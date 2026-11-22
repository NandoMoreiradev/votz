import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Fronteira da regra "nenhum anúncio perto de relato contra o anunciante". O código de anúncios não pode ler relatos
 * (teste do muro em `ads/ads-policy.spec.ts`); a única porta é o `ContentAdjacencyService`, que só devolve ids de
 * empresas e só serve para TIRAR anúncio de perto de um conteúdo. Se um destes testes falhar, NÃO afrouxe o teste:
 * alargar essa porta precisa de aval do dono do produto, revisão do advogado e atualização do RIPD
 * (`docs/legal/ripd-anuncios-rascunho.md`, "Exceção estreita").
 */
const SRC = join(__dirname, '..')
const ADS = join(SRC, 'ads')

const filesIn = (dir: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? filesIn(path) : /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : []
      })

const read = (path: string) => readFileSync(path, 'utf8')

/** Nomes de campo dentro de cada `select: { ... }`, inclusive os de selects aninhados (chaves balanceadas). */
function selectedFields(source: string): string[] {
  const fields: string[] = []
  for (const match of source.matchAll(/select:\s*\{/g)) {
    let depth = 1
    let index = (match.index ?? 0) + match[0].length
    const start = index
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1
      else if (source[index] === '}') depth -= 1
      index += 1
    }
    for (const field of source.slice(start, index - 1).matchAll(/(\w+)\s*:/g)) fields.push(field[1])
  }
  return fields.filter((field) => field !== 'select')
}
const relative = (path: string) => path.replace(SRC, 'src').replace(/\\/g, '/')

describe('anúncios × vizinhança de conteúdo: a porta é uma só', () => {
  it('o código de anúncios só importa o serviço e o módulo da vizinhança, nunca o repositório', () => {
    const imports = filesIn(ADS).flatMap((file) =>
      [...read(file).matchAll(/from\s+['"]([^'"]*content-adjacency[^'"]*)['"]/g)].map((match) => ({ file: relative(file), target: match[1] })),
    )
    expect(imports.length).toBeGreaterThan(0)
    for (const { file, target } of imports) {
      expect({ file, target, permitido: /content-adjacency\.(service|module)$/.test(target) }).toEqual({ file, target, permitido: true })
    }
  })

  it('só a entrega de anúncios usa a vizinhança (módulo e serviço)', () => {
    const users = filesIn(ADS)
      .filter((file) => /content-adjacency/.test(read(file)))
      .map(relative)
      .sort()
    expect(users).toEqual(['src/ads/ads-delivery/ads-delivery.module.ts', 'src/ads/ads-delivery/ads-delivery.service.ts'])
  })

  it('nenhum arquivo de anúncios importa os módulos de relatos ou publicações por conta própria', () => {
    const hits = filesIn(ADS).flatMap((file) =>
      [...read(file).matchAll(/from\s+['"]((?:\.\.\/)+(?:reports|posts)\/[^'"]*)['"]/g)].map((match) => `${relative(file)}: ${match[1]}`),
    )
    expect(hits).toEqual([])
  })
})

describe('vizinhança de conteúdo: só ids saem de lá', () => {
  const dir = join(SRC, 'content-adjacency')
  const repository = read(join(dir, 'content-adjacency.repository.ts'))
  const service = read(join(dir, 'content-adjacency.service.ts'))

  it('só toca post, report e branch, e só leitura', () => {
    const delegates = [...repository.matchAll(/this\.prisma\.(\w+)\.(\w+)/g)].map((match) => `${match[1]}.${match[2]}`)
    expect(delegates.length).toBeGreaterThan(0)
    for (const call of delegates) expect(call).toMatch(/^(post|report|branch)\.findMany$/)
  })

  it('cada consulta seleciona só colunas de ligação (nada de texto, autor, voto ou dado de pessoa)', () => {
    const selected = new Set(selectedFields(repository))
    const allowed = new Set(['mentionedReportId', 'quotePost', 'recipientType', 'recipientId', 'companyId'])
    expect([...selected].filter((field) => !allowed.has(field))).toEqual([])
    // As três consultas (publicações, relatos e filiais) precisam ter sido lidas.
    expect(selected).toEqual(new Set(['mentionedReportId', 'quotePost', 'recipientType', 'recipientId', 'companyId']))
  })

  it('o serviço devolve só uma lista de ids de empresas', () => {
    expect(service).toMatch(/companiesTargetedNear\(near: NearbyContent\): Promise<string\[\]>/)
    // nada de autor, texto ou título saindo do módulo
    const personOrText = /\b(authorId|authorUserId|title|description)\b|\.content\b|\bcontent\s*:/
    expect(service).not.toMatch(personOrText)
    expect(repository).not.toMatch(personOrText)
  })
})
