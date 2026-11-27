import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Optional } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import * as bcrypt from 'bcrypt'
import { Prisma, UserType } from '@prisma/client'
import { MIN_AGE, PRIVACY_VERSION, TERMS_VERSION } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { HandlesService } from '../handles/handles.service'
import { AdsViewerCacheService } from '../ads/ads-viewer/ads-viewer-cache.service'
import { UsersRepository } from './users.repository'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { UpdatePreferencesDto } from './dto/update-preferences.dto'
import { AcceptConsentDto } from './dto/accept-consent.dto'
import { DeleteAccountDto } from './dto/delete-account.dto'
import { LGPD_QUEUE, LgpdExportJob } from './lgpd.processor'
import { SUPPORT_EMAIL } from '../common/legal.constants'

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(LGPD_QUEUE) private readonly lgpdQueue: Queue,
    private readonly handles: HandlesService,
    /** Cópia curta do cadastro usada pela entrega de anúncios: apagada quando a pessoa muda o que ela usa. */
    @Optional() private readonly adsViewerCache?: AdsViewerCacheService,
  ) {}

  async search(rawQuery: string, page = 1, limit = 15) {
    const query = rawQuery.trim().slice(0, 100)
    const handleQuery = query.replace(/^@+/, '')
    const safePage = Math.max(1, Math.floor(page) || 1)
    const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 15), 25)
    if (handleQuery.length < 2) {
      return { data: [], meta: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } }
    }
    return this.repo.searchPublic(query, handleQuery, safePage, safeLimit)
  }

  async findById(id: string) {
    const user = await this.repo.findByIdWithStats(id)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async findMe(id: string) {
    const user = await this.repo.findMe(id)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  async findUserReports(userId: string, page: number, limit: number) {
    const user = await this.repo.findById(userId)
    if (!user) throw new NotFoundException('User not found')
    return this.repo.findUserReports(userId, page, limit)
  }

  async updateProfile(id: string, requesterId: string, dto: UpdateProfileDto) {
    if (id !== requesterId) throw new ForbiddenException()
    const user = await this.repo.findById(id)
    if (!user) throw new NotFoundException('User not found')
    if (dto.avatarUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.avatarUrl, 'avatars')
    }
    if (dto.coverUrl !== undefined) {
      this.storage.assertOwnStorageUrl(dto.coverUrl, 'covers')
    }
    if (dto.username !== undefined) {
      // Nome único em todo o Votz: cidadão, político, entidade e empresa.
      await this.handles.assertAvailable(dto.username, { kind: 'USER', id })
    }
    try {
      const saved = await this.saveProfile(id, dto)
      // Cidade, estado, nascimento e gênero entram na entrega de anúncios: a cópia curta é apagada para valer na hora.
      if (dto.city !== undefined || dto.state !== undefined || dto.birthDate !== undefined || dto.gender !== undefined) {
        await this.adsViewerCache?.invalidate(id)
      }
      return saved
    } catch (err) {
      // Dois pedidos ao mesmo tempo pelo mesmo nome: o banco barra o segundo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este nome de usuário já está em uso')
      }
      throw err
    }
  }

  private saveProfile(id: string, dto: UpdateProfileDto) {
    return this.repo.updateProfile(id, {
      name: dto.name,
      username: dto.username,
      bio: dto.bio,
      avatarUrl: dto.avatarUrl,
      coverUrl: dto.coverUrl,
      phone: dto.phone,
      zipCode: dto.zipCode,
      streetNumber: dto.streetNumber,
      complement: dto.complement,
      street: dto.street,
      neighborhood: dto.neighborhood,
      city: dto.city,
      state: dto.state,
      latitude: dto.latitude,
      longitude: dto.longitude,
      // `null` apaga; ausente não muda. Data só (sem hora), como a pessoa informou.
      birthDate: dto.birthDate === undefined ? undefined : dto.birthDate === null ? null : new Date(`${dto.birthDate}T00:00:00Z`),
      gender: dto.gender,
      themePreference: dto.themePreference,
    })
  }

  async getPreferences(userId: string) {
    const saved = await this.repo.findPreferences(userId)
    return {
      inAppEnabled: saved?.inAppEnabled ?? true,
      emailEnabled: saved?.emailEnabled ?? true,
      pushEnabled: saved?.pushEnabled ?? true,
      reportUpdates: saved?.reportUpdates ?? true,
      reportComments: saved?.reportComments ?? true,
      officialResponses: saved?.officialResponses ?? true,
      localSurges: saved?.localSurges ?? true,
      officialSurveys: saved?.officialSurveys ?? true,
      mentions: saved?.mentions ?? true,
      weeklyDigest: saved?.weeklyDigest ?? false,
      quietHoursStart: saved?.quietHoursStart ?? null,
      quietHoursEnd: saved?.quietHoursEnd ?? null,
      defaultAnonymousReports: saved?.defaultAnonymousReports ?? false,
      publicActivityVisible: saved?.publicActivityVisible ?? true,
      acceptPressContact: saved?.acceptPressContact ?? false,
    }
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const saved = await this.repo.upsertPreferences(userId, dto)
    return {
      inAppEnabled: saved.inAppEnabled,
      emailEnabled: saved.emailEnabled,
      pushEnabled: saved.pushEnabled,
      reportUpdates: saved.reportUpdates,
      reportComments: saved.reportComments,
      officialResponses: saved.officialResponses,
      localSurges: saved.localSurges,
      officialSurveys: saved.officialSurveys,
      mentions: saved.mentions,
      weeklyDigest: saved.weeklyDigest,
      quietHoursStart: saved.quietHoursStart,
      quietHoursEnd: saved.quietHoursEnd,
      defaultAnonymousReports: saved.defaultAnonymousReports,
      publicActivityVisible: saved.publicActivityVisible,
      acceptPressContact: saved.acceptPressContact,
    }
  }

  async acceptConsent(userId: string, dto: AcceptConsentDto) {
    if (dto.confirmAge18 !== true) {
      throw new BadRequestException(`É preciso ter ${MIN_AGE} anos ou mais para continuar.`)
    }
    if (
      dto.acceptedTermsVersion !== TERMS_VERSION ||
      dto.acceptedPrivacyVersion !== PRIVACY_VERSION
    ) {
      throw new ConflictException(
        'Os Termos foram atualizados. Recarregue a página e aceite novamente.',
      )
    }

    const existing = await this.repo.findById(userId)
    if (!existing) throw new NotFoundException('User not found')

    const now = new Date()
    return this.repo.acceptConsent(userId, {
      termsAcceptedAt: now,
      ageConfirmedAt: now,
      termsVersion: dto.acceptedTermsVersion,
      privacyVersion: dto.acceptedPrivacyVersion,
    })
  }

  async requestDataExport(userId: string) {
    const user = await this.repo.findWithPassword(userId)
    if (!user) throw new NotFoundException('User not found')

    const job: LgpdExportJob = { userId, email: user.email, name: user.name }
    await this.lgpdQueue.add('export-data', job, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    })

    return { message: 'Exportação iniciada. Você receberá um e-mail em breve com o link de download.' }
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.repo.findWithPassword(userId)
    if (!user) throw new NotFoundException('User not found')

    if (([UserType.ADMIN, UserType.MODERATOR] as string[]).includes(user.type)) {
      throw new BadRequestException(
        `Contas de moderadores e administradores não podem ser encerradas pelo portal. Entre em contato pelo e-mail ${SUPPORT_EMAIL}.`,
      )
    }

    const hasOrgMembership = await this.prisma.orgMembership.findFirst({
      where: { userId, status: 'ACTIVE', orgType: { in: ['ENTITY', 'POLITICIAN'] } },
    })

    if (hasOrgMembership) {
      throw new BadRequestException(
        `Contas vinculadas a perfis de político ou entidade não podem ser encerradas pelo portal. Entre em contato pelo e-mail ${SUPPORT_EMAIL}.`,
      )
    }

    if (user.password) {
      if (!dto.password || typeof dto.password !== 'string' || dto.password.trim() === '') {
        throw new BadRequestException('Senha é obrigatória para confirmar o encerramento da conta')
      }
      const valid = await bcrypt.compare(dto.password, user.password)
      if (!valid) throw new ForbiddenException('Senha incorreta')
    } else {
      if (!dto.confirmEmail || typeof dto.confirmEmail !== 'string' || dto.confirmEmail.trim() === '') {
        throw new BadRequestException('Digite seu e-mail para confirmar o encerramento da conta.')
      }
      if (dto.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
        throw new ForbiddenException('E-mail de confirmação incorreto.')
      }
    }

    await this.eraseUserData(userId, user.avatarUrl, user.coverUrl)

    return { message: 'Conta encerrada com sucesso.' }
  }

  /**
   * Apaga/anonimiza dados pessoais do usuário no banco e limpa objetos no R2.
   * Reutilizado pelo encerramento voluntário e pela anonimização por inatividade (24 meses).
   */
  async eraseUserData(userId: string, knownAvatarUrl?: string | null, knownCoverUrl?: string | null): Promise<void> {
    let avatarUrl = knownAvatarUrl
    let coverUrl = knownCoverUrl
    if (avatarUrl === undefined) {
      const target = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true, coverUrl: true },
      })
      if (!target) return
      avatarUrl = target.avatarUrl
      coverUrl = target.coverUrl
    }

    // Collect verification document R2 keys and avatar R2 key before deleting requests
    const reqs = await this.prisma.registrationRequest.findMany({
      where: { requesterId: userId },
      select: { payload: true },
    })
    const r2Keys: string[] = []
    for (const req of reqs) {
      const docs = (req.payload as Record<string, unknown>)?.['documents'] as Record<string, string> | undefined
      if (docs && typeof docs === 'object') {
        for (const key of Object.values(docs)) {
          if (typeof key === 'string' && key.startsWith('verification/')) r2Keys.push(key)
        }
      }
    }

    const avatarKey = this.storage.extractKeyFromUrl?.(avatarUrl ?? null)
    if (avatarKey) r2Keys.push(avatarKey)
    const coverKey = this.storage.extractKeyFromUrl?.(coverUrl ?? null)
    if (coverKey) r2Keys.push(coverKey)

    // Database cleanup in interactive transaction (order matters for FK constraints)
    await this.prisma.$transaction(async (tx) => {
      // Collect comment IDs (to orphan replies) and audio mediaKeys (to clean R2 after commit)
      const userComments = await tx.comment.findMany({
        where: { authorId: userId },
        select: { id: true, mediaKey: true },
      })
      if (userComments.length > 0) {
        const commentIds = userComments.map((c) => c.id)
        for (const c of userComments) {
          if (c.mediaKey) r2Keys.push(c.mediaKey)
        }
        await tx.comment.updateMany({
          where: { parentId: { in: commentIds } },
          data: { parentId: null },
        })
      }

      // Anonymize optional user references (civic record preserved)
      await tx.report.updateMany({ where: { authorId: userId }, data: { authorId: null, anonymous: true } })
      await tx.timelineEvent.updateMany({ where: { authorId: userId }, data: { authorId: null } })
      await tx.propostaTimeline.updateMany({ where: { autorId: userId }, data: { autorId: null } })
      await tx.registrationRequest.updateMany({ where: { reviewerId: userId }, data: { reviewerId: null } })
      await tx.contentFlag.updateMany({ where: { reporterId: userId }, data: { reporterId: null } })
      await tx.moderationAction.updateMany({ where: { actorId: userId }, data: { actorId: null } })

      // Decrement debate poll option counters before deleting user poll votes
      const pollVotes = await tx.debatePollVote.findMany({
        where: { userId },
        select: { optionId: true },
      })
      if (pollVotes.length > 0) {
        const countsByOption = new Map<string, number>()
        for (const pv of pollVotes) {
          countsByOption.set(pv.optionId, (countsByOption.get(pv.optionId) ?? 0) + 1)
        }
        for (const [optionId, count] of countsByOption) {
          await tx.debatePollOption.update({
            where: { id: optionId },
            data: { totalVotes: { decrement: count } },
          })
        }
        await tx.debatePollVote.deleteMany({ where: { userId } })
      }

      // Collect post and postComment R2 mediaKeys before deleting user's social records
      const userPosts = await tx.post.findMany({
        where: { authorUserId: userId },
        select: { mediaKeys: true },
      })
      for (const up of userPosts) {
        r2Keys.push(...up.mediaKeys)
      }
      const userPostComments = await tx.postComment.findMany({
        where: { authorId: userId },
        select: { mediaKey: true },
      })
      for (const upc of userPostComments) {
        if (upc.mediaKey) r2Keys.push(upc.mediaKey)
      }

      // Hard-delete user-owned records (all required FK relations to User)
      await tx.postComment.deleteMany({ where: { authorId: userId } })
      await tx.post.deleteMany({ where: { authorUserId: userId } })
      await tx.userFollow.deleteMany({ where: { OR: [{ followerId: userId }, { followingId: userId }] } })
      await tx.userEntityFollower.deleteMany({ where: { userId } })
      await tx.userTopicFollower.deleteMany({ where: { userId } })
      await tx.debateQuestion.deleteMany({ where: { authorId: userId } })
      await tx.debateMessage.deleteMany({ where: { authorId: userId } })
      await tx.propostaVoto.deleteMany({ where: { usuarioId: userId } })
      await tx.apiKey.deleteMany({ where: { userId } })
      await tx.userPoliticianFollower.deleteMany({ where: { userId } })
      await tx.comment.deleteMany({ where: { authorId: userId } })
      await tx.vote.deleteMany({ where: { userId } })
      await tx.notification.deleteMany({ where: { userId } })
      await tx.orgMembership.deleteMany({ where: { userId } })
      await tx.registrationRequest.deleteMany({ where: { requesterId: userId } })
      await tx.refreshToken.deleteMany({ where: { userId } })

      // AccessLog NÃO é apagado: guarda legal obrigatória por 6 meses (Marco Civil, art. 15).
      await tx.user.delete({ where: { id: userId } })
    })

    // Delete R2 files after DB transaction succeeds (fire-and-forget)
    for (const key of new Set(r2Keys)) {
      this.storage.delete(key).catch(() => {})
    }
  }

  async followToggle(targetUserId: string, followerId: string) {
    if (targetUserId === followerId) {
      throw new BadRequestException('Você não pode seguir a si mesmo.')
    }
    const existing = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId: targetUserId } },
    })
    if (existing) {
      await this.prisma.userFollow.delete({ where: { id: existing.id } })
      return { following: false }
    }
    await this.prisma.userFollow.create({
      data: { followerId, followingId: targetUserId },
    })
    return { following: true }
  }

  async isFollowing(targetUserId: string, followerId: string) {
    const existing = await this.prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId: targetUserId } },
    })
    return { following: !!existing }
  }
}
