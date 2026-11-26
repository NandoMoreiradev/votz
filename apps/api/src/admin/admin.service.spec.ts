import { BadRequestException, NotFoundException } from '@nestjs/common'
import { CompanyPlan, EntityPlan, ModerationActionType, PoliticianPlan, UserType } from '@prisma/client'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AdminRepository } from './admin.repository'
import { AdminService } from './admin.service'
import { SetBanDto } from './dto/ban-user.dto'
import { DeleteReportDto } from './dto/delete-report.dto'

describe('AdminService', () => {
  let service: AdminService
  let repo: any
  let prisma: any
  let storage: any
  let mail: any
  let socketRegistry: any

  beforeEach(() => {
    repo = {
      stats: jest.fn(),
      listUsers: jest.fn(),
      findUserForBan: jest.fn(),
      countAdmins: jest.fn(),
      setBan: jest.fn(),
      setUserType: jest.fn(),
      listReports: jest.fn(),
      deleteReport: jest.fn(),
      listEntities: jest.fn(),
      setEntityVerified: jest.fn(),
      listPoliticians: jest.fn(),
      setPoliticianVerified: jest.fn(),
      listCompanies: jest.fn(),
      setCompanyVerified: jest.fn(),
      setEntityPlan: jest.fn(),
      setPoliticianPlan: jest.fn(),
      setCompanyPlan: jest.fn(),
      findApiKeyForTier: jest.fn(),
      setApiKeyTier: jest.fn(),
    }
    prisma = {
      moderationAction: {
        update: jest.fn().mockResolvedValue({ id: 'act-1', notifiedAt: new Date() }),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    }
    storage = {
      extractKeyFromUrl: jest.fn((url: string) =>
        url?.includes('r2.dev/') ? url.split('r2.dev/')[1] : null,
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    mail = {
      sendModerationNotice: jest.fn().mockResolvedValue(true),
    }
    socketRegistry = {
      disconnectUser: jest.fn().mockReturnValue(1),
    }
    service = new AdminService(repo, prisma, storage, mail, socketRegistry)
  })

  it('delegates stats and clamps pagination limit to 50', async () => {
    repo.stats.mockResolvedValue({ users: 10 })
    await expect(service.stats()).resolves.toEqual({ users: 10 })

    repo.listUsers.mockResolvedValue({ data: [], total: 0 })
    await service.listUsers('ana', 2, 200)
    expect(repo.listUsers).toHaveBeenCalledWith({ search: 'ana', page: 2, limit: 50 })

    repo.listReports.mockResolvedValue({ data: [], total: 0 })
    await service.listReports('buraco', 1, 100)
    expect(repo.listReports).toHaveBeenCalledWith({ search: 'buraco', page: 1, limit: 50 })
  })

  it('libera espaço extra de arquivos das conversas só com motivo e para usuário existente', async () => {
    prisma.user = { findUnique: jest.fn().mockResolvedValue(null) }
    prisma.chatStorage = {
      upsert: jest.fn().mockResolvedValue({ userId: 'u1', quotaMb: 10240 }),
    }

    await expect(
      service.setChatStorageQuota('u1', 10240, 'admin-1', 'curto'),
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(
      service.setChatStorageQuota('u1', 10240, 'admin-1', 'Plano de 10 GB combinado'),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.chatStorage.upsert).not.toHaveBeenCalled()

    prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
    await expect(
      service.setChatStorageQuota('u1', 10240, 'admin-1', '  Plano de 10 GB combinado  '),
    ).resolves.toEqual({ userId: 'u1', quotaMb: 10240 })
    expect(prisma.chatStorage.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', quotaMb: 10240 },
      update: { quotaMb: 10240 },
      select: { userId: true, quotaMb: true },
    })
  })

  it('delegates plan and verification mutations', async () => {
    await service.verifyEntity('e1', true)
    expect(repo.setEntityVerified).toHaveBeenCalledWith('e1', true)

    await service.verifyPolitician('p1', true)
    expect(repo.setPoliticianVerified).toHaveBeenCalledWith('p1', true)

    await service.verifyCompany('c1', true)
    expect(repo.setCompanyVerified).toHaveBeenCalledWith('c1', true)

    await service.listCompanies('colegio', false, 1, 100)
    expect(repo.listCompanies).toHaveBeenCalledWith({ search: 'colegio', verified: false, page: 1, limit: 50 })

    await service.setEntityPlan('e1', EntityPlan.GESTAO)
    expect(repo.setEntityPlan).toHaveBeenCalledWith('e1', EntityPlan.GESTAO)

    await service.setPoliticianPlan('p1', PoliticianPlan.MANDATO_PRO)
    expect(repo.setPoliticianPlan).toHaveBeenCalledWith('p1', PoliticianPlan.MANDATO_PRO)

    await service.setCompanyPlan('c1', CompanyPlan.BUSINESS)
    expect(repo.setCompanyPlan).toHaveBeenCalledWith('c1', CompanyPlan.BUSINESS)
  })

  describe('setUserType', () => {
    it('changes role, records audit reason with old->new type, and revokes refresh sessions', async () => {
      repo.findUserForBan.mockResolvedValue({ id: 'u1', type: UserType.CITIZEN })
      repo.setUserType.mockResolvedValue({
        user: { id: 'u1', type: UserType.MODERATOR },
        actionId: 'act-type-1',
      })

      const res = await service.setUserType(
        'u1',
        UserType.MODERATOR,
        'adm-1',
        'Promovido após treinamento de moderação.',
      )

      expect(res).toEqual({ id: 'u1', type: UserType.MODERATOR })
      expect(repo.setUserType).toHaveBeenCalledWith(
        'u1',
        UserType.MODERATOR,
        'adm-1',
        'CITIZEN → MODERATOR: Promovido após treinamento de moderação.',
        UserType.CITIZEN,
      )
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
    })

    it('forbids changing own role, short reason, org roles, or demoting the last admin', async () => {
      await expect(
        service.setUserType('adm-1', UserType.CITIZEN, 'adm-1', 'Alterando a própria conta'),
      ).rejects.toThrow(BadRequestException)

      await expect(
        service.setUserType('u1', UserType.MODERATOR, 'adm-1', 'curto'),
      ).rejects.toThrow(BadRequestException)

      for (const orgRole of [UserType.ENTITY, UserType.POLITICIAN, UserType.COMPANY]) {
        await expect(
          service.setUserType('u1', orgRole, 'adm-1', 'Motivo válido com mais de dez caracteres'),
        ).rejects.toThrow(BadRequestException)
      }

      repo.findUserForBan.mockResolvedValueOnce({ id: 'adm-2', type: UserType.ADMIN })
      repo.countAdmins.mockResolvedValueOnce(1)
      await expect(
        service.setUserType('adm-2', UserType.CITIZEN, 'adm-1', 'Tentando rebaixar último admin'),
      ).rejects.toThrow(BadRequestException)

      repo.findUserForBan.mockResolvedValueOnce({ id: 'adm-2', type: UserType.ADMIN })
      repo.countAdmins.mockResolvedValueOnce(2)
      repo.setUserType.mockResolvedValueOnce({
        user: { id: 'adm-2', type: UserType.MODERATOR },
        actionId: 'act-type-2',
      })
      await expect(
        service.setUserType('adm-2', UserType.MODERATOR, 'adm-1', 'Rebaixando com outro admin ativo'),
      ).resolves.toEqual({ id: 'adm-2', type: UserType.MODERATOR })
    })
  })

  describe('banUser', () => {
    it('forbids banning self, admin, moderator, or missing reason', async () => {
      await expect(service.banUser('mod-1', true, 'mod-1', 'Motivo válido qualquer'))
        .rejects.toThrow(BadRequestException)

      await expect(service.banUser('u1', true, 'mod-1', 'curto'))
        .rejects.toThrow(BadRequestException)

      repo.findUserForBan.mockResolvedValueOnce({ id: 'adm-2', type: UserType.ADMIN })
      await expect(service.banUser('adm-2', true, 'mod-1', 'Motivo válido com mais de 10 chars'))
        .rejects.toThrow(BadRequestException)

      repo.findUserForBan.mockResolvedValueOnce({ id: 'mod-2', type: UserType.MODERATOR })
      await expect(service.banUser('mod-2', true, 'mod-1', 'Motivo válido com mais de 10 chars'))
        .rejects.toThrow(BadRequestException)

      repo.findUserForBan.mockResolvedValueOnce(null)
      await expect(service.banUser('missing', true, 'mod-1', 'Motivo válido com mais de 10 chars'))
        .rejects.toThrow(NotFoundException)
    })

    it('bans citizen, creates audit, notifies via email, and stamps notifiedAt', async () => {
      repo.findUserForBan.mockResolvedValue({
        id: 'u1',
        name: 'Carlos',
        email: 'carlos@votz.app',
        type: UserType.CITIZEN,
        banned: false,
      })
      repo.setBan.mockResolvedValue({ user: { id: 'u1', banned: true }, actionId: 'act-ban-1' })

      const res = await service.banUser('u1', true, 'mod-1', 'Publicações repetidas com spam.')

      expect(res).toEqual({ id: 'u1', banned: true })
      expect(repo.setBan).toHaveBeenCalledWith('u1', true, 'mod-1', 'Publicações repetidas com spam.')
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      })
      expect(socketRegistry.disconnectUser).toHaveBeenCalledWith('u1')
      expect(mail.sendModerationNotice).toHaveBeenCalledWith(
        'carlos@votz.app',
        'Carlos',
        'ACCOUNT_BANNED',
        'Publicações repetidas com spam.',
      )
      expect(prisma.moderationAction.update).toHaveBeenCalledWith({
        where: { id: 'act-ban-1' },
        data: { notifiedAt: expect.any(Date) },
      })
    })

    it('unbans without sending email', async () => {
      repo.findUserForBan.mockResolvedValue({
        id: 'u1',
        name: 'Carlos',
        email: 'carlos@votz.app',
        type: UserType.CITIZEN,
        banned: true,
      })
      repo.setBan.mockResolvedValue({ user: { id: 'u1', banned: false }, actionId: 'act-unban-1' })

      const res = await service.banUser('u1', false, 'admin-1')

      expect(res).toEqual({ id: 'u1', banned: false })
      expect(repo.setBan).toHaveBeenCalledWith('u1', false, 'admin-1', 'Desbanido pela moderação')
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled()
      expect(socketRegistry.disconnectUser).not.toHaveBeenCalled()
      expect(mail.sendModerationNotice).not.toHaveBeenCalled()
      expect(prisma.moderationAction.update).not.toHaveBeenCalled()
    })
  })

  describe('deleteReport', () => {
    it('deletes report media + comment audio, notifies identified author, and sets notifiedAt', async () => {
      repo.deleteReport.mockResolvedValue({
        actionId: 'act-rep-1',
        reportMedia: ['https://pub.r2.dev/reports/img1.jpg'],
        commentMediaKeys: ['comments/audio1.webm'],
        author: { name: 'Ana', email: 'ana@votz.app' },
      })

      const res = await service.deleteReport('rep-1', 'mod-1', 'Contém dados pessoais de terceiros.')

      expect(res).toEqual({ deleted: true })
      expect(repo.deleteReport).toHaveBeenCalledWith('rep-1', 'mod-1', 'Contém dados pessoais de terceiros.')
      expect(storage.delete).toHaveBeenCalledWith('reports/img1.jpg')
      expect(storage.delete).toHaveBeenCalledWith('comments/audio1.webm')
      expect(mail.sendModerationNotice).toHaveBeenCalledWith(
        'ana@votz.app',
        'Ana',
        'REPORT_REMOVED',
        'Contém dados pessoais de terceiros.',
      )
      expect(prisma.moderationAction.update).toHaveBeenCalledWith({
        where: { id: 'act-rep-1' },
        data: { notifiedAt: expect.any(Date) },
      })
    })

    it('skips email and leaves notifiedAt null for anonymous report without error', async () => {
      repo.deleteReport.mockResolvedValue({
        actionId: 'act-rep-anon',
        reportMedia: [],
        commentMediaKeys: [],
        author: null,
      })

      const res = await service.deleteReport('rep-anon', 'mod-1', 'Spam fora do escopo da plataforma.')

      expect(res).toEqual({ deleted: true })
      expect(mail.sendModerationNotice).not.toHaveBeenCalled()
      expect(prisma.moderationAction.update).not.toHaveBeenCalled()
    })

    it('does not roll back report deletion if email fails and leaves notifiedAt null', async () => {
      repo.deleteReport.mockResolvedValue({
        actionId: 'act-rep-fail',
        reportMedia: [],
        commentMediaKeys: [],
        author: { name: 'Ana', email: 'ana@votz.app' },
      })
      mail.sendModerationNotice.mockResolvedValueOnce(false)

      await expect(service.deleteReport('rep-1', 'mod-1', 'Conteúdo ofensivo grave.'))
        .resolves.toEqual({ deleted: true })
      expect(prisma.moderationAction.update).not.toHaveBeenCalled()

      mail.sendModerationNotice.mockRejectedValueOnce(new Error('SMTP crash'))
      await expect(service.deleteReport('rep-1', 'mod-1', 'Conteúdo ofensivo grave.'))
        .resolves.toEqual({ deleted: true })
      expect(prisma.moderationAction.update).not.toHaveBeenCalled()
    })
  })

  describe('DTO validation (T1)', () => {
    it('rejects SetBanDto without reason when banned=true and accepts banned=false without reason', async () => {
      const invalidMissingReason = plainToInstance(SetBanDto, { banned: true })
      expect(await validate(invalidMissingReason)).not.toHaveLength(0)

      const invalidShortReason = plainToInstance(SetBanDto, { banned: true, reason: '  curto  ' })
      expect(await validate(invalidShortReason)).not.toHaveLength(0)

      const invalidNonBool = plainToInstance(SetBanDto, { banned: 'yes', reason: 'Motivo suficientemente longo' })
      expect(await validate(invalidNonBool)).not.toHaveLength(0)

      const validBan = plainToInstance(SetBanDto, { banned: true, reason: 'Motivo válido pela moderação.' })
      expect(await validate(validBan)).toHaveLength(0)

      const validUnban = plainToInstance(SetBanDto, { banned: false })
      expect(await validate(validUnban)).toHaveLength(0)
    })

    it('rejects DeleteReportDto when reason is shorter than 10 chars', async () => {
      const invalid = plainToInstance(DeleteReportDto, { reason: '    curto   ' })
      expect(await validate(invalid)).not.toHaveLength(0)

      const valid = plainToInstance(DeleteReportDto, { reason: 'Violação das diretrizes da comunidade.' })
      expect(await validate(valid)).toHaveLength(0)
    })
  })
})

describe('AdminRepository.deleteReport (FK dependency cleanup)', () => {
  it('deletes notifications, votes, comments, followers, timelineEvents before report and records ModerationAction inside transaction', async () => {
    const order: string[] = []
    const tx: any = {
      report: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rep-fk-1',
          anonymous: false,
          authorId: 'u-author',
          media: ['https://pub.r2.dev/reports/photo.jpg'],
          author: { name: 'João', email: 'joao@votz.app' },
        }),
        delete: jest.fn(async () => {
          order.push('report.delete')
          return { id: 'rep-fk-1' }
        }),
      },
      comment: {
        findMany: jest.fn().mockResolvedValue([{ mediaKey: 'comments/voice-1.webm' }]),
        updateMany: jest.fn(async () => {
          order.push('comment.unlinkReplies')
          return { count: 1 }
        }),
        deleteMany: jest.fn(async () => {
          order.push('comment.deleteMany')
          return { count: 2 }
        }),
      },
      notification: {
        deleteMany: jest.fn(async () => {
          order.push('notification.deleteMany')
          return { count: 1 }
        }),
      },
      vote: {
        deleteMany: jest.fn(async () => {
          order.push('vote.deleteMany')
          return { count: 3 }
        }),
      },
      reportFollower: {
        deleteMany: jest.fn(async () => {
          order.push('reportFollower.deleteMany')
          return { count: 1 }
        }),
      },
      timelineEvent: {
        deleteMany: jest.fn(async () => {
          order.push('timelineEvent.deleteMany')
          return { count: 2 }
        }),
      },
      moderationAction: {
        create: jest.fn(async () => {
          order.push('moderationAction.create')
          return { id: 'act-fk-1' }
        }),
      },
    }

    const prismaMock: any = {
      $transaction: jest.fn((fn: any) => fn(tx)),
    }

    const repo = new AdminRepository(prismaMock)
    const res = await repo.deleteReport('rep-fk-1', 'mod-1', 'Relato falso comprovado.')

    expect(order).toEqual([
      'notification.deleteMany',
      'vote.deleteMany',
      'comment.unlinkReplies',
      'comment.deleteMany',
      'reportFollower.deleteMany',
      'timelineEvent.deleteMany',
      'report.delete',
      'moderationAction.create',
    ])
    expect(tx.moderationAction.create).toHaveBeenCalledWith({
      data: {
        action: ModerationActionType.REPORT_REMOVED,
        targetType: 'REPORT',
        targetId: 'rep-fk-1',
        reason: 'Relato falso comprovado.',
        actorId: 'mod-1',
      },
    })
    expect(res).toEqual({
      actionId: 'act-fk-1',
      reportMedia: ['https://pub.r2.dev/reports/photo.jpg'],
      commentMediaKeys: ['comments/voice-1.webm'],
      author: { name: 'João', email: 'joao@votz.app' },
    })
  })

  it('AdminRepository.setUserType updates type and creates USER_TYPE_CHANGED audit in one transaction', async () => {
    const tx: any = {
      user: {
        update: jest.fn().mockResolvedValue({ id: 'u-t1', type: UserType.MODERATOR }),
      },
      moderationAction: {
        create: jest.fn().mockResolvedValue({ id: 'act-type-tx' }),
      },
    }
    const prismaMock: any = { $transaction: jest.fn((fn: any) => fn(tx)) }

    const { AdminRepository } = require('./admin.repository')
    const repo = new AdminRepository(prismaMock)
    const result = await repo.setUserType(
      'u-t1',
      UserType.MODERATOR,
      'adm-1',
      'CITIZEN → MODERATOR: Motivo auditado válido.',
    )

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-t1' },
      data: { type: UserType.MODERATOR },
      select: { id: true, type: true },
    })
    expect(tx.moderationAction.create).toHaveBeenCalledWith({
      data: {
        action: ModerationActionType.USER_TYPE_CHANGED,
        targetType: 'USER',
        targetId: 'u-t1',
        reason: 'CITIZEN → MODERATOR: Motivo auditado válido.',
        actorId: 'adm-1',
      },
    })
    expect(result).toEqual({
      user: { id: 'u-t1', type: UserType.MODERATOR },
      actionId: 'act-type-tx',
    })
  })

  it('AdminRepository.setUserType grants verified when promoting to PRESS and removes it when leaving PRESS', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'u-p1', type: UserType.PRESS })
    const tx: any = { user: { update }, moderationAction: { create: jest.fn().mockResolvedValue({ id: 'a1' }) } }
    const prismaMock: any = { $transaction: jest.fn((fn: any) => fn(tx)) }
    const { AdminRepository } = require('./admin.repository')
    const repo = new AdminRepository(prismaMock)

    await repo.setUserType('u-p1', UserType.PRESS, 'adm-1', 'CITIZEN → PRESS: credencial conferida.', UserType.CITIZEN)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { type: UserType.PRESS, verified: true } }))

    await repo.setUserType('u-p1', UserType.CITIZEN, 'adm-1', 'PRESS → CITIZEN: credencial revogada.', UserType.PRESS)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { type: UserType.CITIZEN, verified: false } }))
  })

  describe('setApiKeyTier', () => {
    it('changes key tier with audit reason and rejects missing key or short reason', async () => {
      const repo: any = {
        findApiKeyForTier: jest.fn(),
        setApiKeyTier: jest.fn(),
      }
      const service = new AdminService(repo, {} as any, {} as any, {} as any)

      await expect(
        service.setApiKeyTier('k1', 'PAID' as any, 'adm-1', 'curto'),
      ).rejects.toThrow(BadRequestException)

      repo.findApiKeyForTier.mockResolvedValueOnce(null)
      await expect(
        service.setApiKeyTier('missing', 'PAID' as any, 'adm-1', 'Motivo administrativo válido.'),
      ).rejects.toThrow(NotFoundException)

      repo.findApiKeyForTier.mockResolvedValueOnce({
        id: 'k1',
        name: 'Portal',
        prefix: 'vtz_12345678',
        tier: 'FREE',
        userId: 'u1',
        revokedAt: null,
      })
      repo.setApiKeyTier.mockResolvedValueOnce({
        apiKey: { id: 'k1', tier: 'PAID' },
        actionId: 'act-tier-1',
      })

      const res = await service.setApiKeyTier(
        'k1',
        'PAID' as any,
        'adm-1',
        'Aprovado para contrato institucional.',
      )

      expect(res).toEqual({ id: 'k1', tier: 'PAID' })
      expect(repo.setApiKeyTier).toHaveBeenCalledWith(
        'k1',
        'PAID',
        'adm-1',
        'FREE → PAID: Aprovado para contrato institucional.',
      )
    })

    it('AdminRepository.setApiKeyTier updates tier and creates API_KEY_TIER_CHANGED audit atomically', async () => {
      const tx: any = {
        apiKey: {
          update: jest.fn().mockResolvedValue({ id: 'k1', tier: 'PAID' }),
        },
        moderationAction: {
          create: jest.fn().mockResolvedValue({ id: 'act-tier-tx' }),
        },
      }
      const prismaMock: any = { $transaction: jest.fn((fn: any) => fn(tx)) }

      const { AdminRepository } = require('./admin.repository')
      const repository = new AdminRepository(prismaMock)
      const result = await repository.setApiKeyTier(
        'k1',
        'PAID' as any,
        'adm-1',
        'FREE → PAID: Motivo auditado válido.',
      )

      expect(tx.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'k1' },
        data: { tier: 'PAID' },
        select: { id: true, name: true, prefix: true, tier: true, userId: true, updatedAt: true },
      })
      expect(tx.moderationAction.create).toHaveBeenCalledWith({
        data: {
          action: ModerationActionType.API_KEY_TIER_CHANGED,
          targetType: 'API_KEY',
          targetId: 'k1',
          reason: 'FREE → PAID: Motivo auditado válido.',
          actorId: 'adm-1',
        },
      })
      expect(result).toEqual({ apiKey: { id: 'k1', tier: 'PAID' }, actionId: 'act-tier-tx' })
    })
  })
})
