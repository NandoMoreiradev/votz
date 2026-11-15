jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: {
    sanitize: (v: string) =>
      v.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ''),
  },
}))

import { ForbiddenException } from '@nestjs/common'
import {
  AlertChannel,
  AlertFrequency,
  AlertRuleType,
  Category,
  OrgType,
  Prisma,
  ReportStatus,
} from '@prisma/client'
import { AlertRulesService } from './alert-rules.service'

describe('AlertRulesService (Plan limits, territorial scope & dedup)', () => {
  const user = {
    id: 'user-1',
    type: 'POLITICIAN' as const,
    ctx: {
      type: 'POLITICIAN' as const,
      id: 'pol-1',
      permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'],
    },
  } as any

  function makeService(overrides: {
    plan?: 'BASICO' | 'MANDATO' | 'MANDATO_PRO'
    existingRulesCount?: number
    report?: Record<string, unknown> | null
    rules?: Array<Record<string, unknown>>
    existingTriggerKeys?: Set<string>
  }) {
    const triggers = overrides.existingTriggerKeys ?? new Set<string>()
    const createdRules: Array<Record<string, unknown>> = []

    const prisma = {
      orgMembership: {
        findUnique: jest.fn(async () => ({
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
        findFirst: jest.fn(async () => ({
          id: 'mem-1',
          orgType: OrgType.POLITICIAN,
          orgId: 'pol-1',
          status: 'ACTIVE',
          role: { permissions: ['VIEW_ANALYTICS', 'RESPOND_REPORTS', 'MANAGE_PROFILE'] },
        })),
        findMany: jest.fn(async () => [
          {
            userId: 'user-1',
            user: { email: 'gabinete@votz.app', name: 'Gabinete', emailVerified: true },
            role: { permissions: ['VIEW_ANALYTICS'] },
          },
        ]),
      },
      politician: {
        findUnique: jest.fn(async () => ({
          id: 'pol-1',
          name: 'Vereador Teste',
          office: 'Vereador',
          state: 'SP',
          city: 'São Paulo',
          plan: overrides.plan ?? 'MANDATO',
        })),
      },
      alertRule: {
        count: jest.fn(async () => overrides.existingRulesCount ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: 'rule-new', ...data }
          createdRules.push(row)
          return row
        }),
        findMany: jest.fn(async () => overrides.rules ?? []),
      },
      report: {
        findUnique: jest.fn(async () => overrides.report ?? null),
        findMany: jest.fn(async () => []),
      },
      alertTriggerLog: {
        create: jest.fn(async ({ data }: { data: { dedupKey: string } }) => {
          if (triggers.has(data.dedupKey)) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002',
              clientVersion: '5.22.0',
            })
          }
          triggers.add(data.dedupKey)
          return { id: `trig-${triggers.size}`, ...data }
        }),
      },
      moderationAction: {
        create: jest.fn(async () => ({})),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as any

    const notifications = { notify: jest.fn(async () => ({})) } as any
    const mail = { sendOrgAlertNotification: jest.fn(async () => undefined) } as any
    const queue = { add: jest.fn(async () => ({})) } as any

    const service = new AlertRulesService(prisma, notifications, mail, queue)
    return { service, prisma, notifications, mail, queue, triggers, createdRules }
  }

  it('enforces plan limits: blocks BASICO (0 rules) and allows up to 5 on MANDATO', async () => {
    const { service: basicoSvc } = makeService({ plan: 'BASICO', existingRulesCount: 0 })
    await expect(
      basicoSvc.createRule(user, {
        name: 'Saúde crítica',
        ruleType: AlertRuleType.NEW_REPORT,
        categories: [Category.HEALTH],
        wholeArea: true,
        channels: [AlertChannel.IN_APP],
        frequency: AlertFrequency.IMMEDIATE,
      }),
    ).rejects.toThrow(ForbiddenException)

    const { service: mandatoAtCap } = makeService({ plan: 'MANDATO', existingRulesCount: 5 })
    await expect(
      mandatoAtCap.createRule(user, {
        name: 'Regra 6',
        ruleType: AlertRuleType.NEW_REPORT,
        wholeArea: true,
        channels: [AlertChannel.IN_APP],
        frequency: AlertFrequency.IMMEDIATE,
      }),
    ).rejects.toThrow(ForbiddenException)

    const { service: mandatoOk, createdRules } = makeService({
      plan: 'MANDATO',
      existingRulesCount: 4,
    })
    const created = await mandatoOk.createRule(user, {
      name: '<b>Buracos na via</b>',
      ruleType: AlertRuleType.PRESSURE_THRESHOLD,
      minPressure: 50,
      wholeArea: true,
      channels: [AlertChannel.IN_APP],
      frequency: AlertFrequency.IMMEDIATE,
    })
    expect(createdRules).toHaveLength(1)
    expect(created.name).toBe('Buracos na via')
  })

  it('ignores out-of-territory reports and deduplicates repeated rule triggers', async () => {
    const rule = {
      id: 'rule-1',
      orgType: OrgType.POLITICIAN,
      orgId: 'pol-1',
      name: 'Mobilidade Urgente',
      ruleType: AlertRuleType.PRESSURE_THRESHOLD,
      categories: [Category.MOBILITY],
      cell7s: [],
      wholeArea: true,
      minPressure: 40,
      stalledDays: null,
      channels: [AlertChannel.IN_APP, AlertChannel.EMAIL],
      frequency: AlertFrequency.IMMEDIATE,
      active: true,
    }

    // Relato em Campinas/SP não deve disparar regra de Vereador de São Paulo/SP
    const { service: outOfArea, notifications: outNotif } = makeService({
      rules: [rule],
      report: {
        id: 'rep-campinas',
        title: 'Semáforo quebrado',
        category: Category.MOBILITY,
        status: ReportStatus.OPEN,
        state: 'SP',
        cityKey: 'campinas',
        cell7: 'h7_camp',
        pressureScore: 95,
      },
    })
    expect(await outOfArea.evaluateRulesForReport('rep-campinas')).toBe(0)
    expect(outNotif.notify).not.toHaveBeenCalled()

    // Relato dentro de São Paulo/SP dispara 1x e deduplica na segunda execução
    const { service: inArea, notifications, mail } = makeService({
      rules: [rule],
      report: {
        id: 'rep-sp',
        title: 'Via alagada',
        category: Category.MOBILITY,
        status: ReportStatus.OPEN,
        state: 'SP',
        cityKey: 'sao paulo',
        cell7: 'h7_sp',
        pressureScore: 72,
      },
    })
    expect(await inArea.evaluateRulesForReport('rep-sp')).toBe(1)
    expect(await inArea.evaluateRulesForReport('rep-sp')).toBe(0)
    expect(notifications.notify).toHaveBeenCalledTimes(1)
    expect(mail.sendOrgAlertNotification).toHaveBeenCalledTimes(1)
  })
})
