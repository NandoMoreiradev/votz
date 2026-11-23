import { AdsInvoicesService } from './ads-invoices.service'
import { LiveInvoiceIssuer, TestInvoiceIssuer } from './invoice-issuer'

const NOW = new Date('2026-12-02T08:00:00Z')

const pendingInvoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1234567',
  adAccountId: 'acc-1',
  periodStart: new Date('2026-11-01T00:00:00Z'),
  periodEnd: new Date('2026-11-30T00:00:00Z'),
  amountCents: 12_345,
  status: 'PENDING',
  takerName: 'Padaria Teste Ltda',
  takerCnpj: '00000000000191',
  attempts: 0,
  adAccount: { companyId: 'co-1', name: 'Conta principal' },
  ...over,
})

function setup(mode = 'test') {
  const repo = {
    spendByAccount: jest.fn().mockResolvedValue([]),
    takersOf: jest.fn().mockResolvedValue([]),
    createMissing: jest.fn().mockResolvedValue(0),
    pending: jest.fn().mockResolvedValue([]),
    claim: jest.fn().mockResolvedValue(true),
    markIssued: jest.fn().mockResolvedValue(undefined),
    markError: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
  }
  const notifier = { notify: jest.fn().mockResolvedValue(undefined) }
  const config = { get: (key: string) => (key === 'ADS_BILLING_MODE' ? mode : undefined) }
  return { repo, notifier, service: new AdsInvoicesService(repo as never, config as never, new TestInvoiceIssuer(), new LiveInvoiceIssuer(), notifier as never) }
}

describe('AdsInvoicesService.createForMonth', () => {
  it('cria uma nota por conta que gastou no mês passado, com o valor do livro-caixa e o tomador da hora', async () => {
    const { repo, service } = setup()
    repo.spendByAccount.mockResolvedValue([{ adAccountId: 'acc-1', cents: 12_345 }])
    repo.takersOf.mockResolvedValue([{ id: 'acc-1', company: { legalName: 'Padaria Teste Ltda', cnpj: '00000000000191' } }])
    repo.createMissing.mockResolvedValue(1)
    expect(await service.createForMonth(NOW)).toBe(1)
    // O mês consultado é novembro (de São Paulo), de 1/11 03:00Z até 1/12 03:00Z.
    expect(repo.spendByAccount).toHaveBeenCalledWith(new Date('2026-11-01T03:00:00Z'), new Date('2026-12-01T03:00:00Z'))
    expect(repo.createMissing).toHaveBeenCalledWith([
      expect.objectContaining({ adAccountId: 'acc-1', amountCents: 12_345, takerName: 'Padaria Teste Ltda', takerCnpj: '00000000000191', periodStart: new Date('2026-11-01T00:00:00Z'), periodEnd: new Date('2026-11-30T00:00:00Z') }),
    ])
  })

  it('sem gasto, nada é criado', async () => {
    const { repo, service } = setup()
    expect(await service.createForMonth(NOW)).toBe(0)
    expect(repo.createMissing).not.toHaveBeenCalled()
  })

  it('conta sem empresa encontrada é pulada, sem derrubar as outras', async () => {
    const { repo, service } = setup()
    repo.spendByAccount.mockResolvedValue([{ adAccountId: 'acc-1', cents: 100 }, { adAccountId: 'acc-2', cents: 200 }])
    repo.takersOf.mockResolvedValue([{ id: 'acc-2', company: { legalName: 'B', cnpj: '1' } }])
    await service.createForMonth(NOW)
    expect(repo.createMissing.mock.calls[0][0]).toHaveLength(1)
    expect(repo.createMissing.mock.calls[0][0][0].adAccountId).toBe('acc-2')
  })
})

describe('AdsInvoicesService.issuePending', () => {
  it('emite no modo de teste (número falso), grava e avisa a empresa', async () => {
    const { repo, notifier, service } = setup('test')
    repo.pending.mockResolvedValue([pendingInvoice()])
    expect(await service.issuePending(NOW)).toEqual({ issued: 1, waiting: 0, failed: 0 })
    expect(repo.markIssued).toHaveBeenCalledWith('inv-1234567', expect.objectContaining({ provider: 'TEST', number: expect.stringMatching(/^TESTE-202611-/) }), NOW)
    expect(notifier.notify).toHaveBeenCalledWith('co-1', 'AD_INVOICE_ISSUED', expect.objectContaining({ amountCents: 12_345, periodStart: '2026-11-01' }))
  })

  it('sem provedor de NFS-e (modo real), as notas esperam sem gastar tentativa', async () => {
    const { repo, service } = setup('live')
    repo.pending.mockResolvedValue([pendingInvoice()])
    expect(await service.issuePending(NOW)).toEqual({ issued: 0, waiting: 1, failed: 0 })
    expect(repo.claim).not.toHaveBeenCalled()
    expect(repo.markError).not.toHaveBeenCalled()
  })

  it('outra instância reservou a nota: não emite de novo', async () => {
    const { repo, notifier, service } = setup('test')
    repo.pending.mockResolvedValue([pendingInvoice()])
    repo.claim.mockResolvedValue(false)
    expect((await service.issuePending(NOW)).issued).toBe(0)
    expect(notifier.notify).not.toHaveBeenCalled()
  })

  it('erro na emissão guarda o erro; na quinta tentativa vira "com problema"', async () => {
    const { repo, service } = setup('test')
    const broken = { provider: 'X', isReady: () => true, issue: jest.fn().mockRejectedValue(new Error('prefeitura fora do ar')) }
    const withBroken = new AdsInvoicesService(repo as never, { get: () => 'test' } as never, broken as never, new LiveInvoiceIssuer(), { notify: jest.fn() } as never)
    repo.pending.mockResolvedValue([pendingInvoice({ attempts: 1 })])
    expect(await withBroken.issuePending(NOW)).toEqual({ issued: 0, waiting: 0, failed: 0 })
    expect(repo.markError).toHaveBeenCalledWith('inv-1234567', 'prefeitura fora do ar', false)
    repo.pending.mockResolvedValue([pendingInvoice({ attempts: 4 })])
    expect(await withBroken.issuePending(NOW)).toEqual({ issued: 0, waiting: 0, failed: 1 })
    expect(repo.markError).toHaveBeenLastCalledWith('inv-1234567', 'prefeitura fora do ar', true)
    void service
  })
})
