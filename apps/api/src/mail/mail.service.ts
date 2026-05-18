import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: nodemailer.Transporter

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<number>('SMTP_PORT', 587) === 465,
      auth: {
        user: this.config.getOrThrow('SMTP_USER'),
        pass: this.config.getOrThrow('SMTP_PASS'),
      },
    })
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const link = `${baseUrl}/verificar-email?token=${token}`

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: 'Confirme seu e-mail — Votz',
      html: `
        <h2>Olá, ${name}!</h2>
        <p>Clique no botão abaixo para confirmar seu e-mail e ativar sua conta no Votz.</p>
        <p><a href="${link}" style="background:#E63946;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirmar e-mail</a></p>
        <p>O link expira em 24 horas.</p>
        <p>Se você não criou uma conta, ignore este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send verification email', err))
  }

  async sendMemberInvite(email: string, orgName: string, roleName: string, token: string): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const link = `${baseUrl}/convite/${token}`

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: `Você foi convidado para a equipe de ${orgName} — Votz`,
      html: `
        <h2>Você recebeu um convite!</h2>
        <p><strong>${orgName}</strong> convidou você para fazer parte da equipe no Votz com o cargo de <strong>${roleName}</strong>.</p>
        <p><a href="${link}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Aceitar convite</a></p>
        <p>O convite expira em 7 dias.</p>
        <p>Se você não esperava este convite, pode ignorar este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send member invite email', err))
  }

  async sendDataExportReady(email: string, name: string, downloadUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: 'Seus dados estão prontos para download — Votz',
      html: `
        <h2>Olá, ${name}!</h2>
        <p>Sua exportação de dados está pronta. Clique no botão abaixo para baixar o arquivo JSON com todos os seus dados no Votz.</p>
        <p><a href="${downloadUrl}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Baixar meus dados</a></p>
        <p><strong>O link expira em 24 horas.</strong></p>
        <p>Se você não solicitou esta exportação, ignore este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send data export email', err))
  }

  async sendAccountDeleted(email: string, name: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: 'Sua conta foi encerrada — Votz',
      html: `
        <h2>Olá, ${name}!</h2>
        <p>Confirmamos o encerramento da sua conta no Votz. Seus dados pessoais foram removidos conforme solicitado.</p>
        <p>Os relatos que você publicou foram anonimizados e permanecem como registros públicos de interesse coletivo, sem nenhuma informação que permita sua identificação.</p>
        <p>Se você mudar de ideia no futuro, pode criar uma nova conta a qualquer momento.</p>
        <p>Obrigado por fazer parte do Votz.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send account deleted email', err))
  }

  async sendMfaBackupCodes(email: string, name: string, codes: string[]): Promise<void> {
    const formattedCodes = codes.map((c) => `<li><code>${c}</code></li>`).join('')

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: 'Seus códigos de backup MFA — Votz',
      html: `
        <h2>Olá, ${name}!</h2>
        <p>Sua autenticação em dois fatores foi ativada com sucesso.</p>
        <p>Guarde estes 8 códigos de backup em lugar seguro. Cada um pode ser usado <strong>uma única vez</strong> se você perder acesso ao seu autenticador:</p>
        <ul style="font-family:monospace;font-size:16px;">${formattedCodes}</ul>
        <p><strong>Não compartilhe estes códigos com ninguém.</strong></p>
      `,
    }).catch((err) => this.logger.error('Failed to send MFA backup codes email', err))
  }
}
