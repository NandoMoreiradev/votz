import { LANDING, URL_SHORTENERS, actionAfterCheck, hostOf, parseBlockedDomains, sameSite, staticLinkProblem, statusFromHttp } from './landing-rules'

describe('link do anúncio: regras estáticas', () => {
  it.each([
    'https://padaria.com.br/oferta',
    'https://www.padaria.com.br/oferta?utm_source=votz#topo',
    'https://wa.me/5511999999999?text=oi',
    'https://api.whatsapp.com/send?phone=5511999999999',
    'https://www.instagram.com/padaria',
    'https://loja.exemplo.com.br:443/produto',
  ])('aceita %s', (url) => {
    expect(staticLinkProblem(url)).toBeNull()
  })

  it.each([
    ['http://padaria.com.br', 'https://'],
    ['ftp://padaria.com.br', 'https://'],
    ['javascript:alert(1)', 'https://'],
    ['não é link', 'válido'],
    ['https://user:senha@padaria.com.br', 'usuário e senha'],
    ['https://padaria.com.br:8443/x', 'porta'],
    ['https://192.168.0.10/x', 'IP'],
    ['https://8.8.8.8/x', 'IP'],
    ['https://[::1]/x', 'IP'],
    ['https://localhost/x', 'público'],
    ['https://intranet/x', 'público'],
    ['https://servidor.local/x', 'público'],
    ['https://api.internal/x', 'público'],
    ['https://bit.ly/abc', 'encurtados'],
    ['https://loja.bit.ly/abc', 'encurtados'],
    ['https://www.tinyurl.com/abc', 'encurtados'],
    ['https://prefeitura.sp.gov.br/x', 'órgãos públicos'],
    ['https://camara.leg.br/x', 'órgãos públicos'],
    ['https://tjsp.jus.br/x', 'órgãos públicos'],
  ])('recusa %s', (url, pedaco) => {
    expect(staticLinkProblem(url)).toContain(pedaco)
  })

  it('link enorme é recusado', () => {
    expect(staticLinkProblem(`https://padaria.com.br/${'a'.repeat(LANDING.MAX_URL_LENGTH)}`)).toContain('grande demais')
  })

  it('a lista do dono vale para o domínio e os subdomínios, sem confundir nomes parecidos', () => {
    const blocked = parseBlockedDomains(' Golpe.com.br , www.fraude.net,, ')
    expect(blocked).toEqual(['golpe.com.br', 'fraude.net'])
    expect(staticLinkProblem('https://golpe.com.br/x', blocked)).toContain('não pode ser usado')
    expect(staticLinkProblem('https://www.golpe.com.br/x', blocked)).toContain('não pode ser usado')
    expect(staticLinkProblem('https://loja.fraude.net/x', blocked)).toContain('não pode ser usado')
    expect(staticLinkProblem('https://naogolpe.com.br/x', blocked)).toBeNull()
    expect(parseBlockedDomains(undefined)).toEqual([])
  })

  it('a lista de encurtadores não inclui WhatsApp nem redes sociais', () => {
    expect(URL_SHORTENERS).not.toContain('wa.me' as never)
    expect(URL_SHORTENERS.length).toBeGreaterThan(5)
  })
})

describe('página de destino: resultado e ação', () => {
  it('2xx abre; o resto é página quebrada', () => {
    expect(statusFromHttp(200)).toBe('OK')
    expect(statusFromHttp(204)).toBe('OK')
    expect(statusFromHttp(404)).toBe('BAD_STATUS')
    expect(statusFromHttp(500)).toBe('BAD_STATUS')
    expect(statusFromHttp(0)).toBe('BAD_STATUS')
  })

  it('mesmo site ignora www e maiúsculas', () => {
    expect(sameSite('WWW.Padaria.com.br', 'padaria.com.br')).toBe(true)
    expect(sameSite('padaria.com.br', 'outra.com.br')).toBe(false)
    expect(hostOf('https://www.Padaria.com.br/x')).toBe('padaria.com.br')
    expect(hostOf('xx')).toBeNull()
  })

  it('tudo certo não faz nada', () => {
    expect(actionAfterCheck('OK', null)).toBe('NONE')
    expect(actionAfterCheck('OK', 'BAD_STATUS')).toBe('NONE')
  })

  it('bloqueado pausa na hora', () => {
    expect(actionAfterCheck('BLOCKED', null)).toBe('PAUSE')
    expect(actionAfterCheck('BLOCKED', 'OK')).toBe('PAUSE')
  })

  it('página que não abre: primeira vez confere de novo; segunda seguida pausa', () => {
    expect(actionAfterCheck('UNREACHABLE', null)).toBe('RETRY_LATER')
    expect(actionAfterCheck('BAD_STATUS', 'OK')).toBe('RETRY_LATER')
    expect(actionAfterCheck('UNREACHABLE', 'BAD_STATUS')).toBe('PAUSE')
    expect(actionAfterCheck('BAD_STATUS', 'UNREACHABLE')).toBe('PAUSE')
  })
})
