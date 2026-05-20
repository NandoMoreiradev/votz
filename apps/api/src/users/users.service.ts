import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import * as bcrypt from 'bcrypt'
import { UserType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { UsersRepository } from './users.repository'
import { UpdateProfileDto } from './dto/update-profile.dto'
import { LGPD_QUEUE, LgpdExportJob } from './lgpd.processor'

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(LGPD_QUEUE) private readonly lgpdQueue: Queue,
  ) {}

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
    return this.repo.updateProfile(id, {
      name: dto.name,
      bio: dto.bio,
      avatarUrl: dto.avatarUrl,
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

  async deleteAccount(userId: string, password: string) {
    if (!password || typeof password !== 'string' || password.trim() === '') {
      throw new BadRequestException('Senha é obrigatória para confirmar o encerramento da conta')
    }

    const user = await this.repo.findWithPassword(userId)
    if (!user) throw new NotFoundException('User not found')

    if (([UserType.ADMIN, UserType.MODERATOR] as string[]).includes(user.type)) {
      throw new BadRequestException('Contas de moderadores e administradores não podem ser encerradas pelo portal. Entre em contato com o suporte.')
    }

    const hasOrgMembership = await this.prisma.orgMembership.findFirst({
      where: { userId, status: 'ACTIVE', orgType: { in: ['ENTITY', 'POLITICIAN'] } },
    })

    if (hasOrgMembership) {
      throw new BadRequestException('Contas vinculadas a perfis de político ou entidade não podem ser encerradas pelo portal. Entre em contato com o suporte.')
    }

    if (!user.password) {
      throw new BadRequestException('Esta conta usa login pelo Google. Para encerrá-la, desconecte pelo Google e entre em contato com o suporte.')
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new ForbiddenException('Senha incorreta')

    // Collect verification document R2 keys before deleting requests
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

    // Database cleanup in interactive transaction (order matters for FK constraints)
    await this.prisma.$transaction(async (tx) => {
      // Get IDs of this user's comments to orphan other users' replies
      const userCommentIds = await tx.comment.findMany({
        where: { authorId: userId },
        select: { id: true },
      })
      if (userCommentIds.length > 0) {
        await tx.comment.updateMany({
          where: { parentId: { in: userCommentIds.map((c) => c.id) } },
          data: { parentId: null },
        })
      }

      // Anonymize reports and timeline events (nullable FKs — civic record preserved)
      await tx.report.updateMany({ where: { authorId: userId }, data: { authorId: null, anonymous: true } })
      await tx.timelineEvent.updateMany({ where: { authorId: userId }, data: { authorId: null } })

      // Hard-delete user-owned data (non-public)
      await tx.comment.deleteMany({ where: { authorId: userId } })
      await tx.vote.deleteMany({ where: { userId } })
      await tx.notification.deleteMany({ where: { userId } })
      await tx.orgMembership.deleteMany({ where: { userId } })
      await tx.registrationRequest.deleteMany({ where: { requesterId: userId } })

      await tx.user.delete({ where: { id: userId } })
    })

    // Delete R2 files after DB transaction succeeds (fire-and-forget)
    for (const key of r2Keys) {
      this.storage.delete(key).catch(() => {})
    }

    return { message: 'Conta encerrada com sucesso.' }
  }
}
