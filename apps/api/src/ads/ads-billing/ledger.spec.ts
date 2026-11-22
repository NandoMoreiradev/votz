import { assertBalanced, customerBalanceDelta, spendLines, topUpLines } from './ledger'

describe('livro-caixa de anúncios (partidas dobradas)', () => {
  it('recarga: débito em "recebido" e crédito no saldo do cliente, iguais', () => {
    const lines = topUpLines(5000)
    expect(() => assertBalanced(lines)).not.toThrow()
    expect(customerBalanceDelta(lines)).toBe(5000)
  })

  it('gasto: o saldo desce e vira receita', () => {
    const lines = spendLines(1200)
    expect(() => assertBalanced(lines)).not.toThrow()
    expect(customerBalanceDelta(lines)).toBe(-1200)
  })

  it('recusa lançamento desequilibrado', () => {
    expect(() =>
      assertBalanced([
        { ledger: 'PAYMENTS_RECEIVED', side: 'DEBIT', amountCents: 5000 },
        { ledger: 'CUSTOMER_BALANCE', side: 'CREDIT', amountCents: 4999 },
      ]),
    ).toThrow(/desequilibrado/)
  })

  it('recusa uma linha só, valor zero, negativo ou com centavos quebrados', () => {
    expect(() => assertBalanced([{ ledger: 'CUSTOMER_BALANCE', side: 'CREDIT', amountCents: 100 }])).toThrow(/duas linhas/)
    expect(() => assertBalanced(topUpLines(0))).toThrow(/inteiros e positivos/)
    expect(() => assertBalanced(topUpLines(-5))).toThrow(/inteiros e positivos/)
    expect(() => assertBalanced(topUpLines(10.5))).toThrow(/inteiros e positivos/)
  })

  it('lançamento que não mexe no saldo do cliente tem diferença zero', () => {
    expect(
      customerBalanceDelta([
        { ledger: 'PROMO_FUND', side: 'DEBIT', amountCents: 100 },
        { ledger: 'AD_REVENUE', side: 'CREDIT', amountCents: 100 },
      ]),
    ).toBe(0)
  })
})
