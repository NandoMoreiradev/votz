jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (v: string) => v },
}))

import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CryptoService, encryptWithKey, decryptWithKey } from '../crypto/crypto.service'
import { generateSurveySaltHex } from './surveys.crypto'
import { SurveysRepository } from './surveys.repository'
import { SurveysService } from './surveys.service'

describe('SurveysService', () => {
  const cpfKeyHex = '1'.repeat(64)
  const nullifierKeyHex = '2'.repeat(64)
  const cpfKeyBuf = Buffer.from(cpfKeyHex, 'hex')

  const makeCrypto = () =>
    ({
      encrypt: (p: string) => encryptWithKey(p, cpfKeyBuf),
      decrypt: (c: string) => decryptWithKey(c, cpfKeyBuf),
    }) as unknown as CryptoService

  const makeConfig = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      OFFICIAL_SURVEYS_ENABLED: 'true',
      SURVEY_NULLIFIER_KEY: nullifierKeyHex,
      SURVEYS_ELECTORAL_LOCK: 'false',
      CPF_ENCRYPTION_KEY: cpfKeyHex,
      NODE_ENV: 'test',
      ...overrides,
    }
    return {
      get: (k: string) => values[k],
    } as unknown as ConfigService
  }

  const makeRepo = () =>
    ({
      findPublicList: jest.fn(),
      findFeaturedOpen: jest.fn(),
      findAdminList: jest.fn(),
      findByIdOrSlugWithQuestions: jest.fn(),
      findByIdWithQuestions: jest.fn(),
      findById: jest.fn(),
      findUserEligibilityFields: jest.fn(),
      hasParticipation: jest.fn(),
      recordParticipationAndQueueBallot: jest.fn(),
      findPendingBallots: jest.fn(),
      findOpenSurveysForSweep: jest.fn(),
      findScheduledToOpen: jest.fn(),
      commitShuffledBallotsAndRefreshAggregates: jest.fn(),
      findAggregates: jest.fn(),
      createSurvey: jest.fn(),
      updateSurvey: jest.fn(),
      hasActiveInvitation: jest.fn(),
      markInvitationRespondedIfExists: jest.fn(),
      findUserPendingInvitations: jest.fn(),
      declineInvitation: jest.fn(),
      findEligibleCandidateIdsForSample: jest.fn(),
      createSampleInvitations: jest.fn(),
      isActiveEntityMember: jest.fn(),
      findEntityBasic: jest.fn(),
      findByEntityId: jest.fn(),
      listInstitutes: jest.fn(),
      findInstituteBySlug: jest.fn(),
      createInstitute: jest.fn(),
      findClosedByTopicKey: jest.fn(),
    }) as unknown as jest.Mocked<SurveysRepository>

  const makeQueue = () => ({ add: jest.fn().mockResolvedValue(undefined) }) as never

  it('retorna NotFoundException nas rotas públicas quando OFFICIAL_SURVEYS_ENABLED está desligada', async () => {
    const repo = makeRepo()
    const service = new SurveysService(repo, makeCrypto(), makeConfig({ OFFICIAL_SURVEYS_ENABLED: 'false' }), makeQueue())
    await expect(service.listPublic({})).rejects.toThrow(NotFoundException)
    expect(service.getConfig()).toEqual({ enabled: false, electoralLockEnabled: false })
  })

  it('submitVote separa participação (nullifier por CPF) de cédula cifrada sem userId/CPF/nullifier', async () => {
    const repo = makeRepo()
    const crypto = makeCrypto()
    const saltEnc = crypto.encrypt(generateSurveySaltHex())
    const survey = {
      id: 's-1',
      status: 'OPEN',
      scope: 'NATIONAL',
      targetState: null,
      targetCity: null,
      targetIbgeCode: null,
      verificationLevel: 'VERIFIED_CPF',
      minAccountAgeDays: 7,
      distributionMode: 'OPEN',
      startsAt: new Date('2026-11-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T00:00:00Z'),
      nullifierSaltEnc: saltEnc,
      questions: [
        {
          id: 'q-1',
          type: 'SINGLE_CHOICE',
          required: true,
          maxSelections: 1,
          options: [{ id: 'opt-a' }, { id: 'opt-b' }],
        },
      ],
    }

    const cpfEnc = crypto.encrypt('123.456.789-01')
    repo.findByIdWithQuestions.mockResolvedValue(survey as never)
    repo.findUserEligibilityFields.mockResolvedValue({
      id: 'user-1',
      emailVerified: true,
      banned: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      cpf: cpfEnc,
      state: 'SP',
      city: 'São Paulo',
      birthDate: new Date('1992-04-10'),
      gender: 'FEMALE',
    } as never)
    repo.hasParticipation.mockResolvedValue(false)
    repo.recordParticipationAndQueueBallot.mockResolvedValue({ pendingCount: 1 })

    const service = new SurveysService(repo, crypto, makeConfig(), makeQueue())
    const res = await service.submitVote('s-1', 'user-1', { answers: { 'q-1': ['opt-a'] } })
    expect(res.recorded).toBe(true)
    expect(res.anonymous).toBe(true)

    const call = repo.recordParticipationAndQueueBallot.mock.calls[0][0]
    expect(call.nullifierHash).toHaveLength(64)

    // Decifra a cédula enfileirada e verifica que NÃO contém userId, CPF nem nullifierHash
    const decoded = JSON.parse(crypto.decrypt(call.payloadEnc))
    expect(decoded).toEqual({
      answers: { 'q-1': ['opt-a'] },
      ageBand: '25-34',
      gender: 'FEMALE',
      state: 'SP',
      ibgeCode: null,
      submittedBucket: expect.stringMatching(/:00:00\.000Z$/),
    })
    expect(JSON.stringify(decoded)).not.toContain('user-1')
    expect(JSON.stringify(decoded)).not.toContain('12345678901')
    expect(JSON.stringify(decoded)).not.toContain(call.nullifierHash)

    // Segunda conta com o MESMO CPF gera o MESMO nullifierHash (bloqueando voto duplicado)
    repo.findUserEligibilityFields.mockResolvedValueOnce({
      id: 'user-2-clone',
      emailVerified: true,
      banned: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      cpf: crypto.encrypt('12345678901'),
      state: 'SP',
      city: 'São Paulo',
      birthDate: null,
      gender: null,
    } as never)
    repo.hasParticipation.mockResolvedValueOnce(true)

    await expect(service.submitVote('s-1', 'user-2-clone', { answers: { 'q-1': ['opt-b'] } })).rejects.toThrow(
      ConflictException,
    )
    expect(repo.hasParticipation).toHaveBeenLastCalledWith('s-1', call.nullifierHash)
  })

  it('closeSurvey drena o Mix Pool e executa crypto-shredding do nullifierSaltEnc', async () => {
    const repo = makeRepo()
    const crypto = makeCrypto()
    const payloadEnc = crypto.encrypt(
      JSON.stringify({
        answers: { 'q-1': ['opt-a'] },
        ageBand: '25-34',
        gender: 'MALE',
        state: 'MG',
        ibgeCode: null,
        submittedBucket: '2026-11-26T14:00:00.000Z',
      }),
    )

    repo.findById.mockResolvedValue({ id: 's-1', status: 'OPEN', totalBallots: 0 } as never)
    repo.findPendingBallots.mockResolvedValue([{ id: 'p-1', payloadEnc }] as never)
    repo.commitShuffledBallotsAndRefreshAggregates.mockResolvedValue({ committed: 1, totalBallots: 1 })
    repo.updateSurvey.mockResolvedValue({ id: 's-1', status: 'CLOSED', nullifierSaltEnc: null } as never)

    const service = new SurveysService(repo, crypto, makeConfig(), makeQueue())
    await service.closeSurvey('s-1')

    expect(repo.commitShuffledBallotsAndRefreshAggregates).toHaveBeenCalledTimes(1)
    expect(repo.updateSurvey).toHaveBeenCalledWith(
      's-1',
      expect.objectContaining({
        status: 'CLOSED',
        featuredInFeed: false,
        nullifierSaltEnc: null,
        saltDestroyedAt: expect.any(Date),
      }),
    )
  })

  it('drainMixPool sem force não drena lotes menores que minBatch (evita correlação 1-para-1)', async () => {
    const repo = makeRepo()
    repo.findPendingBallots.mockResolvedValue([{ id: 'p-1', payloadEnc: 'enc' }] as never)
    repo.findById.mockResolvedValue({ id: 's-1', totalBallots: 10 } as never)

    const service = new SurveysService(repo, makeCrypto(), makeConfig(), makeQueue())
    const res = await service.drainMixPool('s-1')
    expect(res).toEqual({ committed: 0, totalBallots: 10, skippedBelowMinBatch: true })
    expect(repo.commitShuffledBallotsAndRefreshAggregates).not.toHaveBeenCalled()
  })

  it('publishSurvey respeita a trava TSE quando SURVEYS_ELECTORAL_LOCK=true', async () => {
    const repo = makeRepo()
    repo.findByIdWithQuestions.mockResolvedValue({
      id: 's-tse',
      status: 'DRAFT',
      reviewStatus: 'APPROVED',
      isElectoral: true,
      tseRegistrationCode: null,
      statisticianConre: null,
      questions: [{ id: 'q-1', options: [{ id: 'o-1' }, { id: 'o-2' }] }],
    } as never)

    const service = new SurveysService(repo, makeCrypto(), makeConfig({ SURVEYS_ELECTORAL_LOCK: 'true' }), makeQueue())
    await expect(service.publishSurvey('s-tse', 'admin-1')).rejects.toThrow(ForbiddenException)
  })

  it('publishSurvey bloqueia publicação de consulta pública ainda PENDING_REVIEW', async () => {
    const repo = makeRepo()
    repo.findByIdWithQuestions.mockResolvedValue({
      id: 's-ent',
      status: 'DRAFT',
      reviewStatus: 'PENDING_REVIEW',
      isElectoral: false,
      questions: [{ id: 'q-1', options: [{ id: 'o-1' }, { id: 'o-2' }] }],
    } as never)

    const service = new SurveysService(repo, makeCrypto(), makeConfig(), makeQueue())
    await expect(service.publishSurvey('s-ent', 'admin-1')).rejects.toThrow(ForbiddenException)
  })

  it('submitEntitySurvey bloqueia não-membro e força origem PUBLIC_ENTITY + PENDING_REVIEW + isElectoral=false', async () => {
    const repo = makeRepo()
    const service = new SurveysService(repo, makeCrypto(), makeConfig(), makeQueue())

    repo.isActiveEntityMember.mockResolvedValueOnce(false)
    await expect(
      service.submitEntitySurvey('ent-1', 'u-intruder', {
        title: 'Consulta sobre praça',
        description: 'Onde reformar primeiro?',
        questions: [{ prompt: 'Qual praça?', options: [{ label: 'Praça A' }, { label: 'Praça B' }] }],
      }),
    ).rejects.toThrow(ForbiddenException)

    repo.isActiveEntityMember.mockResolvedValueOnce(true)
    repo.findEntityBasic.mockResolvedValueOnce({
      id: 'ent-1',
      legalName: 'Prefeitura de Campinas',
      city: 'Campinas',
      state: 'SP',
      ibgeCode: '3509502',
      logoUrl: null,
    } as never)
    repo.createSurvey.mockResolvedValueOnce({ id: 's-new' } as never)

    await service.submitEntitySurvey('ent-1', 'u-member', {
      title: 'Consulta sobre praça',
      description: 'Onde reformar primeiro?',
      questions: [{ prompt: 'Qual praça?', options: [{ label: 'Praça A' }, { label: 'Praça B' }] }],
    })

    expect(repo.createSurvey).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'PUBLIC_ENTITY',
        kind: 'CIVIC_TOPIC',
        isElectoral: false,
        reviewStatus: 'PENDING_REVIEW',
        sponsorEntityId: 'ent-1',
        scope: 'MUNICIPAL',
        targetCity: 'Campinas',
        targetState: 'SP',
      }),
    )
  })

  it('drawSample sorteia candidatos respeitando quarentena (cooldownDays) e cria convites', async () => {
    const repo = makeRepo()
    repo.findById.mockResolvedValue({
      id: 's-sample',
      status: 'OPEN',
      distributionMode: 'INVITED_SAMPLE',
      topicKey: 'ELECTION:PREFEITO:SP',
      cooldownDays: 30,
      scope: 'STATE',
      targetState: 'SP',
      targetCity: null,
      verificationLevel: 'VERIFIED_CPF',
      minAccountAgeDays: 7,
    } as never)
    repo.findEligibleCandidateIdsForSample.mockResolvedValue(['u1', 'u2', 'u3', 'u4', 'u5'])
    repo.createSampleInvitations.mockResolvedValue(3)

    const service = new SurveysService(repo, makeCrypto(), makeConfig(), makeQueue())
    const res = await service.drawSample('s-sample', { count: 3, expiresInDays: 10 })

    expect(res.invited).toBe(3)
    expect(res.eligiblePoolSize).toBe(5)
    expect(repo.findEligibleCandidateIdsForSample).toHaveBeenCalledWith(
      expect.objectContaining({
        surveyId: 's-sample',
        topicKey: 'ELECTION:PREFEITO:SP',
        requireCpf: true,
        targetState: 'SP',
      }),
    )
    expect(repo.createSampleInvitations.mock.calls[0][0].userIds).toHaveLength(3)
  })

  it('getResults oculta parciais em AFTER_CLOSE enquanto OPEN e aplica k-anonimato em segmentos pequenos', async () => {
    const repo = makeRepo()
    const base = {
      id: 's-res',
      slug: 'pesquisa-sp',
      status: 'OPEN',
      resultsVisibility: 'AFTER_CLOSE',
      totalBallots: 500,
      minQuorumToPublish: 100,
      kAnonymityThreshold: 30,
      updatedAt: new Date('2026-11-26T14:00:00Z'),
      questions: [
        {
          id: 'q-1',
          prompt: 'Em quem votaria?',
          type: 'SINGLE_CHOICE',
          options: [
            { id: 'o-1', label: 'A', subtitle: null, imageUrl: null },
            { id: 'o-2', label: 'B', subtitle: null, imageUrl: null },
          ],
        },
      ],
    }

    const service = new SurveysService(repo, makeCrypto(), makeConfig(), makeQueue())

    // Aberta com AFTER_CLOSE -> sem perguntas/percentuais
    repo.findByIdOrSlugWithQuestions.mockResolvedValueOnce(base as never)
    const hidden = await service.getResults('pesquisa-sp')
    expect(hidden.questions).toEqual([])
    expect(hidden.quorumReached).toBe(false)

    // Encerrada -> segmento pequeno (<30) é suprimido por k-anonimato
    repo.findByIdOrSlugWithQuestions.mockResolvedValueOnce({ ...base, status: 'CLOSED' } as never)
    repo.findAggregates.mockResolvedValueOnce([
      {
        questionId: 'q-1',
        optionId: 'o-1',
        segmentKey: 'ALL',
        votesCount: 300,
        segmentTotal: 500,
        updatedAt: new Date('2026-11-26T14:00:00Z'),
      },
      {
        questionId: 'q-1',
        optionId: 'o-1',
        segmentKey: 'STATE:AC',
        votesCount: 5,
        segmentTotal: 8,
        updatedAt: new Date('2026-11-26T14:00:00Z'),
      },
    ] as never)

    const suppressed = await service.getResults('pesquisa-sp', 'STATE:AC')
    expect(suppressed.kAnonymitySuppressed).toBe(true)
    expect(suppressed.questions).toEqual([])
    expect(suppressed.availableSegments).toEqual(['ALL'])
  })
})
