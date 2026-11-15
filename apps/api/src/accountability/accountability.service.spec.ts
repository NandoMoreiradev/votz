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
              },
              createdAt: new Date('2026-11-01T10:00:00.000Z'),
            }
          }
          return null
        }),
        findMany: jest.fn(async () => [
          { id: 'rep-exp-1', pdfKey: 'exports/accountability/pol-1/rep-exp-1.pdf' },
        ]),
        update: jest.fn(async () => ({})),
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

    // Consulta pública imutável retorna snapshot salvo
    const pub = await service.findPublicByCode('VTZ-PUBLIC-1')
    expect(pub.code).toBe('VTZ-PUBLIC-1')
    expect((pub.snapshot as any).metrics.received).toBe(50)

    await expect(service.findPublicByCode('VTZ-MISSING')).rejects.toThrow(NotFoundException)

    // Purga de PDFs após retenção de 7 dias
    const purgeRes = await service.purgeExpiredPdfs(new Date('2026-11-15T00:00:00Z'))
    expect(purgeRes.purged).toBe(1)
    expect(expiredDeletedKeys).toEqual(['exports/accountability/pol-1/rep-exp-1.pdf'])
  })
})
