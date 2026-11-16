import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { AccountabilityReportStatus, OrgType } from '@prisma/client'
import { AccountabilityService } from './accountability.service'
import { ReportRendererService } from './report-renderer.service'

describe('ReportRendererService & AccountabilityService', () => {
  it('renders a real PDF buffer containing period figures, verification code and zero citizen PII', async () => {
    const renderer = new ReportRendererService()
    const pdf = await renderer.renderAccountabilityPdf({
      orgType: 'POLITICIAN',
      orgId: 'pol-1',
      orgName: 'Marina Silva Exemplo',
      roleOrTypeLabel: 'Vereadora · PT',
      territoryLabel: 'São Paulo / SP',
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      previousPeriodStart: '2026-09-01',
      previousPeriodEnd: '2026-09-30',
      code: 'VTZ-2026-ABC123',
      verificationUrl: 'https://votz.org.br/prestacao/VTZ-2026-ABC123',
      metrics: {
        received: 120,
        responded: 96,
        advocated: 42,
        resolved: 68,
        medianResponseHours: 14,
        medianResolutionHours: 96,
        responseRatePercent: 80,
        resolutionRatePercent: 72.3,
        previousReceived: 100,
        previousResolved: 50,
        suppressed: false,
      },
      topCategories: [
        { category: 'MOBILITY', receivedCount: 55, resolvedCount: 35 },
        { category: 'HEALTH', receivedCount: 30, resolvedCount: 18 },
      ],
      topResolvedReports: [
        {
          title: 'Recapeamento da Av. Central',
          category: 'MOBILITY',
          resolvedAt: '2026-10-20',
          supportCount: 89,
        },
      ],
      methodology: {
        dictionaryVersion: 'v1.0',
        dictionaryDate: '2026-11-15',
        timezone: 'America/Sao_Paulo',
        computedAt: '2026-11-01T12:00:00.000Z',
        note: 'Relatório factual sem dados pessoais de cidadãos.',
      },
    })

    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(2000)
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  })

  it('enforces monthly quota (MANDATO=4), keeps public verification immutable, and purges PDFs older than 7 days', async () => {
    const expiredDeletedKeys: string[] = []
    const updateCalls: Array<Record<string, unknown>> = []
    const prisma = {
      accountabilityReport: {
        count: jest.fn(async () => 4),
        findUnique: jest.fn(async ({ where }: { where: { code?: string; id?: string } }) => {
          if (where.code === 'VTZ-PUBLIC-1') {
            return {
              code: 'VTZ-PUBLIC-1',
              orgType: OrgType.POLITICIAN,
              orgId: 'pol-1',
              periodStart: '2026-10-01',
              periodEnd: '2026-10-31',
              dictionaryVersion: 'v1.0',
              computedAt: new Date('2026-11-01T10:00:00.000Z'),
              status: AccountabilityReportStatus.READY,
              snapshot: {
                orgName: 'Vereador A',
                metrics: { received: 50, resolved: 30 },
                topResolvedReports: [
                  {
                    title: 'Iluminação pública restaurada (relato anônimo)',
                    category: 'URBAN_SERVICES',
                    resolvedAt: '2026-10-15',
                    supportCount: 22,
                  },
                ],
              },
              createdAt: new Date('2026-11-01T10:00:00.000Z'),
            }
          }
          return null
        }),
        findMany: jest.fn(async () => [
          { id: 'rep-exp-1', pdfKey: 'exports/accountability/pol-1/rep-exp-1.pdf' },
        ]),
        update: jest.fn(async (args: Record<string, unknown>) => {
          updateCalls.push(args)
          return {}
        }),
        delete: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    } as any

    const scopeService = {
      resolveOrgScope: jest.fn(async () => ({
        orgType: 'POLITICIAN',
        orgId: 'pol-1',
        orgName: 'Vereador A',
        plan: 'MANDATO',
        state: 'SP',
        cityKey: 'sao paulo|SP',
        territoryLevel: 'CITY',
      })),
    } as any

    const storage = {
      delete: jest.fn(async (key: string) => {
        expiredDeletedKeys.push(key)
      }),
    } as any

    const service = new AccountabilityService(
      prisma,
      scopeService,
      {} as any,
      new ReportRendererService(),
      storage,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )

    // Cota de 4 PDFs/mês no plano MANDATO atingida
    await expect(
      service.createReport(
        { id: 'u-1', type: 'POLITICIAN' },
        { from: '2026-10-01', to: '2026-10-31' },
      ),
    ).rejects.toThrow(ForbiddenException)

    // Consulta pública imutável retorna snapshot salvo sem autor ou notas internas
    const pub = await service.findPublicByCode('VTZ-PUBLIC-1')
    expect(pub.code).toBe('VTZ-PUBLIC-1')
    expect((pub.snapshot as any).metrics.received).toBe(50)
    const serializedPub = JSON.stringify(pub)
    expect(serializedPub).not.toContain('authorId')
    expect(serializedPub).not.toContain('orgNotes')

    await expect(service.findPublicByCode('VTZ-MISSING')).rejects.toThrow(NotFoundException)

    // Purga de PDFs após retenção de 7 dias apaga apenas o arquivo R2 e zera pdfKey, mantendo snapshot imutável
    const purgeRes = await service.purgeExpiredPdfs(new Date('2026-11-15T00:00:00Z'))
    expect(purgeRes.purged).toBe(1)
    expect(expiredDeletedKeys).toEqual(['exports/accountability/pol-1/rep-exp-1.pdf'])
    expect(updateCalls).toEqual([{ where: { id: 'rep-exp-1' }, data: { pdfKey: null } }])
    expect(prisma.accountabilityReport.delete).not.toHaveBeenCalled()
  })

  it('C5(a): createReport on anonymous report with internal orgNotes builds snapshot and PDF without author or notes', async () => {
    let createdData: Record<string, unknown> | null = null
    const prisma: any = {
      politician: { findUnique: jest.fn(async () => ({ office: 'Vereador', city: 'Recife', state: 'PE' })) },
      timelineEvent: { count: jest.fn(async () => 3) },
      report: {
        findMany: jest.fn(async ({ select }: { select: Record<string, unknown> }) => {
          expect(select.authorId).toBeUndefined()
          expect(select.author).toBeUndefined()
          expect(select.orgNotes).toBeUndefined()
          return [
            {
              title: 'Saneamento básico na Rua 3 (anônimo)',
              category: 'SANITATION',
              resolvedAt: new Date('2026-10-12T12:00:00Z'),
              _count: { votes: 19 },
            },
          ]
        }),
      },
      accountabilityReport: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          createdData = data
          return {
            id: 'rep-created-1',
            code: data.code,
            status: AccountabilityReportStatus.PENDING,
            snapshot: data.snapshot,
          }
        }),
      },
      $executeRaw: jest.fn(async () => 1),
      moderationAction: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    }

    const service = new AccountabilityService(
      prisma,
      {
        resolveOrgScope: jest.fn(async () => ({
          orgType: 'POLITICIAN',
          orgId: 'pol-1',
          orgName: 'Vereador B',
          plan: 'MANDATO',
          state: 'PE',
          cityKey: 'recife|PE',
          territoryLevel: 'CITY',
        })),
      } as any,
      {
        fetchAreaSummary: jest.fn(async () => ({
          createdCount: 20,
          resolvedCount: 12,
          openOver7dCount: 4,
          responseCount: 15,
          respBuckets: [3, 6, 4, 2, 0, 0, 0, 0],
          resolutionDurationCount: 12,
          resBuckets: [0, 2, 5, 5, 0, 0, 0, 0],
        })),
        fetchCategoryBreakdown: jest.fn(async () => [
          { category: 'SANITATION', createdCount: 12, resolvedCount: 8 },
        ]),
      } as any,
      new ReportRendererService(),
      { delete: jest.fn() } as any,
      { get: () => 'https://votz.org.br' } as any,
      { add: jest.fn() } as any,
    )

    const result = await service.createReport({ id: 'u-1', type: 'POLITICIAN' }, { from: '2026-10-01', to: '2026-10-31' })
    expect(result.status).toBe(AccountabilityReportStatus.PENDING)
    const serialized = JSON.stringify(createdData)
    expect(serialized).toContain('Saneamento básico na Rua 3 (anônimo)')
    expect(serialized).not.toContain('authorId')
    expect(serialized).not.toContain('orgNotes')
    expect(serialized).not.toContain('orgTags')

    const pdf = await new ReportRendererService().renderAccountabilityPdf((createdData as any).snapshot)
    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  })
})
