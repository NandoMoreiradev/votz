import { NotificationType } from '@prisma/client'
import { MandatometerService, MandatometerSnapshot } from './mandatometer.service'
import { AdvocacyDeadlineService } from './advocacy-deadline.service'

const DAY = 86_400_000

function prismaFor(opts: {
  byStatus: Array<{ status: string; _count: number }>
  responded?: number
  confirmed?: number
  everDisputed?: number
  closedEver?: number
  upheld?: number
  advocacies?: Array<{ closedAt: Date | null; closedReason: string | null; promisedFor: Date | null; report: { status: string } }>
  politicianStatus?: string
}) {
  const counts = [opts.responded ?? 0, opts.confirmed ?? 0, opts.everDisputed ?? 0, opts.closedEver ?? 0]
  let i = 0
  return {
    report: {
      groupBy: jest.fn(async ({ by }: { by: string[] }) => (by[0] === 'status' ? opts.byStatus : [{ category: 'HEALTH', _count: 2 }])),
      count: jest.fn(async () => counts[i++ % counts.length]),
    },
    timelineEvent: { count: jest.fn(async () => opts.upheld ?? 0) },
    reportAdvocacy: { findMany: jest.fn(async () => opts.advocacies ?? []) },
    politician: {
      findUnique: jest.fn(async () => ({ status: opts.politicianStatus ?? 'ATIVO' })),
      update: jest.fn(async () => ({})),
    },
  } as any
}

describe('MandatometerService', () => {
  const now = new Date('2026-11-27T12:00:00Z')

  it('separa o que o político recebeu do que ele assumiu (avocou)', async () => {
    const prisma = prismaFor({
      byStatus: [
        { status: 'OPEN', _count: 2 },
        { status: 'UNDER_REVIEW', _count: 1 },
        { status: 'IN_PROGRESS', _count: 1 },
        { status: 'RESOLVED', _count: 5 },
        { status: 'DISPUTED', _count: 1 },
      ],
      responded: 8,
      confirmed: 3,
      everDisputed: 2,
      closedEver: 7,
      upheld: 1,
      advocacies: [
        { closedAt: null, closedReason: null, promisedFor: null, report: { status: 'RESOLVED' } },
        { closedAt: null, closedReason: null, promisedFor: new Date(now.getTime() - DAY), report: { status: 'IN_PROGRESS' } },
        { closedAt: null, closedReason: null, promisedFor: new Date(now.getTime() + DAY), report: { status: 'DISPUTED' } },
        { closedAt: now, closedReason: 'WITHDRAWN', promisedFor: null, report: { status: 'OPEN' } },
        { closedAt: now, closedReason: 'MANDATE_ENDED', promisedFor: null, report: { status: 'OPEN' } },
      ],
    })
    const svc = new MandatometerService(prisma)
    const s = await svc.compute('p1', now)

    expect(s).toMatchObject({ total: 10, open: 2, inProgress: 2, resolved: 5, disputed: 1, responded: 8, confirmed: 3, disputesUpheld: 1 })
    expect(s.commitments).toEqual({ total: 5, fulfilled: 1, inProgress: 2, overdue: 1, withdrawn: 1, abandoned: 1 })
    expect(s.advocated).toBe(5)

    const m = svc.metrics(s)
    expect(m.responseRate).toBe(80)
    expect(m.resolutionRate).toBe(50)
    expect(m.contestationRate).toBe(29) // 2 de 7 encerrados
    expect(m.disputesUpheldRate).toBe(50)
    expect(m.confirmedRate).toBe(60)
    expect(m.commitmentRate).toBe(33) // 1 cumprido de 3 decididos
    // Metade das contestações foi procedente: sem selo de confiança mesmo com boa resposta e resolução
    expect(m.trustBadge).toBe(false)
    expect(m.classification).toBe('Político Regular')
  })

  it('sem relatos, nada divide por zero', () => {
    const svc = new MandatometerService({} as any)
    const empty: MandatometerSnapshot = {
      total: 0, open: 0, inProgress: 0, resolved: 0, disputed: 0, archived: 0, responded: 0, confirmed: 0,
      everDisputed: 0, disputesUpheld: 0, closedEver: 0, byStatus: {}, byCategory: [],
      commitments: { total: 0, fulfilled: 0, inProgress: 0, overdue: 0, withdrawn: 0, abandoned: 0 },
      advocated: 0, computedAt: now.toISOString(),
    }
    expect(svc.metrics(empty)).toMatchObject({ responseRate: 0, resolutionRate: 0, commitmentRate: 0, trustBadge: false })
  })

  it('refresh grava o retrato e renova os cards; mandato encerrado fica congelado', async () => {
    const shareCards = { invalidateOnMetricChange: jest.fn(async () => undefined) }
    const prisma = prismaFor({ byStatus: [] })
    await new MandatometerService(prisma, shareCards as any).refresh('p1')
    expect(prisma.politician.update).toHaveBeenCalledTimes(1)
    expect(shareCards.invalidateOnMetricChange).toHaveBeenCalledWith('p1')

    const closed = prismaFor({ byStatus: [], politicianStatus: 'ENCERRADO' })
    await new MandatometerService(closed, shareCards as any).refresh('p1')
    expect(closed.politician.update).not.toHaveBeenCalled()
  })

  it('freeze grava o retrato com a data do congelamento', async () => {
    const prisma = prismaFor({ byStatus: [] })
    await new MandatometerService(prisma).freeze('p1')
    const data = prisma.politician.update.mock.calls[0][0].data.mandatometer
    expect(typeof data.frozenAt).toBe('string')
  })
})

describe('AdvocacyDeadlineService', () => {
  it('avisa equipe e autor uma vez só quando o prazo prometido passa', async () => {
    const notified = new Set<string>()
    const prisma = {
      reportAdvocacy: {
        findMany: jest.fn(async () => [
          { id: 'a1', orgType: 'POLITICIAN', orgId: 'p1', promisedFor: new Date('2026-11-20'), report: { id: 'r1', title: 'Buraco', authorId: 'author-1' } },
          { id: 'a2', orgType: 'ENTITY', orgId: 'e1', promisedFor: new Date('2026-11-20'), report: { id: 'r2', title: 'Poste', authorId: null } },
        ]),
        updateMany: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (notified.has(where.id)) return { count: 0 }
          notified.add(where.id)
          return { count: 1 }
        }),
      },
    } as any
    const notifications = { notifyMany: jest.fn(async () => ({})) }
    const effects = { orgMemberIds: jest.fn(async () => ['staff-1']) }
    const svc = new AdvocacyDeadlineService(prisma, notifications as any, effects as any)

    await svc.sweep(new Date('2026-11-27'))
    expect(notifications.notifyMany).toHaveBeenCalledTimes(2)
    expect(notifications.notifyMany).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['staff-1', 'author-1'], type: NotificationType.ADVOCACY_DEADLINE_PASSED, reportId: 'r1' }),
    )
    // Segunda passada não repete o aviso
    await svc.sweep(new Date('2026-11-27'))
    expect(notifications.notifyMany).toHaveBeenCalledTimes(2)
  })
})
