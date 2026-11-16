import {
  Category,
  ReportStatus,
  SLA_AT_RISK_THRESHOLD_RATIO,
  SLA_PAUSABLE_STATUSES,
  computeSla,
  toSaoPauloDateKey,
} from '@votz/shared-types'

describe('computeSla (pure function with fake timers)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const startedAt = new Date('2026-11-01T12:00:00.000Z') // 09:00 America/Sao_Paulo
  const defaultPolicy = {
    slaHours: { HEALTH: 24 },
    resolutionSlaHours: { HEALTH: 72 },
    escalationHours: 12,
  }

  it('starts ON_TIME and computes 75% AT_RISK threshold and due date', () => {
    jest.setSystemTime(new Date('2026-11-01T18:00:00.000Z')) // +6h (25%)
    const res = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.OPEN,
        createdAt: startedAt,
        slaStartedAt: startedAt,
      },
      defaultPolicy,
      new Date(),
    )

    expect(SLA_AT_RISK_THRESHOLD_RATIO).toBe(0.75)
    expect(res.slaState).toBe('ON_TIME')
    expect(res.responseTargetHours).toBe(24)
    expect(res.slaDueAt.toISOString()).toBe('2026-11-02T12:00:00.000Z')
    expect(res.progressRatio).toBeCloseTo(0.25, 4)
    expect(res.shouldEscalate).toBe(false)
  })

  it('transitions to AT_RISK at exactly 75% of SLA window', () => {
    jest.setSystemTime(new Date('2026-11-02T06:00:00.000Z')) // +18h (75% of 24h)
    const res = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.OPEN,
        createdAt: startedAt,
        slaStartedAt: startedAt,
      },
      defaultPolicy,
      new Date(),
    )

    expect(res.slaState).toBe('AT_RISK')
    expect(res.progressRatio).toBeCloseTo(0.75, 4)
    expect(res.hoursOverdue).toBe(0)
  })

  it('transitions to BREACHED upon expiry and signals escalation after escalationHours', () => {
    jest.setSystemTime(new Date('2026-11-02T12:00:00.000Z')) // exact deadline +24h
    const atDue = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.IN_PROGRESS,
        createdAt: startedAt,
        slaStartedAt: startedAt,
      },
      defaultPolicy,
      new Date(),
    )
    expect(atDue.slaState).toBe('BREACHED')
    expect(atDue.shouldEscalate).toBe(false)

    jest.setSystemTime(new Date('2026-11-03T00:00:00.000Z')) // +12h past due
    const escalated = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.IN_PROGRESS,
        createdAt: startedAt,
        slaStartedAt: startedAt,
      },
      defaultPolicy,
      new Date(),
    )
    expect(escalated.slaState).toBe('BREACHED')
    expect(escalated.hoursOverdue).toBe(12)
    expect(escalated.shouldEscalate).toBe(true)
  })

  it('evaluates MET vs MET_LATE based on firstResponseAt vs slaDueAt', () => {
    const met = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.RESOLVED,
        createdAt: startedAt,
        slaStartedAt: startedAt,
        firstResponseAt: new Date('2026-11-02T11:59:59.000Z'),
        resolvedAt: new Date('2026-11-05T10:00:00.000Z'),
      },
      defaultPolicy,
      new Date('2026-11-06T00:00:00.000Z'),
    )
    expect(met.slaState).toBe('MET')
    expect(met.resolution?.state).toBe('MET_LATE')

    const metLate = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.UNDER_REVIEW,
        createdAt: startedAt,
        slaStartedAt: startedAt,
        firstResponseAt: new Date('2026-11-02T12:05:00.000Z'),
      },
      defaultPolicy,
      new Date('2026-11-03T00:00:00.000Z'),
    )
    expect(metLate.slaState).toBe('MET_LATE')
  })

  it('recomputes deterministically on policy change only when passed new policy', () => {
    jest.setSystemTime(new Date('2026-11-01T22:00:00.000Z')) // +10h
    const tightPolicy = { slaHours: { HEALTH: 12 }, escalationHours: 6 }
    const loosePolicy = { slaHours: { HEALTH: 48 }, escalationHours: 24 }

    const tightRes = computeSla(
      { category: Category.HEALTH, status: ReportStatus.OPEN, createdAt: startedAt, slaStartedAt: startedAt },
      tightPolicy,
      new Date(),
    )
    const looseRes = computeSla(
      { category: Category.HEALTH, status: ReportStatus.OPEN, createdAt: startedAt, slaStartedAt: startedAt },
      loosePolicy,
      new Date(),
    )

    expect(tightRes.slaState).toBe('AT_RISK')
    expect(looseRes.slaState).toBe('ON_TIME')
  })

  it('handles America/Sao_Paulo day and month boundaries accurately', () => {
    // 2026-12-01 02:59:59 UTC is 2026-11-30 23:59:59 America/Sao_Paulo
    expect(toSaoPauloDateKey(new Date('2026-12-01T02:59:59.000Z'))).toBe('2026-11-30')
    // 2026-12-01 03:00:00 UTC is 2026-12-01 00:00:00 America/Sao_Paulo
    expect(toSaoPauloDateKey(new Date('2026-12-01T03:00:00.000Z'))).toBe('2026-12-01')
  })

  it('supports explicit pause document contract (v1 empty pausable statuses; pausedStatuses & slaPausedMs)', () => {
    expect(SLA_PAUSABLE_STATUSES).toEqual([])
    jest.setSystemTime(new Date('2026-11-02T14:00:00.000Z')) // +26h elapsed
    const paused6h = computeSla(
      {
        category: Category.HEALTH,
        status: ReportStatus.OPEN,
        createdAt: startedAt,
        slaStartedAt: startedAt,
        slaPausedMs: 6 * 3_600_000,
      },
      defaultPolicy,
      new Date(),
    )
    // Effective elapsed is 20h of 24h -> AT_RISK (not BREACHED)
    expect(paused6h.slaState).toBe('AT_RISK')
    expect(paused6h.slaDueAt.toISOString()).toBe('2026-11-02T18:00:00.000Z')

    // Simulated pausable status preserves previous state instead of advancing to BREACHED
    const pausedStatus = computeSla(
      {
        category: Category.HEALTH,
        status: 'WAITING_CITIZEN',
        createdAt: startedAt,
        slaStartedAt: startedAt,
        slaState: 'ON_TIME',
      },
      { ...defaultPolicy, pausedStatuses: ['WAITING_CITIZEN'] },
      new Date(),
    )
    expect(pausedStatus.isPaused).toBe(true)
    expect(pausedStatus.slaState).toBe('ON_TIME')
  })
})
