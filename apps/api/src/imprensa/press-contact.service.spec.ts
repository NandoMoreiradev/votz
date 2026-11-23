jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  sanitize: (v: string) => v.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;'),
}))

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PRESS_PLAN_LIMITS } from '@votz/shared-types'
import { PressContactService } from './press-contact.service'
import { contactStatusView, declineBlocks, declineCooldownStart, expiresAtFrom, DAY_MS } from './press-contact.rules'

const repo = {
  findReport: jest.fn(), setReportOptIn: jest.fn(), isBlocked: jest.fn(), blockJournalist: jest.fn(), countAbusive: jest.fn(),
  findForReport: jest.fn(), findRecentDecline: jest.fn(),
  findCredential: jest.fn(), create: jest.fn(), listReceived: jest.fn(), listSent: jest.fn(), findForRecipient: jest.fn(),
  findForJournalist: jest.fn(), respond: jest.fn(), cancel: jest.fn(),
}
const access = { require: jest.fn() }
const mail = { sendPressContactRequest: jest.fn().mockResolvedValue(undefined) }
const notifications = { notify: jest.fn().mockResolvedValue({}) }

const pro = { plan: 'PRO', limits: PRESS_PLAN_LIMITS.PRO, credentialId: 'cred1' }
const free = { plan: 'GRATUITA', limits: PRESS_PLAN_LIMITS.GRATUITA, credentialId: 'cred1' }
const MSG = 'Sou repórter da Gazeta e gostaria de ouvir o seu caso até sexta-feira.'

const report = (over: Record<string, unknown> = {}) => ({
  id: 'rep1', title: 'Posto sem remédio', anonymous: false, pressContactOk: true, authorId: 'cit1',
  author: { id: 'cit1', name: 'Maria', email: 'maria@x.test', banned: false, emailVerified: true }, ...over,
})

function received(over: Record<string, unknown> = {}) {
  return {
    id: 'req1', journalistId: 'jor1', recipientId: 'cit1', reportId: 'rep1', status: 'PENDING',
    expiresAt: new Date(Date.now() + DAY_MS), createdAt: new Date(), respondedAt: null, reply: null, viaVotzChat: false,
    outletName: 'Gazeta', outletType: 'PORTAL', outletWebsite: 'https://gazeta.example.org', message: MSG,
    journalist: { id: 'jor1', name: 'João', type: 'PRESS', verified: true, banned: false },
    report: { id: 'rep1', title: 'Posto sem remédio' }, ...over,
  }
}

describe('regras puras do contato', () => {
  it('pedido pendente depois do prazo vira "venceu"; os outros estados não mudam', () => {
    const now = new Date('2026-11-23T12:00:00Z')
    expect(contactStatusView({ status: 'PENDING', expiresAt: new Date('2026-11-23T12:00:01Z') }, now)).toBe('PENDING')
    expect(contactStatusView({ status: 'PENDING', expiresAt: new Date('2026-11-23T12:00:00Z') }, now)).toBe('EXPIRED')
    expect(contactStatusView({ status: 'ACCEPTED', expiresAt: new Date('2020-01-01') }, now)).toBe('ACCEPTED')
    expect(expiresAtFrom(now).toISOString()).toBe('2026-12-07T12:00:00.000Z') // vale 14 dias
  })

  it('recusar como abusivo bloqueia sempre; recusar comum só bloqueia se a pessoa pedir', () => {
    expect(declineBlocks('ABUSIVE', false)).toBe(true)
    expect(declineBlocks('NOT_NOW', true)).toBe(true)
    expect(declineBlocks('NOT_NOW', false)).toBe(false)
    expect(declineBlocks('NOT_INTERESTED', undefined)).toBe(false)
  })
})

describe('PressContactService', () => {
  let service: PressContactService

  beforeEach(() => {
    jest.clearAllMocks()
    access.require.mockResolvedValue(pro)
    repo.findReport.mockResolvedValue(report())
    repo.isBlocked.mockResolvedValue(null)
    repo.countAbusive.mockResolvedValue(0)
    repo.findForReport.mockResolvedValue(null)
    repo.findRecentDecline.mockResolvedValue(null)
    repo.findCredential.mockResolvedValue({ outletName: 'Gazeta', outletType: 'PORTAL', website: 'https://gazeta.example.org', status: 'APPROVED' })
    repo.create.mockImplementation(async (d: any) => ({ ...d, id: 'req1', createdAt: new Date('2026-11-23T12:00:00Z') }))
    repo.respond.mockResolvedValue(true)
    repo.cancel.mockResolvedValue(true)
    repo.findForRecipient.mockResolvedValue(received())
    service = new PressContactService(repo as any, access as any, mail as any, notifications as any)
  })

  describe('pedir contato', () => {
    it('cria o pedido com cópia do veículo, avisa o autor pelo sino e por e-mail', async () => {
      const res = await service.request('jor1', { reportId: 'rep1', message: MSG })
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        journalistId: 'jor1', recipientId: 'cit1', reportId: 'rep1', outletName: 'Gazeta', outletWebsite: 'https://gazeta.example.org', message: MSG,
      }))
      expect(res).toMatchObject({ status: 'PENDING', recipient: { name: 'Maria' }, report: { id: 'rep1' } })
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'cit1', type: 'PRESS_CONTACT_REQUEST' }))
      expect(mail.sendPressContactRequest).toHaveBeenCalledWith('maria@x.test', 'Maria', expect.objectContaining({ outletName: 'Gazeta', reportTitle: 'Posto sem remédio' }))
    })

    it('o resultado para o jornalista não carrega e-mail nem contato do cidadão', async () => {
      const res = await service.request('jor1', { reportId: 'rep1', message: MSG })
      expect(JSON.stringify(res)).not.toMatch(/maria@x\.test|email/i)
    })

    it('plano gratuito não envia pedido; sem credencial aprovada também não', async () => {
      access.require.mockResolvedValueOnce(free)
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(/Imprensa Pro/)
      access.require.mockResolvedValueOnce({ ...pro, credentialId: null })
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(/credencial/)
      repo.findCredential.mockResolvedValueOnce({ outletName: 'G', outletType: 'PORTAL', website: 'https://g.example.org', status: 'REVOKED' })
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(ForbiddenException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it.each([
      ['anônimo', { anonymous: true }],
      ['sem aceite do autor', { pressContactOk: false }],
      ['sem autor', { authorId: null }],
      ['autor banido', { author: { id: 'cit1', name: 'M', email: 'a@x', banned: true, emailVerified: true } }],
      ['autor sem e-mail confirmado', { author: { id: 'cit1', name: 'M', email: 'a@x', banned: false, emailVerified: false } }],
    ])('recusa relato %s', async (_label, over) => {
      repo.findReport.mockResolvedValue(report(over))
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(ForbiddenException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('relato inexistente dá 404; pedir a si mesmo dá 400', async () => {
      repo.findReport.mockResolvedValueOnce(null)
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(NotFoundException)
      repo.findReport.mockResolvedValueOnce(report({ authorId: 'jor1', author: { id: 'jor1', name: 'J', email: 'j@x', banned: false, emailVerified: true } }))
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(BadRequestException)
    })

    it('bloqueio e recusa recente dão a MESMA mensagem (não revelam o que a pessoa fez)', async () => {
      repo.isBlocked.mockResolvedValueOnce({ id: 'b' })
      const a = await service.request('jor1', { reportId: 'rep1', message: MSG }).catch((e) => e.message)
      repo.findRecentDecline.mockResolvedValueOnce({ id: 'd' })
      const b = await service.request('jor1', { reportId: 'rep1', message: MSG }).catch((e) => e.message)
      expect(a).toBe(b)
      expect(a).toMatch(/não está recebendo/)
    })

    it('cinco denúncias de abuso suspendem os pedidos do jornalista; quatro ainda não', async () => {
      repo.countAbusive.mockResolvedValueOnce(5)
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(/suspensos/)
      repo.countAbusive.mockResolvedValueOnce(4)
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).resolves.toBeDefined()
    })

    it('um pedido por relato (o repetido dá conflito)', async () => {
      repo.findForReport.mockResolvedValueOnce({ id: 'x', status: 'DECLINED' })
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(ConflictException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('sem teto por dia nem limite de pendentes: muitos pedidos seguidos, inclusive à mesma pessoa, passam', async () => {
      for (let i = 0; i < 12; i++) {
        repo.findReport.mockResolvedValueOnce(report({ id: `rep${i}` }))
        await expect(service.request('jor1', { reportId: `rep${i}`, message: MSG })).resolves.toMatchObject({ status: 'PENDING' })
      }
      expect(repo.create).toHaveBeenCalledTimes(12)
    })

    it('a espera depois de uma recusa é de 7 dias', async () => {
      await service.request('jor1', { reportId: 'rep1', message: MSG })
      const since = repo.findRecentDecline.mock.calls[0][2] as Date
      expect(Math.round((Date.now() - since.getTime()) / DAY_MS)).toBe(7)
      expect(declineCooldownStart(new Date('2026-11-23T12:00:00Z')).toISOString()).toBe('2026-11-16T12:00:00.000Z')
    })

    it('mensagem curta demais ou só com HTML é recusada; HTML é tirado', async () => {
      await expect(service.request('jor1', { reportId: 'rep1', message: 'oi' })).rejects.toThrow(BadRequestException)
      await expect(service.request('jor1', { reportId: 'rep1', message: '<b></b><i>curta</i>' })).rejects.toThrow(BadRequestException)
      await service.request('jor1', { reportId: 'rep1', message: `<script>x</script>${MSG}` })
      expect(repo.create.mock.calls.at(-1)![0].message).toBe(`x${MSG}`)
    })

    it('duas abas ao mesmo tempo: o banco recusa o repetido e vira conflito', async () => {
      repo.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).rejects.toThrow(ConflictException)
    })

    it('falha no e-mail não derruba o pedido', async () => {
      mail.sendPressContactRequest.mockRejectedValueOnce(new Error('smtp'))
      await expect(service.request('jor1', { reportId: 'rep1', message: MSG })).resolves.toBeDefined()
    })
  })

  describe('responder', () => {
    it('aceitar: guarda a resposta escrita pela pessoa e avisa o jornalista', async () => {
      await expect(service.respond('cit1', 'req1', { action: 'accept', reply: ' Pode ligar à tarde ', viaVotzChat: true })).resolves.toEqual({ id: 'req1', status: 'ACCEPTED' })
      expect(repo.respond).toHaveBeenCalledWith('req1', { status: 'ACCEPTED', reply: 'Pode ligar à tarde', viaVotzChat: true }, expect.any(Date))
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'jor1', type: 'PRESS_CONTACT_ACCEPTED' }))
    })

    it('recusar comum: não bloqueia; o jornalista é avisado sem motivo', async () => {
      await service.respond('cit1', 'req1', { action: 'decline', reason: 'NOT_INTERESTED' })
      expect(repo.blockJournalist).not.toHaveBeenCalled()
      expect(repo.respond).toHaveBeenCalledWith('req1', { status: 'DECLINED', declineReason: 'NOT_INTERESTED' }, expect.any(Date))
      const payload = notifications.notify.mock.calls[0][0]
      expect(payload).toMatchObject({ userId: 'jor1', type: 'PRESS_CONTACT_DECLINED' })
      expect(JSON.stringify(payload)).not.toMatch(/NOT_INTERESTED|ABUSIVE/)
    })

    it('recusar e bloquear, ou denunciar como abusivo, bloqueia o jornalista', async () => {
      await service.respond('cit1', 'req1', { action: 'decline', reason: 'NOT_NOW', block: true })
      expect(repo.blockJournalist).toHaveBeenCalledWith('cit1', 'jor1')
      repo.blockJournalist.mockClear()
      await service.respond('cit1', 'req1', { action: 'decline', reason: 'ABUSIVE' })
      expect(repo.blockJournalist).toHaveBeenCalledWith('cit1', 'jor1')
    })

    it('só o destinatário responde; vencido, já respondido ou sem credencial ativa dá erro', async () => {
      repo.findForRecipient.mockResolvedValueOnce(null)
      await expect(service.respond('outro', 'req1', { action: 'accept' })).rejects.toThrow(NotFoundException)
      expect(repo.findForRecipient).toHaveBeenCalledWith('req1', 'outro')

      repo.findForRecipient.mockResolvedValueOnce(received({ expiresAt: new Date(Date.now() - 1000) }))
      await expect(service.respond('cit1', 'req1', { action: 'accept' })).rejects.toThrow(ConflictException)
      repo.findForRecipient.mockResolvedValueOnce(received({ status: 'ACCEPTED' }))
      await expect(service.respond('cit1', 'req1', { action: 'accept' })).rejects.toThrow(ConflictException)
      repo.findForRecipient.mockResolvedValueOnce(received({ journalist: { id: 'jor1', name: 'J', type: 'CITIZEN', verified: false, banned: false } }))
      await expect(service.respond('cit1', 'req1', { action: 'accept' })).rejects.toThrow(/credencial/)
      expect(repo.respond).not.toHaveBeenCalled()
    })

    it('dois cliques ao mesmo tempo: só um vale (e o segundo não avisa de novo)', async () => {
      repo.respond.mockResolvedValueOnce(false)
      await expect(service.respond('cit1', 'req1', { action: 'accept' })).rejects.toThrow(ConflictException)
      expect(notifications.notify).not.toHaveBeenCalled()
    })
  })

  describe('listas', () => {
    it('recebidos: some o pedido pendente de quem perdeu a credencial e mostra "venceu"', async () => {
      repo.listReceived.mockResolvedValue([
        received({ id: 'a' }),
        received({ id: 'b', journalist: { id: 'j2', name: 'X', type: 'CITIZEN', verified: false } }),
        received({ id: 'c', expiresAt: new Date(Date.now() - 1000) }),
        received({ id: 'd', status: 'ACCEPTED', journalist: { id: 'j2', name: 'X', type: 'CITIZEN', verified: false } }),
      ])
      const out = await service.listReceived('cit1')
      expect(out.map((r) => `${r.id}:${r.status}`)).toEqual(['a:PENDING', 'c:EXPIRED', 'd:ACCEPTED'])
      expect(out[0]).toMatchObject({ outlet: { name: 'Gazeta' }, journalist: { id: 'jor1', name: 'João' } })
    })

    it('enviados: a resposta só aparece se aceitou, e recusa não mostra motivo', async () => {
      const base = { recipient: { name: 'Maria' }, report: { id: 'rep1', title: 'T' }, message: MSG, createdAt: new Date(), expiresAt: new Date(Date.now() + DAY_MS) }
      repo.listSent.mockResolvedValue([
        { ...base, id: 'a', status: 'ACCEPTED', reply: 'Pode ligar', viaVotzChat: true, respondedAt: new Date() },
        { ...base, id: 'b', status: 'DECLINED', reply: 'segredo', viaVotzChat: true, declineReason: 'ABUSIVE', respondedAt: new Date() },
      ])
      const out = await service.listSent('jor1')
      expect(out[0]).toMatchObject({ status: 'ACCEPTED', reply: 'Pode ligar', viaVotzChat: true })
      expect(out[1]).toMatchObject({ status: 'DECLINED', reply: null, viaVotzChat: false })
      expect(JSON.stringify(out)).not.toMatch(/ABUSIVE|segredo/)
    })

    it('cancelar: só o dono e só enquanto aguarda', async () => {
      repo.findForJournalist.mockResolvedValueOnce(null)
      await expect(service.cancel('jor1', 'req1')).rejects.toThrow(NotFoundException)
      repo.findForJournalist.mockResolvedValueOnce({ id: 'req1' })
      repo.cancel.mockResolvedValueOnce(false)
      await expect(service.cancel('jor1', 'req1')).rejects.toThrow(ConflictException)
      repo.findForJournalist.mockResolvedValueOnce({ id: 'req1' })
      await expect(service.cancel('jor1', 'req1')).resolves.toEqual({ id: 'req1', status: 'CANCELLED' })
    })
  })

  describe('aceite no relato', () => {
    it('só o autor de relato público liga ou desliga', async () => {
      repo.setReportOptIn.mockResolvedValue({ id: 'rep1', pressContactOk: true })
      await expect(service.setOptIn('cit1', 'rep1', true)).resolves.toEqual({ id: 'rep1', pressContactOk: true })
      await expect(service.setOptIn('outro', 'rep1', true)).rejects.toThrow(ForbiddenException)
      repo.findReport.mockResolvedValueOnce(report({ anonymous: true }))
      await expect(service.setOptIn('cit1', 'rep1', true)).rejects.toThrow(ForbiddenException)
      repo.findReport.mockResolvedValueOnce(null)
      await expect(service.setOptIn('cit1', 'rep1', true)).rejects.toThrow(NotFoundException)
    })

    it('estado do botão: o autor vê o próprio aceite; cidadão comum não descobre nada; jornalista Pro pode pedir', async () => {
      expect(await service.reportStatus('cit1', 'rep1')).toMatchObject({ isAuthor: true, optIn: true, canRequest: false })

      access.require.mockRejectedValueOnce(new ForbiddenException('x'))
      expect(await service.reportStatus('curioso', 'rep1')).toEqual({ optIn: false, isAuthor: false, canRequest: false, reason: null, alreadyRequested: false })

      expect(await service.reportStatus('jor1', 'rep1')).toMatchObject({ optIn: true, canRequest: true, reason: null })
    })

    it('estado do botão: explica por que não pode (sem aceite, plano gratuito, já pediu)', async () => {
      repo.findReport.mockResolvedValueOnce(report({ pressContactOk: false }))
      expect(await service.reportStatus('jor1', 'rep1')).toMatchObject({ canRequest: false, reason: expect.stringMatching(/não aceitou/) })

      access.require.mockResolvedValueOnce(free)
      expect(await service.reportStatus('jor1', 'rep1')).toMatchObject({ canRequest: false, reason: expect.stringMatching(/Imprensa Pro/) })

      repo.findForReport.mockResolvedValueOnce({ id: 'x', status: 'PENDING' })
      expect(await service.reportStatus('jor1', 'rep1')).toMatchObject({ canRequest: false, alreadyRequested: true })
    })

    it('relato anônimo nunca mostra aceite', async () => {
      repo.findReport.mockResolvedValue(report({ anonymous: true, pressContactOk: true }))
      expect(await service.reportStatus('jor1', 'rep1')).toMatchObject({ optIn: false, canRequest: false })
    })
  })
})
