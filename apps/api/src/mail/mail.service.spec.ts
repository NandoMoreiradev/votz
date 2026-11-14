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

  it('sends inactivity notice email explaining 30-day deadline and login link', async () => {
    await service.sendInactivityNotice('ana@votz.app', 'Ana')
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ana@votz.app',
        subject: expect.stringContaining('30 dias'),
        html: expect.stringContaining('http://localhost:5173/login'),
      }),
    )
  })
})
