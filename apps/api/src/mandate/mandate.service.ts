import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  EventType,
  NotificationType,
  OrgPermission,
  OrgType,
  Prisma,
  ReportStatus,
  WebhookEventType,
} from '@prisma/client'
import { hasFeature } from '@votz/shared-types'
import { toSaoPauloDateString } from '../analytics/analytics.constants'
import { resolvePoliticianTerritory } from '../analytics/analytics.scope'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { planRequiredException } from '../auth/plan-errors'
import { recordOrgAudit } from '../common/audit/org-audit'
import { NotificationsService } from '../notifications/notifications.service'
import { PrismaService } from '../prisma/prisma.service'
import { ShareCardsService } from '../share-cards/share-cards.service'
import { WebhooksService } from '../webhooks/webhooks.service'
import {
  MandateInboxQueryDto,
  QuickRespondDto,
  UpdateMandateGoalDto,
  UpdateOnboardingDto,
} from './dto/mandate.dto'
import { MandateTemplatesService } from './mandate-templates.service'
import { WeeklyDigestService } from './weekly-digest.service'

const OPEN_STATUSES: ReportStatus[] = [
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.IN_PROGRESS,
]

@Injectable()
export class MandateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: MandateTemplatesService,
    private readonly digest: WeeklyDigestService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly shareCards?: ShareCardsService,
  ) {}

  private async resolveMandateContext(user: ActingUser, permission: OrgPermission) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      permission,
    )

    if (acting.orgType === 'POLITICIAN') {
      const pol = await this.prisma.politician.findUnique({
        where: { id: acting.orgId },
        select: {
          id: true,
          name: true,
          office: true,
          state: true,
          city: true,
          plan: true,
          mandatometer: true,
        },
      })
      if (!pol) throw new NotFoundException('Mandato não encontrado')
      const territory = resolvePoliticianTerritory({
        office: pol.office,
        state: pol.state,
        city: pol.city,
      })
      return {
        orgType: OrgType.POLITICIAN,
        orgPlanType: 'POLITICIAN' as const,
        orgId: pol.id,
        orgName: pol.name,
        plan: pol.plan,
        territory,
        hasCityAndState: Boolean(pol.state && pol.city),
        mandatometer: (pol.mandatometer as Record<string, number> | null) ?? {},
      }
    }

    const entity = await this.prisma.entity.findUnique({
      where: { id: acting.orgId },
      select: { id: true, legalName: true, state: true, city: true, plan: true },
    })
    if (!entity) throw new NotFoundException('Entidade não encontrada')

    const territory = resolvePoliticianTerritory({
      office: 'Prefeito',
      state: entity.state ?? 'BR',
      city: entity.city ?? '',
    })

    return {
      orgType: OrgType.ENTITY,
      orgPlanType: 'ENTITY' as const,
      orgId: entity.id,
      orgName: entity.legalName,
      plan: entity.plan,
      territory,
      hasCityAndState: Boolean(entity.state && entity.city),
      mandatometer: {},
    }
  }

  private buildTerritoryWhere(
    territory: ReturnType<typeof resolvePoliticianTerritory>,
  ): Prisma.ReportWhereInput {
    const where: Prisma.ReportWhereInput = {
      state: territory.state,
    }
    if (territory.cityKey) {
      where.cityKey = territory.cityKey
    }
    return where
  }

  async getInbox(user: ActingUser, query: MandateInboxQueryDto) {
    const ctx = await this.resolveMandateContext(user, OrgPermission.VIEW_ANALYTICS)

    const hasAdvancedFilter = Boolean(
      query.category ||
        query.cell7 ||
        query.stalledDays ||
        query.onlyUnanswered ||
        query.onlyAdvocated,
    )
    const fullAnalyticsEnabled = hasFeature(ctx.orgPlanType, ctx.plan, 'analytics_full')
    if (hasAdvancedFilter && !fullAnalyticsEnabled) {
      throw planRequiredException(ctx.orgPlanType, 'analytics_full')
    }

    const baseTerritoryWhere = this.buildTerritoryWhere(ctx.territory)
    const where: Prisma.ReportWhereInput = { ...baseTerritoryWhere }

    if (query.status) {
      where.status = query.status
    }
    if (query.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { neighborhood: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (query.category) {
      where.category = query.category
    }
    if (query.cell7) {
      where.cell7 = query.cell7
    }
    if (query.stalledDays) {
      const cutoff = new Date(Date.now() - query.stalledDays * 24 * 60 * 60 * 1000)
      where.status = query.status ?? { in: OPEN_STATUSES }
      where.updatedAt = { lt: cutoff }
    }
    if (query.onlyUnanswered) {
      where.firstResponseAt = null
      where.status = query.status ?? { in: OPEN_STATUSES }
    }
    if (query.onlyAdvocated && ctx.orgType === OrgType.POLITICIAN) {
      where.timeline = {
        some: {
          metadata: {
            path: ['politicianId'],
            equals: ctx.orgId,
          },
        },
      }
    }

    const page = query.page ?? 1
    const limit = query.limit ?? 20
    const skip = (page - 1) * limit

    const orderBy: Prisma.ReportOrderByWithRelationInput[] =
      query.sortBy === 'oldest'
        ? [{ createdAt: 'asc' }, { pressureScore: 'desc' }]
        : query.sortBy === 'recent'
          ? [{ createdAt: 'desc' }]
          : [{ pressureScore: 'desc' }, { createdAt: 'asc' }]

    const todaySp = toSaoPauloDateString(new Date())
    const monthStart = new Date(`${todaySp.slice(0, 7)}-01T03:00:00.000Z`)

    const [
      settings,
      total,
      reports,
      unansweredCount,
      advocatedInProgressCount,
      resolvedThisMonthCount,
    ] = await Promise.all([
      this.digest.getOrInitSettings(ctx.orgType, ctx.orgId),
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          status: true,
          state: true,
          city: true,
          neighborhood: true,
          cell7: true,
          pressureScore: true,
          firstResponseAt: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          // NUNCA expor authorId / author / PII de cidadão
          _count: { select: { votes: true, comments: true } },
          timeline: {
            where: {
              type: { in: [EventType.RESPONDED, EventType.STATUS_CHANGED, EventType.RESOLVED, EventType.UPDATE] },
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              type: true,
              content: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.report.count({
        where: {
          ...baseTerritoryWhere,
          status: { in: OPEN_STATUSES },
          firstResponseAt: null,
        },
      }),
      this.prisma.report.count({
        where:
          ctx.orgType === OrgType.POLITICIAN
            ? {
                ...baseTerritoryWhere,
                status: { in: OPEN_STATUSES },
                timeline: {
                  some: {
                    metadata: {
                      path: ['politicianId'],
                      equals: ctx.orgId,
                    },
                  },
                },
              }
            : {
                ...baseTerritoryWhere,
                status: ReportStatus.IN_PROGRESS,
              },
      }),
      this.prisma.report.count({
        where: {
          ...baseTerritoryWhere,
          status: ReportStatus.RESOLVED,
          resolvedAt: { gte: monthStart },
        },
      }),
    ])

    const reportIds = reports.map((r) => r.id)
    const [tags, notes] =
      reportIds.length > 0
        ? await Promise.all([
            this.prisma.orgReportTag.findMany({
              where: { orgType: ctx.orgType, orgId: ctx.orgId, reportId: { in: reportIds } },
              orderBy: { createdAt: 'asc' },
            }),
            this.prisma.orgReportNote.findMany({
              where: { orgType: ctx.orgType, orgId: ctx.orgId, reportId: { in: reportIds } },
              orderBy: { createdAt: 'desc' },
            }),
          ])
        : [[], []]

    const tagsByReport = new Map<string, typeof tags>()
    for (const tag of tags) {
      const list = tagsByReport.get(tag.reportId) ?? []
      list.push(tag)
      tagsByReport.set(tag.reportId, list)
    }

    const notesByReport = new Map<string, typeof notes>()
    for (const note of notes) {
      const list = notesByReport.get(note.reportId) ?? []
      list.push(note)
      notesByReport.set(note.reportId, list)
    }

    const items = reports.map((r) => {
      const advocatedByMe =
        ctx.orgType === OrgType.POLITICIAN &&
        r.timeline.some(
          (e) =>
            (e.metadata as Record<string, unknown> | null)?.action === 'advocated' &&
            (e.metadata as Record<string, unknown> | null)?.politicianId === ctx.orgId,
        )

      return {
        id: r.id,
        protocol: r.id.slice(0, 8).toUpperCase(),
        title: r.title,
        description: r.description,
        category: r.category,
        status: r.status,
        state: r.state,
        city: r.city,
        neighborhood: r.neighborhood,
        cell7: r.cell7,
        pressureScore: r.pressureScore,
        firstResponseAt: r.firstResponseAt,
        resolvedAt: r.resolvedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        supportCount: r._count.votes,
        commentsCount: r._count.comments,
        advocatedByMe,
        internalTags: tagsByReport.get(r.id) ?? [],
        internalNotes: notesByReport.get(r.id) ?? [],
        recentTimeline: r.timeline,
      }
    })

    return {
      kpis: {
        unansweredCount,
        advocatedInProgressCount,
        resolvedThisMonthCount,
        monthlyGoal: settings.monthlyGoal,
      },
      capabilities: {
        advancedFilters: fullAnalyticsEnabled,
        editableGoal: fullAnalyticsEnabled,
        replyTemplates: hasFeature(ctx.orgPlanType, ctx.plan, 'reply_templates'),
      },
      territory: {
        state: ctx.territory.state,
        cityKey: ctx.territory.cityKey,
        level: ctx.territory.territoryLevel,
      },
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    }
  }

  async quickRespond(user: ActingUser, reportId: string, dto: QuickRespondDto) {
    const ctx = await this.resolveMandateContext(user, OrgPermission.RESPOND_REPORTS)

    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        title: true,
        category: true,
        status: true,
        state: true,
        city: true,
        cityKey: true,
        neighborhood: true,
        firstResponseAt: true,
        resolvedAt: true,
        authorId: true, // uso interno apenas para disparar Notification; nunca exposto no retorno
        timeline: {
          select: { id: true, metadata: true },
        },
      },
    })

    if (!report) throw new NotFoundException('Relato não encontrado')
    if (report.state !== ctx.territory.state) {
      throw new ForbiddenException('Relato fora do território deste mandato')
    }
    if (ctx.territory.cityKey && report.cityKey !== ctx.territory.cityKey) {
      throw new ForbiddenException('Relato fora do município deste mandato')
    }

    let renderedMessage = dto.message?.trim() ?? ''
    if (dto.templateId) {
      if (!hasFeature(ctx.orgPlanType, ctx.plan, 'reply_templates')) {
        throw planRequiredException(ctx.orgPlanType, 'reply_templates')
      }
      const template = await this.prisma.replyTemplate.findFirst({
        where: { id: dto.templateId, orgType: ctx.orgType, orgId: ctx.orgId },
      })
      if (!template) {
        throw new NotFoundException('Modelo de resposta não encontrado')
      }
      renderedMessage = this.templates.renderTemplateBody(template.body, {
        protocolo: report.id.slice(0, 8).toUpperCase(),
        bairro: report.neighborhood ?? report.city ?? report.state ?? 'Território',
        categoria: report.category,
        prazo: '7 dias úteis',
      })
      await this.prisma.replyTemplate.update({
        where: { id: template.id },
        data: { usageCount: { increment: 1 } },
      })
    }

    if (renderedMessage) {
      renderedMessage = this.templates.sanitizePlainText(renderedMessage, 'Mensagem')
    }

    const shouldAdvocate =
      dto.advocate !== false && ctx.orgType === OrgType.POLITICIAN
    const alreadyAdvocatedByMe = report.timeline.some(
      (e) =>
        (e.metadata as Record<string, unknown> | null)?.action === 'advocated' &&
        (e.metadata as Record<string, unknown> | null)?.politicianId === ctx.orgId,
    )

    if (!renderedMessage && !dto.newStatus && (!shouldAdvocate || alreadyAdvocatedByMe)) {
      throw new BadRequestException(
        'Informe uma mensagem, selecione um modelo, altere o status ou avoque o relato.',
      )
    }

    const now = new Date()
    let updatedStatus = report.status

    await this.prisma.$transaction(async (tx) => {
      if (shouldAdvocate && !alreadyAdvocatedByMe) {
        await tx.timelineEvent.create({
          data: {
            reportId: report.id,
            type: EventType.UPDATE,
            content: `${ctx.orgName} avocou este relato para acompanhamento do mandato.`,
            authorId: user.id,
            metadata: { action: 'advocated', politicianId: ctx.orgId },
          },
        })
        if (updatedStatus === ReportStatus.OPEN) {
          updatedStatus = ReportStatus.IN_PROGRESS
          await tx.report.update({
            where: { id: report.id },
            data: { status: ReportStatus.IN_PROGRESS },
          })
        }
        if (ctx.orgType === OrgType.POLITICIAN) {
          const prev = ctx.mandatometer
          await tx.politician.update({
            where: { id: ctx.orgId },
            data: {
              mandatometer: {
                ...prev,
                advocated: Number(prev.advocated ?? 0) + 1,
              },
            },
          })
        }
      }

      if (renderedMessage) {
        await tx.timelineEvent.create({
          data: {
            reportId: report.id,
            type: EventType.RESPONDED,
            content: renderedMessage,
            authorId: user.id,
            metadata: {
              action: 'responded',
              orgType: ctx.orgType,
              orgId: ctx.orgId,
              politicianId: ctx.orgType === OrgType.POLITICIAN ? ctx.orgId : undefined,
              templateId: dto.templateId ?? undefined,
            },
          },
        })
        if (!report.firstResponseAt) {
          await tx.report.update({
            where: { id: report.id },
            data: { firstResponseAt: now },
          })
        }
      }

      if (dto.newStatus && dto.newStatus !== updatedStatus) {
        const isResolved = dto.newStatus === ReportStatus.RESOLVED
        updatedStatus = dto.newStatus
        await tx.report.update({
          where: { id: report.id },
          data: {
            status: dto.newStatus,
            ...(isResolved && !report.resolvedAt ? { resolvedAt: now } : {}),
          },
        })
        await tx.timelineEvent.create({
          data: {
            reportId: report.id,
            type: isResolved ? EventType.RESOLVED : EventType.STATUS_CHANGED,
            content: isResolved
              ? `Relato marcado como resolvido por ${ctx.orgName}.`
              : `Status atualizado para ${dto.newStatus} por ${ctx.orgName}.`,
            authorId: user.id,
            metadata: {
              action: 'status_changed',
              status: dto.newStatus,
              orgType: ctx.orgType,
              orgId: ctx.orgId,
            },
          },
        })
      }
    })

    if (report.authorId && this.notifications) {
      try {
        await this.notifications.notify({
          userId: report.authorId,
          type: NotificationType.STATUS_CHANGED,
          reportId: report.id,
          metadata: {
            orgName: ctx.orgName,
            reportTitle: report.title,
            status: updatedStatus,
          },
        })
      } catch {
        // Notificação é best-effort e nunca bloqueia a resposta oficial
      }
    }

    if (this.webhooks) {
      await this.webhooks.enqueueEvent(
        ctx.orgType,
        ctx.orgId,
        WebhookEventType.REPORT_STATUS_CHANGED,
        `mandate-respond-${report.id}-${now.getTime()}`,
        {
          reportId: report.id,
          status: updatedStatus,
          category: report.category,
          state: report.state,
          city: report.city,
          neighborhood: report.neighborhood,
        },
      )
    }

    if (ctx.orgType === OrgType.POLITICIAN && this.shareCards) {
      await this.shareCards.invalidateOnMetricChange(ctx.orgId)
    }

    return {
      reportId: report.id,
      status: updatedStatus,
      advocated: shouldAdvocate || alreadyAdvocatedByMe,
      responded: Boolean(renderedMessage),
    }
  }

  async updateGoal(user: ActingUser, dto: UpdateMandateGoalDto) {
    const ctx = await this.resolveMandateContext(user, OrgPermission.MANAGE_PROFILE)
    if (!hasFeature(ctx.orgPlanType, ctx.plan, 'analytics_full')) {
      throw planRequiredException(ctx.orgPlanType, 'analytics_full')
    }

    const current = await this.digest.getOrInitSettings(ctx.orgType, ctx.orgId)
    const updated = await this.prisma.mandateSettings.update({
      where: { id: current.id },
      data: { monthlyGoal: dto.monthlyGoal ?? null },
    })

    await recordOrgAudit(this.prisma, {
      action: 'CREATED',
      orgType: ctx.orgType,
      orgId: ctx.orgId,
      itemType: 'MANDATE_MONTHLY_GOAL',
      itemId: updated.id,
      actorId: user.id,
      summary: updated.monthlyGoal
        ? `Meta mensal definida para ${updated.monthlyGoal} relatos`
        : 'Meta mensal removida',
    })

    return { monthlyGoal: updated.monthlyGoal }
  }

  async getOnboarding(user: ActingUser) {
    const ctx = await this.resolveMandateContext(user, OrgPermission.VIEW_ANALYTICS)
    const settings = await this.digest.getOrInitSettings(ctx.orgType, ctx.orgId)

    const [memberCount, templateCount] = await Promise.all([
      this.prisma.orgMembership.count({
        where: { orgType: ctx.orgType, orgId: ctx.orgId, status: 'ACTIVE' },
      }),
      this.prisma.replyTemplate.count({
        where: { orgType: ctx.orgType, orgId: ctx.orgId },
      }),
    ])

    const steps = [
      {
        key: 'territoryConfirmed',
        title: 'Confirmar território do mandato',
        completed: Boolean(settings.territoryConfirmedAt || ctx.hasCityAndState),
        actionPath: '/mandato',
      },
      {
        key: 'memberInvited',
        title: 'Convidar membro do gabinete',
        completed: memberCount > 1,
        actionPath:
          ctx.orgType === OrgType.POLITICIAN
            ? `/politico/${ctx.orgId}`
            : `/entidade/${ctx.orgId}`,
      },
      {
        key: 'templateCreated',
        title: 'Criar primeiro modelo de resposta',
        completed: templateCount >= 1,
        actionPath: '/mandato/modelos',
      },
      {
        key: 'digestEnabled',
        title: 'Ativar resumo semanal por e-mail',
        completed: settings.digestEnabled,
        actionPath: '/mandato/resumo',
      },
      {
        key: 'monthlyGoalSet',
        title: 'Definir meta mensal do mandato',
        completed: settings.monthlyGoal !== null,
        actionPath: '/mandato',
      },
    ]

    const completedCount = steps.filter((s) => s.completed).length
    return {
      dismissed: settings.onboardingDismissed,
      completedCount,
      totalCount: steps.length,
      steps,
    }
  }

  async updateOnboarding(user: ActingUser, dto: UpdateOnboardingDto) {
    const ctx = await this.resolveMandateContext(user, OrgPermission.VIEW_ANALYTICS)
    const settings = await this.digest.getOrInitSettings(ctx.orgType, ctx.orgId)

    await this.prisma.mandateSettings.update({
      where: { id: settings.id },
      data: {
        ...(dto.dismissed !== undefined
          ? { onboardingDismissed: dto.dismissed }
          : {}),
        ...(dto.confirmTerritory
          ? { territoryConfirmedAt: new Date() }
          : {}),
      },
    })

    return this.getOnboarding(user)
  }
}
