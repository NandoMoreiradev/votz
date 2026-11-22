import { canAutoApprove, mergeViolations, obviousViolations, sanitizeAnalysis, type AiAnalysisResult } from './ads-ai-review.policy'

const safe = (): AiAnalysisResult => ({ category: 'food-drink', restricted: null, violations: [], sensitive: false, confidence: 0.95, explanation: 'Padaria local, sem problema.' })

describe('sanitizeAnalysis', () => {
  it('aceita uma resposta no formato e descarta ids fora das listas fechadas', () => {
    const result = sanitizeAnalysis({
      category: 'food-drink',
      restricted: 'inventada',
      violations: [{ id: 'gambling', confidence: 1.7 }, { id: 'categoria-nova', confidence: 0.9 }, 'lixo'],
      sensitive: false,
      confidence: 0.93,
      explanation: '  Parece   seguro. ',
    })
    expect(result).toEqual({
      category: 'food-drink',
      restricted: null,
      violations: [{ id: 'gambling', confidence: 1 }],
      sensitive: false,
      confidence: 0.93,
      explanation: 'Parece seguro.',
    })
  })

  it('categoria de interesse que não existe vira null', () => {
    expect(sanitizeAnalysis({ ...safe(), category: 'cripto-milagre' })?.category).toBeNull()
  })

  it.each([null, 'texto', 42, {}, { confidence: 'alta', sensitive: false, explanation: 'x' }, { confidence: 0.9, sensitive: 'não', explanation: 'x' }, { confidence: 0.9, sensitive: false, explanation: '   ' }])(
    'resposta fora do formato (%j) vira null',
    (raw) => {
      expect(sanitizeAnalysis(raw)).toBeNull()
    },
  )

  it('limita o tamanho da explicação', () => {
    expect(sanitizeAnalysis({ ...safe(), explanation: 'a'.repeat(900) })?.explanation).toHaveLength(400)
  })
})

describe('canAutoApprove', () => {
  it('aprova só quando tudo está limpo e a confiança é alta', () => {
    expect(canAutoApprove(safe())).toBe(true)
  })
  it('confiança abaixo de 0,9 vai para pessoa', () => {
    expect(canAutoApprove({ ...safe(), confidence: 0.89 })).toBe(false)
    expect(canAutoApprove({ ...safe(), confidence: 0.9 })).toBe(true)
  })
  it('tema sensível vai para pessoa', () => {
    expect(canAutoApprove({ ...safe(), sensitive: true })).toBe(false)
  })
  it('categoria restrita (saúde, educação, financeiro, imóveis, bebida) sempre vai para pessoa', () => {
    for (const restricted of ['health', 'education', 'finance', 'real-estate', 'alcohol'] as const) {
      expect(canAutoApprove({ ...safe(), restricted })).toBe(false)
    }
  })
  it('qualquer suspeita de violação, mesmo fraca, vai para pessoa', () => {
    expect(canAutoApprove({ ...safe(), violations: [{ id: 'gambling', confidence: 0.2 }] })).toBe(false)
    expect(canAutoApprove({ ...safe(), violations: [{ id: 'gambling', confidence: 0.1 }] })).toBe(true)
  })
})

describe('obviousViolations (trava por palavras)', () => {
  it('pega o texto óbvio, com ou sem acento e em maiúsculas', () => {
    expect(obviousViolations(['CASSINO online', 'Ganhe DINHEIRO FÁCIL']).map((v) => v.id).sort()).toEqual(['gambling', 'predatory-credit'])
    expect(obviousViolations(['Vote em mim nas ELEIÇÕES']).map((v) => v.id)).toEqual(['political'])
    expect(obviousViolations(['Cura milagrosa para dor']).map((v) => v.id)).toEqual(['health-claims'])
  })
  it('anúncio comum não dispara a trava', () => {
    expect(obviousViolations(['Pão quente toda manhã', 'Entrega rápida no bairro', 'https://padaria.com.br'])).toEqual([])
  })
  it('não confunde palavra parecida (abeto, cigarra)', () => {
    expect(obviousViolations(['Abeto de Natal', 'A cigarra canta'])).toEqual([])
  })
  it('a trava impede a aprovação mesmo que a IA diga que está tudo certo', () => {
    const ai = safe()
    const merged = { ...ai, violations: mergeViolations(ai.violations, obviousViolations(['Aposta e cassino']))}
    expect(canAutoApprove(merged)).toBe(false)
  })
})

describe('mergeViolations', () => {
  it('fica com a maior confiança por categoria', () => {
    expect(mergeViolations([{ id: 'gambling', confidence: 0.4 }], [{ id: 'gambling', confidence: 1 }, { id: 'adult', confidence: 1 }])).toEqual([
      { id: 'gambling', confidence: 1 },
      { id: 'adult', confidence: 1 },
    ])
  })
})
