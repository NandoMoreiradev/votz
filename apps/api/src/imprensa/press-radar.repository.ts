import { Injectable } from '@nestjs/common'
import { Category, Prisma, PressCredentialStatus, PressRadarFrequency, PressRadarKind } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export interface NewRadarRule {
  userId: string
  name: string
  kind: PressRadarKind
  states: string[]
  cities: string[]
  categories: Category[]
  minPressure: number | null
  stalledDays: number | null
  frequency: PressRadarFrequency
}

export interface NewHit {
  dedupKey: string
  reportId?: string
  surtoId?: string
}

const RULE_OWNER = { id: true, email: true, name: true, type: true, verified: true, banned: true } as const

@Injectable()
export class PressRadarRepository {
  constructor(private readonly prisma: PrismaService) {}

  listRules(userId: string) {
    return this.prisma.pressRadarRule.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  }

  countRules(userId: string) {
    return this.prisma.pressRadarRule.count({ where: { userId } })
  }

  createRule(data: NewRadarRule) {
    return this.prisma.pressRadarRule.create({ data })
  }

  findRule(id: string, userId: string) {
    return this.prisma.pressRadarRule.findFirst({ where: { id, userId } })
  }

  updateRule(id: string, data: Prisma.PressRadarRuleUpdateInput) {
    return this.prisma.pressRadarRule.update({ where: { id }, data })
  }

  deleteRule(id: string) {
    return this.prisma.pressRadarRule.delete({ where: { id } })
  }

  /** Regras ativas com o dono, na ordem em que foram criadas (a ordem decide quais passam do limite do plano). */
  activeRules(kind?: PressRadarKind) {
    return this.prisma.pressRadarRule.findMany({
      where: { active: true, ...(kind ? { kind } : {}), user: { type: 'PRESS', verified: true, banned: false } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: RULE_OWNER } },
    })
  }

  /** Plano de cada dono (credencial aprovada). Quem não tem credencial aprovada fica fora do mapa = gratuito. */
  async plansByUser(userIds: string[]): Promise<Map<string, 'GRATUITA' | 'PRO'>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.prisma.pressCredential.findMany({
      where: { userId: { in: userIds }, status: PressCredentialStatus.APPROVED },
      orderBy: { reviewedAt: 'asc' },
      select: { userId: true, plan: true },
    })
    return new Map(rows.map((r) => [r.userId, r.plan]))
  }

  matchingReportIds(where: Prisma.ReportWhereInput, take: number) {
    return this.prisma.report.findMany({
      where,
      orderBy: { pressureScore: 'desc' },
      take,
      select: { id: true },
    })
  }

  /** Grava os achados novos (repetidos são ignorados pela chave única). `sentAt` marca achado já "visto" (linha de base). */
  async createHits(ruleId: string, hits: NewHit[], sentAt: Date | null = null): Promise<number> {
    if (hits.length === 0) return 0
    const res = await this.prisma.pressRadarHit.createMany({
      data: hits.map((h) => ({ ruleId, dedupKey: h.dedupKey, reportId: h.reportId ?? null, surtoId: h.surtoId ?? null, sentAt })),
      skipDuplicates: true,
    })
    return res.count
  }

  pendingHits(ruleId: string) {
    return this.prisma.pressRadarHit.findMany({ where: { ruleId, sentAt: null }, orderBy: { createdAt: 'asc' } })
  }

  async markHitsSent(ruleId: string, hitIds: string[], now: Date) {
    await this.prisma.$transaction([
      this.prisma.pressRadarHit.updateMany({ where: { id: { in: hitIds } }, data: { sentAt: now } }),
      this.prisma.pressRadarRule.update({ where: { id: ruleId }, data: { lastDigestAt: now } }),
    ])
  }

  reportsByIds(ids: string[]) {
    return this.prisma.report.findMany({
      where: { id: { in: ids }, anonymous: false, status: { notIn: ['ARCHIVED'] } },
      select: { id: true, title: true, city: true, state: true, category: true, pressureScore: true, status: true },
    })
  }

  surtosByIds(ids: string[]) {
    return this.prisma.surto.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: true, city: true, state: true, count: true },
    })
  }
}
