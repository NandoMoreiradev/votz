import { conversionProblem, clickUrlBase, hashConversionKey, isValidClickToken, landingUrl, newClickToken, newConversionKey } from './conversion-rules'

const DAY = 86_400_000
const LANDED = new Date('2026-11-22T12:00:00.000Z')
const NOW = new Date('2026-11-23T12:00:00.000Z')

describe('identificador do clique', () => {
  it('tem 22 letras sorteadas e nunca repete', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => newClickToken()))
    expect(tokens.size).toBe(500)
    for (const token of tokens) expect(isValidClickToken(token)).toBe(true)
  })

  it('recusa o que não parece um identificador', () => {
    for (const bad of ['', 'abc', 'x'.repeat(21), 'x'.repeat(23), 'a'.repeat(21) + '!', '../../etc/passwd/aaaaa', null, undefined, 42]) {
      expect(isValidClickToken(bad)).toBe(false)
    }
  })
})

describe('chave de conversões', () => {
  it('só o hash vai para o banco, e o começo (prefixo) serve para reconhecer', () => {
    const { key, prefix, keyHash } = newConversionKey()
    expect(key.startsWith('vzc_')).toBe(true)
    expect(key.length).toBeGreaterThan(40)
    expect(prefix).toBe(key.slice(0, 12))
    expect(keyHash).toBe(hashConversionKey(key))
    expect(keyHash).not.toContain(key)
    expect(hashConversionKey(key + 'x')).not.toBe(keyHash)
  })
})

describe('endereço do clique', () => {
  it('usa a base configurada, sem barra no fim', () => {
    expect(clickUrlBase({ AD_CLICK_URL_BASE: 'https://votz.app/c/' })).toBe('https://votz.app/c')
  })
  it('em desenvolvimento aponta para a API local', () => {
    expect(clickUrlBase({ NODE_ENV: 'development', PORT: '3000' })).toBe('http://localhost:3000/api/v1/ads/c')
    expect(clickUrlBase({})).toBe('http://localhost:3000/api/v1/ads/c')
  })
  it('em produção usa o site: <site>/c', () => {
    expect(clickUrlBase({ NODE_ENV: 'production', APP_URL: 'https://votz.app/' })).toBe('https://votz.app/c')
  })
})

describe('para onde o clique vai', () => {
  it('põe o votz_click_id no link e mantém o resto do endereço', () => {
    const url = new URL(landingUrl('https://padaria.com.br/bolo?cupom=A1#topo', 'TOKEN') as string)
    expect(url.origin + url.pathname).toBe('https://padaria.com.br/bolo')
    expect(url.searchParams.get('cupom')).toBe('A1')
    expect(url.searchParams.get('votz_click_id')).toBe('TOKEN')
    expect(url.hash).toBe('#topo')
  })

  it('troca um votz_click_id que o anunciante já tivesse posto (não deixa forjar)', () => {
    const url = new URL(landingUrl('https://padaria.com.br/?votz_click_id=forjado', 'REAL') as string)
    expect(url.searchParams.getAll('votz_click_id')).toEqual(['REAL'])
  })

  it('nunca redireciona para esquema perigoso nem para endereço quebrado', () => {
    expect(landingUrl('javascript:alert(1)', 'T')).toBeNull()
    expect(landingUrl('data:text/html,<script>', 'T')).toBeNull()
    expect(landingUrl('ftp://padaria.com.br', 'T')).toBeNull()
    expect(landingUrl('não é um endereço', 'T')).toBeNull()
  })
})

describe('janela de atribuição', () => {
  it('aceita no mesmo instante, no meio e no último momento dos 7 dias', () => {
    expect(conversionProblem(LANDED, LANDED, NOW)).toBeNull()
    expect(conversionProblem(new Date(LANDED.getTime() + 3 * DAY), LANDED, new Date(LANDED.getTime() + 4 * DAY))).toBeNull()
    expect(conversionProblem(new Date(LANDED.getTime() + 7 * DAY), LANDED, new Date(LANDED.getTime() + 8 * DAY))).toBeNull()
  })

  it('recusa depois de 7 dias', () => {
    expect(conversionProblem(new Date(LANDED.getTime() + 7 * DAY + 1), LANDED, new Date(LANDED.getTime() + 9 * DAY))).toBe('OUTSIDE_WINDOW')
  })

  it('recusa conversão antes do clique, com folga de 5 minutos para o relógio do anunciante', () => {
    expect(conversionProblem(new Date(LANDED.getTime() - 4 * 60_000), LANDED, NOW)).toBeNull()
    expect(conversionProblem(new Date(LANDED.getTime() - 6 * 60_000), LANDED, NOW)).toBe('OUTSIDE_WINDOW')
  })

  it('recusa conversão no futuro, com a mesma folga', () => {
    expect(conversionProblem(new Date(NOW.getTime() + 4 * 60_000), LANDED, NOW)).toBeNull()
    expect(conversionProblem(new Date(NOW.getTime() + 6 * 60_000), LANDED, NOW)).toBe('IN_THE_FUTURE')
  })
})
