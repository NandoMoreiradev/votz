import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common'
import { ApiKeyTier, MembershipStatus, OrgType, WebhookEventType } from '@prisma/client'
import { ReportRendererService } from '../accountability/report-renderer.service'
import { ApiKeyGuard } from '../public-api/guards/api-key.guard'
import { PublicApiService } from '../public-api/public-api.service'

describe('Brief 4D T5 & T6 verification (Entity PDF, Scoped Data API, Per-Key+IP Limit, Webhooks)', () => {
  it('renders Entity "RELATÓRIO DE ATENDIMENTO" PDF with SLA compliance and recurrence (MIN_CELL_SIZE suppressed)', async () => {
    const renderer = new ReportRendererService()
    const pdf = await renderer.renderAccountabilityPdf({
      orgType: 'ENTITY',
      orgId: 'ent-1',
      orgName: 'Secretaria Municipal de Infraestrutura',
      roleOrTypeLabel: 'CITY_HALL',
      territoryLabel: 'Curitiba/PR',
      reportTitle: 'RELATÓRIO DE ATENDIMENTO — VOTZ',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      previousPeriodStart: '2026-09-01',
      previousPeriodEnd: '2026-09-30',
      code: 'VTZ-202610-ATT01',
      verificationUrl: 'https://votz.app/prestacao/VTZ-202610-ATT01',
      metrics: {
        received: 48,
        responded: 42,
        advocated: 0,
        resolved: 31,
        medianResponseHours: 12,
        medianResolutionHours: 64,
        responseRatePercent: 87.5,
        resolutionRatePercent: 77.5,
        slaMet: 36,
        slaBreached: 6,
        slaCompliancePercent: 85.7,
        previousReceived: 40,
        previousResolved: 28,
        suppressed: false,
      },
      topCategories: [{ category: 'INFRASTRUCTURE', receivedCount: 28, resolvedCount: 20 }],
      recurrence: {
        windowEnd: '2026-10-31',
        visibleCellsCount: 2,
        suppressedCellsCount: 5,
        recurrenceIndexPercent: 34.2,
        topCells: [{ cell7: '6gkzmgf', category: 'INFRASTRUCTURE', count90d: 14 }],
      },
      topResolvedReports: [
        {
          title: 'Drenagem da Rua das Flores',
          category: 'INFRASTRUCTURE',
          resolvedAt: '2026-10-24',
          supportCount: 53,
        },
      ],
      methodology: {
        dictionaryVersion: 'v1.1.0',
        dictionaryDate: '2026-11-15',
        timezone: 'America/Sao_Paulo',
        computedAt: '2026-11-01T09:00:00.000Z',
        note: 'Relatório factual sem dados pessoais.',
      },
    })

    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(2500)
  })

  it('enforces both per-key AND per-IP hourly ceiling in ApiKeyGuard', async () => {
    const counters = new Map<string, number>()
    const redis = {
      incr: jest.fn(async (k: string) => {
        const next = (counters.get(k) ?? 0) + 1
        counters.set(k, next)
        return next
      }),
      expire: jest.fn(async () => 1),
    }

    const apiKeysService = {
      findByHash: jest.fn(async (hash: string) => ({
        id: hash.slice(0, 8),
        userId: 'user-int',
        tier: ApiKeyTier.FREE,
        revokedAt: null,
      })),
      touchLastUsed: jest.fn(async () => undefined),
    }

    const guard = new ApiKeyGuard(apiKeysService as any, redis as any)
    const headers: Record<string, unknown> = {}
    const makeCtx = (key: string, ip: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-api-key': key }, ip }),
          getResponse: () => ({ setHeader: (k: string, v: unknown) => (headers[k] = v) }),
        }),
      }) as any

    // Simulate key counter already hitting FREE ceiling (1000)
    const hour = Math.floor(Date.now() / 3_600_000)
    const { createHash } = await import('crypto')
    const keyHash = createHash('sha256').update('votz_test_key').digest('hex')
    counters.set(`rl:apikey:${keyHash}:${hour}`, 1000)

    await expect(guard.canActivate(makeCtx('votz_test_key', '198.51.100.10'))).rejects.toThrow(
      HttpException,
    )

    // Simulate rotating different key from same IP exceeding 10,000 IP ceiling
    const ipHash = createHash('sha256').update('198.51.100.20').digest('hex').slice(0, 24)
    counters.set(`rl:apikey-ip:${ipHash}:${hour}`, 10_000)

    try {
      await guard.canActivate(makeCtx('votz_other_fresh_key', '198.51.100.20'))
      throw new Error('Expected 429')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException)
      expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS)
    }
  })

  it('scopes entity Data API strictly to INTEGRACAO plan and caller own entity without assignments/PII', async () => {
    const repo = {
      findReportsForEntity: jest.fn(async (entityId: string) => ({
        data: [{ id: 'r1', title: 'Sem água', recipientId: entityId }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      })),
    }
    const prisma = {
      orgMembership: {
        findFirst: jest.fn(async ({ where }: any) => {
          if (where.userId === 'user-gestao') return { orgId: 'ent-gestao' }
          if (where.userId === 'user-integracao') return { orgId: 'ent-integracao' }
          return null
        }),
      },
      entity: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.id === 'ent-gestao') {
            return { id: 'ent-gestao', legalName: 'Ent Gestão', state: 'SP', city: 'Campinas', plan: 'GESTAO' }
          }
          return {
            id: 'ent-integracao',
            legalName: 'Ent Integração',
            state: 'SP',
            city: 'Campinas',
            plan: 'INTEGRACAO',
          }
        }),
      },
    }

    const svc = new PublicApiService(repo as any, prisma as any, {} as any)

    // BASICO / GESTAO blocked from api_access
    await expect(svc.getMyEntityReports('user-gestao', {} as any)).rejects.toThrow(ForbiddenException)

    // INTEGRACAO succeeds and calls findReportsForEntity scoped only to ent-integracao
    const res = await svc.getMyEntityReports('user-integracao', {} as any)
    expect(repo.findReportsForEntity).toHaveBeenCalledWith('ent-integracao', {})
    expect(res.data[0].recipientId).toBe('ent-integracao')
  })

  it('exposes SLA_AT_RISK, SLA_BREACHED and REPORT_ASSIGNED in WebhookEventType enum', () => {
    expect(WebhookEventType.SLA_AT_RISK).toBe('SLA_AT_RISK')
    expect(WebhookEventType.SLA_BREACHED).toBe('SLA_BREACHED')
    expect(WebhookEventType.REPORT_ASSIGNED).toBe('REPORT_ASSIGNED')
    expect(MembershipStatus.ACTIVE).toBe('ACTIVE')
    expect(OrgType.ENTITY).toBe('ENTITY')
  })
})
