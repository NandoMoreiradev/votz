import { Category, ReportStatus } from './enums'

export type SlaStateValue = 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MET_LATE'

/**
 * TODO(v2): considerar horário comercial, feriados nacionais/municipais
 * e status de pausa ("aguardando cidadão"). Na v1 o SLA corre em horas corridas.
 */
export const SLA_AT_RISK_THRESHOLD_RATIO = 0.75
export const DEFAULT_SLA_ESCALATION_HOURS = 24
export const SLA_PAUSABLE_STATUSES: readonly ReportStatus[] = []

export const DEFAULT_SLA_HOURS_BY_CATEGORY: Record<Category, number> = {
  [Category.SAFETY]: 24,
  [Category.HEALTH]: 48,
  [Category.CORRUPTION]: 48,
  [Category.SANITATION]: 72,
  [Category.MOBILITY]: 72,
  [Category.INFRASTRUCTURE]: 72,
  [Category.URBAN_SERVICES]: 72,
  [Category.ENVIRONMENT]: 72,
  [Category.ACCESSIBILITY]: 72,
  [Category.SOCIAL_WELFARE]: 72,
  [Category.EDUCATION]: 96,
  [Category.HOUSING]: 96,
  [Category.OTHER]: 120,
}

export interface SlaReportInput {
  category: Category
  status: ReportStatus | string
  createdAt: Date
  firstResponseAt?: Date | null
  resolvedAt?: Date | null
  slaStartedAt?: Date | null
  slaState?: SlaStateValue | null
  slaPausedMs?: number
}

export interface SlaPolicyInput {
  slaHours?: Partial<Record<Category | string, number>> | null
  resolutionSlaHours?: Partial<Record<Category | string, number>> | null
  escalationHours?: number | null
  pausedStatuses?: readonly (ReportStatus | string)[]
}

export interface SlaDeadlineResult {
  targetHours: number
  startedAt: Date
  dueAt: Date
  metAt: Date | null
  state: SlaStateValue | null
  elapsedHours: number
  remainingHours: number
  progressRatio: number
}

export interface ComputedSlaResult {
  slaStartedAt: Date
  slaDueAt: Date
  slaState: SlaStateValue | null
  slaMetAt: Date | null
  responseTargetHours: number
  elapsedHours: number
  remainingHours: number
  progressRatio: number
  dueDaySp: string
  nowDaySp: string
  isDueToday: boolean
  isPaused: boolean
  hoursOverdue: number
  shouldEscalate: boolean
  resolution: SlaDeadlineResult | null
}

const SP_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function toSaoPauloDateKey(date: Date): string {
  return SP_DATE_FORMATTER.format(date)
}

export function hasConfiguredOwnSla(slaHours: unknown): boolean {
  if (!slaHours || typeof slaHours !== 'object' || Array.isArray(slaHours)) {
    return false
  }
  return Object.values(slaHours as Record<string, unknown>).some(
    (v) => typeof v === 'number' && Number.isFinite(v) && v > 0,
  )
}

export interface PublicSlaDisplayState {
  showPercentage: boolean
  label: string
  emptyMessage: string | null
  showConfigureInvite: boolean
}

export function resolvePublicSlaDisplayState(params: {
  hasOwnSla: boolean
  suppressed: boolean
  canConfigureSla?: boolean
}): PublicSlaDisplayState {
  if (params.hasOwnSla) {
    return {
      showPercentage: !params.suppressed,
      label: 'Cumprimento dos prazos declarados pela entidade',
      emptyMessage: null,
      showConfigureInvite: false,
    }
  }
  return {
    showPercentage: false,
    label: 'Prazos declarados (SLA)',
    emptyMessage: 'Esta entidade ainda não declarou seus prazos de resposta.',
    showConfigureInvite: Boolean(params.canConfigureSla),
  }
}

export function resolveCategorySlaHours(
  category: Category,
  slaHours?: Partial<Record<Category | string, number>> | null,
): number {
  const configured = slaHours?.[category]
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 1) {
    return Math.round(configured)
  }
  return DEFAULT_SLA_HOURS_BY_CATEGORY[category] ?? 120
}

export function resolveOptionalResolutionSlaHours(
  category: Category,
  resolutionSlaHours?: Partial<Record<Category | string, number>> | null,
): number | null {
  const configured = resolutionSlaHours?.[category]
  if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 1) {
    return Math.round(configured)
  }
  return null
}

function evaluateDeadline(params: {
  startedAt: Date
  targetHours: number
  completedAt: Date | null
  archivedWithoutCompletion: boolean
  isPaused: boolean
  previousState: SlaStateValue | null
  pausedMs: number
  now: Date
}): SlaDeadlineResult {
  const totalMs = Math.max(1, params.targetHours) * 3_600_000
  const dueAt = new Date(params.startedAt.getTime() + totalMs + Math.max(0, params.pausedMs))

  if (params.archivedWithoutCompletion) {
    const elapsedHours = Number(
      (Math.max(0, params.now.getTime() - params.startedAt.getTime()) / 3_600_000).toFixed(2),
    )
    return {
      targetHours: params.targetHours,
      startedAt: params.startedAt,
      dueAt,
      metAt: null,
      state: null,
      elapsedHours,
      remainingHours: Number(((dueAt.getTime() - params.now.getTime()) / 3_600_000).toFixed(2)),
      progressRatio: Number((Math.max(0, params.now.getTime() - params.startedAt.getTime()) / totalMs).toFixed(4)),
    }
  }

  if (params.completedAt) {
    const metOnTime = params.completedAt.getTime() <= dueAt.getTime()
    const elapsedMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime() - Math.max(0, params.pausedMs))
    return {
      targetHours: params.targetHours,
      startedAt: params.startedAt,
      dueAt,
      metAt: params.completedAt,
      state: metOnTime ? 'MET' : 'MET_LATE',
      elapsedHours: Number((elapsedMs / 3_600_000).toFixed(2)),
      remainingHours: Number(((dueAt.getTime() - params.completedAt.getTime()) / 3_600_000).toFixed(2)),
      progressRatio: Number((elapsedMs / totalMs).toFixed(4)),
    }
  }

  const elapsedMs = Math.max(0, params.now.getTime() - params.startedAt.getTime() - Math.max(0, params.pausedMs))
  const progressRatio = elapsedMs / totalMs
  const remainingHours = Number(((dueAt.getTime() - params.now.getTime()) / 3_600_000).toFixed(2))
  const elapsedHours = Number((elapsedMs / 3_600_000).toFixed(2))

  let state: SlaStateValue
  if (params.isPaused) {
    state = params.previousState ?? 'ON_TIME'
  } else if (params.now.getTime() >= dueAt.getTime()) {
    state = 'BREACHED'
  } else if (progressRatio >= SLA_AT_RISK_THRESHOLD_RATIO) {
    state = 'AT_RISK'
  } else {
    state = 'ON_TIME'
  }

  return {
    targetHours: params.targetHours,
    startedAt: params.startedAt,
    dueAt,
    metAt: null,
    state,
    elapsedHours,
    remainingHours,
    progressRatio: Number(progressRatio.toFixed(4)),
  }
}

/**
 * Calcula estado de SLA de primeira resposta (e opcionalmente resolução) de forma pura e determinística
 * no fuso America/Sao_Paulo, exigindo injeção explícita de `now`.
 */
export function computeSla(
  report: SlaReportInput,
  policy: SlaPolicyInput,
  now: Date,
): ComputedSlaResult {
  const startedAt = report.slaStartedAt ?? report.createdAt
  const responseTargetHours = resolveCategorySlaHours(report.category, policy?.slaHours)
  const pausedStatuses = policy?.pausedStatuses ?? SLA_PAUSABLE_STATUSES
  const isPaused = pausedStatuses.includes(report.status)
  const pausedMs = Math.max(0, report.slaPausedMs ?? 0)

  const effectiveFirstResponseAt =
    report.firstResponseAt ??
    (report.status === ReportStatus.RESOLVED ? (report.resolvedAt ?? null) : null)

  const isArchivedWithoutCompletion =
    report.status === ReportStatus.ARCHIVED && effectiveFirstResponseAt === null

  const responseResult = evaluateDeadline({
    startedAt,
    targetHours: responseTargetHours,
    completedAt: effectiveFirstResponseAt,
    archivedWithoutCompletion: isArchivedWithoutCompletion,
    isPaused,
    previousState: report.slaState ?? null,
    pausedMs,
    now,
  })

  const resolutionHours = resolveOptionalResolutionSlaHours(
    report.category,
    policy?.resolutionSlaHours,
  )

  let resolution: SlaDeadlineResult | null = null
  if (resolutionHours !== null) {
    const effectiveResolvedAt =
      report.status === ReportStatus.RESOLVED ? (report.resolvedAt ?? null) : null
    const archivedNoResolution =
      report.status === ReportStatus.ARCHIVED && effectiveResolvedAt === null

    resolution = evaluateDeadline({
      startedAt,
      targetHours: resolutionHours,
      completedAt: effectiveResolvedAt,
      archivedWithoutCompletion: archivedNoResolution,
      isPaused,
      previousState: null,
      pausedMs,
      now,
    })
  }

  const dueDaySp = toSaoPauloDateKey(responseResult.dueAt)
  const nowDaySp = toSaoPauloDateKey(now)
  const hoursOverdue =
    responseResult.state === 'BREACHED'
      ? Number(
          Math.max(0, (now.getTime() - responseResult.dueAt.getTime()) / 3_600_000).toFixed(2),
        )
      : 0
  const escalationThreshold =
    typeof policy?.escalationHours === 'number' && policy.escalationHours >= 1
      ? policy.escalationHours
      : DEFAULT_SLA_ESCALATION_HOURS

  return {
    slaStartedAt: startedAt,
    slaDueAt: responseResult.dueAt,
    slaState: responseResult.state,
    slaMetAt: responseResult.metAt,
    responseTargetHours,
    elapsedHours: responseResult.elapsedHours,
    remainingHours: responseResult.remainingHours,
    progressRatio: responseResult.progressRatio,
    dueDaySp,
    nowDaySp,
    isDueToday:
      dueDaySp === nowDaySp &&
      (responseResult.state === 'ON_TIME' || responseResult.state === 'AT_RISK'),
    isPaused,
    hoursOverdue,
    shouldEscalate:
      responseResult.state === 'BREACHED' && hoursOverdue >= escalationThreshold,
    resolution,
  }
}
