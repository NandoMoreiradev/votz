jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (v: string) =>
      v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ''),
  },
}))

import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Category, OrgType, ReportStatus } from '@prisma/client'
import { ReportsRepository } from '../reports/reports.repository'
import { MandateTemplatesService } from './mandate-templates.service'
import { MandateService } from './mandate.service'
import { WeeklyDigestService } from './weekly-digest.service'

describe('MandateModule (Inbox, Templates, Notes/Tags, Weekly Digest & Onboarding)', () => {
  const user = {
    id: 'u-pol',
    type: 'POLITICIAN' as const,
    ctx: {
      type: 'POLITICIAN' as const,
      id: 'pol-1',
      permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'],
    },
  } as any

  it('MandateTemplatesService enforces allowlisted variables, DOMPurify sanitization, and internal-only annotations', async () => {
    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
        findFirst: jest.fn(async () => ({
          id: 'm-1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
      },
      politician: {
        findUnique: jest.fn(async () => ({
          id: 'pol-1',
          office: 'Vereador',
          state: 'SP',
          city: 'São Paulo',
          plan: 'MANDATO_PRO',
        })),
      },
      replyTemplate: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'tpl-1',
          ...data,
        })),
      },
      report: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'rep-campinas'
            ? { id: 'rep-campinas', state: 'SP', cityKey: 'campinas' }
            : { id: 'rep-sp', state: 'SP', cityKey: 'sao paulo' },
        ),
      },
      orgReportTag: {
        upsert: jest.fn(async ({ create }: { create: Record<string, unknown> }) => ({
          id: 'tag-1',
          ...create,
        })),
      },
      orgReportNote: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'note-1',
          ...data,
        })),
      },
      moderationAction: {
        create: jest.fn(async () => ({})),
      },
    } as any

    const svc = new MandateTemplatesService(prisma)

    // Variável fora da allowlist deve ser rejeitada
    await expect(
      svc.createTemplate(user, {
        title: 'Modelo inválido',
        body: 'Olá {{cpf}}, protocolo {{protocolo}}',
      }),
    ).rejects.toThrow(BadRequestException)

    // XSS / HTML é removido com DOMPurify
    const created = await svc.createTemplate(user, {
      title: '<img src=x onerror=alert(1)>Prazo padrão',
      body: '<script>alert(1)</script>Protocolo {{protocolo}} em {{bairro}} ({{categoria}}) terá retorno em {{prazo}}.',
      category: Category.INFRASTRUCTURE,
    })
    expect(created.title).toBe('Prazo padrão')
    expect(created.body).toBe(
      'Protocolo {{protocolo}} em {{bairro}} ({{categoria}}) terá retorno em {{prazo}}.',
    )

    const rendered = svc.renderTemplateBody(created.body, {
      protocolo: 'ABC12345',
      bairro: 'Pinheiros',
      categoria: 'INFRASTRUCTURE',
      prazo: '7 dias',
    })
    expect(rendered).toContain('ABC12345')
    expect(rendered).toContain('Pinheiros')

    // Nota interna bloqueada fora do território do mandato
    await expect(
      svc.addNote(user, 'rep-campinas', { content: 'Acompanhar' }),
    ).rejects.toThrow(ForbiddenException)

    const note = await svc.addNote(user, 'rep-sp', {
      content: '<b>Encaminhado</b> ao gabinete regional.',
    })
    expect(note.content).toBe('Encaminhado ao gabinete regional.')

    // Verifica que a query pública de ReportsRepository nunca inclui tags ou notas internas
    const spyFindUnique = jest.fn(async () => null)
    const repo = new ReportsRepository({ report: { findUnique: spyFindUnique } } as any)
    await repo.findById('rep-sp')
    const selectObj = ((spyFindUnique.mock.calls[0] as unknown[] | undefined)?.[0] as {
      select?: Record<string, unknown>
    })?.select
    expect(selectObj).toBeDefined()
    expect(selectObj?.orgTags).toBeUndefined()
    expect(selectObj?.orgNotes).toBeUndefined()
  })

  it('MandateService gates advanced inbox filters on BASICO and executes quickRespond + onboarding cleanly', async () => {
    let plan: 'BASICO' | 'MANDATO_PRO' = 'BASICO'
    const timelineCreates: Array<Record<string, unknown>> = []
    const recipient = { type: 'POLITICIAN', id: 'pol-1' }

    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
        findFirst: jest.fn(async () => ({
          id: 'm-1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
        count: jest.fn(async () => 2),
      },
      politician: {
        findUnique: jest.fn(async () => ({
          id: 'pol-1',
          name: 'Vereadora Lúcia',
          office: 'Vereadora',
          state: 'RJ',
          city: 'Niterói',
          plan,
          mandatometer: { advocated: 1, resolved: 0, ignored: 0 },
        })),
        update: jest.fn(async () => ({})),
      },
      mandateSettings: {
        findUnique: jest.fn(async () => ({
          id: 'set-1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          monthlyGoal: 15,
          digestEnabled: true,
          digestDayOfWeek: 1,
          digestHour: 8,
          digestUnsubscribeToken: 'tok-123456789012345678',
          onboardingDismissed: false,
          territoryConfirmedAt: new Date(),
        })),
      },
      replyTemplate: {
        count: jest.fn(async () => 1),
        findFirst: jest.fn(async () => ({
          id: 'tpl-1',
          body: 'Protocolo {{protocolo}} recebido em {{bairro}} ({{prazo}}).',
        })),
        update: jest.fn(async () => ({})),
      },
      report: {
        count: jest.fn(async () => 2),
        findMany: jest.fn(async () => [
          {
            id: 'rep-11111111-1111-4111-8111-111111111111',
            title: 'Posto sem médico',
            description: 'Descrição pública',
            category: Category.HEALTH,
            status: ReportStatus.OPEN,
            state: 'RJ',
            city: 'Niterói',
            neighborhood: 'Icaraí',
            cell7: '89a8100',
            pressureScore: 88,
            firstResponseAt: null,
            resolvedAt: null,
            createdAt: new Date('2026-11-10T10:00:00Z'),
            updatedAt: new Date('2026-11-10T10:00:00Z'),
            _count: { votes: 14, comments: 2 },
            recipientType: 'POLITICIAN',
            recipientId: 'pol-1',
            advocacies: [],
            timeline: [],
          },
        ]),
        findUnique: jest.fn(async () => ({
          id: 'rep-11111111-1111-4111-8111-111111111111',
          title: 'Posto sem médico',
          category: Category.HEALTH,
          status: ReportStatus.OPEN,
          state: 'RJ',
          city: 'Niterói',
          cityKey: 'niteroi',
          neighborhood: 'Icaraí',
          firstResponseAt: null,
          resolvedAt: null,
          authorId: 'citizen-hidden',
          recipientType: recipient.type,
          recipientId: recipient.id,
          advocacies: [],
          timeline: [],
        })),
        update: jest.fn(async () => ({})),
      },
      orgReportTag: { findMany: jest.fn(async () => []) },
      orgReportNote: { findMany: jest.fn(async () => []) },
      timelineEvent: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          timelineCreates.push(data)
          return { id: `ev-${timelineCreates.length}`, ...data }
        }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as any

    const templatesSvc = new MandateTemplatesService(prisma)
    const digestSvc = new WeeklyDigestService(
      prisma,
      { fetchAreaSummary: jest.fn() } as any,
      { sendWeeklyMandateDigest: jest.fn() } as any,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )
    const notifications = { notify: jest.fn(async () => ({})) } as any
    const webhooks = { enqueueEvent: jest.fn(async () => 1) } as any
    const shareCards = { invalidateOnMetricChange: jest.fn(async () => undefined) } as any

    const lifecycle = {
      advocate: jest.fn(async () => ({ advocated: true })),
      changeStatus: jest.fn(async (_id: string, _u: unknown, dto: { status: string }) => ({ status: dto.status })),
      postUpdate: jest.fn(async () => ({ status: ReportStatus.OPEN })),
    } as any

    const service = new MandateService(
      prisma,
      templatesSvc,
      digestSvc,
      lifecycle,
      notifications,
      webhooks,
      shareCards,
    )

    // Filtro avançado bloqueado no BASICO
    await expect(
      service.getInbox(user, { category: Category.HEALTH }),
    ).rejects.toThrow(ForbiddenException)

    // Filtro básico livre no BASICO e nunca vaza authorId
    const inboxBasic = await service.getInbox(user, { status: ReportStatus.OPEN })
    expect(inboxBasic.items).toHaveLength(1)
    expect((inboxBasic.items[0] as any).authorId).toBeUndefined()
    expect(inboxBasic.kpis.monthlyGoal).toBe(15)

    // No MANDATO_PRO permite responder com modelo + avocar + mudar status (a regra mora no ciclo de vida)
    plan = 'MANDATO_PRO'
    const reportId = 'rep-11111111-1111-4111-8111-111111111111'
    const res = await service.quickRespond(user, reportId, {
      templateId: 'tpl-1',
      newStatus: ReportStatus.IN_PROGRESS,
      advocate: true,
    })
    expect(res.advocated).toBe(true)
    expect(res.responded).toBe(true)
    expect(res.status).toBe(ReportStatus.IN_PROGRESS)
    expect(lifecycle.advocate).toHaveBeenCalledWith(reportId, user, { orgType: 'POLITICIAN', orgId: 'pol-1' })
    expect(lifecycle.changeStatus).toHaveBeenCalledWith(
      reportId,
      user,
      expect.objectContaining({ status: ReportStatus.IN_PROGRESS, content: expect.stringContaining('REP-1111') }),
    )
    // Sem marcar "Avocar", responder não avoca sozinho
    lifecycle.advocate.mockClear()
    await service.quickRespond(user, reportId, { message: 'Recebemos e vamos verificar no local.' })
    expect(lifecycle.advocate).not.toHaveBeenCalled()
    expect(lifecycle.postUpdate).toHaveBeenCalledWith(reportId, user, expect.objectContaining({ content: 'Recebemos e vamos verificar no local.' }))
    // Status com mensagem vazia é recusado
    await expect(service.quickRespond(user, reportId, { newStatus: ReportStatus.RESOLVED })).rejects.toThrow(BadRequestException)

    // Quem não é o destinatário não muda status e precisa avocar antes de publicar
    recipient.id = 'outro-orgao'
    await expect(
      service.quickRespond(user, reportId, { message: 'Já resolvemos tudo por aqui.', newStatus: ReportStatus.RESOLVED }),
    ).rejects.toThrow(ForbiddenException)
    await expect(service.quickRespond(user, reportId, { message: 'Vamos cobrar a secretaria.' })).rejects.toThrow(ForbiddenException)
    recipient.id = 'pol-1'

    const onboarding = await service.getOnboarding(user)
    expect(onboarding.completedCount).toBe(5)
    expect(onboarding.totalCount).toBe(5)
  })

  it('WeeklyDigestService enforces LGPD opt-in, weekly idempotency, and 1-click unsubscribe', async () => {
    let sentWeek: string | null = null
    let digestEnabled = true

    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: ['MANAGE_PROFILE', 'VIEW_ANALYTICS'] },
        })),
        findFirst: jest.fn(async () => ({
          id: 'm-1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          status: 'ACTIVE',
          role: { permissions: ['MANAGE_PROFILE', 'VIEW_ANALYTICS'] },
        })),
        findMany: jest.fn(async () => [
          {
            user: { email: 'gabinete@votz.app', name: 'Equipe' },
            role: { permissions: ['VIEW_ANALYTICS'] },
          },
        ]),
      },
      politician: {
        findUnique: jest.fn(async () => ({
          id: 'pol-1',
          name: 'Deputado Estadual',
          office: 'Deputado Estadual',
          state: 'MG',
          city: null,
          plan: 'MANDATO',
        })),
      },
      report: {
        findMany: jest.fn(async () => [
          {
            id: 'rep-anon-digest',
            title: 'Bueiro entupido (anônimo)',
            category: Category.SANITATION,
            neighborhood: 'Centro',
            city: 'Belo Horizonte',
            pressureScore: 95,
          },
        ]),
      },
      mandateSettings: {
        findUnique: jest.fn(async ({ where }: { where: { digestUnsubscribeToken?: string } }) => {
          if (where.digestUnsubscribeToken === 'invalid') return null
          return {
            id: 'set-1',
            orgType: OrgType.POLITICIAN,
            orgId: 'pol-1',
            digestEnabled,
            digestDayOfWeek: 1,
            digestHour: 8,
            digestUnsubscribeToken: 'valid-token-1234567890',
            digestLastSentWeek: sentWeek,
            digestLegalBasisAcceptedAt: null,
          }
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { OR: Array<Record<string, unknown>> }; data: { digestLastSentWeek: string } }) => {
          if (!digestEnabled || sentWeek === data.digestLastSentWeek) {
            return { count: 0 }
          }
          sentWeek = data.digestLastSentWeek
          return { count: 1 }
        }),
        update: jest.fn(async ({ data }: { data: { digestEnabled?: boolean } }) => {
          if (data.digestEnabled !== undefined) digestEnabled = data.digestEnabled
          return { id: 'set-1', digestEnabled }
        }),
      },
      moderationAction: { create: jest.fn(async () => ({})) },
    } as any

    const mail = { sendWeeklyMandateDigest: jest.fn(async () => undefined) } as any
    const svc = new WeeklyDigestService(
      prisma,
      {
        fetchAreaSummary: jest.fn(async () => ({
          createdCount: 12,
          resolvedCount: 5,
          responseCount: 8,
          respBuckets: [2, 4, 2, 0, 0, 0, 0, 0],
        })),
      } as any,
      mail,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )

    // Exige aceite de base legal ao ativar
    await expect(
      svc.updateSettings(user, { digestEnabled: true, legalBasisAccepted: false }),
    ).rejects.toThrow(BadRequestException)

    // Idempotência semanal: envia apenas 1x na semana 2026-W46
    const first = await svc.processDigestJob(OrgType.POLITICIAN, 'pol-1', '2026-W46')
    const second = await svc.processDigestJob(OrgType.POLITICIAN, 'pol-1', '2026-W46')
    expect(first).toEqual({ sent: 1, weekKey: '2026-W46', mode: 'DETAILED' })
    expect(second).toEqual({ skipped: true, reason: 'already_sent_or_disabled' })
    expect(mail.sendWeeklyMandateDigest).toHaveBeenCalledTimes(1)
    const digestPayload = mail.sendWeeklyMandateDigest.mock.calls[0][2]
    expect(digestPayload.topUnanswered).toHaveLength(1)
    expect(digestPayload.topUnanswered[0].id).toBe('rep-anon-digest')
    const serializedDigest = JSON.stringify(digestPayload)
    expect(serializedDigest).not.toContain('authorId')
    expect(serializedDigest).not.toContain('orgNotes')
    expect(serializedDigest).not.toContain('orgTags')

    // C4: GET /unsubscribe (previewUnsubscribeByToken) nunca altera digestEnabled (proteção anti-prefetch)
    const preview = await svc.previewUnsubscribeByToken('valid-token-1234567890')
    expect(preview.valid).toBe(true)
    expect(preview.alreadyUnsubscribed).toBe(false)
    expect(digestEnabled).toBe(true)

    // Confirmação explícita via POST desativa de forma idempotente
    const unsub1 = await svc.confirmUnsubscribeByToken('valid-token-1234567890')
    expect(unsub1.unsubscribed).toBe(true)
    expect(digestEnabled).toBe(false)
    const unsub2 = await svc.confirmUnsubscribeByToken('valid-token-1234567890')
    expect(unsub2.unsubscribed).toBe(true)
    expect(digestEnabled).toBe(false)
  })
})
