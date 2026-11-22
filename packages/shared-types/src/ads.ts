/**
 * Anúncios do Votz: Etapa 0 do plano (docs/dev/anuncios-plano-implementacao-2026-11-21.md).
 *
 * Aqui ficam as regras que valem para a API, o site, o celular e os modelos de IA: taxonomia de interesses,
 * temas sensíveis, categorias proibidas e restritas, a LISTA FECHADA de sinais que a IA pode usar, faixas de
 * idade, gênero e o formato dos eventos. Mudar a lista de sinais ou os temas sensíveis exige aval do dono do
 * produto (decisões 1 e 2 do plano) e revisão do advogado.
 */

import {
  AD_MEDIA_MIN_WIDTH,
  AD_VIDEO_MAX_SECONDS,
  type MediaAssetKind,
  type MediaCrop,
  type MediaFormat,
  type MediaItemDto,
} from './media'

// ─── Taxonomia de interesses ───────────────────────────────────────────────────────────────────

/**
 * Interesses que a pessoa pode escolher e que o anunciante pode usar para segmentar. Inspirada nas categorias de
 * primeiro nível da IAB Content Taxonomy 3.0, adaptada ao Brasil e ao Votz. Nenhuma categoria sensível (veja
 * `AD_SENSITIVE_TOPICS`) entra aqui: saúde, política, religião e afins não são interesse segmentável.
 */
export const AD_INTERESTS = [
  { id: 'local-commerce', label: 'Comércio do bairro', group: 'Compras e serviços' },
  { id: 'local-services', label: 'Serviços perto de casa', group: 'Compras e serviços' },
  { id: 'shopping', label: 'Compras e promoções', group: 'Compras e serviços' },
  { id: 'food-drink', label: 'Comida e restaurantes', group: 'Lazer' },
  { id: 'events', label: 'Eventos e shows', group: 'Lazer' },
  { id: 'arts-culture', label: 'Arte e cultura', group: 'Lazer' },
  { id: 'music', label: 'Música', group: 'Lazer' },
  { id: 'movies-tv', label: 'Filmes e séries', group: 'Lazer' },
  { id: 'books', label: 'Livros', group: 'Lazer' },
  { id: 'games', label: 'Jogos eletrônicos', group: 'Lazer' },
  { id: 'travel', label: 'Viagem e turismo', group: 'Lazer' },
  { id: 'sports', label: 'Esportes', group: 'Esporte e bem-estar' },
  { id: 'fitness', label: 'Academia e atividade física', group: 'Esporte e bem-estar' },
  { id: 'style-beauty', label: 'Moda e beleza', group: 'Estilo de vida' },
  { id: 'home-garden', label: 'Casa e jardim', group: 'Estilo de vida' },
  { id: 'pets', label: 'Animais de estimação', group: 'Estilo de vida' },
  { id: 'family-kids', label: 'Família e filhos', group: 'Estilo de vida' },
  { id: 'automotive', label: 'Carros e motos', group: 'Estilo de vida' },
  { id: 'technology', label: 'Tecnologia', group: 'Trabalho e estudo' },
  { id: 'education', label: 'Cursos e educação', group: 'Trabalho e estudo' },
  { id: 'careers', label: 'Empregos e carreira', group: 'Trabalho e estudo' },
  { id: 'small-business', label: 'Pequenos negócios e empreender', group: 'Trabalho e estudo' },
  { id: 'personal-finance', label: 'Finanças pessoais', group: 'Trabalho e estudo' },
  { id: 'real-estate', label: 'Imóveis', group: 'Trabalho e estudo' },
] as const

export type AdInterestId = (typeof AD_INTERESTS)[number]['id']
export const AD_INTEREST_IDS: readonly AdInterestId[] = AD_INTERESTS.map((interest) => interest.id)

export function isAdInterestId(value: unknown): value is AdInterestId {
  return typeof value === 'string' && (AD_INTEREST_IDS as readonly string[]).includes(value)
}

// ─── Temas sensíveis (LGPD art. 5º, II e art. 11; ECA Digital) ─────────────────────────────────

/**
 * Temas que NUNCA viram perfil de ninguém nem segmentação de anúncio. Conteúdo com esses temas também não
 * alimenta os modelos. Base: dado pessoal sensível da LGPD (art. 5º, II) e a proibição de perfilamento para
 * publicidade dirigida a crianças e adolescentes (Lei 15.211/2025).
 */
export const AD_SENSITIVE_TOPICS = [
  { id: 'politics', label: 'Política, eleições, partidos e opinião política' },
  { id: 'religion', label: 'Religião e crenças' },
  { id: 'health', label: 'Saúde, doenças, remédios e tratamentos' },
  { id: 'ethnicity', label: 'Origem racial ou étnica' },
  { id: 'sexuality', label: 'Vida sexual e orientação sexual' },
  { id: 'unions', label: 'Filiação a sindicato ou a organização religiosa, filosófica ou política' },
  { id: 'genetic-biometric', label: 'Dados genéticos e biométricos' },
  { id: 'minors', label: 'Crianças e adolescentes' },
] as const

export type AdSensitiveTopicId = (typeof AD_SENSITIVE_TOPICS)[number]['id']

// ─── Política de anúncios ──────────────────────────────────────────────────────────────────────

/** Nunca aceitos. */
export const AD_PROHIBITED_CATEGORIES = [
  { id: 'political', label: 'Política, eleições, candidatos e partidos' },
  { id: 'government', label: 'Órgãos públicos e publicidade de governo' },
  { id: 'gambling', label: 'Apostas e jogos de azar' },
  { id: 'weapons', label: 'Armas, munição e explosivos' },
  { id: 'tobacco', label: 'Cigarro, vape e produtos de tabaco' },
  { id: 'adult', label: 'Conteúdo adulto' },
  { id: 'predatory-credit', label: 'Crédito com juros abusivos ou promessa de dinheiro fácil' },
  { id: 'health-claims', label: 'Saúde com promessa de cura ou resultado garantido' },
  { id: 'sensitive-targeting', label: 'Anúncio que fala do tema sensível da pessoa (saúde, religião, orientação sexual etc.)' },
] as const

/** Aceitos só com revisão humana. */
export const AD_RESTRICTED_CATEGORIES = [
  { id: 'health', label: 'Saúde (clínicas, farmácias, planos)' },
  { id: 'education', label: 'Educação (cursos, faculdades)' },
  { id: 'finance', label: 'Serviços financeiros' },
  { id: 'real-estate', label: 'Imóveis' },
  { id: 'alcohol', label: 'Bebida alcoólica' },
] as const

export type AdProhibitedCategoryId = (typeof AD_PROHIBITED_CATEGORIES)[number]['id']
export type AdRestrictedCategoryId = (typeof AD_RESTRICTED_CATEGORIES)[number]['id']

/** Limites do Votz (decisão 4 do plano). */
export const AD_DELIVERY_LIMITS = {
  /** No máximo 1 anúncio a cada N itens do feed. */
  FEED_ITEMS_PER_AD: 8,
  /** Fração das pessoas que nunca vê anúncio (grupo de controle). */
  HOLDOUT_SHARE: 0.05,
  /** Menor grupo de pessoas que um relatório ou estimativa de alcance pode mostrar. */
  MIN_AUDIENCE_SIZE: 100,
} as const

/**
 * Vizinhança do espaço de anúncio. Nenhum anúncio aparece perto de relato contra o próprio anunciante: o site e o
 * celular dizem ao servidor quais itens estão em volta do espaço (até 3 antes e 3 depois) e o servidor tira da
 * disputa as empresas que são alvo de relato nesses itens. `MAX_IDS` é o teto de cada lista no pedido.
 */
export const AD_ADJACENCY = { BEFORE: 3, AFTER: 3, MAX_IDS: 8 } as const

/**
 * Ids dos itens do feed ao redor de um espaço de anúncio. `position` é quantos itens vieram antes do espaço, então
 * o espaço fica entre `items[position - 1]` e `items[position]`. Só olha o que já foi carregado.
 */
export function adNeighborIds(items: readonly { id: string }[], position: number): string[] {
  const from = Math.max(0, position - AD_ADJACENCY.BEFORE)
  const to = Math.min(items.length, position + AD_ADJACENCY.AFTER)
  return items.slice(from, to).map((item) => item.id)
}

// ─── Sinais que a IA pode usar (lista fechada) ─────────────────────────────────────────────────

export type AdSignalConsent = 'NONE' | 'PERSONALIZATION'

export interface AdSignalSpec {
  /** Descrição em português simples (aparece no "Por que estou vendo isto?" e na política). */
  label: string
  /** De onde o sinal vem. Nunca de tabela política ou de conteúdo livre. */
  source: string
  /** `NONE`: anúncio por contexto, vale sem aceite. `PERSONALIZATION`: só com a personalização ligada. */
  consent: AdSignalConsent
}

/**
 * ÚNICOS atributos que os modelos e o servidor de anúncios podem usar (seção 3.1 do plano). Um teste falha se
 * aparecer qualquer outro. Para mudar: aval do dono do produto, revisão do advogado e atualização do RIPD.
 */
export const ADS_FEATURE_ALLOWLIST = {
  'context.city': { label: 'Cidade da tela que você está vendo', source: 'pedido do feed', consent: 'NONE' },
  'context.state': { label: 'Estado da tela que você está vendo', source: 'pedido do feed', consent: 'NONE' },
  'context.surface': { label: 'Seção do app (feed, busca)', source: 'pedido do feed', consent: 'NONE' },
  'context.position': { label: 'Posição no feed', source: 'pedido do feed', consent: 'NONE' },
  'context.hour': { label: 'Hora do dia', source: 'pedido do feed', consent: 'NONE' },
  'context.weekday': { label: 'Dia da semana', source: 'pedido do feed', consent: 'NONE' },
  'device.platform': { label: 'Tipo de aparelho (site, Android, iPhone)', source: 'pedido do feed', consent: 'NONE' },
  'user.city': { label: 'Sua cidade no cadastro', source: 'users.city', consent: 'PERSONALIZATION' },
  'user.state': { label: 'Seu estado no cadastro', source: 'users.state', consent: 'PERSONALIZATION' },
  'user.neighborhood': { label: 'Seu bairro no cadastro', source: 'users.neighborhood', consent: 'PERSONALIZATION' },
  'user.ageBand': { label: 'Sua faixa de idade (nunca a data)', source: 'users.birth_date', consent: 'PERSONALIZATION' },
  'user.gender': { label: 'Gênero, se você informou', source: 'users.gender', consent: 'PERSONALIZATION' },
  'user.declaredInterests': { label: 'Interesses que você escolheu', source: 'preferências de anúncios', consent: 'PERSONALIZATION' },
  'user.followedCompanies': { label: 'Empresas que você segue', source: 'company_followers', consent: 'PERSONALIZATION' },
  'user.adEngagement': { label: 'Anúncios que você viu, tocou ou escondeu', source: 'eventos de anúncio', consent: 'PERSONALIZATION' },
  'user.nonSensitiveContentCategories': { label: 'Categorias não sensíveis de conteúdo com que você interagiu', source: 'classificador de sensibilidade', consent: 'PERSONALIZATION' },
} as const satisfies Record<string, AdSignalSpec>

export type AdFeatureKey = keyof typeof ADS_FEATURE_ALLOWLIST
export const AD_FEATURE_KEYS = Object.keys(ADS_FEATURE_ALLOWLIST) as AdFeatureKey[]

/**
 * Origens que NUNCA podem alimentar anúncios (seção 3.2 do plano): atividade política, conteúdo livre,
 * mensagens, documentos. Usado pelo teste do muro e pela revisão de código.
 */
export const ADS_FORBIDDEN_SOURCES = [
  'politician_followers', 'entity_followers', 'reports', 'report_media', 'votes', 'comments', 'proposta_votos',
  'propostas', 'debates', 'debate_questions', 'debate_messages', 'debate_poll_votes', 'posts.content',
  'post_comments', 'conversations', 'conversation_members', 'chat_attachments', 'page_messages',
  'registration_requests', 'users.cpf', 'users.latitude', 'users.longitude', 'users.street', 'users.zip_code',
] as const

export class ForbiddenAdFeatureError extends Error {
  constructor(public readonly features: string[]) {
    super(`Atributo fora da lista permitida para anúncios: ${features.join(', ')}`)
    this.name = 'ForbiddenAdFeatureError'
  }
}

/** Confere uma lista de atributos (do treino ou do servidor de anúncios). Lança erro se algum não for permitido. */
export function assertAllowedAdFeatures(features: readonly string[]): void {
  const forbidden = features.filter((feature) => !(feature in ADS_FEATURE_ALLOWLIST))
  if (forbidden.length) throw new ForbiddenAdFeatureError(forbidden)
}

/** Atributos que valem para quem NÃO ligou a personalização (só contexto). */
export function adFeaturesForConsent(personalization: boolean): AdFeatureKey[] {
  return AD_FEATURE_KEYS.filter((key) => personalization || ADS_FEATURE_ALLOWLIST[key].consent === 'NONE')
}

// ─── Idade e gênero (decisão 3: opcionais no cadastro) ─────────────────────────────────────────

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const
export type AgeBand = (typeof AGE_BANDS)[number]

/** Idade completa em anos numa data (fuso de São Paulo não importa aqui: a data de nascimento é só dia). */
export function ageOn(birthDate: string | Date, today: Date = new Date()): number | null {
  const iso = typeof birthDate === 'string' ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  let age = today.getUTCFullYear() - year
  const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day)
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 150 ? age : null
}

/**
 * Faixa de idade para anúncios. Menor de 18 (ou data inválida) devolve null: sem perfil para publicidade
 * (ECA Digital), mesmo que o cadastro já exija 18 anos.
 */
export function ageBandOf(birthDate: string | Date | null | undefined, today: Date = new Date()): AgeBand | null {
  if (!birthDate) return null
  const age = ageOn(birthDate, today)
  if (age === null || age < 18) return null
  if (age <= 24) return '18-24'
  if (age <= 34) return '25-34'
  if (age <= 44) return '35-44'
  if (age <= 54) return '45-54'
  if (age <= 64) return '55-64'
  return '65+'
}

export const USER_GENDERS = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'] as const
export type UserGender = (typeof USER_GENDERS)[number]
export const USER_GENDER_LABELS: Record<UserGender, string> = {
  FEMALE: 'Mulher',
  MALE: 'Homem',
  OTHER: 'Outro',
  UNDISCLOSED: 'Prefiro não dizer',
}

/** Texto curto que explica para que servem data de nascimento e gênero (mesmo no site e no celular). */
export const PROFILE_DEMOGRAPHICS_PURPOSE =
  'Opcional. Usamos só para mostrar anúncios mais adequados, se você permitir. Não aparece no seu perfil.'

// ─── Preferências de anúncios (tela da pessoa, seção 3.4 do plano) ─────────────────────────────

/** Versão do texto do aceite. Muda quando o texto ou os sinais usados mudarem: aí o aceite antigo deixa de valer. */
export const AD_PERSONALIZATION_CONSENT_VERSION = '2026-11-21'
/** Quantos interesses a pessoa pode escolher. */
export const AD_MAX_DECLARED_INTERESTS = 10

/** O que a API devolve para a tela "Preferências de anúncios". Idade só como faixa, nunca a data. */
export interface AdPreferencesView {
  personalizationConsent: boolean
  consentAt: string | null
  interests: AdInterestId[]
  ageBand: AgeBand | null
  gender: UserGender | null
}

/** O que a tela manda. Campo ausente não muda. */
export interface UpdateAdPreferencesInput {
  personalizationConsent?: boolean
  interests?: AdInterestId[]
}

/** Textos da tela, iguais no site e no celular (português simples, sem juridiquês). */
export const AD_PREFERENCES_COPY = {
  title: 'Preferências de anúncios',
  intro: 'O Votz mostra anúncios de empresas. Aqui você decide se eles podem ser escolhidos pelo que você gosta.',
  toggleLabel: 'Anúncios mais adequados a mim',
  toggleOff: 'Desligado. Você vê só anúncios da sua cidade e da tela em que está. Nada sobre você é usado.',
  toggleOn: 'Ligado. Usamos só o que está na lista abaixo para escolher anúncios. Você pode desligar quando quiser.',
  usedTitle: 'O que usamos, só se você ligar',
  usedItems: [
    'Sua cidade, estado e bairro do cadastro',
    'Sua faixa de idade e seu gênero, se você informou (nunca a data de nascimento)',
    'Os interesses que você escolher aqui',
    'As empresas que você segue',
    'Os anúncios que você viu, tocou ou escondeu',
  ],
  neverTitle: 'O que nunca usamos',
  neverItems: [
    'Seus relatos, apoios, votos, comentários e debates',
    'Os políticos e órgãos públicos que você segue',
    'Suas conversas (só você e quem conversa com você conseguem ler)',
    'Seu CPF, seu endereço e sua localização exata',
    'Temas como política, religião, saúde e outros dados sensíveis',
  ],
  interestsTitle: 'Seus interesses',
  interestsHint: 'Escolha até 10. Eles só são usados se a opção acima estiver ligada.',
  interestsLimit: 'Você já escolheu 10 interesses. Tire um para escolher outro.',
  demographicsHint: 'Faixa de idade e gênero vêm do seu perfil. Para mudar, edite seu perfil.',
  saved: 'Preferências salvas.',
  saveError: 'Não foi possível salvar agora. Tente de novo.',
} as const

// ─── Plataforma do anunciante (Estúdio, Etapa 1) ───────────────────────────────────────────────

export const AD_OBJECTIVES = ['AWARENESS', 'TRAFFIC', 'CONVERSIONS'] as const
export type AdObjective = (typeof AD_OBJECTIVES)[number]
export const AD_OBJECTIVE_LABELS: Record<AdObjective, { label: string; hint: string; billing: string }> = {
  AWARENESS: { label: 'Ser conhecido', hint: 'Mostrar sua marca para o maior número de pessoas da região.', billing: 'Cobrado a cada mil exibições' },
  TRAFFIC: { label: 'Levar pessoas ao seu site', hint: 'Mostrar para quem tem mais chance de tocar no anúncio.', billing: 'Cobrado por clique' },
  CONVERSIONS: { label: 'Vender ou receber contatos', hint: 'Mostrar para quem tem mais chance de comprar ou chamar você.', billing: 'Cobrado a cada mil exibições' },
}

export const AD_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'] as const
export type AdStatus = (typeof AD_STATUSES)[number]
export const AD_STATUS_LABELS: Record<AdStatus, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativa', PAUSED: 'Pausada', ARCHIVED: 'Arquivada' }

export const AD_REVIEW_STATUSES = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'] as const
export type AdReviewStatus = (typeof AD_REVIEW_STATUSES)[number]
export const AD_REVIEW_STATUS_LABELS: Record<AdReviewStatus, string> = {
  NOT_SUBMITTED: 'Não enviado',
  PENDING: 'Em revisão',
  APPROVED: 'Aprovado',
  REJECTED: 'Recusado',
}

/** Limites do formulário (o servidor confere de novo). */
export const AD_LIMITS = {
  NAME_MAX: 80,
  HEADLINE_MAX: 60,
  BODY_MAX: 280,
  CTA_MAX: 20,
  URL_MAX: 500,
  /** Orçamento diário mínimo: R$ 6,00. */
  MIN_DAILY_BUDGET_CENTS: 600,
  /** Orçamento diário máximo por conjunto na fase de teste: R$ 10.000,00. */
  MAX_DAILY_BUDGET_CENTS: 1_000_000,
  MAX_STATES: 27,
  MAX_CITIES: 50,
} as const

/** Textos de botão que o anunciante pode escolher (sem texto livre, para não virar isca). */
export const AD_CTA_LABELS = ['Saiba mais', 'Comprar', 'Pedir agora', 'Agendar', 'Falar no WhatsApp', 'Ver cardápio', 'Inscrever-se', 'Ver oferta'] as const
export type AdCtaLabel = (typeof AD_CTA_LABELS)[number]

export interface AdAccountView {
  id: string
  companyId: string
  name: string
  currency: string
  timezone: string
  balanceCents: number
  createdAt: string
}

/**
 * Foto ou vídeo do anúncio: mesmas molduras das publicações (1:1, 4:5, 16:9), com exigências a mais (plano do padrão
 * de mídia, seção 2.3). Quem confere é a API; o site usa a mesma função para avisar antes de enviar.
 */
export const AD_MEDIA_RULES = {
  MIN_WIDTH: AD_MEDIA_MIN_WIDTH,
  MAX_VIDEO_SECONDS: AD_VIDEO_MAX_SECONDS,
  /** Formatos que o Votz recomenda ao anunciante (o paisagem também vale). */
  RECOMMENDED_FORMATS: ['SQUARE', 'PORTRAIT'] as const,
  /** Quanto o vídeo pode passar de 60 s por arredondamento da leitura do arquivo. */
  DURATION_TOLERANCE_MS: 500,
} as const

export interface AdMediaCheckInput {
  kind: MediaAssetKind
  /** Largura em pixels: do arquivo inteiro (`scope: 'file'`) ou só da parte que aparece depois do recorte (`'crop'`). */
  width: number
  durationMs?: number | null
  scope: 'file' | 'crop'
}

/** Mensagem para o anunciante (português simples) ou null se a mídia serve para anúncio. */
export function adMediaProblem(input: AdMediaCheckInput): string | null {
  const noun = input.kind === 'VIDEO' ? 'vídeo' : 'foto'
  if (input.kind === 'GIF') return 'GIF ainda não vale em anúncio. Use uma foto ou um vídeo.'
  if (input.width < AD_MEDIA_RULES.MIN_WIDTH - 1) {
    return input.scope === 'file'
      ? `${input.kind === 'VIDEO' ? 'Esse vídeo é pequeno' : 'Essa foto é pequena'} demais para anúncio. Use ${input.kind === 'VIDEO' ? 'um' : 'uma'} com pelo menos ${AD_MEDIA_RULES.MIN_WIDTH} px de largura.`
      : `Com esse enquadramento, a parte mostrada fica pequena demais para anúncio (mínimo de ${AD_MEDIA_RULES.MIN_WIDTH} px de largura). Afaste ${input.kind === 'VIDEO' ? 'o' : 'a'} ${noun} ou escolha um arquivo maior.`
  }
  if (input.kind === 'VIDEO' && input.durationMs != null && input.durationMs > AD_MEDIA_RULES.MAX_VIDEO_SECONDS * 1000 + AD_MEDIA_RULES.DURATION_TOLERANCE_MS) {
    return `O vídeo do anúncio pode ter até ${AD_MEDIA_RULES.MAX_VIDEO_SECONDS} segundos.`
  }
  return null
}

export interface AdCreativeView {
  id: string
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
  /** Foto ou vídeo do anúncio; null se o anúncio é só texto. */
  media: MediaItemDto | null
}

export interface AdView {
  id: string
  name: string
  status: AdStatus
  reviewStatus: AdReviewStatus
  reviewNote: string | null
  creative: AdCreativeView
}

export interface AdSetView {
  id: string
  name: string
  status: AdStatus
  dailyBudgetCents: number
  bidCapCents: number | null
  startAt: string
  endAt: string | null
  states: string[]
  cities: string[]
  interests: AdInterestId[]
  ageBands: AgeBand[]
  genders: UserGender[]
  automaticAudience: boolean
  ads: AdView[]
}

export interface AdCampaignView {
  id: string
  name: string
  objective: AdObjective
  status: AdStatus
  createdAt: string
  adSets: AdSetView[]
}

/** Passo a passo "Criar campanha": objetivo → público e orçamento → criativo → revisão. Cria tudo como rascunho. */
export interface CreateAdCampaignInput {
  name: string
  objective: AdObjective
  adSet: {
    name: string
    dailyBudgetCents: number
    bidCapCents?: number | null
    startAt: string
    endAt?: string | null
    states: string[]
    cities: string[]
    interests: AdInterestId[]
    ageBands: AgeBand[]
    genders: UserGender[]
    automaticAudience: boolean
  }
  creative: {
    headline: string
    body: string
    ctaLabel: AdCtaLabel
    destinationUrl: string
    /** Arquivo enviado pelo Estúdio (`POST .../media`) com a moldura e o enquadramento escolhidos. */
    media?: { id: string; format: MediaFormat; crop?: MediaCrop }
  }
  /** Já manda o anúncio para revisão ao salvar. */
  submitForReview?: boolean
}

// ─── Revisão de anúncios (fila da moderação) ───────────────────────────────────────────────────

export const AD_REVIEW_LIMITS = { REASON_MIN: 10, REASON_MAX: 500 } as const

/** Um anúncio na fila de revisão, com tudo o que quem revisa precisa ver. */
/** Parecer da IA sobre o anúncio, mostrado ao moderador (nunca ao anunciante). */
export interface AdAiAnalysisView {
  /** Categoria de interesse sugerida (id de `AD_INTERESTS`). */
  category: string | null
  /** Categoria restrita detectada (id de `AD_RESTRICTED_CATEGORIES`). */
  restricted: string | null
  /** Categorias proibidas suspeitas, com a confiança de 0 a 1. */
  violations: { id: string; confidence: number }[]
  sensitive: boolean
  confidence: number
  explanation: string
  autoApproved: boolean
  /** O que a IA leu da mídia: a foto, quadros do vídeo com ou sem o som, "não deu para ler" ou nada (anúncio só de texto). */
  mediaScope: AdAiMediaScope | null
  /** O que se vê na foto ou nos quadros do vídeo, em poucas palavras. */
  mediaSummary: string | null
  /** Texto escrito dentro da foto ou do vídeo, como a IA leu. */
  mediaText: string | null
  /** O que a IA ouviu no áudio do vídeo (falado ou cantado). Nulo se não ouviu, ou se só havia música e silêncio. */
  audioText: string | null
  createdAt: string
}

/**
 * IMAGE: a foto. VIDEO_FRAMES_AUDIO: quadros do vídeo e o som. VIDEO_FRAMES: quadros, mas o som não deu para ouvir.
 * VIDEO_SILENT: quadros de um vídeo sem som. UNREADABLE: tinha foto ou vídeo, mas não deu para ler.
 */
export type AdAiMediaScope = 'IMAGE' | 'VIDEO_FRAMES_AUDIO' | 'VIDEO_FRAMES' | 'VIDEO_SILENT' | 'UNREADABLE'

/** Última conferência da página para onde o botão do anúncio leva. */
export interface AdLandingCheckView {
  status: 'OK' | 'BAD_STATUS' | 'UNREACHABLE' | 'BLOCKED'
  httpStatus: number | null
  /** Site em que o link terminou, depois dos redirecionamentos. */
  finalHost: string | null
  problems: string[]
  checkedAt: string
}

export const AD_LANDING_STATUS_LABELS = {
  OK: 'A página abre normalmente',
  BAD_STATUS: 'A página responde com erro',
  UNREACHABLE: 'A página não abriu',
  BLOCKED: 'O link leva para um endereço não permitido',
} as const

export const AD_LANDING_PROBLEM_LABELS: Record<string, string> = {
  REDIRECT_OFF_SITE: 'Leva para outro site, diferente do que está no link',
  TOO_MANY_REDIRECTS: 'Passa por redirecionamentos demais',
  REDIRECT_TO_HTTP: 'Passa por um endereço sem https',
  BLOCKED_DOMAIN: 'Passa por um domínio bloqueado ou de órgão público',
  PRIVATE_ADDRESS: 'Aponta para um endereço interno',
}

export interface AdReviewQueueItem {
  /** Conferência da página de destino; nula enquanto não foi feita. */
  landing: AdLandingCheckView | null
  adId: string
  reviewStatus: AdReviewStatus
  submittedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
  company: { id: string; name: string; verified: boolean }
  accountName: string
  campaignName: string
  objective: AdObjective
  creative: AdCreativeView
  audience: { states: string[]; cities: string[]; interests: AdInterestId[]; ageBands: AgeBand[]; genders: UserGender[]; automaticAudience: boolean }
  dailyBudgetCents: number
  /** Última leitura da IA, ou null se ainda não houve (ou a IA está desligada). */
  aiAnalysis: AdAiAnalysisView | null
  /** Decisões anteriores sobre este anúncio (mais recente primeiro). */
  history: { decision: AdReviewStatus; reason: string | null; source: 'HUMAN' | 'AI'; reviewerName: string | null; createdAt: string }[]
}

export interface AdReviewQueueResponse {
  data: AdReviewQueueItem[]
  meta: { total: number; pendingCount: number; page: number; limit: number; totalPages: number }
}

export interface AdReviewDecisionInput {
  decision: 'APPROVED' | 'REJECTED'
  /**
   * O `submittedAt` do anúncio como a tela mostrava. Se o anunciante mudou o anúncio depois, o servidor recusa a decisão
   * (a pessoa não aprova um texto que não leu).
   */
  expectedSubmittedAt?: string | null
  /** Obrigatório ao recusar (o anunciante lê este motivo). */
  reason?: string
}

// ─── Faturamento: saldo pré-pago ───────────────────────────────────────────────────────────────

export const AD_TOPUP_METHODS = ['PIX', 'BOLETO', 'CARD'] as const
export type AdTopUpMethod = (typeof AD_TOPUP_METHODS)[number]
export const AD_TOPUP_METHOD_LABELS: Record<AdTopUpMethod, string> = { PIX: 'Pix', BOLETO: 'Boleto', CARD: 'Cartão de crédito' }

export const AD_TOPUP_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELED'] as const
export type AdTopUpStatus = (typeof AD_TOPUP_STATUSES)[number]
export const AD_TOPUP_STATUS_LABELS: Record<AdTopUpStatus, string> = {
  PENDING: 'Aguardando pagamento',
  PAID: 'Pago',
  EXPIRED: 'Venceu',
  CANCELED: 'Cancelado',
}

/** Limites de uma recarga (em centavos). */
export const AD_BILLING_LIMITS = {
  /** Recarga mínima: R$ 20,00. */
  MIN_TOPUP_CENTS: 2_000,
  /** Recarga máxima por pedido na fase de teste: R$ 10.000,00. */
  MAX_TOPUP_CENTS: 1_000_000,
  /** Quanto tempo o Pix ou o boleto vale: 3 dias. */
  TOPUP_VALID_HOURS: 72,
} as const

/** "test": recarga de teste, sem chamar serviço externo. "live": Asaas (Pix e boleto) e Stripe (cartão). */
export type AdBillingMode = 'test' | 'live'

export interface AdTopUpView {
  id: string
  amountCents: number
  method: AdTopUpMethod
  status: AdTopUpStatus
  /** Pix copia e cola ou linha digitável do boleto. */
  paymentCode: string | null
  checkoutUrl: string | null
  expiresAt: string
  paidAt: string | null
  createdAt: string
}

export const AD_LEDGER_TYPE_LABELS = { TOPUP: 'Recarga', SPEND: 'Gasto com anúncios', REFUND: 'Devolução', ADJUSTMENT: 'Ajuste' } as const
export type AdLedgerEntryType = keyof typeof AD_LEDGER_TYPE_LABELS

/** Uma linha do extrato: o que entrou ou saiu do saldo do anunciante. */
export interface AdStatementLine {
  id: string
  type: AdLedgerEntryType
  description: string
  /** Positivo entra no saldo, negativo sai. */
  amountCents: number
  balanceAfterCents: number
  createdAt: string
}

export interface AdBillingView {
  account: AdAccountView
  mode: AdBillingMode
  /** Formas de pagamento que estão disponíveis agora. */
  methods: AdTopUpMethod[]
  limits: { minTopUpCents: number; maxTopUpCents: number }
  topUps: AdTopUpView[]
  statement: AdStatementLine[]
  /** O saldo da conta bate com a soma do livro-caixa. Se for falso, há erro de contabilidade e o suporte precisa olhar. */
  reconciled: boolean
}

// ─── Eventos de anúncio ────────────────────────────────────────────────────────────────────────

export const AD_EVENT_TYPES = ['REQUEST', 'IMPRESSION', 'VIEWABLE_IMPRESSION', 'CLICK', 'HIDE', 'HIDE_ADVERTISER', 'REPORT', 'CONVERSION'] as const
export type AdEventType = (typeof AD_EVENT_TYPES)[number]

/** Exibição só conta como vista com metade do card na tela por 1 segundo (padrão de mercado). */
export const AD_VIEWABILITY = { MIN_VISIBLE_RATIO: 0.5, MIN_VISIBLE_MS: 1000 } as const

export const AD_SURFACES = ['FEED_FOR_YOU', 'FEED_RECENT', 'FEED_CITY'] as const
export type AdSurface = (typeof AD_SURFACES)[number]

/**
 * Evento que o site e o celular mandam (em lote) para `POST /ads/events`. O `eventId` é gerado no aparelho e
 * evita contar duas vezes; o servidor confere a sessão, a ordem (clique sem exibição não conta) e o antifraude.
 * Sem dado pessoal: quem é a pessoa vem da sessão, nunca do corpo do evento.
 */
export interface AdClientEvent {
  eventId: string
  type: Exclude<AdEventType, 'REQUEST' | 'CONVERSION'>
  /** Identificador da exibição, devolvido junto com o anúncio. Liga exibição, visibilidade, clique e esconder. */
  impressionId: string
  adId: string
  surface: AdSurface
  position: number
  /** Momento no aparelho (ISO). O servidor guarda também a hora em que recebeu. */
  occurredAt: string
  /** Só em VIEWABLE_IMPRESSION: quanto tempo ficou visível. */
  visibleMs?: number
}

export const AD_CONVERSION_EVENT_NAMES = ['PURCHASE', 'LEAD', 'SIGNUP', 'CONTACT', 'OTHER'] as const
export type AdConversionEventName = (typeof AD_CONVERSION_EVENT_NAMES)[number]

/**
 * Conversão enviada pelo anunciante (API de conversões, `POST /ads/conversions`): só o identificador do clique
 * (`votz_click_id`, que o Votz põe no link do anúncio), o que aconteceu e quando. Nada da pessoa.
 */
export interface AdConversionEvent {
  clickId: string
  eventName: AdConversionEventName
  /** Valor em centavos (opcional; só faz sentido para compra). */
  valueCents?: number
  occurredAt: string
  /** Para não contar a mesma conversão duas vezes. Vale por conta de anúncios. */
  dedupeKey: string
}

/** Janela de atribuição: conversão até 7 dias depois do clique. */
export const AD_ATTRIBUTION_WINDOW_DAYS = 7

export const AD_CONVERSIONS = {
  /** Eventos por chamada. */
  MAX_BATCH: 100,
  /** Conversões que um mesmo clique pode ter (várias compras, sim; milhares, não). */
  MAX_PER_CLICK: 20,
  /** Maior valor aceito por conversão: R$ 1.000.000,00. */
  MAX_VALUE_CENTS: 100_000_000,
  /** Chaves ativas por conta de anúncios. */
  MAX_ACTIVE_KEYS: 5,
  /** O relógio do anunciante pode errar um pouco para o futuro. */
  MAX_CLOCK_SKEW_MS: 5 * 60_000,
  KEY_PREFIX: 'vzc_',
  /** Nome do parâmetro que o Votz põe no link do anunciante. */
  CLICK_PARAM: 'votz_click_id',
  /** Tamanho do identificador do clique (16 bytes em base64url). */
  CLICK_TOKEN_LENGTH: 22,
} as const

export type AdConversionRejection = 'UNKNOWN_CLICK' | 'OUTSIDE_WINDOW' | 'IN_THE_FUTURE' | 'TOO_MANY_FOR_CLICK'

export type AdConversionOutcome =
  | { dedupeKey: string; status: 'ACCEPTED' }
  | { dedupeKey: string; status: 'DUPLICATE' }
  | { dedupeKey: string; status: 'REJECTED'; reason: AdConversionRejection }

export interface AdConversionsResult {
  accepted: number
  duplicates: number
  rejected: number
  results: AdConversionOutcome[]
}

/** Chave de conversões como o Estúdio mostra (nunca com o segredo inteiro). */
export interface AdConversionKeyView {
  id: string
  name: string
  /** Começo da chave, para reconhecer qual é. */
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** Resposta de criar a chave: o segredo aparece só desta vez. */
export interface AdConversionKeyCreated extends AdConversionKeyView {
  key: string
}
/** Lote máximo de eventos por envio do aparelho. */
export const AD_EVENTS_MAX_BATCH = 50

// ─── Preço, antifraude e entrega (Etapa 2) ─────────────────────────────────────────────────────

/**
 * Dinheiro dos anúncios corre em MILÉSIMOS DE CENTAVO ("millicents") durante a cobrança, para o preço por mil
 * exibições fechar exato: R$ 6,00 por mil exibições (600 centavos) custa 600 millicents por exibição. O livro-caixa
 * só recebe centavos inteiros: o resto fica acumulado na conta até completar um centavo.
 */
export const MILLICENTS_PER_CENT = 1000

/**
 * Preços mínimos (valores de partida; mudar é decisão do dono do produto). Reconhecimento e Conversões pagam por mil
 * exibições visíveis (CPM); Tráfego paga por clique (CPC). O lance do conjunto é o máximo que o anunciante paga.
 */
export const AD_PRICING = {
  /** R$ 6,00 por mil exibições visíveis. */
  MIN_CPM_CENTS: 600,
  /** R$ 0,40 por clique. */
  MIN_CPC_CENTS: 40,
} as const

/** Regras de entrega do Votz (valem para qualquer anunciante). */
export const AD_DELIVERY = {
  /** Quantas vezes a mesma pessoa vê o mesmo anúncio em 24 horas. */
  MAX_IMPRESSIONS_PER_USER_AD_DAY: 3,
  /** Depois deste prazo a exibição não aceita mais eventos (visível, clique). */
  IMPRESSION_EVENT_TTL_HOURS: 24,
} as const

/** Antifraude da primeira versão: regras simples e transparentes. Tráfego inválido nunca é cobrado. */
export const AD_FRAUD = {
  /** Clique antes disso depois da exibição é de robô. */
  MIN_CLICK_DELAY_MS: 300,
  /** Cliques cobrados da mesma pessoa no mesmo anúncio por dia. */
  MAX_BILLED_CLICKS_PER_USER_AD_DAY: 2,
  /** O relógio do aparelho pode errar um pouco, mas não tanto. */
  MAX_CLOCK_SKEW_MS: 5 * 60_000,
} as const

export type AdInvalidReason =
  | 'IMPRESSION_UNKNOWN'
  | 'IMPRESSION_EXPIRED'
  | 'NOT_VIEWABLE'
  | 'CLICK_TOO_FAST'
  | 'TOO_MANY_CLICKS'
  | 'CLOCK_SKEW'
  | 'DUPLICATE_ACTION'

export function adChargeUnit(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS'): 'VIEWABLE_IMPRESSION' | 'CLICK' {
  return objective === 'TRAFFIC' ? 'CLICK' : 'VIEWABLE_IMPRESSION'
}

/** Preço mínimo, em centavos, da unidade cobrada (mil exibições visíveis ou um clique). */
export function adFloorCents(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS'): number {
  return adChargeUnit(objective) === 'CLICK' ? AD_PRICING.MIN_CPC_CENTS : AD_PRICING.MIN_CPM_CENTS
}

/** Quanto custa UMA exibição visível (CPM) ou UM clique (CPC), em millicents, dado o preço em centavos da unidade. */
export function adChargeMillicents(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS', priceCents: number): number {
  return adChargeUnit(objective) === 'CLICK' ? priceCents * MILLICENTS_PER_CENT : priceCents
}

/** O anúncio como o feed mostra. Nunca leva dado do anunciante além da página dele; nunca leva o alvo escolhido. */
export interface SponsoredAdView {
  /** Identifica esta exibição; volta em todos os eventos (visível, clique, esconder). */
  impressionId: string
  adId: string
  headline: string
  body: string
  ctaLabel: string
  destinationUrl: string
  /**
   * O que o botão abre: passa pelo Votz (`votz.app/c/<id>`), que leva ao `destinationUrl` com o `votz_click_id` no
   * link. É isso que deixa o anunciante contar conversões sem rastrear a pessoa.
   */
  clickUrl: string
  /** Foto ou vídeo já pronto para desenhar (só chega anúncio com a mídia processada); null se é só texto. */
  media: MediaItemDto | null
  advertiser: { id: string; name: string; username: string | null; logoUrl: string | null }
  /** "Por que estou vendo isto?" em português simples. */
  why: string
}

export interface AdEventsResult {
  accepted: number
  duplicates: number
  rejected: number
}

/** Uma linha do relatório diário de um anúncio. */
export interface AdDailyStatView {
  day: string
  impressions: number
  viewableImpressions: number
  clicks: number
  hides: number
  spendCents: number
  /** Conversões que o anunciante contou para os cliques deste dia (API de conversões). */
  conversions: number
  /** Soma dos valores das conversões, em centavos. */
  conversionValueCents: number
}

// ─── Relatório do anunciante ───────────────────────────────────────────────────────────────────

export const AD_REPORT_PERIODS = [7, 30, 90] as const
export type AdReportPeriod = (typeof AD_REPORT_PERIODS)[number]

export interface AdReportTotals {
  impressions: number
  viewableImpressions: number
  clicks: number
  hides: number
  spendCents: number
  conversions: number
  conversionValueCents: number
  /** Custo por conversão, em centavos. Nulo se não houve conversão. */
  cpaCents: number | null
  /** Cliques sobre exibições vistas, em %. Nulo se ninguém viu ainda. */
  ctrPercent: number | null
  /** Custo por mil exibições vistas, em centavos. */
  cpmCents: number | null
  /** Custo por clique, em centavos. */
  cpcCents: number | null
}

export function summarizeAdStats(rows: readonly AdDailyStatView[]): AdReportTotals {
  const sum = (pick: (row: AdDailyStatView) => number) => rows.reduce((total, row) => total + pick(row), 0)
  const impressions = sum((row) => row.impressions)
  const viewableImpressions = sum((row) => row.viewableImpressions)
  const clicks = sum((row) => row.clicks)
  const hides = sum((row) => row.hides)
  const spendCents = sum((row) => row.spendCents)
  const conversions = sum((row) => row.conversions)
  return {
    impressions,
    viewableImpressions,
    clicks,
    hides,
    spendCents,
    conversions,
    conversionValueCents: sum((row) => row.conversionValueCents),
    cpaCents: conversions > 0 ? Math.round(spendCents / conversions) : null,
    ctrPercent: viewableImpressions > 0 ? Math.round((clicks / viewableImpressions) * 10_000) / 100 : null,
    cpmCents: viewableImpressions > 0 ? Math.round((spendCents / viewableImpressions) * 1000) : null,
    cpcCents: clicks > 0 ? Math.round(spendCents / clicks) : null,
  }
}

/** Completa com zeros os dias sem movimento, do mais antigo até `today` ("AAAA-MM-DD"), para o gráfico não pular dia. */
export function fillAdStatDays(rows: readonly AdDailyStatView[], days: number, today: string): AdDailyStatView[] {
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const end = new Date(`${today}T00:00:00.000Z`).getTime()
  const result: AdDailyStatView[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(end - offset * 86_400_000).toISOString().slice(0, 10)
    result.push(byDay.get(day) ?? { day, impressions: 0, viewableImpressions: 0, clicks: 0, hides: 0, spendCents: 0, conversions: 0, conversionValueCents: 0 })
  }
  return result
}

// ─── Biblioteca pública de anúncios ────────────────────────────────────────────────────────────
// Transparência: qualquer pessoa vê quem pagou, o texto, o período, as regiões e FAIXAS de gasto e de exibições.
// Nunca leva o público escolhido (interesses, idade, gênero), lance, preço nem dado de pessoa.

export const AD_LIBRARY = {
  /** Anúncio que parou de rodar continua na biblioteca por este tempo. */
  RETENTION_MONTHS: 12,
  PAGE_SIZE: 24,
  MAX_PAGE_SIZE: 48,
  SEARCH_MAX: 80,
} as const

export interface AdRangeBand {
  /** Limite de baixo (incluso). */
  min: number
  /** Limite de cima (excluso); nulo na última faixa ("mais de..."). */
  max: number | null
  label: string
}

/** Faixas de gasto, em centavos. Ninguém vê o valor exato: só em qual faixa o anúncio caiu. */
const SPEND_BAND_LIMITS_CENTS = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000] as const
/** Faixas de exibições. */
const IMPRESSION_BAND_LIMITS = [0, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000] as const

// Milhar com ponto, sem depender do ICU do aparelho (o Hermes do celular nem sempre tem pt-BR).
const count = (value: number) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const brl = (cents: number) => `R$ ${count(cents / 100)}`

function buildBands(limits: readonly number[], format: (value: number) => string, below: string, above: string): AdRangeBand[] {
  return limits.map((min, index) => {
    const max = index + 1 < limits.length ? limits[index + 1] : null
    const label = index === 0 ? below.replace('{max}', format(max as number)) : max === null ? above.replace('{min}', format(min)) : `${format(min)} a ${format(max)}`
    return { min, max, label }
  })
}

export const AD_SPEND_BANDS: readonly AdRangeBand[] = buildBands(SPEND_BAND_LIMITS_CENTS, brl, 'Menos de {max}', 'Mais de {min}')
export const AD_IMPRESSION_BANDS: readonly AdRangeBand[] = buildBands(IMPRESSION_BAND_LIMITS, count, 'Menos de {max}', 'Mais de {min}')

function bandOf(bands: readonly AdRangeBand[], value: number): AdRangeBand {
  const safe = Number.isFinite(value) && value > 0 ? value : 0
  for (let index = bands.length - 1; index >= 0; index -= 1) if (safe >= bands[index].min) return bands[index]
  return bands[0]
}

export const adSpendBand = (spendCents: number): AdRangeBand => bandOf(AD_SPEND_BANDS, spendCents)
export const adImpressionBand = (impressions: number): AdRangeBand => bandOf(AD_IMPRESSION_BANDS, impressions)

export interface AdLibraryItem {
  adId: string
  /** Quem pagou o anúncio. */
  advertiser: { id: string; name: string; username: string | null; logoUrl: string | null; verified: boolean }
  headline: string
  body: string
  ctaLabel: string
  /** Só o endereço do site (ex.: padaria.com.br), sem caminho nem parâmetros. */
  destinationHost: string | null
  media: MediaItemDto | null
  /** Está rodando agora (campanha ligada, no período, com saldo). */
  active: boolean
  /** "AAAA-MM-DD". */
  startedOn: string
  /** Dia em que acaba ou acabou; nulo se não tem data para acabar. */
  endsOn: string | null
  /** Estados e cidades onde a empresa escolheu mostrar; vazio = todo o Brasil. */
  states: string[]
  cities: string[]
  spend: AdRangeBand
  impressions: AdRangeBand
}

export interface AdLibraryResponse {
  data: AdLibraryItem[]
  meta: { page: number; limit: number; hasMore: boolean }
}

/** Só o domínio do destino (para a biblioteca mostrar para onde o anúncio leva, sem entregar parâmetros). */
export function adDestinationHost(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

// ─── Tráfego inválido (antifraude) ─────────────────────────────────────────────────────────────

export const AD_FRAUD_SIGNAL_LABELS = {
  CTR_ABNORMAL: 'Taxa de cliques muito acima do normal',
  CLICKS_WITHOUT_VIEW: 'Cliques sem o anúncio ter sido visto antes',
} as const
export type AdFraudSignal = keyof typeof AD_FRAUD_SIGNAL_LABELS

export type AdFraudStatus = 'OPEN' | 'CONFIRMED' | 'DISMISSED'
export type AdFraudLevel = 'REVIEW' | 'EXTREME'

/** Um caso de tráfego suspeito na fila da moderação: um anúncio num dia. */
export interface AdFraudFlagItem {
  id: string
  status: AdFraudStatus
  level: AdFraudLevel
  /** "AAAA-MM-DD" (fuso de São Paulo). */
  day: string
  signals: AdFraudSignal[]
  viewable: number
  clicks: number
  clicksWithoutView: number
  invalidClicks: number
  /** Taxa de cliques do dia, em %. Nulo se ninguém viu. */
  ctrPercent: number | null
  /** Já devolvido ao anunciante, em centavos. */
  creditedCents: number
  pausedAd: boolean
  ad: { id: string; name: string; headline: string; status: AdStatus }
  campaignName: string
  objective: AdObjective
  company: { id: string; name: string }
  resolvedAt: string | null
  resolutionNote: string | null
  createdAt: string
}

export interface AdFraudQueueResponse {
  data: AdFraudFlagItem[]
  meta: { total: number; openCount: number; page: number; limit: number; totalPages: number }
}

export interface AdFraudResolveInput {
  resolution: 'CONFIRMED' | 'DISMISSED'
  note?: string
}

// ─── Editar anúncio, público e orçamento; duplicar campanha ────────────────────────────────────

/** Só o que veio no corpo muda. Mudar o texto, o botão ou o link de anúncio aprovado ou em revisão manda de volta para revisão. */
export interface UpdateAdInput {
  headline?: string
  body?: string
  ctaLabel?: AdCtaLabel
  destinationUrl?: string
}

/** Público e orçamento do conjunto. A data de início não muda depois de criada. Não precisa de nova revisão. */
export interface UpdateAdSetInput {
  name?: string
  dailyBudgetCents?: number
  bidCapCents?: number | null
  endAt?: string | null
  states?: string[]
  cities?: string[]
  interests?: AdInterestId[]
  ageBands?: AgeBand[]
  genders?: UserGender[]
  automaticAudience?: boolean
}

export const AD_EDIT_COPY = {
  REVIEW_AGAIN: 'Ao salvar, o anúncio volta para a revisão e para de rodar até ser aprovado de novo.',
  REVIEW_PENDING: 'O anúncio já está em revisão. Ao salvar, a moderação passa a ver o anúncio novo.',
  DUPLICATE_NO_MEDIA: 'A cópia não leva a foto ou o vídeo: envie de novo ao editar o anúncio.',
} as const
