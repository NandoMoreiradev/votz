import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Category as PrismaCategory, type PressRadarRule } from '@prisma/client'
import {
  PRESS_PLAN_LIMITS,
  getCategoryLabel,
  type PressPlan,
  type PressRadarRuleView,
} from '@votz/shared-types'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CreatePressRadarRuleDto, UpdatePressRadarRuleDto } from './dto/press-radar.dto'
import { PressAccessService } from './press-access.service'
import { PressRadarRepository, type NewHit } from './press-radar.repository'
import {
  effectiveFrequency,
  isDigestDue,
  reportDedupKey,
  reportWhereForRule,
  surtoDedupKey,
  surtoMatchesRule,
} from './press-radar.rules'

/** Quantos relatos entram por regra em cada rodada (os de maior pressão primeiro). */
const MAX_HITS_PER_RULE_PER_SWEEP = 100
/** Itens mostrados no e-mail; o resto vira "E mais N". */
const MAX_ITEMS_IN_EMAIL = 15

export interface SurtoEvent {
  id: string
  category: string
  city: string
  state: string
  count: number
}

type RuleWithOwner = PressRadarRule & { user: { id: string; email: string; name: string } }

@Injectable()
export class PressRadarService {
  private readonly logger = new Logger(PressRadarService.name)

  constructor(
    private readonly repo: PressRadarRepository,
    private readonly access: PressAccessService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Regras do jornalista ────────────────────────────────────────────────────

  async listRules(userId: string): Promise<PressRadarRuleView[]> {
    await this.access.require(userId)
    return (await this.repo.listRules(userId)).map(toView)
  }

  async createRule(userId: string, dto: CreatePressRadarRuleDto): Promise<PressRadarRuleView> {
    const { limits } = await this.access.require(userId)

    if ((await this.repo.countRules(userId)) >= limits.maxRadarRules) {
      throw new ForbiddenException(
        `Você já usa os ${limits.maxRadarRules} avisos do seu plano. Apague um ou conheça o plano Imprensa Pro.`,
      )
    }
    const frequency = dto.frequency ?? 'DAILY'
    if (!(limits.radarFrequencies as readonly string[]).includes(frequency)) {
      throw new ForbiddenException('O aviso na hora é do plano Imprensa Pro. Escolha o resumo por dia.')
    }
    if (dto.kind === 'PRESSURE' && dto.minPressure === undefined) {
      throw new BadRequestException('Informe a pressão mínima para este aviso.')
    }
    if (dto.kind === 'UNANSWERED' && dto.stalledDays === undefined) {
      throw new BadRequestException('Informe há quantos dias o relato está sem resposta.')
    }

    const rule = await this.repo.createRule({
      userId,
      name: dto.name,
      kind: dto.kind,
      states: [...new Set(dto.states ?? [])],
      cities: [...new Set(dto.cities ?? [])],
      categories: [...new Set(dto.categories ?? [])] as PrismaCategory[],
      minPressure: dto.kind === 'SURGE' ? null : (dto.minPressure ?? null),
      stalledDays: dto.kind === 'UNANSWERED' ? (dto.stalledDays ?? null) : null,
      frequency,
    })

    // Só avisamos do que for novo a partir de agora: o que já existe entra como "visto".
    await this.baseline(rule)
    return toView(rule)
  }

  async updateRule(userId: string, id: string, dto: UpdatePressRadarRuleDto): Promise<PressRadarRuleView> {
    const { limits } = await this.access.require(userId)
    const rule = await this.repo.findRule(id, userId)
    if (!rule) throw new NotFoundException('Aviso não encontrado.')
    if (dto.frequency && !(limits.radarFrequencies as readonly string[]).includes(dto.frequency)) {
      throw new ForbiddenException('O aviso na hora é do plano Imprensa Pro. Escolha o resumo por dia.')
    }
    const updated = await this.repo.updateRule(id, {
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.frequency !== undefined ? { frequency: dto.frequency } : {}),
    })
    // Religar depois de um tempo parado: o que aconteceu enquanto estava pausado não vira enxurrada de e-mail.
    if (dto.active === true && !rule.active) await this.baseline(updated)
    return toView(updated)
  }

  async deleteRule(userId: string, id: string): Promise<{ deleted: true }> {
    await this.access.require(userId)
    if (!(await this.repo.findRule(id, userId))) throw new NotFoundException('Aviso não encontrado.')
    await this.repo.deleteRule(id)
    return { deleted: true }
  }

  // ── Disparos ────────────────────────────────────────────────────────────────

  /** Chamado quando um surto é ativado: cria achados nas regras SURGE que combinam e, se for "na hora", já avisa. */
  async onSurtoActivated(surto: SurtoEvent, now = new Date()): Promise<number> {
    const rules = await this.repo.activeRules('SURGE')
    const matching = rules.filter((r) => surtoMatchesRule(r, surto))
    if (matching.length === 0) return 0
    const plans = await this.repo.plansByUser([...new Set(matching.map((r) => r.userId))])
    let delivered = 0
    for (const rule of this.withinPlanLimits(rules, plans).filter((r) => matching.includes(r))) {
      await this.repo.createHits(rule.id, [{ dedupKey: surtoDedupKey(surto.id, now), surtoId: surto.id }])
      const plan = plans.get(rule.userId) ?? 'GRATUITA'
      if (effectiveFrequency(rule.frequency, plan) === 'IMMEDIATE') delivered += await this.deliver(rule, plan, now)
    }
    return delivered
  }

  /** Rodada de 15 em 15 minutos: acha relatos novos (pressão e sem resposta) e entrega o que estiver na hora. */
  async runSweep(now = new Date()): Promise<{ rules: number; newHits: number; digests: number }> {
    const rules = await this.repo.activeRules()
    if (rules.length === 0) return { rules: 0, newHits: 0, digests: 0 }
    const plans = await this.repo.plansByUser([...new Set(rules.map((r) => r.userId))])
    const allowed = this.withinPlanLimits(rules, plans)

    let newHits = 0
    let digests = 0
    for (const rule of allowed) {
      try {
        if (rule.kind !== 'SURGE') {
          const found = await this.repo.matchingReportIds(reportWhereForRule(rule, now), MAX_HITS_PER_RULE_PER_SWEEP)
          newHits += await this.repo.createHits(
            rule.id,
            found.map((r): NewHit => ({ dedupKey: reportDedupKey(r.id), reportId: r.id })),
          )
        }
        const plan = plans.get(rule.userId) ?? 'GRATUITA'
        const freq = effectiveFrequency(rule.frequency, plan)
        if (isDigestDue(freq, rule.lastDigestAt, now)) digests += await this.deliver(rule, plan, now)
      } catch (err) {
        // Uma regra com problema não pode parar as outras.
        this.logger.error(`Falha no radar (regra ${rule.id})`, err as Error)
      }
    }
    return { rules: allowed.length, newHits, digests }
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  /** Depois de uma queda de plano, só as primeiras regras (por data de criação) continuam valendo. */
  private withinPlanLimits<T extends RuleWithOwner>(rules: T[], plans: Map<string, PressPlan>): T[] {
    const seen = new Map<string, number>()
    return rules.filter((r) => {
      const plan = plans.get(r.userId) ?? 'GRATUITA'
      const max = PRESS_PLAN_LIMITS[plan].maxRadarRules
      const n = (seen.get(r.userId) ?? 0) + 1
      seen.set(r.userId, n)
      return n <= max
    })
  }

  /** Marca como já visto tudo o que a regra acharia agora, sem mandar nada. */
  private async baseline(rule: PressRadarRule, now = new Date()) {
    if (rule.kind === 'SURGE') return
    const found = await this.repo.matchingReportIds(reportWhereForRule(rule, now), 500)
    await this.repo.createHits(
      rule.id,
      found.map((r): NewHit => ({ dedupKey: reportDedupKey(r.id), reportId: r.id })),
      now,
    )
  }

  /** Envia os achados pendentes da regra (e-mail e sino) e marca todos como enviados. Devolve 1 se mandou. */
  private async deliver(rule: RuleWithOwner, _plan: PressPlan, now: Date): Promise<number> {
    const pending = await this.repo.pendingHits(rule.id)
    if (pending.length === 0) return 0

    const reportIds = pending.map((h) => h.reportId).filter((id): id is string => !!id)
    const surtoIds = pending.map((h) => h.surtoId).filter((id): id is string => !!id)
    const [reports, surtos] = await Promise.all([
      reportIds.length ? this.repo.reportsByIds(reportIds) : Promise.resolve([]),
      surtoIds.length ? this.repo.surtosByIds(surtoIds) : Promise.resolve([]),
    ])

    // Relato que já foi resolvido ou apagado desde o achado não vale um aviso.
    const items = [
      ...surtos.map((s) => ({
        title: `Surto: ${getCategoryLabel(s.category)} em ${s.city}/${s.state}`,
        detail: `${s.count} relatos nas últimas 24 horas`,
        path: `/surtos/${s.id}`,
      })),
      ...reports
        .filter((r) => r.status !== 'RESOLVED')
        .sort((a, b) => b.pressureScore - a.pressureScore)
        .map((r) => ({
          title: r.title,
          detail: `${getCategoryLabel(r.category)} · ${[r.city, r.state].filter(Boolean).join('/') || 'local não informado'} · pressão ${Math.round(r.pressureScore)}`,
          path: `/relatos/${r.id}`,
        })),
    ]

    await this.repo.markHitsSent(rule.id, pending.map((h) => h.id), now)
    if (items.length === 0) return 0

    const shown = items.slice(0, MAX_ITEMS_IN_EMAIL)
    this.mail
      .sendPressRadarDigest(rule.user.email, rule.user.name, { ruleName: rule.name, items: shown, more: items.length - shown.length })
      .catch((err) => this.logger.error(`Falha ao enviar o radar da regra ${rule.id}`, err))
    this.notifications
      .notify({ userId: rule.userId, type: 'PRESS_RADAR_HIT', metadata: { ruleName: rule.name, count: items.length } })
      .catch((err) => this.logger.error(`Falha ao notificar o radar da regra ${rule.id}`, err))
    return 1
  }
}

function toView(r: PressRadarRule): PressRadarRuleView {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    states: r.states,
    cities: r.cities,
    categories: r.categories,
    minPressure: r.minPressure,
    stalledDays: r.stalledDays,
    frequency: r.frequency,
    active: r.active,
    lastDigestAt: r.lastDigestAt ? r.lastDigestAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }
}
