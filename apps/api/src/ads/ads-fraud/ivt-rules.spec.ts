import { IVT, applyCreditToPending, creditMillicents, judgeTraffic } from './ivt-rules'

describe('tráfego inválido: julgamento', () => {
  it('taxa de cliques normal (3%) passa', () => {
    expect(judgeTraffic({ viewable: 5000, clicks: 150, clicksWithoutView: 0 })).toBeNull()
  })

  it('amostra pequena nunca é julgada', () => {
    expect(judgeTraffic({ viewable: 30, clicks: 19, clicksWithoutView: 19 })).toBeNull()
    expect(judgeTraffic({ viewable: 0, clicks: 0, clicksWithoutView: 0 })).toBeNull()
  })

  it('taxa de cliques acima de 20% vai para revisão e conta como inválido o que passa de 10%', () => {
    const verdict = judgeTraffic({ viewable: 1000, clicks: 300, clicksWithoutView: 0 })
    expect(verdict).toEqual({ level: 'REVIEW', signals: ['CTR_ABNORMAL'], invalidClicks: 200 })
  })

  it('exatamente 20% ainda é normal; logo acima já é sinal', () => {
    expect(judgeTraffic({ viewable: 1000, clicks: 200, clicksWithoutView: 0 })).toBeNull()
    expect(judgeTraffic({ viewable: 1000, clicks: 201, clicksWithoutView: 0 })?.signals).toEqual(['CTR_ABNORMAL'])
  })

  it('taxa acima de 40% com amostra grande é extrema', () => {
    expect(judgeTraffic({ viewable: 1000, clicks: 500, clicksWithoutView: 0 })?.level).toBe('EXTREME')
  })

  it('taxa extrema com amostra pequena fica só em revisão (ninguém pausa por pouco dado)', () => {
    expect(judgeTraffic({ viewable: 300, clicks: 150, clicksWithoutView: 0 })?.level).toBe('REVIEW')
    expect(judgeTraffic({ viewable: 100, clicks: 60, clicksWithoutView: 0 })).toBeNull() // viewable < 200
  })

  it('clique sem exibição vista: mais da metade vai para revisão e esses cliques são o inválido', () => {
    expect(judgeTraffic({ viewable: 5000, clicks: 40, clicksWithoutView: 25 })).toEqual({ level: 'REVIEW', signals: ['CLICKS_WITHOUT_VIEW'], invalidClicks: 25 })
    expect(judgeTraffic({ viewable: 5000, clicks: 40, clicksWithoutView: 20 })).toBeNull() // exatamente metade: normal
  })

  it('quase todos sem exibição vista, com amostra, é extremo', () => {
    expect(judgeTraffic({ viewable: 5000, clicks: 60, clicksWithoutView: 55 })?.level).toBe('EXTREME')
    expect(judgeTraffic({ viewable: 5000, clicks: 30, clicksWithoutView: 29 })?.level).toBe('REVIEW')
  })

  it('dois sinais juntos: vale o maior inválido e os dois aparecem', () => {
    const verdict = judgeTraffic({ viewable: 400, clicks: 120, clicksWithoutView: 100 })
    expect(verdict?.signals).toEqual(['CTR_ABNORMAL', 'CLICKS_WITHOUT_VIEW'])
    expect(verdict?.invalidClicks).toBe(100) // max(120 - 40, 100)
  })

  it('o inválido nunca passa do total de cliques e números ruins não quebram', () => {
    expect(judgeTraffic({ viewable: 200, clicks: 25, clicksWithoutView: 999 })?.invalidClicks).toBe(25)
    expect(judgeTraffic({ viewable: Number.NaN, clicks: -3, clicksWithoutView: 5 })).toBeNull()
  })

  it('constantes coerentes: o plausível fica abaixo do limite de revisão', () => {
    expect(IVT.PLAUSIBLE_CTR).toBeLessThan(IVT.REVIEW_CTR)
    expect(IVT.REVIEW_CTR).toBeLessThan(IVT.EXTREME_CTR)
  })
})

describe('tráfego inválido: crédito', () => {
  it('devolve a parte do gasto que veio de clique inválido', () => {
    expect(creditMillicents({ chargeOn: 'CLICK', grossSpendMillicents: 400_000, clicks: 100, invalidClicks: 25 })).toBe(100_000)
  })

  it('anúncio cobrado por exibição não devolve nada (o clique não gerou cobrança)', () => {
    expect(creditMillicents({ chargeOn: 'VIEWABLE_IMPRESSION', grossSpendMillicents: 400_000, clicks: 100, invalidClicks: 25 })).toBe(0)
  })

  it('sem clique, sem crédito; inválido maior que o total vale o total', () => {
    expect(creditMillicents({ chargeOn: 'CLICK', grossSpendMillicents: 1000, clicks: 0, invalidClicks: 5 })).toBe(0)
    expect(creditMillicents({ chargeOn: 'CLICK', grossSpendMillicents: 1000, clicks: 4, invalidClicks: 9 })).toBe(1000)
  })

  it('abate do gasto ainda não lançado antes de devolver em centavos', () => {
    expect(applyCreditToPending(700, 500)).toEqual({ newPendingMillicents: 200, refundCents: 0 })
    expect(applyCreditToPending(700, 700)).toEqual({ newPendingMillicents: 0, refundCents: 0 })
  })

  it('o que passa do pendente vira devolução em centavos, arredondada a favor do anunciante', () => {
    // credita 2.500; pendente 300; faltam 2.200 => 3 centavos (3.000), sobra 800 no pendente
    expect(applyCreditToPending(300, 2500)).toEqual({ newPendingMillicents: 800, refundCents: 3 })
    expect(applyCreditToPending(0, 1000)).toEqual({ newPendingMillicents: 0, refundCents: 1 })
  })

  it('a conta fecha: pendente novo + devolução = pendente + crédito (em milésimos)', () => {
    for (const [pending, credit] of [[0, 1], [999, 1500], [123, 100_000], [500, 500]]) {
      const { newPendingMillicents, refundCents } = applyCreditToPending(pending, credit)
      expect(newPendingMillicents).toBeGreaterThanOrEqual(0)
      expect(newPendingMillicents - refundCents * 1000 + credit).toBe(pending) // quem recebe devolução e pendente = o que se devia
      expect(refundCents * 1000 - newPendingMillicents).toBe(Math.max(0, credit - pending))
    }
  })
})
