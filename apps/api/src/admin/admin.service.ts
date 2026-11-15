import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { UserType } from '@prisma/client'
import { cleanupR2Keys, deliverModerationNotice } from '../common/moderation.helper'
import { SocketSessionRegistry } from '../common/security/socket-session.registry'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { AdminRepository } from './admin.repository'

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name)

  constructor(
    private readonly repo: AdminRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    @Optional() private readonly socketRegistry?: SocketSessionRegistry,
  ) {}

  stats() { return this.repo.stats() }

  listUsers(search?: string, page = 1, limit = 20) {
    return this.repo.listUsers({ search, page, limit: Math.min(limit, 50) })
  }

  async banUser(id: string, banned: boolean, actorId: string, reason?: string) {
    if (id === actorId) {
      throw new BadRequestException('Você não pode alterar o banimento da própria conta.')
    }

    const trimmedReason = reason?.trim()
    if (banned && (!trimmedReason || trimmedReason.length < 10)) {
      throw new BadRequestException('Informe um motivo com pelo menos 10 caracteres para banir.')
    }

    const target = await this.repo.findUserForBan(id)
    if (!target) {
      throw new NotFoundException('Usuário não encontrado.')
    }
    if (banned && (target.type === UserType.ADMIN || target.type === UserType.MODERATOR)) {
      throw new BadRequestException('Não é possível banir contas de administrador ou moderador.')
    }

    const auditReason = trimmedReason || 'Desbanido pela moderação'
    const { user, actionId } = await this.repo.setBan(id, banned, actorId, auditReason)

    if (banned) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      this.socketRegistry?.disconnectUser(id)
      await deliverModerationNotice(this.mail, this.prisma, this.logger, {
        actionId,
        email: target.email,
        name: target.name,
        kind: 'ACCOUNT_BANNED',
        reason: auditReason,
      })
    }

    return user
  }

  async setUserType(id: string, type: string) {
    return this.repo.setUserType(id, type)
  }

  listReports(search?: string, page = 1, limit = 20) {
    return this.repo.listReports({ search, page, limit: Math.min(limit, 50) })
  }

  async deleteReport(id: string, actorId: string, reason: string) {
    const trimmedReason = reason?.trim()
    if (!trimmedReason || trimmedReason.length < 10) {
      throw new BadRequestException('Informe um motivo com pelo menos 10 caracteres.')
    }

    const deleted = await this.repo.deleteReport(id, actorId, trimmedReason)
    if (!deleted) {
      throw new NotFoundException('Relato não encontrado.')
    }

    const mediaKeys = [
      ...deleted.reportMedia.map((url) => this.storage.extractKeyFromUrl(url)),
      ...deleted.commentMediaKeys,
    ]
    cleanupR2Keys(this.storage, mediaKeys, this.logger)

    await deliverModerationNotice(this.mail, this.prisma, this.logger, {
      actionId: deleted.actionId,
      email: deleted.author?.email,
      name: deleted.author?.name,
      kind: 'REPORT_REMOVED',
      reason: trimmedReason,
    })

    return { deleted: true }
  }

  listEntities(verified?: boolean, page = 1, limit = 20) {
    return this.repo.listEntities({ verified, page, limit: Math.min(limit, 50) })
  }

  async verifyEntity(id: string, verified: boolean) {
    return this.repo.setEntityVerified(id, verified)
  }

  listPoliticians(verified?: boolean, page = 1, limit = 20) {
    return this.repo.listPoliticians({ verified, page, limit: Math.min(limit, 50) })
  }

  async verifyPolitician(id: string, verified: boolean) {
    return this.repo.setPoliticianVerified(id, verified)
  }

  async setEntityPlan(id: string, plan: string) {
    return this.repo.setEntityPlan(id, plan)
  }

  async setPoliticianPlan(id: string, plan: string) {
    return this.repo.setPoliticianPlan(id, plan)
  }

  async setCompanyPlan(id: string, plan: string) {
    return this.repo.setCompanyPlan(id, plan)
  }
}
