import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
import { YoutubeChannelsService } from './youtube-channels.service'

describe('YoutubeChannelsService', () => {
  let service: YoutubeChannelsService
  let repo: any
  let api: any
  let prisma: any

  const CHANNEL_ID = 'UCaaaaaaaaaaaaaaaaaaaaaa'

  const ctxUser = (type: 'POLITICIAN' | 'ENTITY' | 'COMPANY', orgId: string, userId = 'u1') => ({
    id: userId,
    type: 'CITIZEN',
    ctx: { type, id: orgId, name: 'Org', logoUrl: null, permissions: [OrgPermission.MANAGE_PROFILE] },
  })

  const record = (over: Record<string, unknown> = {}) => ({
    id: 'yc-1',
    orgType: OrgType.POLITICIAN,
    orgId: 'pol-1',
    channelId: CHANNEL_ID,
    title: 'Canal do João',
    verificationCode: 'votz-abc123',
    verifiedAt: null,
    createdAt: new Date(),
    ...over,
  })

  beforeEach(() => {
    repo = {
      findByChannelId: jest.fn().mockResolvedValue(null),
      findOwned: jest.fn(),
      listByOrg: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (data) => record(data)),
      markVerified: jest.fn(async (id, title) => record({ id, title, verifiedAt: new Date() })),
      delete: jest.fn(),
      deleteUnverified: jest.fn(),
      isVerifiedFor: jest.fn().mockResolvedValue(true),
    }
    api = {
      parseChannelRef: jest.fn().mockReturnValue({ kind: 'id', value: CHANNEL_ID }),
      getChannel: jest.fn().mockResolvedValue({ channelId: CHANNEL_ID, title: 'Canal do João', description: '' }),
      parseVideoId: jest.fn().mockReturnValue('dQw4w9WgXcQ'),
      getVideo: jest.fn().mockResolvedValue({
        videoId: 'dQw4w9WgXcQ',
        channelId: CHANNEL_ID,
        channelTitle: 'Canal do João',
        embeddable: true,
        privacyStatus: 'public',
        isLiveBroadcast: true,
      }),
    }
    prisma = {
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          role: { permissions: [OrgPermission.MANAGE_PROFILE] },
        }),
      },
    }
    service = new YoutubeChannelsService(repo, api, prisma)
  })

  describe('contexto', () => {
    it('só político e entidade (com permissão) mexem em canais', async () => {
      await expect(service.list({ id: 'u1', type: 'CITIZEN', ctx: null })).rejects.toThrow(ForbiddenException)
      await expect(service.list(ctxUser('COMPANY', 'emp-1'))).rejects.toThrow(ForbiddenException)

      await service.list(ctxUser('ENTITY', 'ent-1'))
      expect(repo.listByOrg).toHaveBeenCalledWith('ENTITY', 'ent-1')
    })
  })

  describe('add', () => {
    it('registra o canal da organização ativa com um código novo para colar na descrição', async () => {
      const res = await service.add(ctxUser('POLITICIAN', 'pol-1'), 'https://www.youtube.com/@canaldojoao')

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orgType: 'POLITICIAN',
          orgId: 'pol-1',
          channelId: CHANNEL_ID,
          createdByUserId: 'u1',
          verificationCode: expect.stringMatching(/^votz-[0-9a-f]{12}$/),
        }),
      )
      expect(res.verifiedAt).toBeNull()
    })

    it('recusa link que não é de canal e canal que não existe', async () => {
      api.parseChannelRef.mockReturnValueOnce(null)
      await expect(service.add(ctxUser('POLITICIAN', 'pol-1'), 'lixo')).rejects.toThrow(BadRequestException)

      api.getChannel.mockResolvedValueOnce(null)
      await expect(service.add(ctxUser('POLITICIAN', 'pol-1'), '@naoexiste')).rejects.toThrow(NotFoundException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('registrar de novo o mesmo canal devolve o que já existe', async () => {
      const existing = record()
      repo.findByChannelId.mockResolvedValue(existing)

      await expect(service.add(ctxUser('POLITICIAN', 'pol-1'), '@canaldojoao')).resolves.toBe(existing)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('canal já verificado por outra conta não pode ser tomado', async () => {
      repo.findByChannelId.mockResolvedValue(record({ orgId: 'pol-9', verifiedAt: new Date() }))

      await expect(service.add(ctxUser('POLITICIAN', 'pol-1'), '@canaldojoao')).rejects.toThrow(ConflictException)
      expect(repo.deleteUnverified).not.toHaveBeenCalled()
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('pedido antigo de outra conta que nunca verificou não trava o dono de verdade', async () => {
      repo.findByChannelId.mockResolvedValue(record({ id: 'yc-velho', orgId: 'pol-9', verifiedAt: null }))

      await service.add(ctxUser('POLITICIAN', 'pol-1'), '@canaldojoao')

      expect(repo.deleteUnverified).toHaveBeenCalledWith('yc-velho')
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'pol-1' }))
    })
  })

  describe('verify', () => {
    it('verifica quando o código está na descrição pública do canal', async () => {
      repo.findOwned.mockResolvedValue(record())
      api.getChannel.mockResolvedValue({
        channelId: CHANNEL_ID,
        title: 'Canal Novo Nome',
        description: 'Canal oficial. votz-abc123 — obrigado',
      })

      const res = await service.verify(ctxUser('POLITICIAN', 'pol-1'), 'yc-1')

      expect(repo.findOwned).toHaveBeenCalledWith('yc-1', 'POLITICIAN', 'pol-1')
      expect(api.getChannel).toHaveBeenCalledWith({ kind: 'id', value: CHANNEL_ID })
      expect(repo.markVerified).toHaveBeenCalledWith('yc-1', 'Canal Novo Nome')
      expect(res.verifiedAt).toBeInstanceOf(Date)
    })

    it('sem o código na descrição não verifica', async () => {
      repo.findOwned.mockResolvedValue(record())
      api.getChannel.mockResolvedValue({ channelId: CHANNEL_ID, title: 'Canal', description: 'sem código' })

      await expect(service.verify(ctxUser('POLITICIAN', 'pol-1'), 'yc-1')).rejects.toThrow(BadRequestException)
      expect(repo.markVerified).not.toHaveBeenCalled()
    })

    it('canal de outra organização não aparece e canal já verificado não consulta o YouTube', async () => {
      repo.findOwned.mockResolvedValueOnce(null)
      await expect(service.verify(ctxUser('POLITICIAN', 'pol-2'), 'yc-1')).rejects.toThrow(NotFoundException)

      const verified = record({ verifiedAt: new Date() })
      repo.findOwned.mockResolvedValueOnce(verified)
      await expect(service.verify(ctxUser('POLITICIAN', 'pol-1'), 'yc-1')).resolves.toBe(verified)
      expect(api.getChannel).not.toHaveBeenCalled()
    })
  })

  describe('remove', () => {
    it('só remove canal da própria organização', async () => {
      repo.findOwned.mockResolvedValueOnce(null)
      await expect(service.remove(ctxUser('ENTITY', 'ent-2'), 'yc-1')).rejects.toThrow(NotFoundException)
      expect(repo.delete).not.toHaveBeenCalled()

      repo.findOwned.mockResolvedValueOnce(record({ orgType: OrgType.ENTITY, orgId: 'ent-1' }))
      await expect(service.remove(ctxUser('ENTITY', 'ent-1'), 'yc-1')).resolves.toEqual({ removed: true })
      expect(repo.delete).toHaveBeenCalledWith('yc-1')
    })
  })

  describe('resolveVerifiedStream', () => {
    const resolve = () => service.resolveVerifiedStream('https://youtu.be/dQw4w9WgXcQ', OrgType.POLITICIAN, 'pol-1')

    it('aceita live incorporável de canal verificado da organização', async () => {
      await expect(resolve()).resolves.toEqual({
        videoId: 'dQw4w9WgXcQ',
        channelId: CHANNEL_ID,
        channelTitle: 'Canal do João',
      })
      expect(repo.isVerifiedFor).toHaveBeenCalledWith('POLITICIAN', 'pol-1', CHANNEL_ID)
    })

    it('recusa link que não é do YouTube', async () => {
      api.parseVideoId.mockReturnValueOnce(null)
      await expect(resolve()).rejects.toThrow(BadRequestException)
      expect(api.getVideo).not.toHaveBeenCalled()
    })

    it('recusa vídeo inexistente, privado, sem live e sem incorporação', async () => {
      api.getVideo.mockResolvedValueOnce(null)
      await expect(resolve()).rejects.toThrow(NotFoundException)

      api.getVideo.mockResolvedValueOnce({ ...(await api.getVideo()), privacyStatus: 'private' })
      await expect(resolve()).rejects.toThrow(/privado/)

      api.getVideo.mockResolvedValueOnce({ ...(await api.getVideo()), isLiveBroadcast: false })
      await expect(resolve()).rejects.toThrow(/transmissão ao vivo/)

      api.getVideo.mockResolvedValueOnce({ ...(await api.getVideo()), embeddable: false })
      await expect(resolve()).rejects.toThrow(/Permitir incorporação/)
    })

    it('recusa vídeo de canal que a organização não verificou (live de outra pessoa)', async () => {
      repo.isVerifiedFor.mockResolvedValue(false)
      await expect(resolve()).rejects.toThrow(ForbiddenException)
    })
  })
})
