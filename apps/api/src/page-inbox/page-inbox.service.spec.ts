import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { OrgType } from '@prisma/client'
import { CITIZEN_DAILY_LIMIT, PAGE_STARTED_PER_DAY, PageInboxService } from './page-inbox.service'
import { decryptBufferWithKey, encryptBufferWithKey } from '../crypto/crypto.service'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: (s: string) => s.replace(/<[^>]*>/g, ''),
}))

const fakeCrypto = {
  encrypt: (t: string) => `enc(${t})`,
  decrypt: (t: string) => t.replace(/^enc\(/, '').replace(/\)$/, ''),
  encryptBuffer: (b: Buffer) => Buffer.concat([Buffer.from('ENC:'), b]),
  decryptBuffer: (b: Buffer) => (b.subarray(0, 4).toString() === 'ENC:' ? b.subarray(4) : b),
}

describe('PageInboxService', () => {
  let prisma: any
  let memberships: any
  let storage: any
  let service: PageInboxService
  const org = { orgType: OrgType.POLITICIAN, orgId: 'p1' }

  beforeEach(() => {
    prisma = {
      politician: { findUnique: jest.fn().mockResolvedValue({ name: 'Maria', username: 'maria', avatarUrl: null }) },
      pageConversation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _sum: { citizenUnread: 0, staffUnread: 0 } }),
        create: jest.fn().mockResolvedValue({ id: 'c1' }),
        update: jest.fn().mockResolvedValue({ id: 'c1' }),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      pageMessage: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'm1', createdAt: new Date(), ...data })),
      },
      pageAttachment: {
        findFirst: jest.fn(),
      },
      pageConversationRead: {
        upsert: jest.fn().mockReturnValue('upsert'),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
      userPoliticianFollower: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    }
    prisma.$transaction.mockImplementation((arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    )
    memberships = { findMembership: jest.fn().mockResolvedValue(null) }
    storage = {
      uploadEncryptedBlob: jest.fn().mockResolvedValue(undefined),
      downloadEncryptedBlob: jest.fn().mockResolvedValue(Buffer.from('ENC:hello')),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    service = new PageInboxService(prisma, fakeCrypto as any, memberships, storage)
  })

  describe('sendAsCitizen', () => {
    it('cria a conversa e grava o texto cifrado, nunca em claro', async () => {
      const res = await service.sendAsCitizen('u1', org.orgType, org.orgId, 'Olá <b>equipe</b>')
      expect(prisma.pageConversation.create).toHaveBeenCalled()
      const saved = prisma.pageMessage.create.mock.calls[0][0].data
      expect(saved.bodyEnc).toBe('enc(Olá equipe)')
      expect(saved.senderKind).toBe('CITIZEN')
      expect(res.message.text).toBe('Olá equipe')
    })

    it('reabre uma conversa resolvida e conta mais uma não lida para a equipe', async () => {
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'RESOLVED' })
      await service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi de novo')
      expect(prisma.pageConversation.update.mock.calls[0][0].data).toMatchObject({
        status: 'OPEN',
        staffUnread: { increment: 1 },
      })
    })

    it('recusa quem foi bloqueado pela página', async () => {
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'BLOCKED', citizenAccepted: true })
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi')).rejects.toThrow(ForbiddenException)
      expect(prisma.pageMessage.create).not.toHaveBeenCalled()
    })

    it('recusa quem é da própria equipe da página', async () => {
      memberships.findMembership.mockResolvedValue({ status: 'ACTIVE' })
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi')).rejects.toThrow(ForbiddenException)
    })

    it('limita mensagens por dia e recusa texto vazio ou longo demais', async () => {
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'OPEN' })
      prisma.pageMessage.count.mockResolvedValue(CITIZEN_DAILY_LIMIT)
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi')).rejects.toThrow(ConflictException)
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, '   ')).rejects.toThrow(BadRequestException)
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'a'.repeat(2001))).rejects.toThrow(BadRequestException)
    })

    it('dá 404 se a página não existe', async () => {
      prisma.politician.findUnique.mockResolvedValue(null)
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi')).rejects.toThrow(NotFoundException)
    })
  })

  describe('myThreadWithPage', () => {
    it('devolve a página mesmo sem conversa (tela de /conversas antes da primeira mensagem)', async () => {
      const res = await service.myThreadWithPage('u1', org.orgType, org.orgId)
      expect(res).toEqual({
        conversation: null,
        page: { orgType: org.orgType, orgId: org.orgId, name: 'Maria', username: 'maria', avatarUrl: null },
      })
    })

    it('dá 404 se a página não existe', async () => {
      prisma.politician.findUnique.mockResolvedValue(null)
      await expect(service.myThreadWithPage('u1', org.orgType, org.orgId)).rejects.toThrow(NotFoundException)
    })
  })

  describe('equipe', () => {
    it('ao abrir a conversa registra quem leu e zera as não lidas', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({
        id: 'c1',
        status: 'OPEN',
        citizen: { id: 'u1', name: 'João', username: 'joao', avatarUrl: null },
        messages: [{ id: 'm1', senderKind: 'CITIZEN', bodyEnc: 'enc(Oi)', createdAt: new Date(), sender: { name: 'João' } }],
      })
      const res = await service.openForStaff('staff1', org.orgType, org.orgId, 'c1')
      expect(prisma.pageConversationRead.upsert.mock.calls[0][0].create).toEqual({ conversationId: 'c1', userId: 'staff1' })
      expect(res.messages[0].text).toBe('Oi')
    })

    it('a resposta mostra o nome de quem respondeu só para a equipe', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'OPEN' })
      prisma.pageMessage.create.mockResolvedValue({
        id: 'm2', senderKind: 'STAFF', bodyEnc: 'enc(Já vamos ver)', createdAt: new Date(), sender: { name: 'Ana' },
      })
      const res: any = await service.replyAsStaff('staff1', org.orgType, org.orgId, 'c1', 'Já vamos ver')
      expect(res.staffName).toBe('Ana')
      expect(prisma.pageConversation.update.mock.calls[0][0].data).toMatchObject({
        lastSender: 'STAFF',
        citizenUnread: { increment: 1 },
      })
    })

    it('não responde em conversa bloqueada nem em conversa de outra página', async () => {
      prisma.pageConversation.findFirst.mockResolvedValueOnce({ id: 'c1', status: 'BLOCKED' })
      await expect(service.replyAsStaff('s', org.orgType, org.orgId, 'c1', 'Oi')).rejects.toThrow(ConflictException)
      prisma.pageConversation.findFirst.mockResolvedValueOnce(null)
      await expect(service.replyAsStaff('s', org.orgType, org.orgId, 'c9', 'Oi')).rejects.toThrow(NotFoundException)
    })

    it('muda o estado só dentro da própria página', async () => {
      prisma.pageConversation.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.setStatus(org.orgType, org.orgId, 'c1', 'RESOLVED')).rejects.toThrow(NotFoundException)
      expect(prisma.pageConversation.updateMany.mock.calls[0][0].where).toEqual({ id: 'c1', orgType: 'POLITICIAN', orgId: 'p1' })
    })
  })

  describe('a página começa a conversa', () => {
    it('só chama quem segue a página', async () => {
      prisma.userPoliticianFollower.count.mockResolvedValue(0)
      await expect(service.startAsStaff('staff1', org.orgType, org.orgId, 'u1', 'Oi')).rejects.toThrow(ForbiddenException)
      expect(prisma.pageConversation.create).not.toHaveBeenCalled()
    })

    it('cria a conversa pendente de aceite, com a primeira mensagem cifrada', async () => {
      prisma.pageConversation.count.mockResolvedValue(0)
      prisma.pageMessage.create.mockResolvedValue({
        id: 'm1', senderKind: 'STAFF', bodyEnc: 'enc(Olá!)', createdAt: new Date(), sender: { name: 'Ana' },
      })
      const res = await service.startAsStaff('staff1', org.orgType, org.orgId, 'u1', 'Olá!')
      expect(res.created).toBe(true)
      expect(prisma.pageConversation.create.mock.calls[0][0].data).toMatchObject({
        startedBy: 'STAFF',
        citizenAccepted: false,
        citizenUnread: 1,
      })
      expect(prisma.pageMessage.create.mock.calls[0][0].data.bodyEnc).toBe('enc(Olá!)')
    })

    it('tem teto diário de conversas novas começadas pela página', async () => {
      prisma.pageConversation.count.mockResolvedValue(PAGE_STARTED_PER_DAY)
      await expect(service.startAsStaff('staff1', org.orgType, org.orgId, 'u1', 'Oi')).rejects.toMatchObject({ status: 429 })
    })

    it('não chama quem é da própria equipe, nem a si mesmo', async () => {
      memberships.findMembership.mockResolvedValue({ status: 'ACTIVE' })
      await expect(service.startAsStaff('staff1', org.orgType, org.orgId, 'u1', 'Oi')).rejects.toThrow(BadRequestException)
      await expect(service.startAsStaff('staff1', org.orgType, org.orgId, 'staff1', 'Oi')).rejects.toThrow(BadRequestException)
    })

    it('enquanto a pessoa não aceita, a página não manda mais mensagens', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'OPEN', startedBy: 'STAFF', citizenAccepted: false })
      await expect(service.replyAsStaff('staff1', org.orgType, org.orgId, 'c1', 'De novo')).rejects.toThrow(ConflictException)
    })

    it('o cidadão aceita ou recusa; recusar bloqueia só essa conversa', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({ id: 'c1', status: 'OPEN', startedBy: 'STAFF', citizenAccepted: false })
      prisma.pageConversation.update.mockResolvedValue({ status: 'OPEN' })
      expect(await service.respondAsCitizen('u1', 'c1', true)).toMatchObject({ accepted: true })
      expect(prisma.pageConversation.update.mock.calls[0][0].data).toMatchObject({ citizenAccepted: true, status: 'OPEN' })
      prisma.pageConversation.update.mockResolvedValue({ status: 'BLOCKED' })
      expect(await service.respondAsCitizen('u1', 'c1', false)).toMatchObject({ accepted: false, status: 'BLOCKED' })
    })

    it('quem recusou pode voltar a escrever; quem foi bloqueado pela página não', async () => {
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'BLOCKED', citizenAccepted: false })
      await service.sendAsCitizen('u1', org.orgType, org.orgId, 'Mudei de ideia')
      expect(prisma.pageConversation.update.mock.calls[0][0].data).toMatchObject({ status: 'OPEN', citizenAccepted: true })
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'BLOCKED', citizenAccepted: true })
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Oi')).rejects.toThrow(ForbiddenException)
    })

    it('bloquear pela página vale mais que "recusou"', async () => {
      prisma.pageConversation.updateMany.mockResolvedValue({ count: 1 })
      await service.setStatus(org.orgType, org.orgId, 'c1', 'BLOCKED')
      expect(prisma.pageConversation.updateMany.mock.calls[0][0].data).toEqual({ status: 'BLOCKED', citizenAccepted: true })
    })
  })

  describe('cidadão', () => {
    it('só apaga a própria conversa e remove os anexos do bucket', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({
        id: 'c1',
        attachments: [{ objectKey: 'page-media/c1/a1.enc' }],
      })
      prisma.pageConversation.deleteMany.mockResolvedValue({ count: 1 })
      await service.deleteMine('u1', 'c1')
      expect(prisma.pageConversation.deleteMany).toHaveBeenCalledWith({ where: { id: 'c1', citizenId: 'u1' } })
      expect(storage.delete).toHaveBeenCalledWith('page-media/c1/a1.enc')

      prisma.pageConversation.findFirst.mockResolvedValue(null)
      await expect(service.deleteMine('u1', 'c1')).rejects.toThrow(NotFoundException)
    })

    it('não deixa abrir conversa de outra pessoa', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue(null)
      await expect(service.myConversation('u1', 'c1')).rejects.toThrow(NotFoundException)
    })

    it('lista e conta não lidas excluindo conversas recusadas pelo cidadão', async () => {
      prisma.pageConversation.aggregate.mockResolvedValue({ _sum: { citizenUnread: 3 } })
      expect(await service.citizenUnreadCount('u1')).toEqual({ unread: 3 })
      expect(prisma.pageConversation.aggregate.mock.calls[0][0].where).toEqual({
        citizenId: 'u1',
        NOT: { status: 'BLOCKED', citizenAccepted: false },
      })
      await service.myConversations('u1', 1)
      expect(prisma.pageConversation.count.mock.calls[0][0].where).toEqual({
        citizenId: 'u1',
        NOT: { status: 'BLOCKED', citizenAccepted: false },
      })
    })
  })

  describe('mídia, áudio e resposta', () => {
    it('cifra e decifra buffer binário com AES-256-GCM', () => {
      const key = Buffer.alloc(32, 7)
      const plain = Buffer.from('conteudo secreto de audio')
      const cipher = encryptBufferWithKey(plain, key)
      expect(cipher.equals(plain)).toBe(false)
      expect(decryptBufferWithKey(cipher, key).equals(plain)).toBe(true)
    })

    it('recusa arquivo HTML/SVG perigoso e aceita imagem cifrada no bucket', async () => {
      await expect(
        service.sendMediaAsCitizen(
          'u1',
          org.orgType,
          org.orgId,
          { buffer: Buffer.from('<svg></svg>'), originalname: 'x.svg', mimetype: 'image/svg+xml' },
          {},
        ),
      ).rejects.toThrow(BadRequestException)

      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3, 4, 5, 6, 7])
      prisma.pageMessage.create.mockImplementationOnce(({ data }: any) =>
        Promise.resolve({
          id: 'm1',
          senderKind: 'CITIZEN',
          bodyEnc: data.bodyEnc,
          createdAt: new Date(),
          attachment: {
            id: 'a1',
            kind: data.attachment.create.kind,
            mimeType: data.attachment.create.mimeType,
            nameEnc: data.attachment.create.nameEnc,
            sizeBytes: jpeg.length,
            width: 100,
            height: 80,
            durationMs: null,
            thumbnail: null,
          },
        }),
      )
      const res = await service.sendMediaAsCitizen(
        'u1',
        org.orgType,
        org.orgId,
        { buffer: jpeg, originalname: 'foto.jpg', mimetype: 'image/jpeg' },
        { caption: 'Olha só', width: 100, height: 80 },
      )
      expect(storage.uploadEncryptedBlob).toHaveBeenCalledTimes(1)
      expect(storage.uploadEncryptedBlob.mock.calls[0][1].subarray(0, 4).toString()).toBe('ENC:')
      expect(res.message.text).toBe('Olha só')
      expect(res.message.attachment?.kind).toBe('image')
      expect(res.message.attachment?.name).toBe('foto.jpg')
    })

    it('baixa e decifra anexo apenas para o cidadão dono da conversa', async () => {
      prisma.pageConversation.findFirst.mockResolvedValue({ id: 'c1' })
      prisma.pageAttachment.findFirst.mockResolvedValue({
        id: 'a1',
        objectKey: 'page-media/c1/a1.enc',
        mimeType: 'audio/webm',
        nameEnc: 'enc(audio.webm)',
        kind: 'audio',
      })
      const file = await service.downloadMediaForCitizen('u1', 'c1', 'a1')
      expect(file.buffer.toString()).toBe('hello')
      expect(file.mimeType).toBe('audio/webm')

      prisma.pageConversation.findFirst.mockResolvedValue(null)
      await expect(service.downloadMediaForCitizen('u2', 'c1', 'a1')).rejects.toThrow(NotFoundException)
    })

    it('recusa responder mensagem que não pertence à mesma conversa', async () => {
      prisma.pageConversation.findUnique.mockResolvedValue({ id: 'c1', status: 'OPEN', citizenAccepted: true })
      prisma.pageMessage.findFirst.mockResolvedValue(null)
      await expect(service.sendAsCitizen('u1', org.orgType, org.orgId, 'Resposta', 'm-outra')).rejects.toThrow(
        BadRequestException,
      )
    })
  })
})
