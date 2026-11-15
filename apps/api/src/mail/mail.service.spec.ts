import * as nodemailer from 'nodemailer'
import { MailService } from './mail.service'

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}))

describe('MailService', () => {
  let service: MailService
  let sendMailMock: jest.Mock

  beforeEach(() => {
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-1' })
    ;(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock })

    const config: any = {
      getOrThrow: jest.fn((k: string) => {
        if (k === 'SMTP_HOST') return 'smtp.test.local'
        if (k === 'SMTP_USER') return 'user'
        if (k === 'SMTP_PASS') return 'pass'
        throw new Error(k)
      }),
      get: jest.fn((k: string, def?: any) => {
        if (k === 'SMTP_PORT') return 587
        if (k === 'APP_URL') return 'http://localhost:5173'
        if (k === 'SMTP_FROM') return 'Votz <noreply@votz.app>'
        return def
      }),
    }

    service = new MailService(config)
  })

  it('creates transporter and sends verification & invite emails', async () => {
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.test.local', port: 587, secure: false }),
    )

    await service.sendVerificationEmail('ana@votz.app', 'Ana', 'tok-1')
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@votz.app',
        html: expect.stringContaining('http://localhost:5173/verificar-email?token=tok-1'),
      }),
    )

    await service.sendMemberInvite('bob@votz.app', 'Prefeitura X', 'AGENT', 'inv-1')
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'bob@votz.app',
        html: expect.stringContaining('http://localhost:5173/convite/inv-1'),
      }),
    )
  })

  it('catches sendMail errors without throwing', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'))
    await expect(service.sendVerificationEmail('ana@votz.app', 'Ana', 'tok-2')).resolves.toBeUndefined()
  })

  it('sends inactivity notice email explaining 30-day deadline, escapes name, and propagates SMTP errors', async () => {
    await service.sendInactivityNotice('ana@votz.app', 'Ana <script>alert(1)</script>')
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@votz.app',
        subject: expect.stringContaining('30 dias'),
        html: expect.stringContaining('http://localhost:5173/login'),
      }),
    )
    const sentHtml = sendMailMock.mock.calls[0][0].html as string
    expect(sentHtml).toContain('Ana &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(sentHtml).not.toContain('<script>')

    sendMailMock.mockRejectedValueOnce(new Error('SMTP down'))
    await expect(service.sendInactivityNotice('ana@votz.app', 'Ana')).rejects.toThrow('SMTP down')
  })

  it('sends moderation notice with reason, guidelines link, and appeal email, and returns true/false', async () => {
    const ok = await service.sendModerationNotice(
      'ana@votz.app',
      'Ana',
      'REPORT_REMOVED',
      'Conteúdo com dados pessoais expostos.',
    )
    expect(ok).toBe(true)
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@votz.app',
        subject: expect.stringContaining('relato foi removido'),
        html: expect.stringContaining('Conteúdo com dados pessoais expostos.'),
      }),
    )
    const sentHtml = sendMailMock.mock.calls[0][0].html as string
    expect(sentHtml).toContain('http://localhost:5173/diretrizes')
    expect(sentHtml).toContain('fernandomoreira.dev@gmail.com')

    sendMailMock.mockRejectedValueOnce(new Error('SMTP offline'))
    const failed = await service.sendModerationNotice(
      'ana@votz.app',
      'Ana',
      'ACCOUNT_BANNED',
      'Violação grave repetida.',
    )
    expect(failed).toBe(false)
  })

  it('escapes HTML in user/org/moderator fields and strips CRLF in email subjects', async () => {
    const injectedName = '<a href="https://x">clique</a>'
    await service.sendVerificationEmail('ana@votz.app', injectedName, 'tok-xss')
    const verifyHtml = sendMailMock.mock.calls[0][0].html as string
    expect(verifyHtml).toContain('&lt;a href=&quot;https://x&quot;&gt;clique&lt;/a&gt;')
    expect(verifyHtml).not.toContain('<a href="https://x">')

    await service.sendMemberInvite(
      'bob@votz.app',
      'Org <img src=x onerror=alert(1)>\r\nBcc: evil@attacker.com',
      '<b>ADMIN</b>',
      'inv-xss',
    )
    const inviteCall = sendMailMock.mock.calls[1][0]
    expect(inviteCall.subject).not.toMatch(/[\r\n]/)
    expect(inviteCall.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(inviteCall.html).toContain('&lt;b&gt;ADMIN&lt;/b&gt;')

    await service.sendRegistrationRejected(
      'carla@votz.app',
      injectedName,
      'ENTITY',
      'Motivo <script>alert(1)</script>',
    )
    const rejectedHtml = sendMailMock.mock.calls[2][0].html as string
    expect(rejectedHtml).toContain('&lt;a href=&quot;https://x&quot;&gt;clique&lt;/a&gt;')
    expect(rejectedHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rejectedHtml).not.toContain('<script>')
  })
})
