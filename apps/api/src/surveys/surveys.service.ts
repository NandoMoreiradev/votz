import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'
import { NotificationType, Prisma, SurveyResultsVisibility, SurveyStatus } from '@prisma/client'
import { Queue } from 'bullmq'
import DOMPurify from 'isomorphic-dompurify'
import {
  SURVEY_DEFAULTS,
  type ResearchInstituteView,
  type SurveyComparisonItem,
  type SurveyDetailView,
  type SurveyInvitationView,
  type SurveyResultsView,
  type SurveySummaryView,
} from '@votz/shared-types'
import { CryptoService, parseHexKey } from '../crypto/crypto.service'
import { NotificationsService } from '../notifications/notifications.service'
import {
  CancelSurveyDto,
  CreateInstituteDto,
  CreateSurveyDto,
  DrawSampleDto,
  ListSurveysQueryDto,
  ReviewSurveyDto,
  SubmitEntitySurveyDto,
  SubmitSurveyVoteDto,
  UpdateSurveyDto,
} from './dto/surveys.dto'
import {
  computeNullifierHash,
  cryptoShuffle,
  generateSurveySaltHex,
  normalizeCpfDigits,
  roundToHourBucket,
  shuffleSurveyOptions,
  surveyAgeBandOf,
} from './surveys.crypto'
import { SURVEYS_QUEUE } from './surveys.queue'
import { SurveysRepository } from './surveys.repository'
import {
  computeAggregatesFromBallots,
  evaluateEligibility,
  filterKAnonymousSegments,
  formatSurveyResultsCsv,
  validateBallotAnswers,
  validateTsePublishLock,
  type DecryptedBallotPayload,
} from './surveys.rules'

function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim()
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name)
  private readonly masterNullifierKey: Buffer | null

  constructor(
    private readonly repo: SurveysRepository,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
    @InjectQueue(SURVEYS_QUEUE) private readonly queue: Queue,
    @Optional() private readonly notifications?: NotificationsService,
  ) {
    const rawKey = this.config.get<string>('SURVEY_NULLIFIER_KEY')?.trim()
    if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
      this.masterNullifierKey = parseHexKey(rawKey)
    } else {
      this.masterNullifierKey = null
    }
  }

  isEnabled(): boolean {
    return this.config.get<string>('OFFICIAL_SURVEYS_ENABLED') === 'true'
  }

  isElectoralLockEnabled(): boolean {
    return this.config.get<string>('SURVEYS_ELECTORAL_LOCK') === 'true'
  }

  private assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new NotFoundException('Pesquisa Votz ainda não está habilitada neste ambiente.')
    }
  }

  private getNullifierKey(): Buffer {
    if (this.masterNullifierKey) return this.masterNullifierKey
    // Em ambiente local/teste sem SURVEY_NULLIFIER_KEY definida, bloqueia em produção.
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('SURVEY_NULLIFIER_KEY não configurada.')
    }
    const fallback = this.config.get<string>('CPF_ENCRYPTION_KEY')
    if (fallback && /^[0-9a-fA-F]{64}$/.test(fallback)) {
      return parseHexKey(fallback)
    }
    return Buffer.alloc(32, 7)
  }

  private async resolveUserContext(userId?: string) {
    if (!userId) return null
    const user = await this.repo.findUserEligibilityFields(userId)
    if (!user) return null
    let cpfDigits = ''
    if (user.cpf) {
      try {
        cpfDigits = normalizeCpfDigits(this.crypto.decrypt(user.cpf))
      } catch {
        cpfDigits = ''
      }
    }
    return {
      ...user,
      cpfDigits,
      hasValidCpf: cpfDigits.length === 11,
    }
  }

  private computeUserNullifier(
    survey: { id: string; verificationLevel: string; nullifierSaltEnc: string | null },
    user: { id: string; cpfDigits: string },
  ): string | null {
    if (!survey.nullifierSaltEnc) return null
    const saltHex = this.crypto.decrypt(survey.nullifierSaltEnc)
    const subject =
      survey.verificationLevel === 'VERIFIED_CPF'
        ? `cpf:${user.cpfDigits}`
        : `usr:${user.id}`
    return computeNullifierHash(this.getNullifierKey(), saltHex, survey.id, subject)
  }

  private async toSummaryView(
    survey: Awaited<ReturnType<SurveysRepository['findPublicList']>>[number],
    userCtx: Awaited<ReturnType<SurveysService['resolveUserContext']>>,
  ): Promise<SurveySummaryView> {
    let hasVoted: boolean | null = null
    let eligible: boolean | null = null
    let ineligibleReason: SurveySummaryView['ineligibleReason'] = null

    if (userCtx && survey.status === 'OPEN') {
      const nullifier =
        survey.verificationLevel === 'VERIFIED_CPF' && !userCtx.hasValidCpf
          ? null
          : this.computeUserNullifier(survey, userCtx)
      hasVoted = nullifier ? await this.repo.hasParticipation(survey.id, nullifier) : false
      const hasInvite =
        survey.distributionMode === 'INVITED_SAMPLE'
          ? await this.repo.hasActiveInvitation(survey.id, userCtx.id)
          : false
      const evalRes = evaluateEligibility(
        {
          status: survey.status,
          scope: survey.scope,
          targetState: survey.targetState,
          targetCity: survey.targetCity,
          verificationLevel: survey.verificationLevel,
          minAccountAgeDays: survey.minAccountAgeDays,
          distributionMode: survey.distributionMode,
          startsAt: survey.startsAt,
          endsAt: survey.endsAt,
        },
        userCtx,
        hasVoted,
        new Date(),
        hasInvite,
      )
      eligible = evalRes.eligible
      ineligibleReason = evalRes.reason
    } else if (!userCtx && survey.status === 'OPEN') {
      eligible = false
      ineligibleReason = 'UNAUTHENTICATED'
    }

    return {
      id: survey.id,
      slug: survey.slug,
      title: survey.title,
      subtitle: survey.subtitle,
      kind: survey.kind,
      origin: survey.origin,
      distributionMode: survey.distributionMode,
      methodologyType: survey.methodologyType,
      status: survey.status,
      scope: survey.scope,
      targetState: survey.targetState,
      targetCity: survey.targetCity,
      verificationLevel: survey.verificationLevel,
      resultsVisibility: survey.resultsVisibility,
      featuredInFeed: survey.featuredInFeed,
      partnerName: survey.partnerName ?? survey.institute?.name ?? null,
      partnerLogoUrl: survey.partnerLogoUrl ?? survey.institute?.logoUrl ?? null,
      instituteSlug: survey.institute?.slug ?? null,
      contractorName: survey.contractorName,
      topicKey: survey.topicKey,
      reviewStatus: survey.reviewStatus,
      reviewNote: survey.reviewNote,
      isElectoral: survey.isElectoral,
      tseRegistrationCode: survey.tseRegistrationCode,
      startsAt: survey.startsAt?.toISOString() ?? null,
      endsAt: survey.endsAt?.toISOString() ?? null,
      closedAt: survey.closedAt?.toISOString() ?? null,
      totalBallots: survey.totalBallots,
      quorumReached: survey.totalBallots >= survey.minQuorumToPublish,
      hasVoted,
      eligible,
      ineligibleReason,
    }
  }

  // ── Público / Cidadão ──────────────────────────────────────────────────────

  getConfig() {
    return {
      enabled: this.isEnabled(),
      electoralLockEnabled: this.isElectoralLockEnabled(),
    }
  }

  async listPublic(query: ListSurveysQueryDto, userId?: string): Promise<SurveySummaryView[]> {
    this.assertEnabled()
    const [rows, userCtx] = await Promise.all([
      this.repo.findPublicList(query),
      this.resolveUserContext(userId),
    ])
    return Promise.all(rows.map((s) => this.toSummaryView(s, userCtx)))
  }

  async listFeatured(userId?: string): Promise<SurveySummaryView[]> {
    this.assertEnabled()
    const userCtx = await this.resolveUserContext(userId)
    const rows = await this.repo.findFeaturedOpen(userCtx?.state)
    const views = await Promise.all(rows.map((s) => this.toSummaryView(s, userCtx)))
    return views.filter((v) => v.hasVoted !== true).slice(0, 2)
  }

  async getDetail(slugOrId: string, userId?: string): Promise<SurveyDetailView> {
    this.assertEnabled()
    const [survey, userCtx] = await Promise.all([
      this.repo.findByIdOrSlugWithQuestions(slugOrId),
      this.resolveUserContext(userId),
    ])
    if (!survey || survey.status === 'DRAFT' || survey.status === 'SCHEDULED' || survey.status === 'CANCELLED') {
      throw new NotFoundException('Pesquisa não encontrada.')
    }

    const summary = await this.toSummaryView(survey, userCtx)
    return {
      ...summary,
      description: survey.description,
      minAccountAgeDays: survey.minAccountAgeDays,
      minQuorumToPublish: survey.minQuorumToPublish,
      kAnonymityThreshold: survey.kAnonymityThreshold,
      marginOfError: survey.marginOfError,
      confidenceLevel: survey.confidenceLevel,
      statisticianName: survey.statisticianName,
      statisticianConre: survey.statisticianConre,
      methodologyNote: survey.methodologyNote,
      disclaimerText: survey.disclaimerText,
      questions: survey.questions.map((q) => ({
        id: q.id,
        position: q.position,
        prompt: q.prompt,
        helpText: q.helpText,
        type: q.type,
        required: q.required,
        maxSelections: q.maxSelections,
        randomizeOptions: q.randomizeOptions,
        options: shuffleSurveyOptions(
          q.options.map((o) => ({
            id: o.id,
            position: o.position,
            label: o.label,
            subtitle: o.subtitle,
            imageUrl: o.imageUrl,
            politicianId: o.politicianId,
            isPinnedBottom: o.isPinnedBottom,
          })),
          q.randomizeOptions,
        ),
      })),
    }
  }

  async submitVote(surveyId: string, userId: string, dto: SubmitSurveyVoteDto) {
    this.assertEnabled()
    const [survey, userCtx] = await Promise.all([
      this.repo.findByIdWithQuestions(surveyId),
      this.resolveUserContext(userId),
    ])
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (!userCtx) throw new ForbiddenException('Usuário não autenticado.')

    const nullifierHash =
      survey.verificationLevel === 'VERIFIED_CPF' && !userCtx.hasValidCpf
        ? null
        : this.computeUserNullifier(survey, userCtx)

    const hasVoted = nullifierHash ? await this.repo.hasParticipation(survey.id, nullifierHash) : false
    const hasInvite =
      survey.distributionMode === 'INVITED_SAMPLE'
        ? await this.repo.hasActiveInvitation(survey.id, userCtx.id)
        : false
    const eligibility = evaluateEligibility(
      {
        status: survey.status,
        scope: survey.scope,
        targetState: survey.targetState,
        targetCity: survey.targetCity,
        verificationLevel: survey.verificationLevel,
        minAccountAgeDays: survey.minAccountAgeDays,
        distributionMode: survey.distributionMode,
        startsAt: survey.startsAt,
        endsAt: survey.endsAt,
      },
      userCtx,
      hasVoted,
      new Date(),
      hasInvite,
    )

    if (!eligibility.eligible) {
      if (eligibility.reason === 'ALREADY_VOTED') {
        throw new ConflictException('Você já participou desta pesquisa.')
      }
      throw new ForbiddenException({
        message: 'Você não atende aos critérios de participação desta pesquisa.',
        reason: eligibility.reason,
      })
    }

    if (!nullifierHash) {
      throw new ForbiddenException('Pesquisa sem chave de anonimização ativa.')
    }

    const validation = validateBallotAnswers(
      survey.questions.map((q) => ({
        id: q.id,
        type: q.type,
        required: q.required,
        maxSelections: q.maxSelections,
        optionIds: q.options.map((o) => o.id),
      })),
      dto.answers,
    )
    if (!validation.ok) {
      throw new BadRequestException(validation.error)
    }

    const bucket = roundToHourBucket(new Date())
    const ballotPayload: DecryptedBallotPayload = {
      answers: validation.normalized,
      ageBand: surveyAgeBandOf(userCtx.birthDate),
      gender: userCtx.gender ?? null,
      state: userCtx.state ? userCtx.state.toUpperCase() : null,
      ibgeCode: survey.scope === 'MUNICIPAL' ? survey.targetIbgeCode : null,
      submittedBucket: bucket.toISOString(),
    }

    // Cifra a cédula no Mix Pool para que nem o payload em repouso na fila seja legível antes do embaralhamento.
    const payloadEnc = this.crypto.encrypt(JSON.stringify(ballotPayload))

    let pendingCount = 0
    try {
      const res = await this.repo.recordParticipationAndQueueBallot({
        surveyId: survey.id,
        nullifierHash,
        bucket,
        payloadEnc,
      })
      pendingCount = res.pendingCount
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já participou desta pesquisa.')
      }
      throw err
    }

    if (survey.distributionMode === 'INVITED_SAMPLE') {
      await this.repo.markInvitationRespondedIfExists(survey.id, userCtx.id, bucket)
    }

    // Se atingiu o tamanho de lote do Mix Pool, dispara drenagem embaralhada assíncrona via BullMQ.
    if (pendingCount >= SURVEY_DEFAULTS.MIX_POOL_BATCH_SIZE) {
      const slot = Math.floor(Date.now() / 60_000)
      await this.queue
        .add('drain-mix-pool', { surveyId: survey.id }, { jobId: `survey-drain-${survey.id}-${slot}` })
        .catch((err: Error) => this.logger.warn(`Falha ao enfileirar drain-mix-pool: ${err.message}`))
    }

    return {
      recorded: true,
      anonymous: true,
      message: 'Sua participação foi registrada de forma anônima e definitiva.',
    }
  }

  async getResults(slugOrId: string, segmentKey = 'ALL', userId?: string): Promise<SurveyResultsView> {
    this.assertEnabled()
    const survey = await this.repo.findByIdOrSlugWithQuestions(slugOrId)
    if (!survey || survey.status === 'DRAFT' || survey.status === 'SCHEDULED' || survey.status === 'CANCELLED') {
      throw new NotFoundException('Pesquisa não encontrada.')
    }

    // Regra de visibilidade: se AFTER_CLOSE e ainda está OPEN, não expõe resultados parciais.
    if (survey.status === 'OPEN' && survey.resultsVisibility === SurveyResultsVisibility.AFTER_CLOSE) {
      return {
        surveyId: survey.id,
        slug: survey.slug,
        status: survey.status,
        segmentKey: 'ALL',
        totalBallots: survey.totalBallots,
        segmentTotal: 0,
        quorumReached: false,
        kAnonymitySuppressed: false,
        kAnonymityThreshold: survey.kAnonymityThreshold,
        availableSegments: [],
        updatedAt: survey.updatedAt.toISOString(),
        questions: [],
      }
    }

    // Se AFTER_VOTE e está OPEN, só mostra parciais se atingiu o quórum mínimo.
    const quorumReached = survey.totalBallots >= survey.minQuorumToPublish
    if (!quorumReached) {
      return {
        surveyId: survey.id,
        slug: survey.slug,
        status: survey.status,
        segmentKey: 'ALL',
        totalBallots: survey.totalBallots,
        segmentTotal: 0,
        quorumReached: false,
        kAnonymitySuppressed: false,
        kAnonymityThreshold: survey.kAnonymityThreshold,
        availableSegments: [],
        updatedAt: survey.updatedAt.toISOString(),
        questions: [],
      }
    }

    const aggregates = await this.repo.findAggregates(survey.id)
    const segmentTotals = new Map<string, number>()
    let latestUpdate: Date | null = null
    for (const row of aggregates) {
      if (!segmentTotals.has(row.segmentKey) || row.segmentTotal > (segmentTotals.get(row.segmentKey) ?? 0)) {
        segmentTotals.set(row.segmentKey, row.segmentTotal)
      }
      if (!latestUpdate || row.updatedAt > latestUpdate) {
        latestUpdate = row.updatedAt
      }
    }

    const availableSegments = filterKAnonymousSegments(
      segmentTotals,
      survey.totalBallots,
      survey.minQuorumToPublish,
      survey.kAnonymityThreshold,
    )

    const normalizedSeg = segmentKey.trim() || 'ALL'
    if (normalizedSeg !== 'ALL' && !availableSegments.includes(normalizedSeg)) {
      return {
        surveyId: survey.id,
        slug: survey.slug,
        status: survey.status,
        segmentKey: normalizedSeg,
        totalBallots: survey.totalBallots,
        segmentTotal: 0,
        quorumReached: true,
        kAnonymitySuppressed: true,
        kAnonymityThreshold: survey.kAnonymityThreshold,
        availableSegments,
        updatedAt: latestUpdate?.toISOString() ?? survey.updatedAt.toISOString(),
        questions: [],
      }
    }

    const segAggs = aggregates.filter((a) => a.segmentKey === normalizedSeg)
    const byQuestionOption = new Map<string, number>()
    for (const a of segAggs) {
      byQuestionOption.set(`${a.questionId}:${a.optionId}`, a.votesCount)
    }

    const segmentTotal = segmentTotals.get(normalizedSeg) ?? survey.totalBallots

    // Ignora `userId` propositalmente: resultados são idênticos e 100% agregados para qualquer leitor.
    void userId

    return {
      surveyId: survey.id,
      slug: survey.slug,
      status: survey.status,
      segmentKey: normalizedSeg,
      totalBallots: survey.totalBallots,
      segmentTotal,
      quorumReached: true,
      kAnonymitySuppressed: false,
      kAnonymityThreshold: survey.kAnonymityThreshold,
      availableSegments,
      updatedAt: latestUpdate?.toISOString() ?? survey.updatedAt.toISOString(),
      questions: survey.questions.map((q) => {
        const optionCounts = q.options.map((o) => ({
          option: o,
          votesCount: byQuestionOption.get(`${q.id}:${o.id}`) ?? 0,
        }))
        const totalResponses = optionCounts.reduce((acc, item) => acc + item.votesCount, 0)
        return {
          questionId: q.id,
          prompt: q.prompt,
          type: q.type,
          totalResponses,
          options: optionCounts.map(({ option, votesCount }) => ({
            optionId: option.id,
            label: option.label,
            subtitle: option.subtitle,
            imageUrl: option.imageUrl,
            votesCount,
            percentage: totalResponses > 0 ? Math.round((votesCount / totalResponses) * 1000) / 10 : 0,
          })),
        }
      }),
    }
  }

  // ── Mix Pool / Encerramento (Jobs) ─────────────────────────────────────────

  async drainMixPool(
    surveyId: string,
    options: { force?: boolean; minBatch?: number } = {},
  ): Promise<{ committed: number; totalBallots: number; skippedBelowMinBatch?: boolean }> {
    const pending = await this.repo.findPendingBallots(surveyId)
    const minBatch = options.minBatch ?? 5
    if (pending.length === 0 || (!options.force && pending.length < minBatch)) {
      const survey = await this.repo.findById(surveyId)
      return {
        committed: 0,
        totalBallots: survey?.totalBallots ?? 0,
        ...(pending.length > 0 && !options.force ? { skippedBelowMinBatch: true } : {}),
      }
    }

    const decrypted: DecryptedBallotPayload[] = []
    for (const item of pending) {
      try {
        const json = this.crypto.decrypt(item.payloadEnc)
        decrypted.push(JSON.parse(json) as DecryptedBallotPayload)
      } catch (err) {
        this.logger.error(`Falha ao decifrar cédula pendente ${item.id}: ${(err as Error).message}`)
      }
    }

    const shuffled = cryptoShuffle(decrypted)
    return this.repo.commitShuffledBallotsAndRefreshAggregates({
      surveyId,
      pendingIds: pending.map((p) => p.id),
      shuffledBallots: shuffled,
      computeAggregates: computeAggregatesFromBallots,
    })
  }

  async sweepOpenAndScheduledSurveys(): Promise<{ opened: number; drained: number; closed: number }> {
    const now = new Date()
    let opened = 0
    let drained = 0
    let closed = 0

    const scheduled = await this.repo.findScheduledToOpen(now)
    for (const s of scheduled) {
      await this.publishSurvey(s.id, 'system-scheduler')
      opened += 1
    }

    const openList = await this.repo.findOpenSurveysForSweep(now)
    for (const s of openList) {
      const res = await this.drainMixPool(s.id)
      if (res.committed > 0) drained += res.committed

      if (s.endsAt && now >= s.endsAt) {
        await this.closeSurvey(s.id)
        closed += 1
      }
    }

    return { opened, drained, closed }
  }

  // ── Administração (ADMIN apenas) ───────────────────────────────────────────

  async listAdmin() {
    return this.repo.findAdminList()
  }

  async createSurvey(dto: CreateSurveyDto, actorId: string) {
    const baseSlug = dto.slug ? slugify(dto.slug) : slugify(dto.title)
    const slug = `${baseSlug}-${Date.now().toString(36).slice(-4)}`

    const defaultVisibility =
      dto.kind === 'VOTING_INTENTION'
        ? SurveyResultsVisibility.AFTER_CLOSE
        : SurveyResultsVisibility.AFTER_VOTE

    const defaultVerification =
      dto.kind === 'VOTING_INTENTION' ? 'VERIFIED_CPF' : 'STANDARD'

    const saltEnc = this.crypto.encrypt(generateSurveySaltHex())

    return this.repo.createSurvey({
      slug,
      title: sanitizeText(dto.title),
      subtitle: dto.subtitle ? sanitizeText(dto.subtitle) : null,
      description: sanitizeText(dto.description),
      kind: dto.kind,
      origin: dto.origin ?? 'VOTZ',
      distributionMode: dto.distributionMode ?? 'OPEN',
      methodologyType: dto.methodologyType ?? 'OPEN_PANEL',
      status: SurveyStatus.DRAFT,
      scope: dto.scope ?? 'NATIONAL',
      targetState: dto.targetState ? dto.targetState.toUpperCase() : null,
      targetCity: dto.targetCity ? sanitizeText(dto.targetCity) : null,
      targetIbgeCode: dto.targetIbgeCode?.trim() || null,
      sponsorEntityId: dto.sponsorEntityId ?? null,
      ...(dto.instituteId ? { institute: { connect: { id: dto.instituteId } } } : {}),
      topicKey: dto.topicKey ? sanitizeText(dto.topicKey).toUpperCase() : null,
      cooldownDays: dto.cooldownDays ?? 30,
      targetSampleSize: dto.targetSampleSize ?? null,
      partnerName: dto.partnerName ? sanitizeText(dto.partnerName) : null,
      partnerLogoUrl: dto.partnerLogoUrl ?? null,
      contractorName: dto.contractorName ? sanitizeText(dto.contractorName) : null,
      marginOfError: dto.marginOfError ?? null,
      confidenceLevel: dto.confidenceLevel ?? null,
      verificationLevel: dto.verificationLevel ?? defaultVerification,
      minAccountAgeDays: dto.minAccountAgeDays ?? SURVEY_DEFAULTS.MIN_ACCOUNT_AGE_DAYS,
      resultsVisibility: dto.resultsVisibility ?? defaultVisibility,
      minQuorumToPublish: dto.minQuorumToPublish ?? SURVEY_DEFAULTS.MIN_QUORUM_TO_PUBLISH,
      kAnonymityThreshold: dto.kAnonymityThreshold ?? SURVEY_DEFAULTS.K_ANONYMITY_THRESHOLD,
      featuredInFeed: dto.featuredInFeed ?? false,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      nullifierSaltEnc: saltEnc,
      isElectoral: dto.isElectoral ?? dto.kind === 'VOTING_INTENTION',
      tseRegistrationCode: dto.tseRegistrationCode ? sanitizeText(dto.tseRegistrationCode) : null,
      statisticianName: dto.statisticianName ? sanitizeText(dto.statisticianName) : null,
      statisticianConre: dto.statisticianConre ? sanitizeText(dto.statisticianConre) : null,
      methodologyNote: sanitizeText(dto.methodologyNote),
      disclaimerText: sanitizeText(dto.disclaimerText),
      createdById: actorId,
      questions: {
        create: dto.questions.map((q, qIdx) => ({
          position: qIdx,
          prompt: sanitizeText(q.prompt),
          helpText: q.helpText ? sanitizeText(q.helpText) : null,
          type: q.type ?? 'SINGLE_CHOICE',
          required: q.required ?? true,
          maxSelections: q.maxSelections ?? 1,
          randomizeOptions: q.randomizeOptions ?? true,
          options: {
            create: q.options.map((o, oIdx) => ({
              position: oIdx,
              label: sanitizeText(o.label),
              subtitle: o.subtitle ? sanitizeText(o.subtitle) : null,
              imageUrl: o.imageUrl ?? null,
              politicianId: o.politicianId ?? null,
              isPinnedBottom: o.isPinnedBottom ?? false,
            })),
          },
        })),
      },
    })
  }

  async updateSurvey(id: string, dto: UpdateSurveyDto) {
    const existing = await this.repo.findById(id)
    if (!existing) throw new NotFoundException('Pesquisa não encontrada.')
    if (existing.status === 'CLOSED' || existing.status === 'ARCHIVED' || existing.status === 'CANCELLED') {
      throw new BadRequestException('Pesquisas encerradas ou canceladas não podem ser editadas.')
    }

    return this.repo.updateSurvey(id, {
      ...(dto.title !== undefined ? { title: sanitizeText(dto.title) } : {}),
      ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle ? sanitizeText(dto.subtitle) : null } : {}),
      ...(dto.description !== undefined ? { description: sanitizeText(dto.description) } : {}),
      ...(dto.featuredInFeed !== undefined ? { featuredInFeed: dto.featuredInFeed } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      ...(dto.tseRegistrationCode !== undefined
        ? { tseRegistrationCode: dto.tseRegistrationCode ? sanitizeText(dto.tseRegistrationCode) : null }
        : {}),
      ...(dto.statisticianName !== undefined
        ? { statisticianName: dto.statisticianName ? sanitizeText(dto.statisticianName) : null }
        : {}),
      ...(dto.statisticianConre !== undefined
        ? { statisticianConre: dto.statisticianConre ? sanitizeText(dto.statisticianConre) : null }
        : {}),
      ...(dto.methodologyNote !== undefined ? { methodologyNote: sanitizeText(dto.methodologyNote) } : {}),
      ...(dto.disclaimerText !== undefined ? { disclaimerText: sanitizeText(dto.disclaimerText) } : {}),
    })
  }

  async publishSurvey(id: string, actorId: string) {
    const survey = await this.repo.findByIdWithQuestions(id)
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new BadRequestException('Apenas pesquisas em rascunho ou agendadas podem ser publicadas.')
    }
    if (survey.reviewStatus !== 'APPROVED') {
      throw new ForbiddenException('A pesquisa precisa estar aprovada na revisão editorial antes de ser publicada.')
    }
    if (survey.questions.length === 0) {
      throw new BadRequestException('A pesquisa precisa ter pelo menos uma pergunta.')
    }

    const tseCheck = validateTsePublishLock(survey, this.isElectoralLockEnabled())
    if (!tseCheck.ok) {
      throw new ForbiddenException(tseCheck.error)
    }

    const now = new Date()
    const nextStatus = survey.startsAt && survey.startsAt > now ? SurveyStatus.SCHEDULED : SurveyStatus.OPEN
    const saltEnc = survey.nullifierSaltEnc ?? this.crypto.encrypt(generateSurveySaltHex())

    return this.repo.updateSurvey(id, {
      status: nextStatus,
      startsAt: survey.startsAt ?? now,
      publishedById: actorId,
      nullifierSaltEnc: saltEnc,
    })
  }

  /**
   * Encerra a pesquisa:
   * 1) Drena e embaralha todas as cédulas restantes no Mix Pool;
   * 2) Recalcula agregados finais;
   * 3) Executa crypto-shredding (`nullifierSaltEnc = null`, `saltDestroyedAt = now`).
   */
  async closeSurvey(id: string) {
    const survey = await this.repo.findById(id)
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (survey.status !== 'OPEN') {
      throw new BadRequestException('Apenas pesquisas abertas podem ser encerradas.')
    }

    await this.drainMixPool(id, { force: true })

    const now = new Date()
    return this.repo.updateSurvey(id, {
      status: SurveyStatus.CLOSED,
      closedAt: now,
      featuredInFeed: false,
      nullifierSaltEnc: null,
      saltDestroyedAt: now,
    })
  }

  async cancelSurvey(id: string, dto: CancelSurveyDto) {
    const survey = await this.repo.findById(id)
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (survey.status === 'CLOSED' || survey.status === 'ARCHIVED') {
      throw new BadRequestException('Pesquisas já encerradas não podem ser canceladas.')
    }

    const now = new Date()
    return this.repo.updateSurvey(id, {
      status: SurveyStatus.CANCELLED,
      featuredInFeed: false,
      cancelReason: sanitizeText(dto.reason),
      nullifierSaltEnc: null,
      saltDestroyedAt: now,
    })
  }

  // ── Fase 2: Convites, Revisão, Sorteio, Entidades, Institutos, Comparador & Export ──

  async listMyInvitations(userId: string): Promise<SurveyInvitationView[]> {
    this.assertEnabled()
    const [invitations, userCtx] = await Promise.all([
      this.repo.findUserPendingInvitations(userId),
      this.resolveUserContext(userId),
    ])
    return Promise.all(
      invitations.map(async (inv) => ({
        invitationId: inv.id,
        status: inv.status,
        invitedAt: inv.invitedAt.toISOString(),
        expiresAt: inv.expiresAt?.toISOString() ?? null,
        survey: await this.toSummaryView(inv.survey, userCtx),
      })),
    )
  }

  async declineInvitation(invitationId: string, userId: string) {
    this.assertEnabled()
    await this.repo.declineInvitation(invitationId, userId)
    return { declined: true }
  }

  async reviewSurvey(id: string, dto: ReviewSurveyDto) {
    const survey = await this.repo.findById(id)
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (survey.status !== 'DRAFT' && survey.status !== 'SCHEDULED') {
      throw new BadRequestException('Apenas pesquisas em rascunho ou agendadas podem ser revisadas.')
    }
    const updated = await this.repo.updateSurvey(id, {
      reviewStatus: dto.reviewStatus,
      reviewNote: dto.reviewNote ? sanitizeText(dto.reviewNote) : null,
    })

    const reviewMeta = {
      surveyId: survey.id,
      surveySlug: survey.slug,
      surveyTitle: survey.title,
      reviewStatus: dto.reviewStatus,
      reviewNote: dto.reviewNote ? sanitizeText(dto.reviewNote) : null,
    }
    if (survey.createdById) {
      this.notifications
        ?.notify({
          userId: survey.createdById,
          type: NotificationType.SURVEY_REVIEWED,
          metadata: reviewMeta,
        })
        .catch(() => null)
    }
    if (survey.sponsorEntityId) {
      this.notifications
        ?.notifyRecipient?.('ENTITY', survey.sponsorEntityId, {
          type: NotificationType.SURVEY_REVIEWED,
          metadata: reviewMeta,
          excludeUserIds: survey.createdById ? [survey.createdById] : [],
        })
        ?.catch(() => null)
    }

    return updated
  }

  /**
   * Sorteia uma amostra independente de cidadãos elegíveis para pesquisa `INVITED_SAMPLE`,
   * aplicando quarentena automática de `cooldownDays` dias no mesmo `topicKey`.
   */
  async drawSample(surveyId: string, dto: DrawSampleDto) {
    const survey = await this.repo.findById(surveyId)
    if (!survey) throw new NotFoundException('Pesquisa não encontrada.')
    if (survey.distributionMode !== 'INVITED_SAMPLE') {
      throw new BadRequestException('O sorteio de amostra só se aplica a pesquisas do tipo INVITED_SAMPLE.')
    }
    if (survey.status !== 'OPEN' && survey.status !== 'SCHEDULED' && survey.status !== 'DRAFT') {
      throw new BadRequestException('Não é possível sortear amostra para pesquisa encerrada ou cancelada.')
    }

    const now = new Date()
    const cooldownCutoff = new Date(now.getTime() - survey.cooldownDays * 86_400_000)
    const minAccountCreatedBefore = new Date(now.getTime() - survey.minAccountAgeDays * 86_400_000)

    // Busca pool ampliado (até 3x o pedido, limitado a 100k) e aplica Fisher-Yates criptográfico
    const poolLimit = Math.min(dto.count * 3, 100_000)
    const candidates = await this.repo.findEligibleCandidateIdsForSample({
      surveyId: survey.id,
      topicKey: survey.topicKey,
      cooldownCutoff,
      scope: survey.scope,
      targetState: survey.targetState,
      targetCity: survey.targetCity,
      requireCpf: survey.verificationLevel === 'VERIFIED_CPF',
      minAccountCreatedBefore,
      limit: poolLimit,
    })

    const selected = cryptoShuffle(candidates).slice(0, dto.count)
    const expiresAt = new Date(now.getTime() + (dto.expiresInDays ?? 14) * 86_400_000)
    const invited = await this.repo.createSampleInvitations({
      surveyId: survey.id,
      topicKey: survey.topicKey,
      userIds: selected,
      expiresAt,
    })

    if (selected.length > 0) {
      this.notifications
        ?.notifyMany?.({
          userIds: selected,
          type: NotificationType.OFFICIAL_SURVEY_PUBLISHED,
          metadata: {
            surveyId: survey.id,
            surveySlug: survey.slug,
            surveyTitle: survey.title,
            invited: true,
          },
        })
        ?.catch(() => null)
    }

    return {
      surveyId: survey.id,
      requested: dto.count,
      eligiblePoolSize: candidates.length,
      invited,
      cooldownDays: survey.cooldownDays,
      topicKey: survey.topicKey,
    }
  }

  async listEntitySurveys(entityId: string, userId: string) {
    const allowed = await this.repo.isActiveEntityMember(entityId, userId)
    if (!allowed) throw new ForbiddenException('Você não tem permissão para gerenciar esta entidade.')
    return this.repo.findByEntityId(entityId)
  }

  /**
   * Entidade pública submete Consulta Pública para revisão obrigatória do Admin.
   * Nunca permite intenção de voto nem publicação direta sem revisão editorial.
   */
  async submitEntitySurvey(entityId: string, userId: string, dto: SubmitEntitySurveyDto) {
    const allowed = await this.repo.isActiveEntityMember(entityId, userId)
    if (!allowed) throw new ForbiddenException('Você não tem permissão para gerenciar esta entidade.')

    const entity = await this.repo.findEntityBasic(entityId)
    if (!entity) throw new NotFoundException('Entidade não encontrada.')

    const slug = `${slugify(dto.title)}-${Date.now().toString(36).slice(-4)}`
    const scope = entity.city && entity.state ? 'MUNICIPAL' : entity.state ? 'STATE' : 'NATIONAL'
    const saltEnc = this.crypto.encrypt(generateSurveySaltHex())

    return this.repo.createSurvey({
      slug,
      title: sanitizeText(dto.title),
      subtitle: dto.subtitle ? sanitizeText(dto.subtitle) : null,
      description: sanitizeText(dto.description),
      kind: 'CIVIC_TOPIC',
      origin: 'PUBLIC_ENTITY',
      distributionMode: 'OPEN',
      methodologyType: 'OPEN_PANEL',
      status: SurveyStatus.DRAFT,
      reviewStatus: 'PENDING_REVIEW',
      submittedByUserId: userId,
      scope,
      targetState: entity.state ? entity.state.toUpperCase() : null,
      targetCity: entity.city ?? null,
      targetIbgeCode: entity.ibgeCode ?? null,
      sponsorEntityId: entity.id,
      partnerName: entity.legalName,
      partnerLogoUrl: entity.logoUrl,
      contractorName: entity.legalName,
      verificationLevel: 'STANDARD',
      minAccountAgeDays: SURVEY_DEFAULTS.MIN_ACCOUNT_AGE_DAYS,
      resultsVisibility: SurveyResultsVisibility.AFTER_VOTE,
      minQuorumToPublish: SURVEY_DEFAULTS.MIN_QUORUM_TO_PUBLISH,
      kAnonymityThreshold: SURVEY_DEFAULTS.K_ANONYMITY_THRESHOLD,
      featuredInFeed: false,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      nullifierSaltEnc: saltEnc,
      isElectoral: false,
      methodologyNote: `Consulta pública proposta por ${entity.legalName} e revisada pela equipe Votz. Coleta anônima com Mix Pool e proteção por k-anonimato.`,
      disclaimerText: `Os resultados representam a opinião dos cidadãos participantes do Votz nesta consulta pública de ${entity.legalName}. O voto é secreto e definitivo.`,
      createdById: userId,
      questions: {
        create: dto.questions.map((q, qIdx) => ({
          position: qIdx,
          prompt: sanitizeText(q.prompt),
          helpText: q.helpText ? sanitizeText(q.helpText) : null,
          type: q.type ?? 'SINGLE_CHOICE',
          required: q.required ?? true,
          maxSelections: q.maxSelections ?? 1,
          randomizeOptions: q.randomizeOptions ?? true,
          options: {
            create: q.options.map((o, oIdx) => ({
              position: oIdx,
              label: sanitizeText(o.label),
              subtitle: o.subtitle ? sanitizeText(o.subtitle) : null,
              imageUrl: o.imageUrl ?? null,
              politicianId: null,
              isPinnedBottom: o.isPinnedBottom ?? false,
            })),
          },
        })),
      },
    })
  }

  async listInstitutes(onlyActive = true): Promise<ResearchInstituteView[]> {
    const rows = await this.repo.listInstitutes(onlyActive)
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      legalName: r.legalName,
      cnpj: r.cnpj,
      logoUrl: r.logoUrl,
      website: r.website,
      description: r.description,
      statisticianLead: r.statisticianLead,
      conreLead: r.conreLead,
      verified: r.verified,
      surveysCount: r._count.surveys,
    }))
  }

  async getInstituteBySlug(slug: string, userId?: string) {
    this.assertEnabled()
    const inst = await this.repo.findInstituteBySlug(slug)
    if (!inst || !inst.active) throw new NotFoundException('Instituto não encontrado.')
    const userCtx = await this.resolveUserContext(userId)
    const surveys = await Promise.all(inst.surveys.map((s) => this.toSummaryView(s, userCtx)))
    return {
      institute: {
        id: inst.id,
        slug: inst.slug,
        name: inst.name,
        legalName: inst.legalName,
        cnpj: inst.cnpj,
        logoUrl: inst.logoUrl,
        website: inst.website,
        description: inst.description,
        statisticianLead: inst.statisticianLead,
        conreLead: inst.conreLead,
        verified: inst.verified,
        surveysCount: surveys.length,
      } satisfies ResearchInstituteView,
      surveys,
    }
  }

  async createInstitute(dto: CreateInstituteDto) {
    const slug = `${slugify(dto.name)}-${Date.now().toString(36).slice(-4)}`
    return this.repo.createInstitute({
      slug,
      name: sanitizeText(dto.name),
      legalName: sanitizeText(dto.legalName),
      cnpj: dto.cnpj?.trim() || null,
      logoUrl: dto.logoUrl ?? null,
      website: dto.website ?? null,
      description: dto.description ? sanitizeText(dto.description) : null,
      statisticianLead: dto.statisticianLead ? sanitizeText(dto.statisticianLead) : null,
      conreLead: dto.conreLead ? sanitizeText(dto.conreLead) : null,
      verified: dto.verified ?? true,
    })
  }

  async compareByTopicKey(topicKey: string): Promise<SurveyComparisonItem[]> {
    this.assertEnabled()
    const normalized = topicKey.trim().toUpperCase()
    if (!normalized) return []
    const surveys = await this.repo.findClosedByTopicKey(normalized)
    return surveys
      .filter((s) => s.totalBallots >= s.minQuorumToPublish)
      .map((s) => {
        const firstQuestion = s.questions[0]
        const aggMap = new Map<string, number>()
        for (const a of s.aggregates) {
          if (firstQuestion && a.questionId === firstQuestion.id) {
            aggMap.set(a.optionId, a.votesCount)
          }
        }
        const total = firstQuestion
          ? firstQuestion.options.reduce((acc, o) => acc + (aggMap.get(o.id) ?? 0), 0)
          : 0
        return {
          surveyId: s.id,
          slug: s.slug,
          title: s.title,
          origin: s.origin,
          partnerName: s.partnerName ?? s.institute?.name ?? null,
          instituteSlug: s.institute?.slug ?? null,
          methodologyType: s.methodologyType,
          tseRegistrationCode: s.tseRegistrationCode,
          marginOfError: s.marginOfError,
          closedAt: s.closedAt?.toISOString() ?? null,
          startsAt: s.startsAt?.toISOString() ?? null,
          totalBallots: s.totalBallots,
          topQuestionPrompt: firstQuestion?.prompt ?? null,
          options: firstQuestion
            ? firstQuestion.options.map((o) => {
                const votesCount = aggMap.get(o.id) ?? 0
                return {
                  label: o.label,
                  subtitle: o.subtitle,
                  votesCount,
                  percentage: total > 0 ? Math.round((votesCount / total) * 1000) / 10 : 0,
                }
              })
            : [],
        }
      })
  }

  async exportAggregatedResults(slugOrId: string, format: 'csv' | 'json', segment = 'ALL') {
    const survey = await this.repo.findByIdOrSlugWithQuestions(slugOrId)
    if (!survey || survey.status === 'DRAFT' || survey.status === 'SCHEDULED' || survey.status === 'CANCELLED') {
      throw new NotFoundException('Pesquisa não encontrada.')
    }
    const results = await this.getResults(slugOrId, segment)
    if (!results.quorumReached || results.kAnonymitySuppressed) {
      throw new ForbiddenException('Resultados indisponíveis para exportação (quórum ou k-anonimato não atingidos).')
    }
    if (format === 'json') {
      return {
        contentType: 'application/json; charset=utf-8',
        filename: `${survey.slug}-${results.segmentKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`,
        body: JSON.stringify(results, null, 2),
      }
    }
    return {
      contentType: 'text/csv; charset=utf-8',
      filename: `${survey.slug}-${results.segmentKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
      body: formatSurveyResultsCsv({
        surveyTitle: survey.title,
        segmentKey: results.segmentKey,
        totalBallots: results.totalBallots,
        questions: results.questions,
      }),
    }
  }
}
