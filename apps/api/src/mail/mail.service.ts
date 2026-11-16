import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { SUPPORT_EMAIL } from '../common/legal.constants'

export type ModerationNoticeKind = 'REPORT_REMOVED' | 'COMMENT_REMOVED' | 'ACCOUNT_BANNED'

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function sanitizeSubject(subject: string): string {
  return String(subject).replace(/[\r\n]+/g, ' ').trim()
}

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
    const link = `${baseUrl}/verificar-email?token=${encodeURIComponent(token)}`
    const safeName = escapeHtml(name)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Confirme seu e-mail — Votz'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Clique no botão abaixo para confirmar seu e-mail e ativar sua conta no Votz.</p>
        <p><a href="${escapeHtml(link)}" style="background:#E63946;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Confirmar e-mail</a></p>
        <p>O link expira em 24 horas.</p>
        <p>Se você não criou uma conta, ignore este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send verification email', err))
  }

  async sendMemberInvite(email: string, orgName: string, roleName: string, token: string): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const link = `${baseUrl}/convite/${encodeURIComponent(token)}`
    const safeOrgName = escapeHtml(orgName)
    const safeRoleName = escapeHtml(roleName)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject(`Você foi convidado para a equipe de ${orgName} — Votz`),
      html: `
        <h2>Você recebeu um convite!</h2>
        <p><strong>${safeOrgName}</strong> convidou você para fazer parte da equipe no Votz com o cargo de <strong>${safeRoleName}</strong>.</p>
        <p><a href="${escapeHtml(link)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Aceitar convite</a></p>
        <p>O convite expira em 7 dias.</p>
        <p>Se você não esperava este convite, pode ignorar este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send member invite email', err))
  }

  async sendSurtoAlert(
    email: string,
    name: string,
    data: { category: string; city: string; state: string; count: number; surtoId: string },
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const link = `${baseUrl}/surtos/${encodeURIComponent(data.surtoId)}`
    const safeName = escapeHtml(name)
    const safeCategory = escapeHtml(data.category)
    const safeCity = escapeHtml(data.city)
    const safeState = escapeHtml(data.state)
    const safeCount = escapeHtml(String(data.count))

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject(`[SURTO] ${data.category} em ${data.city}/${data.state} — Votz Imprensa`),
      html: `
        <h2>Alerta de Surto Detectado — Votz</h2>
        <p>Olá, ${safeName}. Um novo surto foi detectado na plataforma Votz:</p>
        <table style="border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 16px 6px 0;font-weight:600">Categoria</td><td>${safeCategory}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;font-weight:600">Local</td><td>${safeCity} / ${safeState}</td></tr>
          <tr><td style="padding:6px 16px 6px 0;font-weight:600">Relatos (24h)</td><td>${safeCount}</td></tr>
        </table>
        <p><a href="${escapeHtml(link)}" style="background:#E63946;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver surto completo</a></p>
        <p style="color:#6B7280;font-size:13px">Você recebe este alerta por ser um jornalista verificado no Votz. <a href="${escapeHtml(`${baseUrl}/meu-perfil`)}">Gerenciar preferências</a></p>
      `,
    }).catch((err) => this.logger.error('Failed to send surto alert email', err))
  }

  async sendDataExportReady(email: string, name: string, downloadUrl: string): Promise<void> {
    const safeName = escapeHtml(name)
    const safeDownloadUrl = escapeHtml(downloadUrl)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Seus dados estão prontos para download — Votz'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Sua exportação de dados está pronta. Clique no botão abaixo para baixar o arquivo JSON com todos os seus dados no Votz.</p>
        <p><a href="${safeDownloadUrl}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Baixar meus dados</a></p>
        <p><strong>O link expira em 24 horas.</strong></p>
        <p>Se você não solicitou esta exportação, ignore este e-mail.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send data export email', err))
  }

  async sendAccountDeleted(email: string, name: string): Promise<void> {
    const safeName = escapeHtml(name)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Sua conta foi encerrada — Votz'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Confirmamos o encerramento da sua conta no Votz. Seus dados pessoais foram removidos conforme solicitado.</p>
        <p>Os relatos que você publicou foram anonimizados e permanecem como registros públicos de interesse coletivo, sem nenhuma informação que permita sua identificação.</p>
        <p>Se você mudar de ideia no futuro, pode criar uma nova conta a qualquer momento.</p>
        <p>Obrigado por fazer parte do Votz.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send account deleted email', err))
  }

  async sendRegistrationApproved(
    email: string,
    name: string,
    orgType: 'ENTITY' | 'POLITICIAN' | 'COMPANY',
    orgName: string,
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const typeLabel = orgType === 'ENTITY' ? 'entidade pública'
      : orgType === 'POLITICIAN' ? 'perfil de político'
      : 'empresa'
    const link = `${baseUrl}/minhas-solicitacoes`
    const safeName = escapeHtml(name)
    const safeOrgName = escapeHtml(orgName)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject(`Solicitação aprovada: ${orgName} — Votz`),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Sua solicitação de cadastro de <strong>${typeLabel}</strong> foi <strong style="color:#2DC653">aprovada</strong>.</p>
        <p><strong>${safeOrgName}</strong> já está disponível na plataforma Votz. Agora você pode acessar o painel da organização e começar a responder relatos.</p>
        <p><a href="${escapeHtml(link)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver minhas solicitações</a></p>
        <p style="color:#6B7280;font-size:13px">Obrigado por fazer parte do Votz.</p>
      `,
    }).catch((err) => this.logger.error('Failed to send registration approved email', err))
  }

  async sendRegistrationRejected(
    email: string,
    name: string,
    orgType: 'ENTITY' | 'POLITICIAN' | 'COMPANY',
    reviewNote: string,
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const typeLabel = orgType === 'ENTITY' ? 'entidade pública'
      : orgType === 'POLITICIAN' ? 'perfil de político'
      : 'empresa'
    const link = `${baseUrl}/minhas-solicitacoes`
    const safeName = escapeHtml(name)
    const safeReviewNote = reviewNote ? escapeHtml(reviewNote) : ''

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Solicitação não aprovada — Votz'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Sua solicitação de cadastro de <strong>${typeLabel}</strong> não foi aprovada neste momento.</p>
        ${safeReviewNote ? `<p><strong>Motivo informado pela moderação:</strong></p><blockquote style="border-left:3px solid #E63946;margin:0;padding:8px 16px;color:#374151;">${safeReviewNote}</blockquote>` : ''}
        <p>Se acreditar que houve um engano ou quiser tentar novamente com mais informações, você pode enviar uma nova solicitação.</p>
        <p><a href="${escapeHtml(link)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver minhas solicitações</a></p>
      `,
    }).catch((err) => this.logger.error('Failed to send registration rejected email', err))
  }

  async sendInactivityNotice(email: string, name: string): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const link = `${baseUrl}/login`
    const safeName = escapeHtml(name)

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Sua conta no Votz será anonimizada em 30 dias'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Notamos que você não acessa sua conta no Votz há mais de 24 meses.</p>
        <p>Conforme nossa Política de Privacidade, se você não entrar nos próximos <strong>30 dias</strong>, sua conta será anonimizada: seus dados pessoais, comentários e apoios serão apagados, e eventuais relatos publicados permanecerão sem o seu nome.</p>
        <p>Para manter sua conta ativa, basta fazer login usando seu e-mail e senha (ou sua conta Google) pelo link abaixo:</p>
        <p><a href="${escapeHtml(link)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Entrar no Votz</a></p>
        <p>Se você quiser que sua conta seja encerrada e anonimizada, não precisa fazer nada.</p>
      `,
    })
  }

  async sendMfaBackupCodes(email: string, name: string, codes: string[]): Promise<void> {
    const safeName = escapeHtml(name)
    const formattedCodes = codes.map((c) => `<li><code>${escapeHtml(c)}</code></li>`).join('')

    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
      to: email,
      subject: sanitizeSubject('Seus códigos de backup MFA — Votz'),
      html: `
        <h2>Olá, ${safeName}!</h2>
        <p>Sua autenticação em dois fatores foi ativada com sucesso.</p>
        <p>Guarde estes 8 códigos de backup em lugar seguro. Cada um pode ser usado <strong>uma única vez</strong> se você perder acesso ao seu autenticador:</p>
        <ul style="font-family:monospace;font-size:16px;">${formattedCodes}</ul>
        <p><strong>Não compartilhe estes códigos com ninguém.</strong></p>
      `,
    }).catch((err) => this.logger.error('Failed to send MFA backup codes email', err))
  }

  async sendModerationNotice(
    email: string,
    name: string,
    kind: ModerationNoticeKind,
    reason: string,
  ): Promise<boolean> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const guidelinesLink = `${baseUrl}/diretrizes`
    const safeName = escapeHtml(name || 'usuário')
    const safeReason = escapeHtml(reason)

    const copy =
      kind === 'REPORT_REMOVED'
        ? {
            subject: 'Seu relato foi removido — Votz',
            actionText: 'Um relato publicado por você foi removido pela equipe de moderação do Votz.',
          }
        : kind === 'COMMENT_REMOVED'
          ? {
              subject: 'Seu comentário foi removido — Votz',
              actionText: 'Um comentário publicado por você foi removido pela equipe de moderação do Votz.',
            }
          : {
              subject: 'Sua conta foi banida — Votz',
              actionText: 'Sua conta no Votz foi banida pela equipe de moderação.',
            }

    try {
      await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
        to: email,
        subject: copy.subject,
        html: `
          <h2>Olá, ${safeName}!</h2>
          <p>${copy.actionText}</p>
          <p><strong>Motivo informado pela moderação:</strong></p>
          <blockquote style="border-left:3px solid #E63946;margin:0;padding:8px 16px;color:#374151;">${safeReason}</blockquote>
          <p>Nossas regras de convivência estão publicadas nas <a href="${guidelinesLink}">Diretrizes da Comunidade</a>.</p>
          <p>Se você acha que houve um engano e quer contestar esta decisão, envie uma mensagem para <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> explicando seu ponto de vista.</p>
        `,
      })
      return true
    } catch (err) {
      this.logger.error('Failed to send moderation notice email', err)
      return false
    }
  }

  async sendWeeklyMandateDigest(
    email: string,
    recipientName: string,
    data: {
      orgName: string
      territoryLabel: string
      weekLabel: string
      newReportsCount: number
      resolvedCount: number
      medianResponseHours: number | null
      prevMedianResponseHours: number | null
      detailed: boolean
      topUnanswered: Array<{ id: string; title: string; category: string; pressureScore: number }>
      unsubscribeToken: string
      definitionVersion: string
    },
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const inboxLink = `${baseUrl}/mandato`
    const unsubLink = `${baseUrl}/descadastro-resumo?token=${encodeURIComponent(data.unsubscribeToken)}`
    const safeName = escapeHtml(recipientName || 'Equipe')
    const safeOrg = escapeHtml(data.orgName)
    const safeTerritory = escapeHtml(data.territoryLabel)
    const safeWeek = escapeHtml(data.weekLabel)

    const topHtml =
      data.detailed && data.topUnanswered.length > 0
        ? `
          <h3 style="margin:20px 0 8px;">3 relatos sem resposta de maior pressão</h3>
          <ul style="padding-left:18px;margin:0 0 16px;">
            ${data.topUnanswered
              .map(
                (r) =>
                  `<li style="margin-bottom:6px;"><a href="${escapeHtml(`${baseUrl}/relatos/${encodeURIComponent(r.id)}`)}">${escapeHtml(r.title)}</a> · ${escapeHtml(r.category)} · pressão ${escapeHtml(String(Math.round(r.pressureScore)))}</li>`,
              )
              .join('')}
          </ul>
        `
        : ''

    const medianLine =
      data.detailed && data.medianResponseHours !== null
        ? `<tr><td style="padding:6px 16px 6px 0;font-weight:600">Mediana de resposta</td><td>${escapeHtml(String(data.medianResponseHours))}h${
            data.prevMedianResponseHours !== null
              ? ` (semana anterior: ${escapeHtml(String(data.prevMedianResponseHours))}h)`
              : ''
          }</td></tr>`
        : ''

    await this.transporter
      .sendMail({
        from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
        to: email,
        subject: sanitizeSubject(`Resumo semanal do mandato (${data.weekLabel}) — ${data.orgName}`),
        html: `
          <h2>Resumo semanal — ${safeOrg}</h2>
          <p>Olá, ${safeName}. Dados factuais do Votz para ${safeTerritory} (${safeWeek}):</p>
          <table style="border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px 16px 6px 0;font-weight:600">Novos relatos na área</td><td>${escapeHtml(String(data.newReportsCount))}</td></tr>
            <tr><td style="padding:6px 16px 6px 0;font-weight:600">Resolvidos na semana</td><td>${escapeHtml(String(data.resolvedCount))}</td></tr>
            ${medianLine}
          </table>
          ${topHtml}
          <p><a href="${escapeHtml(inboxLink)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Abrir Caixa do mandato</a></p>
          <p style="color:#6B7280;font-size:12px;margin-top:24px;">
            Dados públicos agregados (definição ${escapeHtml(data.definitionVersion)}). Sem rastreamento de abertura.
            <a href="${escapeHtml(unsubLink)}">Cancelar recebimento com 1 clique</a>
          </p>
        `,
      })
      .catch((err) => this.logger.error('Failed to send weekly mandate digest email', err))
  }

  async sendOrgAlertNotification(
    email: string,
    recipientName: string,
    data: {
      orgName: string
      ruleName: string
      itemsCount: number
      highlights: Array<{ title: string; category: string; detail: string; reportId?: string | null }>
    },
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const inboxLink = `${baseUrl}/mandato`
    const safeName = escapeHtml(recipientName || 'Equipe')
    const safeOrg = escapeHtml(data.orgName)
    const safeRule = escapeHtml(data.ruleName)

    const itemsHtml = data.highlights
      .slice(0, 5)
      .map((item) => {
        const titleHtml = item.reportId
          ? `<a href="${escapeHtml(`${baseUrl}/relatos/${encodeURIComponent(item.reportId)}`)}">${escapeHtml(item.title)}</a>`
          : escapeHtml(item.title)
        return `<li style="margin-bottom:6px;">${titleHtml} — ${escapeHtml(item.category)} (${escapeHtml(item.detail)})</li>`
      })
      .join('')

    await this.transporter
      .sendMail({
        from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
        to: email,
        subject: sanitizeSubject(`[Alerta Votz] ${data.ruleName} (${data.itemsCount}) — ${data.orgName}`),
        html: `
          <h2>Alerta configurado — ${safeOrg}</h2>
          <p>Olá, ${safeName}. A regra <strong>${safeRule}</strong> registrou ${escapeHtml(String(data.itemsCount))} ocorrência(s) na sua área:</p>
          <ul style="padding-left:18px;margin:12px 0 18px;">${itemsHtml}</ul>
          <p><a href="${escapeHtml(inboxLink)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Abrir Caixa do mandato</a></p>
          <p style="color:#6B7280;font-size:12px;">Dados públicos agregados sem dados pessoais de cidadãos. Gerencie suas regras em ${escapeHtml(baseUrl)}/mandato/alertas.</p>
        `,
      })
      .catch((err) => this.logger.error('Failed to send org alert email', err))
  }

  async sendSlaAlertDigest(
    email: string,
    recipientName: string,
    data: {
      orgName: string
      atRiskCount: number
      breachedCount: number
      escalatedCount: number
      highlights: Array<{ reportId: string; title: string; category: string; stageLabel: string }>
    },
  ): Promise<void> {
    const baseUrl = this.config.get('APP_URL', 'http://localhost:5173')
    const queueUrl = `${baseUrl}/entidade/prazos`
    const safeName = escapeHtml(recipientName || 'Equipe')
    const safeOrg = escapeHtml(data.orgName)

    const itemsHtml = data.highlights
      .slice(0, 8)
      .map(
        (item) =>
          `<li style="margin-bottom:6px;"><a href="${escapeHtml(`${baseUrl}/relatos/${encodeURIComponent(item.reportId)}`)}">${escapeHtml(item.title)}</a> · ${escapeHtml(item.category)} · <strong>${escapeHtml(item.stageLabel)}</strong></li>`,
      )
      .join('')

    await this.transporter
      .sendMail({
        from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
        to: email,
        subject: sanitizeSubject(
          `[SLA Votz] ${data.breachedCount} vencido(s), ${data.atRiskCount} em risco — ${data.orgName}`,
        ),
        html: `
          <h2>Painel de prazos (SLA) — ${safeOrg}</h2>
          <p>Olá, ${safeName}. Resumo dos alertas de prazo desta janela:</p>
          <ul>
            <li>Em risco (&ge; 75% do prazo): <strong>${escapeHtml(String(data.atRiskCount))}</strong></li>
            <li>Prazo vencido: <strong>${escapeHtml(String(data.breachedCount))}</strong></li>
            <li>Escalonados à gestão: <strong>${escapeHtml(String(data.escalatedCount))}</strong></li>
          </ul>
          ${itemsHtml ? `<ul style="padding-left:18px;margin:12px 0 18px;">${itemsHtml}</ul>` : ''}
          <p><a href="${escapeHtml(queueUrl)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Abrir fila de prazos</a></p>
        `,
      })
      .catch((err) => this.logger.error('Failed to send SLA digest email', err))
  }

  async sendMonthlyAttendanceReport(
    email: string,
    recipientName: string,
    data: {
      orgName: string
      periodLabel: string
      code: string
      signedDownloadUrl: string | null
      verificationUrl: string
    },
  ): Promise<void> {
    const safeName = escapeHtml(recipientName || 'Gestor(a)')
    const safeOrg = escapeHtml(data.orgName)
    const safePeriod = escapeHtml(data.periodLabel)
    const safeCode = escapeHtml(data.code)

    await this.transporter
      .sendMail({
        from: this.config.get('SMTP_FROM', 'Votz <noreply@votz.app>'),
        to: email,
        subject: sanitizeSubject(`Relatório mensal de atendimento (${data.periodLabel}) — ${data.orgName}`),
        html: `
          <h2>Relatório mensal de atendimento — ${safeOrg}</h2>
          <p>Olá, ${safeName}. O relatório de atendimento referente a <strong>${safePeriod}</strong> foi gerado com código verificável <code>${safeCode}</code>.</p>
          ${
            data.signedDownloadUrl
              ? `<p><a href="${escapeHtml(data.signedDownloadUrl)}" style="background:#1A1A2E;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Baixar PDF (link assinado)</a></p>`
              : ''
          }
          <p>Página pública de verificação: <a href="${escapeHtml(data.verificationUrl)}">${escapeHtml(data.verificationUrl)}</a></p>
        `,
      })
      .catch((err) => this.logger.error('Failed to send monthly attendance report email', err))
  }
}
