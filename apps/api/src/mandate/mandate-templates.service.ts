import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'
import { getPlanConfig, hasFeature } from '@votz/shared-types'
import DOMPurify from 'isomorphic-dompurify'
import { resolvePoliticianTerritory } from '../analytics/analytics.scope'
import { ActingUser, requireActingOrg } from '../auth/acting-org'
import { planRequiredException } from '../auth/plan-errors'
import { recordOrgAudit } from '../common/audit/org-audit'
import { PrismaService } from '../prisma/prisma.service'
import {
  CreateReplyTemplateDto,
  CreateReportNoteDto,
  CreateReportTagDto,
  UpdateReplyTemplateDto,
} from './dto/mandate.dto'

export const ALLOWED_TEMPLATE_VARIABLES = [
  'protocolo',
  'bairro',
  'categoria',
  'prazo',
] as const

@Injectable()
export class MandateTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  sanitizePlainText(input: string, fieldLabel = 'Texto'): string {
    const clean = DOMPurify.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
    }).trim()
    if (!clean) {
      throw new BadRequestException(`${fieldLabel} não pode ficar vazio após sanitização`)
    }
    return clean
  }

  validateTemplateVariables(body: string): void {
    const matches = body.matchAll(/\{\{([^}]*)\}\}/g)
    for (const match of matches) {
      const token = (match[1] ?? '').trim()
      if (!(ALLOWED_TEMPLATE_VARIABLES as readonly string[]).includes(token)) {
        throw new BadRequestException(
          `Variável não permitida no modelo: "{{${token}}}". Permitidas: {{protocolo}}, {{bairro}}, {{categoria}}, {{prazo}}.`,
        )
      }
    }
  }

  renderTemplateBody(
    body: string,
    vars: { protocolo: string; bairro: string; categoria: string; prazo: string },
  ): string {
    this.validateTemplateVariables(body)
    return body.replace(/\{\{([^}]*)\}\}/g, (_full, rawKey: string) => {
      const key = rawKey.trim() as keyof typeof vars
      return vars[key] ?? ''
    })
  }

  private async resolveTemplateOrg(user: ActingUser, permission: OrgPermission) {
    const acting = await requireActingOrg(
      this.prisma,
      user,
      ['POLITICIAN', 'ENTITY'],
      permission,
    )

    if (acting.orgType === 'POLITICIAN') {
      const pol = await this.prisma.politician.findUnique({
        where: { id: acting.orgId },
        select: { id: true, plan: true, office: true, state: true, city: true },
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
        plan: pol.plan,
        territory,
      }
    }

    const entity = await this.prisma.entity.findUnique({
      where: { id: acting.orgId },
      select: { id: true, plan: true, state: true, city: true },
    })
    if (!entity) throw new NotFoundException('Entidade não encontrada')

    return {
      orgType: OrgType.ENTITY,
      orgPlanType: 'ENTITY' as const,
      orgId: entity.id,
      plan: entity.plan,
      territory: null,
    }
  }

  async listTemplates(user: ActingUser) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.VIEW_ANALYTICS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }
    const cfg = getPlanConfig(org.orgPlanType, org.plan)
    const items = await this.prisma.replyTemplate.findMany({
      where: { orgType: org.orgType, orgId: org.orgId },
      orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
    })
    return {
      items,
      allowedVariables: ALLOWED_TEMPLATE_VARIABLES,
      limit: cfg?.limits.maxReplyTemplates ?? null,
    }
  }

  async createTemplate(user: ActingUser, dto: CreateReplyTemplateDto) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }

    const cfg = getPlanConfig(org.orgPlanType, org.plan)
    const maxTemplates = cfg?.limits.maxReplyTemplates ?? null
    if (maxTemplates !== null) {
      const existingCount = await this.prisma.replyTemplate.count({
        where: { orgType: org.orgType, orgId: org.orgId },
      })
      if (existingCount >= maxTemplates) {
        throw new ForbiddenException(
          `Limite de ${maxTemplates} modelos de resposta atingido no plano atual.`,
        )
      }
    }

    const title = this.sanitizePlainText(dto.title, 'Título')
    const body = this.sanitizePlainText(dto.body, 'Corpo do modelo')
    this.validateTemplateVariables(body)

    const created = await this.prisma.replyTemplate.create({
      data: {
        orgType: org.orgType,
        orgId: org.orgId,
        title,
        body,
        category: dto.category ?? null,
        createdById: user.id,
      },
    })

    await recordOrgAudit(this.prisma, {
      action: 'CREATED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'REPLY_TEMPLATE',
      itemId: created.id,
      actorId: user.id,
      summary: title,
    })

    return created
  }

  async updateTemplate(
    user: ActingUser,
    templateId: string,
    dto: UpdateReplyTemplateDto,
  ) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }

    const existing = await this.prisma.replyTemplate.findFirst({
      where: { id: templateId, orgType: org.orgType, orgId: org.orgId },
    })
    if (!existing) throw new NotFoundException('Modelo de resposta não encontrado')

    const data: Record<string, unknown> = {}
    if (dto.title !== undefined) {
      data.title = this.sanitizePlainText(dto.title, 'Título')
    }
    if (dto.body !== undefined) {
      const cleanBody = this.sanitizePlainText(dto.body, 'Corpo do modelo')
      this.validateTemplateVariables(cleanBody)
      data.body = cleanBody
    }
    if (dto.category !== undefined) {
      data.category = dto.category
    }

    return this.prisma.replyTemplate.update({
      where: { id: existing.id },
      data,
    })
  }

  async deleteTemplate(user: ActingUser, templateId: string) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }

    const existing = await this.prisma.replyTemplate.findFirst({
      where: { id: templateId, orgType: org.orgType, orgId: org.orgId },
    })
    if (!existing) throw new NotFoundException('Modelo de resposta não encontrado')

    await this.prisma.replyTemplate.delete({ where: { id: existing.id } })
    await recordOrgAudit(this.prisma, {
      action: 'DELETED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'REPLY_TEMPLATE',
      itemId: existing.id,
      actorId: user.id,
      summary: existing.title,
    })

    return { deleted: true }
  }

  private async verifyReportTerritoryAccess(
    org: Awaited<ReturnType<MandateTemplatesService['resolveTemplateOrg']>>,
    reportId: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { id: true, state: true, cityKey: true, recipientType: true, recipientId: true },
    })
    if (!report) throw new NotFoundException('Relato não encontrado')

    if (org.orgType === OrgType.POLITICIAN && org.territory) {
      if (report.state !== org.territory.state) {
        throw new ForbiddenException('Relato fora do território deste mandato')
      }
      if (org.territory.cityKey && report.cityKey !== org.territory.cityKey) {
        throw new ForbiddenException('Relato fora do município deste mandato')
      }
    }
    return report
  }

  async listReportPrivateAnnotations(user: ActingUser, reportId: string) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.VIEW_ANALYTICS)
    await this.verifyReportTerritoryAccess(org, reportId)

    const [tags, notes] = await Promise.all([
      this.prisma.orgReportTag.findMany({
        where: { orgType: org.orgType, orgId: org.orgId, reportId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.orgReportNote.findMany({
        where: { orgType: org.orgType, orgId: org.orgId, reportId },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return { tags, notes }
  }

  async addTag(user: ActingUser, reportId: string, dto: CreateReportTagDto) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }
    await this.verifyReportTerritoryAccess(org, reportId)

    const label = this.sanitizePlainText(dto.label, 'Tag')
    const tag = await this.prisma.orgReportTag.upsert({
      where: {
        orgType_orgId_reportId_label: {
          orgType: org.orgType,
          orgId: org.orgId,
          reportId,
          label,
        },
      },
      create: {
        orgType: org.orgType,
        orgId: org.orgId,
        reportId,
        label,
        color: dto.color ?? '#1D4ED8',
        createdById: user.id,
      },
      update: {
        color: dto.color ?? '#1D4ED8',
      },
    })

    await recordOrgAudit(this.prisma, {
      action: 'CREATED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'ORG_REPORT_TAG',
      itemId: tag.id,
      actorId: user.id,
      summary: `${reportId}:${label}`,
    })

    return tag
  }

  async removeTag(user: ActingUser, reportId: string, tagId: string) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }

    const existing = await this.prisma.orgReportTag.findFirst({
      where: { id: tagId, reportId, orgType: org.orgType, orgId: org.orgId },
    })
    if (!existing) throw new NotFoundException('Tag interna não encontrada')

    await this.prisma.orgReportTag.delete({ where: { id: existing.id } })
    await recordOrgAudit(this.prisma, {
      action: 'DELETED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'ORG_REPORT_TAG',
      itemId: existing.id,
      actorId: user.id,
      summary: `${reportId}:${existing.label}`,
    })
    return { deleted: true }
  }

  async addNote(user: ActingUser, reportId: string, dto: CreateReportNoteDto) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }
    await this.verifyReportTerritoryAccess(org, reportId)

    const content = this.sanitizePlainText(dto.content, 'Nota interna')
    const note = await this.prisma.orgReportNote.create({
      data: {
        orgType: org.orgType,
        orgId: org.orgId,
        reportId,
        content,
        createdById: user.id,
      },
    })

    await recordOrgAudit(this.prisma, {
      action: 'CREATED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'ORG_REPORT_NOTE',
      itemId: note.id,
      actorId: user.id,
      summary: `Nota em ${reportId}`,
    })

    return note
  }

  async deleteNote(user: ActingUser, reportId: string, noteId: string) {
    const org = await this.resolveTemplateOrg(user, OrgPermission.RESPOND_REPORTS)
    if (!hasFeature(org.orgPlanType, org.plan, 'reply_templates')) {
      throw planRequiredException(org.orgPlanType, 'reply_templates')
    }

    const existing = await this.prisma.orgReportNote.findFirst({
      where: { id: noteId, reportId, orgType: org.orgType, orgId: org.orgId },
    })
    if (!existing) throw new NotFoundException('Nota interna não encontrada')

    await this.prisma.orgReportNote.delete({ where: { id: existing.id } })
    await recordOrgAudit(this.prisma, {
      action: 'DELETED',
      orgType: org.orgType,
      orgId: org.orgId,
      itemType: 'ORG_REPORT_NOTE',
      itemId: existing.id,
      actorId: user.id,
      summary: `Nota removida de ${reportId}`,
    })
    return { deleted: true }
  }
}
