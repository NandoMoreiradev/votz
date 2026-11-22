import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import {
  AD_FEATURE_KEYS,
  AD_INTERESTS,
  AD_PROHIBITED_CATEGORIES,
  AD_SENSITIVE_TOPICS,
  ADS_FEATURE_ALLOWLIST,
  ADS_FORBIDDEN_SOURCES,
  ForbiddenAdFeatureError,
  adFeaturesForConsent,
  ageBandOf,
  ageOn,
  assertAllowedAdFeatures,
  isAdInterestId,
} from '@votz/shared-types'

/**
 * "Muro" de privacidade dos anúncios (seção 3.3 do plano de anúncios). Se um destes testes falhar, NÃO afrouxe o
 * teste: a mudança precisa de aval do dono do produto, revisão do advogado e atualização do RIPD.
 */
describe('anúncios: lista fechada de sinais', () => {
  it('é exatamente a aprovada em 21/11/2026 (mudar exige aval do dono)', () => {
    expect([...AD_FEATURE_KEYS].sort()).toEqual([
      'context.city', 'context.hour', 'context.position', 'context.state', 'context.surface', 'context.weekday',
      'device.platform',
      'user.adEngagement', 'user.ageBand', 'user.city', 'user.declaredInterests', 'user.followedCompanies',
      'user.gender', 'user.neighborhood', 'user.nonSensitiveContentCategories', 'user.state',
    ])
  })

  it('nenhum sinal vem de origem proibida (atividade política, conteúdo livre, mensagens, documentos)', () => {
    const forbidden = new Set<string>(ADS_FORBIDDEN_SOURCES)
    for (const [key, spec] of Object.entries(ADS_FEATURE_ALLOWLIST)) {
      expect({ key, proibido: forbidden.has(spec.source) }).toEqual({ key, proibido: false })
    }
  })

  it('sinal de contexto vale sem aceite; sinal da pessoa só com a personalização ligada', () => {
    const withoutConsent = adFeaturesForConsent(false)
    expect(withoutConsent.every((key) => key.startsWith('context.') || key.startsWith('device.'))).toBe(true)
    expect(adFeaturesForConsent(true)).toHaveLength(AD_FEATURE_KEYS.length)
  })

  it('recusa qualquer atributo fora da lista', () => {
    expect(() => assertAllowedAdFeatures(['user.city', 'context.hour'])).not.toThrow()
    expect(() => assertAllowedAdFeatures(['user.city', 'user.followedPoliticians', 'report.text'])).toThrow(ForbiddenAdFeatureError)
    try {
      assertAllowedAdFeatures(['user.followedPoliticians'])
    } catch (error) {
      expect((error as ForbiddenAdFeatureError).features).toEqual(['user.followedPoliticians'])
    }
  })
})

describe('anúncios: taxonomia e política', () => {
  it('nenhum interesse segmentável é tema sensível', () => {
    const sensitiveWords = /pol[ií]tic|elei|partid|religi|igrej|sa[uú]de|doen|rem[eé]dio|sexual|lgbt|ra[cç]a|[eé]tnic|sindica|crian/i
    for (const interest of AD_INTERESTS) expect({ id: interest.id, sensível: sensitiveWords.test(`${interest.id} ${interest.label}`) }).toEqual({ id: interest.id, sensível: false })
    const ids = AD_INTERESTS.map((interest) => interest.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(isAdInterestId('sports')).toBe(true)
    expect(isAdInterestId('politics')).toBe(false)
  })

  it('temas sensíveis cobrem os da LGPD e menores; política e governo são categorias proibidas', () => {
    expect(AD_SENSITIVE_TOPICS.map((topic) => topic.id)).toEqual(
      expect.arrayContaining(['politics', 'religion', 'health', 'ethnicity', 'sexuality', 'unions', 'genetic-biometric', 'minors']),
    )
    expect(AD_PROHIBITED_CATEGORIES.map((category) => category.id)).toEqual(expect.arrayContaining(['political', 'government', 'gambling']))
  })
})

describe('anúncios: faixa de idade', () => {
  const today = new Date('2026-11-21T12:00:00Z')
  it('calcula a idade pelo aniversário', () => {
    expect(ageOn('2008-11-21', today)).toBe(18)
    expect(ageOn('2008-11-22', today)).toBe(17)
    expect(ageOn('xx', today)).toBeNull()
  })
  it('menor de 18 nunca recebe faixa (sem perfil para publicidade)', () => {
    expect(ageBandOf('2008-11-22', today)).toBeNull()
    expect(ageBandOf('2008-11-21', today)).toBe('18-24')
    expect(ageBandOf('1990-01-01', today)).toBe('35-44')
    expect(ageBandOf('1950-01-01', today)).toBe('65+')
    expect(ageBandOf(null, today)).toBeNull()
  })
})

/**
 * O código de anúncios (API e, no futuro, o servidor de anúncios) não pode consultar tabelas proibidas. Este teste
 * lê os arquivos e falha se aparecer acesso do Prisma a elas. Hoje as pastas podem não existir: o teste já fica
 * pronto para quando o código chegar.
 */
describe('anúncios: o código de anúncios não lê tabelas proibidas', () => {
  const FORBIDDEN_MODELS = [
    'report', 'reportMedia', 'reportFollower', 'reportGroup', 'vote', 'comment', 'proposta', 'propostaVoto', 'propostaTimeline',
    'debate', 'debateQuestion', 'debateMessage', 'debatePoll', 'debatePollVote', 'debateReaction', 'debateParticipant',
    'userPoliticianFollower', 'userEntityFollower', 'userTopicFollower', 'postComment',
    'conversation', 'conversationMember', 'chatAttachment', 'pageConversation', 'pageMessage', 'registrationRequest',
  ]
  const roots = [join(__dirname), join(__dirname, '..', '..', '..', 'ads-server', 'src')]
  const files = (dir: string): string[] =>
    !existsSync(dir)
      ? []
      : readdirSync(dir).flatMap((name) => {
          const path = join(dir, name)
          return statSync(path).isDirectory() ? files(path) : /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [path] : []
        })

  it.each(roots)('nenhum acesso proibido em %s', (root) => {
    const pattern = new RegExp(`\\.(${FORBIDDEN_MODELS.join('|')})\\.(find|count|aggregate|groupBy)`, 'g')
    const hits = files(root).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => `${file}: ${match[0]}`))
    expect(hits).toEqual([])
  })
})
