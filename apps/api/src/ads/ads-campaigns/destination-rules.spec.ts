import { destinationProblem, pageMessageUrl } from './destination-rules'

describe('destino do anúncio: combina com o objetivo e com o botão', () => {
  it('site com objetivo de site passa', () => {
    expect(destinationProblem({ objective: 'TRAFFIC', destinationUrl: 'https://padaria.com.br', ctaLabel: 'Saiba mais' })).toBeNull()
    expect(destinationProblem({ objective: 'CONVERSIONS', destinationKind: 'URL', destinationUrl: 'https://padaria.com.br', ctaLabel: 'Comprar' })).toBeNull()
  })

  it('site sem link não passa', () => {
    expect(destinationProblem({ objective: 'TRAFFIC', destinationUrl: ' ', ctaLabel: 'Saiba mais' })).toMatch(/link do botão/)
  })

  it('mensagens com chat da página e "Enviar mensagem" passa, sem link', () => {
    expect(destinationProblem({ objective: 'MESSAGES', destinationKind: 'PAGE_MESSAGE', ctaLabel: 'Enviar mensagem' })).toBeNull()
  })

  it('mensagens com destino de site não passa', () => {
    expect(destinationProblem({ objective: 'MESSAGES', destinationKind: 'URL', destinationUrl: 'https://padaria.com.br', ctaLabel: 'Saiba mais' })).toMatch(/chat da sua página/)
  })

  it('chat da página com objetivo de site não passa', () => {
    expect(destinationProblem({ objective: 'TRAFFIC', destinationKind: 'PAGE_MESSAGE', ctaLabel: 'Enviar mensagem' })).toMatch(/Receber mensagens/)
  })

  it('o botão não pode prometer o que não faz', () => {
    expect(destinationProblem({ objective: 'MESSAGES', destinationKind: 'PAGE_MESSAGE', ctaLabel: 'Falar no WhatsApp' })).toMatch(/Enviar mensagem/)
    expect(destinationProblem({ objective: 'MESSAGES', destinationKind: 'PAGE_MESSAGE', ctaLabel: 'Comprar' })).toMatch(/Enviar mensagem/)
    expect(destinationProblem({ objective: 'TRAFFIC', destinationUrl: 'https://padaria.com.br', ctaLabel: 'Enviar mensagem' })).toMatch(/abre uma conversa/)
  })

  it('o site continua aceitando "Falar no WhatsApp" (link wa.me colado à mão, como antes)', () => {
    expect(destinationProblem({ objective: 'TRAFFIC', destinationUrl: 'https://wa.me/5511999999999', ctaLabel: 'Falar no WhatsApp' })).toBeNull()
  })

  it('WhatsApp sem número não passa (o resto das regras do WhatsApp está em whatsapp-rules.spec.ts)', () => {
    expect(destinationProblem({ objective: 'MESSAGES', destinationKind: 'WHATSAPP', ctaLabel: 'Falar no WhatsApp' })).toMatch(/número de WhatsApp/)
  })
})

describe('endereço do chat da página', () => {
  it('usa o site da configuração, sem barra no fim', () => {
    expect(pageMessageUrl('https://votz.org.br/', 'abc')).toBe('https://votz.org.br/conversas/pagina/COMPANY/abc')
    expect(pageMessageUrl('http://localhost:5173', 'abc')).toBe('http://localhost:5173/conversas/pagina/COMPANY/abc')
  })

  it('sem configuração, usa o site de produção', () => {
    expect(pageMessageUrl(undefined, 'abc')).toBe('https://votz.org.br/conversas/pagina/COMPANY/abc')
    expect(pageMessageUrl('  ', 'abc')).toBe('https://votz.org.br/conversas/pagina/COMPANY/abc')
  })
})
