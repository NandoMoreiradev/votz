import { AD_WHATSAPP, AD_WHATSAPP_COPY, buildWhatsAppUrl, formatBrazilianMobile, normalizeBrazilianMobile, whatsappTextOrDefault, whatsappTextProblem } from '@votz/shared-types'
import { destinationProblem, whatsappDestination, whatsappOf } from './destination-rules'

describe('número de WhatsApp: só celular do Brasil, com DDD', () => {
  it.each([
    ['(11) 98765-4321', '5511987654321'],
    ['11987654321', '5511987654321'],
    ['+55 11 98765-4321', '5511987654321'],
    ['5511987654321', '5511987654321'],
    ['  (21) 9 8765 4321 ', '5521987654321'],
    ['55 98765-4321', '5555987654321'],
  ])('aceita %s', (raw, expected) => {
    expect(normalizeBrazilianMobile(raw)).toBe(expected)
  })

  it.each([
    ['', 'vazio'],
    ['(11) 3456-7890', 'fixo: o WhatsApp não usa'],
    ['(11) 8765-4321', 'sem o nono dígito'],
    ['(01) 98765-4321', 'DDD com zero'],
    ['987654321', 'sem DDD'],
    ['+1 415 555 0132', 'de outro país'],
    ['55119876543210', 'dígito sobrando'],
    ['abc', 'não é número'],
  ])('recusa %s (%s)', (raw) => {
    expect(normalizeBrazilianMobile(raw)).toBeNull()
  })

  it('mostra como a pessoa digita', () => {
    expect(formatBrazilianMobile('5511987654321')).toBe('(11) 98765-4321')
  })
})

describe('mensagem que já vem escrita no WhatsApp', () => {
  it('vazia vale: usa o texto padrão', () => {
    expect(whatsappTextProblem('')).toBeNull()
    expect(whatsappTextProblem(undefined)).toBeNull()
    expect(whatsappTextOrDefault('   ')).toBe(AD_WHATSAPP.DEFAULT_TEXT)
  })

  it('até 200 letras, sem link', () => {
    expect(whatsappTextProblem('a'.repeat(AD_WHATSAPP.TEXT_MAX))).toBeNull()
    expect(whatsappTextProblem('a'.repeat(AD_WHATSAPP.TEXT_MAX + 1))).toMatch(/até 200/)
    for (const text of ['Veja https://golpe.com', 'acesse www.golpe.com', 'chame wa.me/5511999999999', 'ganhe em golpe.com.br', 'bit.ly/abc']) {
      expect(whatsappTextProblem(text)).toMatch(/link/)
    }
    expect(whatsappTextProblem('Oi! Vi o anúncio do pão quentinho. Tem entrega hoje?')).toBeNull()
  })

  it('espaços sobrando viram um só', () => {
    expect(whatsappTextOrDefault('  Oi,   tudo   bem?  ')).toBe('Oi, tudo bem?')
  })
})

describe('endereço do WhatsApp montado pelo servidor', () => {
  it('wa.me com o número e o texto codificado', () => {
    expect(buildWhatsAppUrl('5511987654321', 'Oi! Tem pão?')).toBe('https://wa.me/5511987654321?text=Oi!%20Tem%20p%C3%A3o%3F')
  })

  it('a partir do que o anunciante digitou, normaliza e usa o texto padrão se vier vazio', () => {
    const wa = whatsappDestination({ whatsappPhone: '(11) 98765-4321', whatsappText: '' })
    expect(wa?.phone).toBe('5511987654321')
    expect(wa?.text).toBe(AD_WHATSAPP.DEFAULT_TEXT)
    expect(wa?.url).toBe(`https://wa.me/5511987654321?text=${encodeURIComponent(AD_WHATSAPP.DEFAULT_TEXT)}`)
  })

  it('número ruim ou texto com link não gera endereço', () => {
    expect(whatsappDestination({ whatsappPhone: '123' })).toBeNull()
    expect(whatsappDestination({ whatsappPhone: '11987654321', whatsappText: 'veja golpe.com' })).toBeNull()
  })

  it('o texto do anunciante não consegue escapar do parâmetro (nada de & ou # soltos)', () => {
    const wa = whatsappDestination({ whatsappPhone: '11987654321', whatsappText: 'Oi&text=outro#fim' })
    expect(wa?.url).toBe('https://wa.me/5511987654321?text=Oi%26text%3Doutro%23fim')
    expect(new URL(wa?.url as string).searchParams.get('text')).toBe('Oi&text=outro#fim')
  })

  it('a visão do anunciante só traz o número em anúncio de WhatsApp', () => {
    expect(whatsappOf({ destinationKind: 'WHATSAPP', whatsappPhone: '5511987654321', whatsappText: null })).toEqual({ phone: '5511987654321', text: AD_WHATSAPP.DEFAULT_TEXT })
    expect(whatsappOf({ destinationKind: 'PAGE_MESSAGE', whatsappPhone: '5511987654321' })).toBeNull()
    expect(whatsappOf({ destinationKind: 'URL' })).toBeNull()
  })
})

describe('destino WhatsApp: combina com o objetivo e com o botão', () => {
  const ok = { objective: 'MESSAGES' as const, destinationKind: 'WHATSAPP' as const, ctaLabel: 'Falar no WhatsApp', whatsappPhone: '(11) 98765-4321' }

  it('mensagens + WhatsApp + botão certo + número válido passa', () => {
    expect(destinationProblem(ok)).toBeNull()
  })

  it('sem número ou com número ruim, não passa', () => {
    expect(destinationProblem({ ...ok, whatsappPhone: '' })).toMatch(/número de WhatsApp/)
    expect(destinationProblem({ ...ok, whatsappPhone: '(11) 3456-7890' })).toMatch(/número de WhatsApp/)
  })

  it('mensagem com link não passa', () => {
    expect(destinationProblem({ ...ok, whatsappText: 'veja https://golpe.com' })).toMatch(/link/)
  })

  it('o botão precisa dizer WhatsApp, e o objetivo precisa ser mensagens', () => {
    expect(destinationProblem({ ...ok, ctaLabel: 'Enviar mensagem' })).toMatch(/botão/)
    expect(destinationProblem({ ...ok, objective: 'TRAFFIC' })).toMatch(/Receber mensagens/)
  })
})

describe('aviso antes de abrir o WhatsApp', () => {
  it('diz com o nome da empresa que ela vai ver o número', () => {
    expect(AD_WHATSAPP_COPY.body('Padaria Teste')).toContain('Padaria Teste')
    expect(AD_WHATSAPP_COPY.body('Padaria Teste')).toMatch(/vai ver o seu número/)
    expect(AD_WHATSAPP_COPY.cancel).toBeTruthy()
  })
})
