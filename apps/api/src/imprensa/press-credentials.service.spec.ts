jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  // Imita o que importa do DOMPurify: sem tags, e com `&` virando `&amp;`.
  sanitize: (v: string) => v.replace(/<[^>]*>/g, '').replace(/&/g, '&amp;'),
}))

import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { PressCredentialsService, plainText, RESEND_MIN_MS, TOKEN_TTL_MS } from './press-credentials.service'
import { domainsRelated, emailDomain, hostOf, pressSignals } from './press-signals'

const repo = {
  findUser: jest.fn(),
  findPending: jest.fn(),
  findLastRejection: jest.fn(),
  findLatestByUser: jest.fn(),
  create: jest.fn(),
  setEmailToken: jest.fn(),
  findByTokenHash: jest.fn(),
  confirmEmail: jest.fn(),
  list: jest.fn(),
  contactAbuseCounts: jest.fn().mockResolvedValue(new Map([['u1', 2]])),
  approve: jest.fn(),
  reject: jest.fn(),
  revoke: jest.fn(),
}
const mail = {
  sendPressEmailConfirmation: jest.fn().mockResolvedValue(undefined),
  sendPressCredentialDecision: jest.fn().mockResolvedValue(undefined),
}
const notifications = { notify: jest.fn().mockResolvedValue({}) }

const dto = {
  outletName: 'Gazeta do Interior',
  outletType: 'NEWSPAPER' as const,
  jobTitle: 'Repórter',
  website: 'https://gazetadointerior.com.br',
  newsroomEmail: 'redacao@gazetadointerior.com.br',
  coverageArea: 'Campinas',
  portfolioUrls: ['https://gazetadointerior.com.br/a', 'https://gazetadointerior.com.br/a', 'https://gazetadointerior.com.br/b'],
  note: 'Cobertura de saúde',
}

const citizen = { id: 'u1', name: 'Ana', email: 'ana@x.com', type: 'CITIZEN', verified: false, emailVerified: true, banned: false }

function stored(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1', userId: 'u1', status: 'PENDING', outletName: 'Gazeta', outletType: 'NEWSPAPER', jobTitle: null,
    website: 'https://g.com.br', newsroomEmail: 'r@g.com.br', coverageArea: null, portfolioUrls: ['https://g.com.br/a'],
    note: null, emailConfirmedAt: null, emailTokenHash: 'h', emailTokenExpires: new Date(Date.now() + TOKEN_TTL_MS),
    reviewNote: null, reviewedAt: null, createdAt: new Date('2026-11-23T10:00:00Z'), ...overrides,
  }
}

describe('PressCredentialsService', () => {
  let service: PressCredentialsService

  beforeEach(() => {
    jest.clearAllMocks()
    repo.findUser.mockResolvedValue(citizen)
    repo.findPending.mockResolvedValue(null)
    repo.findLastRejection.mockResolvedValue(null)
    repo.create.mockImplementation(async (d: any) => stored({ ...d, id: 'c1' }))
    service = new PressCredentialsService(repo as any, mail as any, notifications as any)
  })

  describe('create', () => {
    it('cria o pedido, junta links repetidos, guarda só o hash do código e manda o e-mail com o código puro', async () => {
      const res = await service.create('u1', dto)

      const saved = repo.create.mock.calls[0][0]
      expect(saved.portfolioUrls).toEqual(['https://gazetadointerior.com.br/a', 'https://gazetadointerior.com.br/b'])
      expect(saved.emailTokenHash).toMatch(/^[a-f0-9]{64}$/)

      const sent = mail.sendPressEmailConfirmation.mock.calls[0]
      expect(sent[0]).toBe('redacao@gazetadointerior.com.br')
      const token = sent[2].token as string
      expect(createHash('sha256').update(token).digest('hex')).toBe(saved.emailTokenHash)
      expect(token).not.toBe(saved.emailTokenHash)

      expect(res.status).toBe('PENDING')
      expect(res.emailConfirmed).toBe(false)
      expect(JSON.stringify(res)).not.toContain(saved.emailTokenHash)
    })

    it('tira HTML dos textos livres mas mantém o "&" legível', async () => {
      await service.create('u1', { ...dto, outletName: 'Rádio <b>Folha</b> & Voz', note: '<script>x</script>oi' })
      const saved = repo.create.mock.calls[0][0]
      expect(saved.outletName).toBe('Rádio Folha & Voz')
      expect(saved.note).toBe('xoi')
    })

    it('não deixa pedir sem e-mail da conta confirmado, banido, já credenciado, equipe ou com pedido aberto', async () => {
      repo.findUser.mockResolvedValueOnce({ ...citizen, emailVerified: false })
      await expect(service.create('u1', dto)).rejects.toThrow(BadRequestException)

      repo.findUser.mockResolvedValueOnce({ ...citizen, banned: true })
      await expect(service.create('u1', dto)).rejects.toThrow(ForbiddenException)

      repo.findUser.mockResolvedValueOnce({ ...citizen, type: 'PRESS', verified: true })
      await expect(service.create('u1', dto)).rejects.toThrow(ConflictException)

      repo.findUser.mockResolvedValueOnce({ ...citizen, type: 'MODERATOR' })
      await expect(service.create('u1', dto)).rejects.toThrow(BadRequestException)

      repo.findPending.mockResolvedValueOnce(stored())
      await expect(service.create('u1', dto)).rejects.toThrow(ConflictException)
      expect(repo.create).not.toHaveBeenCalled()
    })

    it('PRESS antigo sem selo (promovido à mão antes da correção) pode pedir a credencial', async () => {
      repo.findUser.mockResolvedValueOnce({ ...citizen, type: 'PRESS', verified: false })
      await expect(service.create('u1', dto)).resolves.toBeDefined()
    })

    it('espera 7 dias depois de uma recusa', async () => {
      repo.findLastRejection.mockResolvedValueOnce({ reviewedAt: new Date(Date.now() - 2 * 86_400_000) })
      await expect(service.create('u1', dto)).rejects.toThrow(HttpException)
      repo.findLastRejection.mockResolvedValueOnce({ reviewedAt: new Date(Date.now() - 8 * 86_400_000) })
      await expect(service.create('u1', dto)).resolves.toBeDefined()
    })

    it('falha no envio do e-mail não derruba o pedido', async () => {
      mail.sendPressEmailConfirmation.mockRejectedValueOnce(new Error('smtp'))
      await expect(service.create('u1', dto)).resolves.toBeDefined()
    })
  })

  describe('confirmEmail e reenvio', () => {
    const raw = 'a'.repeat(43)
    const hash = createHash('sha256').update(raw).digest('hex')

    it('confirma com o código certo, da própria pessoa e dentro do prazo', async () => {
      repo.findByTokenHash.mockResolvedValue(stored())
      await expect(service.confirmEmail('u1', raw)).resolves.toEqual({ confirmed: true })
      expect(repo.findByTokenHash).toHaveBeenCalledWith(hash)
      expect(repo.confirmEmail).toHaveBeenCalledWith('c1')
    })

    it.each([
      ['código desconhecido', null],
      ['código de outra pessoa', stored({ userId: 'outro' })],
      ['vencido', stored({ emailTokenExpires: new Date(Date.now() - 1000) })],
      ['pedido já decidido', stored({ status: 'REJECTED' })],
    ])('recusa %s', async (_label, row) => {
      repo.findByTokenHash.mockResolvedValue(row)
      await expect(service.confirmEmail('u1', raw)).rejects.toThrow(BadRequestException)
      expect(repo.confirmEmail).not.toHaveBeenCalled()
    })

    it('reenvio: sem pedido, já confirmado, rápido demais e normal', async () => {
      await expect(service.resendEmail('u1')).rejects.toThrow(NotFoundException)

      repo.findPending.mockResolvedValueOnce(stored({ emailConfirmedAt: new Date() }))
      await expect(service.resendEmail('u1')).resolves.toEqual({ sent: false, alreadyConfirmed: true })

      // enviado agora há pouco: a validade (48h) menos o tempo passado
      repo.findPending.mockResolvedValueOnce(stored({ emailTokenExpires: new Date(Date.now() + TOKEN_TTL_MS - 30_000) }))
      await expect(service.resendEmail('u1')).rejects.toThrow(HttpException)

      repo.findPending.mockResolvedValueOnce(stored({ emailTokenExpires: new Date(Date.now() + TOKEN_TTL_MS - RESEND_MIN_MS - 1000) }))
      await expect(service.resendEmail('u1')).resolves.toEqual({ sent: true })
      expect(repo.setEmailToken).toHaveBeenCalledTimes(1)
    })
  })

  describe('decisões da moderação', () => {
    const who = { ok: true, userId: 'u1', outletName: 'Gazeta', email: 'ana@x.com', name: 'Ana' }

    it('aprovar avisa a pessoa pelo sino e por e-mail', async () => {
      repo.approve.mockResolvedValue(who)
      await expect(service.approve('c1', 'mod1', ' ok, confere ')).resolves.toEqual({ id: 'c1', status: 'APPROVED' })
      expect(repo.approve).toHaveBeenCalledWith('c1', 'mod1', 'ok, confere')
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', type: 'PRESS_CREDENTIAL_APPROVED' }))
      expect(mail.sendPressCredentialDecision).toHaveBeenCalledWith('ana@x.com', 'Ana', expect.objectContaining({ decision: 'APPROVED' }))
    })

    it('aprovar sem e-mail confirmado, conta que mudou de tipo ou pedido já decidido dá erro claro e não avisa ninguém', async () => {
      repo.approve.mockResolvedValueOnce({ ok: false, reason: 'EMAIL_NOT_CONFIRMED' })
      await expect(service.approve('c1', 'mod1')).rejects.toThrow(BadRequestException)
      repo.approve.mockResolvedValueOnce({ ok: false, reason: 'USER_TYPE' })
      await expect(service.approve('c1', 'mod1')).rejects.toThrow(BadRequestException)
      repo.approve.mockResolvedValueOnce({ ok: false, reason: 'NOT_FOUND_OR_STATE' })
      await expect(service.approve('c1', 'mod1')).rejects.toThrow(ConflictException)
      expect(notifications.notify).not.toHaveBeenCalled()
    })

    it('recusar e cancelar exigem motivo de pelo menos 10 caracteres', async () => {
      await expect(service.reject('c1', 'mod1', 'curto')).rejects.toThrow(BadRequestException)
      await expect(service.revoke('c1', 'mod1', undefined)).rejects.toThrow(BadRequestException)
      expect(repo.reject).not.toHaveBeenCalled()
      expect(repo.revoke).not.toHaveBeenCalled()

      repo.reject.mockResolvedValue(who)
      await service.reject('c1', 'mod1', 'Não achamos matérias suas nos links.')
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'PRESS_CREDENTIAL_REJECTED' }))

      repo.revoke.mockResolvedValue(who)
      await service.revoke('c1', 'mod1', 'Uso indevido dos dados exportados.')
      expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'PRESS_CREDENTIAL_REVOKED' }))
    })

    it('lista aceita só situações conhecidas e devolve os sinais de verificação', async () => {
      await expect(service.list('QUALQUER', 1, 20)).rejects.toThrow(BadRequestException)

      repo.list.mockResolvedValue({
        total: 1,
        data: [{ ...stored({ website: 'https://www.gazeta.com.br', newsroomEmail: 'r@noticias.gazeta.com.br', emailConfirmedAt: new Date() }), reviewer: null, user: { id: 'u1', name: 'Ana', email: 'ana@x.com', type: 'CITIZEN', createdAt: new Date(Date.now() - 10 * 86_400_000) } }],
      })
      const res = await service.list('PENDING', 1, 999)
      expect(repo.list).toHaveBeenCalledWith({ status: 'PENDING', page: 1, limit: 50 })
      expect(res.data[0].signals).toMatchObject({ emailMatchesWebsite: true, emailIsFreeProvider: false, emailConfirmed: true, accountAgeDays: 10 })
      // denúncias de abuso do jornalista (pedido de contato recusado como abusivo) aparecem para o moderador
      expect(res.data[0].contactAbuseCount).toBe(2)
    })
  })
})

describe('plainText', () => {
  it('limita o tamanho e junta espaços', () => {
    expect(plainText('  a   b \n c ', 100)).toBe('a b c')
    expect(plainText('x'.repeat(50), 10)).toHaveLength(10)
  })
})

describe('press-signals', () => {
  it('lê domínio do e-mail e host do site', () => {
    expect(emailDomain('Fulano@Gazeta.com.br')).toBe('gazeta.com.br')
    expect(emailDomain('semarroba')).toBe('')
    expect(hostOf('https://www.Gazeta.com.br/x?y=1')).toBe('gazeta.com.br')
    expect(hostOf('lixo')).toBe('')
  })

  it('subdomínio é do mesmo dono, mas "gazeta.com.br" não é "falsagazeta.com.br"', () => {
    expect(domainsRelated('noticias.gazeta.com.br', 'gazeta.com.br')).toBe(true)
    expect(domainsRelated('gazeta.com.br', 'gazeta.com.br')).toBe(true)
    expect(domainsRelated('falsagazeta.com.br', 'gazeta.com.br')).toBe(false)
    expect(domainsRelated('', 'gazeta.com.br')).toBe(false)
  })

  it('avisa e-mail de provedor aberto e idade da conta', () => {
    const s = pressSignals({
      newsroomEmail: 'fulano@gmail.com',
      website: 'https://blog.example.org',
      emailConfirmedAt: null,
      userCreatedAt: new Date('2026-11-20T00:00:00Z'),
      now: new Date('2026-11-23T12:00:00Z'),
    })
    expect(s).toEqual({
      emailDomain: 'gmail.com', emailIsFreeProvider: true, websiteHost: 'blog.example.org',
      emailMatchesWebsite: false, emailConfirmed: false, accountAgeDays: 3,
    })
  })
})
