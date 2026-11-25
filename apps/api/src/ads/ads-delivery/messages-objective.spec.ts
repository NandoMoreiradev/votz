import { AD_OBJECTIVES, AD_PRICING, adChargeMillicents, adChargeUnit, adCtaLabelsFor, adDestinationKindsFor, adFloorCents } from '@votz/shared-types'

describe('objetivo "Receber mensagens": cobrança por clique, com piso próprio', () => {
  it('cobra por clique, como o Tráfego', () => {
    expect(adChargeUnit('MESSAGES')).toBe('CLICK')
    expect(adChargeUnit('TRAFFIC')).toBe('CLICK')
    expect(adChargeUnit('AWARENESS')).toBe('VIEWABLE_IMPRESSION')
    expect(adChargeUnit('CONVERSIONS')).toBe('VIEWABLE_IMPRESSION')
  })

  it('piso de R$ 0,80 por clique (decisão do dono); os outros pisos não mudam', () => {
    expect(adFloorCents('MESSAGES')).toBe(80)
    expect(adFloorCents('MESSAGES')).toBe(AD_PRICING.MIN_CPC_MESSAGES_CENTS)
    expect(adFloorCents('TRAFFIC')).toBe(40)
    expect(adFloorCents('AWARENESS')).toBe(600)
    expect(adFloorCents('CONVERSIONS')).toBe(600)
  })

  it('um clique de R$ 0,80 custa 80.000 milésimos de centavo', () => {
    expect(adChargeMillicents('MESSAGES', 80)).toBe(80_000)
    expect(adChargeMillicents('TRAFFIC', 40)).toBe(40_000)
  })

  it('todo objetivo tem preço, unidade e destino definidos', () => {
    for (const objective of AD_OBJECTIVES) {
      expect(adFloorCents(objective)).toBeGreaterThan(0)
      expect(adDestinationKindsFor(objective).length).toBeGreaterThan(0)
    }
  })

  it('mensagens vai a conversa; os outros vão a site', () => {
    expect(adDestinationKindsFor('MESSAGES')).toEqual(['PAGE_MESSAGE', 'WHATSAPP'])
    for (const objective of ['AWARENESS', 'TRAFFIC', 'CONVERSIONS'] as const) expect(adDestinationKindsFor(objective)).toEqual(['URL'])
  })

  it('o texto do botão combina com o destino', () => {
    expect(adCtaLabelsFor('PAGE_MESSAGE')).toEqual(['Enviar mensagem'])
    expect(adCtaLabelsFor('WHATSAPP')).toEqual(['Falar no WhatsApp'])
    expect(adCtaLabelsFor('URL')).not.toContain('Enviar mensagem')
    expect(adCtaLabelsFor('URL')).toContain('Saiba mais')
  })
})
