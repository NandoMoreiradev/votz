"use strict";
/**
 * Anúncios do Votz: Etapa 0 do plano (docs/dev/anuncios-plano-implementacao-2026-11-21.md).
 *
 * Aqui ficam as regras que valem para a API, o site, o celular e os modelos de IA: taxonomia de interesses,
 * temas sensíveis, categorias proibidas e restritas, a LISTA FECHADA de sinais que a IA pode usar, faixas de
 * idade, gênero e o formato dos eventos. Mudar a lista de sinais ou os temas sensíveis exige aval do dono do
 * produto (decisões 1 e 2 do plano) e revisão do advogado.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adSpendBand = exports.AD_IMPRESSION_BANDS = exports.AD_SPEND_BANDS = exports.AD_LIBRARY = exports.AD_REPORT_PERIODS = exports.AD_FRAUD = exports.AD_DELIVERY = exports.AD_PRICING = exports.MILLICENTS_PER_CENT = exports.AD_EVENTS_MAX_BATCH = exports.AD_CONVERSIONS = exports.AD_ATTRIBUTION_WINDOW_DAYS = exports.AD_CONVERSION_EVENT_NAMES = exports.AD_SURFACES = exports.AD_VIEWABILITY = exports.AD_EVENT_TYPES = exports.AD_LEDGER_TYPE_LABELS = exports.AD_BILLING_LIMITS = exports.AD_TOPUP_STATUS_LABELS = exports.AD_TOPUP_STATUSES = exports.AD_TOPUP_METHOD_LABELS = exports.AD_TOPUP_METHODS = exports.AD_REVIEW_LIMITS = exports.AD_MEDIA_RULES = exports.AD_CTA_LABELS = exports.AD_LIMITS = exports.AD_REVIEW_STATUS_LABELS = exports.AD_REVIEW_STATUSES = exports.AD_STATUS_LABELS = exports.AD_STATUSES = exports.AD_OBJECTIVE_LABELS = exports.AD_OBJECTIVES = exports.AD_PREFERENCES_COPY = exports.AD_MAX_DECLARED_INTERESTS = exports.AD_PERSONALIZATION_CONSENT_VERSION = exports.PROFILE_DEMOGRAPHICS_PURPOSE = exports.USER_GENDER_LABELS = exports.USER_GENDERS = exports.AGE_BANDS = exports.ForbiddenAdFeatureError = exports.ADS_FORBIDDEN_SOURCES = exports.AD_FEATURE_KEYS = exports.ADS_FEATURE_ALLOWLIST = exports.AD_ADJACENCY = exports.AD_DELIVERY_LIMITS = exports.AD_RESTRICTED_CATEGORIES = exports.AD_PROHIBITED_CATEGORIES = exports.AD_SENSITIVE_TOPICS = exports.AD_INTEREST_IDS = exports.AD_INTERESTS = void 0;
exports.AD_FRAUD_SIGNAL_LABELS = exports.adImpressionBand = void 0;
exports.isAdInterestId = isAdInterestId;
exports.adNeighborIds = adNeighborIds;
exports.assertAllowedAdFeatures = assertAllowedAdFeatures;
exports.adFeaturesForConsent = adFeaturesForConsent;
exports.ageOn = ageOn;
exports.ageBandOf = ageBandOf;
exports.adMediaProblem = adMediaProblem;
exports.adChargeUnit = adChargeUnit;
exports.adFloorCents = adFloorCents;
exports.adChargeMillicents = adChargeMillicents;
exports.summarizeAdStats = summarizeAdStats;
exports.fillAdStatDays = fillAdStatDays;
exports.adDestinationHost = adDestinationHost;
const media_1 = require("./media");
// ─── Taxonomia de interesses ───────────────────────────────────────────────────────────────────
/**
 * Interesses que a pessoa pode escolher e que o anunciante pode usar para segmentar. Inspirada nas categorias de
 * primeiro nível da IAB Content Taxonomy 3.0, adaptada ao Brasil e ao Votz. Nenhuma categoria sensível (veja
 * `AD_SENSITIVE_TOPICS`) entra aqui: saúde, política, religião e afins não são interesse segmentável.
 */
exports.AD_INTERESTS = [
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
];
exports.AD_INTEREST_IDS = exports.AD_INTERESTS.map((interest) => interest.id);
function isAdInterestId(value) {
    return typeof value === 'string' && exports.AD_INTEREST_IDS.includes(value);
}
// ─── Temas sensíveis (LGPD art. 5º, II e art. 11; ECA Digital) ─────────────────────────────────
/**
 * Temas que NUNCA viram perfil de ninguém nem segmentação de anúncio. Conteúdo com esses temas também não
 * alimenta os modelos. Base: dado pessoal sensível da LGPD (art. 5º, II) e a proibição de perfilamento para
 * publicidade dirigida a crianças e adolescentes (Lei 15.211/2025).
 */
exports.AD_SENSITIVE_TOPICS = [
    { id: 'politics', label: 'Política, eleições, partidos e opinião política' },
    { id: 'religion', label: 'Religião e crenças' },
    { id: 'health', label: 'Saúde, doenças, remédios e tratamentos' },
    { id: 'ethnicity', label: 'Origem racial ou étnica' },
    { id: 'sexuality', label: 'Vida sexual e orientação sexual' },
    { id: 'unions', label: 'Filiação a sindicato ou a organização religiosa, filosófica ou política' },
    { id: 'genetic-biometric', label: 'Dados genéticos e biométricos' },
    { id: 'minors', label: 'Crianças e adolescentes' },
];
// ─── Política de anúncios ──────────────────────────────────────────────────────────────────────
/** Nunca aceitos. */
exports.AD_PROHIBITED_CATEGORIES = [
    { id: 'political', label: 'Política, eleições, candidatos e partidos' },
    { id: 'government', label: 'Órgãos públicos e publicidade de governo' },
    { id: 'gambling', label: 'Apostas e jogos de azar' },
    { id: 'weapons', label: 'Armas, munição e explosivos' },
    { id: 'tobacco', label: 'Cigarro, vape e produtos de tabaco' },
    { id: 'adult', label: 'Conteúdo adulto' },
    { id: 'predatory-credit', label: 'Crédito com juros abusivos ou promessa de dinheiro fácil' },
    { id: 'health-claims', label: 'Saúde com promessa de cura ou resultado garantido' },
    { id: 'sensitive-targeting', label: 'Anúncio que fala do tema sensível da pessoa (saúde, religião, orientação sexual etc.)' },
];
/** Aceitos só com revisão humana. */
exports.AD_RESTRICTED_CATEGORIES = [
    { id: 'health', label: 'Saúde (clínicas, farmácias, planos)' },
    { id: 'education', label: 'Educação (cursos, faculdades)' },
    { id: 'finance', label: 'Serviços financeiros' },
    { id: 'real-estate', label: 'Imóveis' },
    { id: 'alcohol', label: 'Bebida alcoólica' },
];
/** Limites do Votz (decisão 4 do plano). */
exports.AD_DELIVERY_LIMITS = {
    /** No máximo 1 anúncio a cada N itens do feed. */
    FEED_ITEMS_PER_AD: 8,
    /** Fração das pessoas que nunca vê anúncio (grupo de controle). */
    HOLDOUT_SHARE: 0.05,
    /** Menor grupo de pessoas que um relatório ou estimativa de alcance pode mostrar. */
    MIN_AUDIENCE_SIZE: 100,
};
/**
 * Vizinhança do espaço de anúncio. Nenhum anúncio aparece perto de relato contra o próprio anunciante: o site e o
 * celular dizem ao servidor quais itens estão em volta do espaço (até 3 antes e 3 depois) e o servidor tira da
 * disputa as empresas que são alvo de relato nesses itens. `MAX_IDS` é o teto de cada lista no pedido.
 */
exports.AD_ADJACENCY = { BEFORE: 3, AFTER: 3, MAX_IDS: 8 };
/**
 * Ids dos itens do feed ao redor de um espaço de anúncio. `position` é quantos itens vieram antes do espaço, então
 * o espaço fica entre `items[position - 1]` e `items[position]`. Só olha o que já foi carregado.
 */
function adNeighborIds(items, position) {
    const from = Math.max(0, position - exports.AD_ADJACENCY.BEFORE);
    const to = Math.min(items.length, position + exports.AD_ADJACENCY.AFTER);
    return items.slice(from, to).map((item) => item.id);
}
/**
 * ÚNICOS atributos que os modelos e o servidor de anúncios podem usar (seção 3.1 do plano). Um teste falha se
 * aparecer qualquer outro. Para mudar: aval do dono do produto, revisão do advogado e atualização do RIPD.
 */
exports.ADS_FEATURE_ALLOWLIST = {
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
};
exports.AD_FEATURE_KEYS = Object.keys(exports.ADS_FEATURE_ALLOWLIST);
/**
 * Origens que NUNCA podem alimentar anúncios (seção 3.2 do plano): atividade política, conteúdo livre,
 * mensagens, documentos. Usado pelo teste do muro e pela revisão de código.
 */
exports.ADS_FORBIDDEN_SOURCES = [
    'politician_followers', 'entity_followers', 'reports', 'report_media', 'votes', 'comments', 'proposta_votos',
    'propostas', 'debates', 'debate_questions', 'debate_messages', 'debate_poll_votes', 'posts.content',
    'post_comments', 'conversations', 'conversation_members', 'chat_attachments', 'page_messages',
    'registration_requests', 'users.cpf', 'users.latitude', 'users.longitude', 'users.street', 'users.zip_code',
];
class ForbiddenAdFeatureError extends Error {
    features;
    constructor(features) {
        super(`Atributo fora da lista permitida para anúncios: ${features.join(', ')}`);
        this.features = features;
        this.name = 'ForbiddenAdFeatureError';
    }
}
exports.ForbiddenAdFeatureError = ForbiddenAdFeatureError;
/** Confere uma lista de atributos (do treino ou do servidor de anúncios). Lança erro se algum não for permitido. */
function assertAllowedAdFeatures(features) {
    const forbidden = features.filter((feature) => !(feature in exports.ADS_FEATURE_ALLOWLIST));
    if (forbidden.length)
        throw new ForbiddenAdFeatureError(forbidden);
}
/** Atributos que valem para quem NÃO ligou a personalização (só contexto). */
function adFeaturesForConsent(personalization) {
    return exports.AD_FEATURE_KEYS.filter((key) => personalization || exports.ADS_FEATURE_ALLOWLIST[key].consent === 'NONE');
}
// ─── Idade e gênero (decisão 3: opcionais no cadastro) ─────────────────────────────────────────
exports.AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
/** Idade completa em anos numa data (fuso de São Paulo não importa aqui: a data de nascimento é só dia). */
function ageOn(birthDate, today = new Date()) {
    const iso = typeof birthDate === 'string' ? birthDate.slice(0, 10) : birthDate.toISOString().slice(0, 10);
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match)
        return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    let age = today.getUTCFullYear() - year;
    const beforeBirthday = today.getUTCMonth() + 1 < month || (today.getUTCMonth() + 1 === month && today.getUTCDate() < day);
    if (beforeBirthday)
        age -= 1;
    return age >= 0 && age < 150 ? age : null;
}
/**
 * Faixa de idade para anúncios. Menor de 18 (ou data inválida) devolve null: sem perfil para publicidade
 * (ECA Digital), mesmo que o cadastro já exija 18 anos.
 */
function ageBandOf(birthDate, today = new Date()) {
    if (!birthDate)
        return null;
    const age = ageOn(birthDate, today);
    if (age === null || age < 18)
        return null;
    if (age <= 24)
        return '18-24';
    if (age <= 34)
        return '25-34';
    if (age <= 44)
        return '35-44';
    if (age <= 54)
        return '45-54';
    if (age <= 64)
        return '55-64';
    return '65+';
}
exports.USER_GENDERS = ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'];
exports.USER_GENDER_LABELS = {
    FEMALE: 'Mulher',
    MALE: 'Homem',
    OTHER: 'Outro',
    UNDISCLOSED: 'Prefiro não dizer',
};
/** Texto curto que explica para que servem data de nascimento e gênero (mesmo no site e no celular). */
exports.PROFILE_DEMOGRAPHICS_PURPOSE = 'Opcional. Usamos só para mostrar anúncios mais adequados, se você permitir. Não aparece no seu perfil.';
// ─── Preferências de anúncios (tela da pessoa, seção 3.4 do plano) ─────────────────────────────
/** Versão do texto do aceite. Muda quando o texto ou os sinais usados mudarem: aí o aceite antigo deixa de valer. */
exports.AD_PERSONALIZATION_CONSENT_VERSION = '2026-11-21';
/** Quantos interesses a pessoa pode escolher. */
exports.AD_MAX_DECLARED_INTERESTS = 10;
/** Textos da tela, iguais no site e no celular (português simples, sem juridiquês). */
exports.AD_PREFERENCES_COPY = {
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
};
// ─── Plataforma do anunciante (Estúdio, Etapa 1) ───────────────────────────────────────────────
exports.AD_OBJECTIVES = ['AWARENESS', 'TRAFFIC', 'CONVERSIONS'];
exports.AD_OBJECTIVE_LABELS = {
    AWARENESS: { label: 'Ser conhecido', hint: 'Mostrar sua marca para o maior número de pessoas da região.', billing: 'Cobrado a cada mil exibições' },
    TRAFFIC: { label: 'Levar pessoas ao seu site', hint: 'Mostrar para quem tem mais chance de tocar no anúncio.', billing: 'Cobrado por clique' },
    CONVERSIONS: { label: 'Vender ou receber contatos', hint: 'Mostrar para quem tem mais chance de comprar ou chamar você.', billing: 'Cobrado a cada mil exibições' },
};
exports.AD_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
exports.AD_STATUS_LABELS = { DRAFT: 'Rascunho', ACTIVE: 'Ativa', PAUSED: 'Pausada', ARCHIVED: 'Arquivada' };
exports.AD_REVIEW_STATUSES = ['NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'];
exports.AD_REVIEW_STATUS_LABELS = {
    NOT_SUBMITTED: 'Não enviado',
    PENDING: 'Em revisão',
    APPROVED: 'Aprovado',
    REJECTED: 'Recusado',
};
/** Limites do formulário (o servidor confere de novo). */
exports.AD_LIMITS = {
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
};
/** Textos de botão que o anunciante pode escolher (sem texto livre, para não virar isca). */
exports.AD_CTA_LABELS = ['Saiba mais', 'Comprar', 'Pedir agora', 'Agendar', 'Falar no WhatsApp', 'Ver cardápio', 'Inscrever-se', 'Ver oferta'];
/**
 * Foto ou vídeo do anúncio: mesmas molduras das publicações (1:1, 4:5, 16:9), com exigências a mais (plano do padrão
 * de mídia, seção 2.3). Quem confere é a API; o site usa a mesma função para avisar antes de enviar.
 */
exports.AD_MEDIA_RULES = {
    MIN_WIDTH: media_1.AD_MEDIA_MIN_WIDTH,
    MAX_VIDEO_SECONDS: media_1.AD_VIDEO_MAX_SECONDS,
    /** Formatos que o Votz recomenda ao anunciante (o paisagem também vale). */
    RECOMMENDED_FORMATS: ['SQUARE', 'PORTRAIT'],
    /** Quanto o vídeo pode passar de 60 s por arredondamento da leitura do arquivo. */
    DURATION_TOLERANCE_MS: 500,
};
/** Mensagem para o anunciante (português simples) ou null se a mídia serve para anúncio. */
function adMediaProblem(input) {
    const noun = input.kind === 'VIDEO' ? 'vídeo' : 'foto';
    if (input.kind === 'GIF')
        return 'GIF ainda não vale em anúncio. Use uma foto ou um vídeo.';
    if (input.width < exports.AD_MEDIA_RULES.MIN_WIDTH - 1) {
        return input.scope === 'file'
            ? `${input.kind === 'VIDEO' ? 'Esse vídeo é pequeno' : 'Essa foto é pequena'} demais para anúncio. Use ${input.kind === 'VIDEO' ? 'um' : 'uma'} com pelo menos ${exports.AD_MEDIA_RULES.MIN_WIDTH} px de largura.`
            : `Com esse enquadramento, a parte mostrada fica pequena demais para anúncio (mínimo de ${exports.AD_MEDIA_RULES.MIN_WIDTH} px de largura). Afaste ${input.kind === 'VIDEO' ? 'o' : 'a'} ${noun} ou escolha um arquivo maior.`;
    }
    if (input.kind === 'VIDEO' && input.durationMs != null && input.durationMs > exports.AD_MEDIA_RULES.MAX_VIDEO_SECONDS * 1000 + exports.AD_MEDIA_RULES.DURATION_TOLERANCE_MS) {
        return `O vídeo do anúncio pode ter até ${exports.AD_MEDIA_RULES.MAX_VIDEO_SECONDS} segundos.`;
    }
    return null;
}
// ─── Revisão de anúncios (fila da moderação) ───────────────────────────────────────────────────
exports.AD_REVIEW_LIMITS = { REASON_MIN: 10, REASON_MAX: 500 };
// ─── Faturamento: saldo pré-pago ───────────────────────────────────────────────────────────────
exports.AD_TOPUP_METHODS = ['PIX', 'BOLETO', 'CARD'];
exports.AD_TOPUP_METHOD_LABELS = { PIX: 'Pix', BOLETO: 'Boleto', CARD: 'Cartão de crédito' };
exports.AD_TOPUP_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELED'];
exports.AD_TOPUP_STATUS_LABELS = {
    PENDING: 'Aguardando pagamento',
    PAID: 'Pago',
    EXPIRED: 'Venceu',
    CANCELED: 'Cancelado',
};
/** Limites de uma recarga (em centavos). */
exports.AD_BILLING_LIMITS = {
    /** Recarga mínima: R$ 20,00. */
    MIN_TOPUP_CENTS: 2_000,
    /** Recarga máxima por pedido na fase de teste: R$ 10.000,00. */
    MAX_TOPUP_CENTS: 1_000_000,
    /** Quanto tempo o Pix ou o boleto vale: 3 dias. */
    TOPUP_VALID_HOURS: 72,
};
exports.AD_LEDGER_TYPE_LABELS = { TOPUP: 'Recarga', SPEND: 'Gasto com anúncios', REFUND: 'Devolução', ADJUSTMENT: 'Ajuste' };
// ─── Eventos de anúncio ────────────────────────────────────────────────────────────────────────
exports.AD_EVENT_TYPES = ['REQUEST', 'IMPRESSION', 'VIEWABLE_IMPRESSION', 'CLICK', 'HIDE', 'HIDE_ADVERTISER', 'REPORT', 'CONVERSION'];
/** Exibição só conta como vista com metade do card na tela por 1 segundo (padrão de mercado). */
exports.AD_VIEWABILITY = { MIN_VISIBLE_RATIO: 0.5, MIN_VISIBLE_MS: 1000 };
exports.AD_SURFACES = ['FEED_FOR_YOU', 'FEED_RECENT', 'FEED_CITY'];
exports.AD_CONVERSION_EVENT_NAMES = ['PURCHASE', 'LEAD', 'SIGNUP', 'CONTACT', 'OTHER'];
/** Janela de atribuição: conversão até 7 dias depois do clique. */
exports.AD_ATTRIBUTION_WINDOW_DAYS = 7;
exports.AD_CONVERSIONS = {
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
};
/** Lote máximo de eventos por envio do aparelho. */
exports.AD_EVENTS_MAX_BATCH = 50;
// ─── Preço, antifraude e entrega (Etapa 2) ─────────────────────────────────────────────────────
/**
 * Dinheiro dos anúncios corre em MILÉSIMOS DE CENTAVO ("millicents") durante a cobrança, para o preço por mil
 * exibições fechar exato: R$ 6,00 por mil exibições (600 centavos) custa 600 millicents por exibição. O livro-caixa
 * só recebe centavos inteiros: o resto fica acumulado na conta até completar um centavo.
 */
exports.MILLICENTS_PER_CENT = 1000;
/**
 * Preços mínimos (valores de partida; mudar é decisão do dono do produto). Reconhecimento e Conversões pagam por mil
 * exibições visíveis (CPM); Tráfego paga por clique (CPC). O lance do conjunto é o máximo que o anunciante paga.
 */
exports.AD_PRICING = {
    /** R$ 6,00 por mil exibições visíveis. */
    MIN_CPM_CENTS: 600,
    /** R$ 0,40 por clique. */
    MIN_CPC_CENTS: 40,
};
/** Regras de entrega do Votz (valem para qualquer anunciante). */
exports.AD_DELIVERY = {
    /** Quantas vezes a mesma pessoa vê o mesmo anúncio em 24 horas. */
    MAX_IMPRESSIONS_PER_USER_AD_DAY: 3,
    /** Depois deste prazo a exibição não aceita mais eventos (visível, clique). */
    IMPRESSION_EVENT_TTL_HOURS: 24,
};
/** Antifraude da primeira versão: regras simples e transparentes. Tráfego inválido nunca é cobrado. */
exports.AD_FRAUD = {
    /** Clique antes disso depois da exibição é de robô. */
    MIN_CLICK_DELAY_MS: 300,
    /** Cliques cobrados da mesma pessoa no mesmo anúncio por dia. */
    MAX_BILLED_CLICKS_PER_USER_AD_DAY: 2,
    /** O relógio do aparelho pode errar um pouco, mas não tanto. */
    MAX_CLOCK_SKEW_MS: 5 * 60_000,
};
function adChargeUnit(objective) {
    return objective === 'TRAFFIC' ? 'CLICK' : 'VIEWABLE_IMPRESSION';
}
/** Preço mínimo, em centavos, da unidade cobrada (mil exibições visíveis ou um clique). */
function adFloorCents(objective) {
    return adChargeUnit(objective) === 'CLICK' ? exports.AD_PRICING.MIN_CPC_CENTS : exports.AD_PRICING.MIN_CPM_CENTS;
}
/** Quanto custa UMA exibição visível (CPM) ou UM clique (CPC), em millicents, dado o preço em centavos da unidade. */
function adChargeMillicents(objective, priceCents) {
    return adChargeUnit(objective) === 'CLICK' ? priceCents * exports.MILLICENTS_PER_CENT : priceCents;
}
// ─── Relatório do anunciante ───────────────────────────────────────────────────────────────────
exports.AD_REPORT_PERIODS = [7, 30, 90];
function summarizeAdStats(rows) {
    const sum = (pick) => rows.reduce((total, row) => total + pick(row), 0);
    const impressions = sum((row) => row.impressions);
    const viewableImpressions = sum((row) => row.viewableImpressions);
    const clicks = sum((row) => row.clicks);
    const hides = sum((row) => row.hides);
    const spendCents = sum((row) => row.spendCents);
    const conversions = sum((row) => row.conversions);
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
    };
}
/** Completa com zeros os dias sem movimento, do mais antigo até `today` ("AAAA-MM-DD"), para o gráfico não pular dia. */
function fillAdStatDays(rows, days, today) {
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const end = new Date(`${today}T00:00:00.000Z`).getTime();
    const result = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = new Date(end - offset * 86_400_000).toISOString().slice(0, 10);
        result.push(byDay.get(day) ?? { day, impressions: 0, viewableImpressions: 0, clicks: 0, hides: 0, spendCents: 0, conversions: 0, conversionValueCents: 0 });
    }
    return result;
}
// ─── Biblioteca pública de anúncios ────────────────────────────────────────────────────────────
// Transparência: qualquer pessoa vê quem pagou, o texto, o período, as regiões e FAIXAS de gasto e de exibições.
// Nunca leva o público escolhido (interesses, idade, gênero), lance, preço nem dado de pessoa.
exports.AD_LIBRARY = {
    /** Anúncio que parou de rodar continua na biblioteca por este tempo. */
    RETENTION_MONTHS: 12,
    PAGE_SIZE: 24,
    MAX_PAGE_SIZE: 48,
    SEARCH_MAX: 80,
};
/** Faixas de gasto, em centavos. Ninguém vê o valor exato: só em qual faixa o anúncio caiu. */
const SPEND_BAND_LIMITS_CENTS = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000];
/** Faixas de exibições. */
const IMPRESSION_BAND_LIMITS = [0, 1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000];
// Milhar com ponto, sem depender do ICU do aparelho (o Hermes do celular nem sempre tem pt-BR).
const count = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const brl = (cents) => `R$ ${count(cents / 100)}`;
function buildBands(limits, format, below, above) {
    return limits.map((min, index) => {
        const max = index + 1 < limits.length ? limits[index + 1] : null;
        const label = index === 0 ? below.replace('{max}', format(max)) : max === null ? above.replace('{min}', format(min)) : `${format(min)} a ${format(max)}`;
        return { min, max, label };
    });
}
exports.AD_SPEND_BANDS = buildBands(SPEND_BAND_LIMITS_CENTS, brl, 'Menos de {max}', 'Mais de {min}');
exports.AD_IMPRESSION_BANDS = buildBands(IMPRESSION_BAND_LIMITS, count, 'Menos de {max}', 'Mais de {min}');
function bandOf(bands, value) {
    const safe = Number.isFinite(value) && value > 0 ? value : 0;
    for (let index = bands.length - 1; index >= 0; index -= 1)
        if (safe >= bands[index].min)
            return bands[index];
    return bands[0];
}
const adSpendBand = (spendCents) => bandOf(exports.AD_SPEND_BANDS, spendCents);
exports.adSpendBand = adSpendBand;
const adImpressionBand = (impressions) => bandOf(exports.AD_IMPRESSION_BANDS, impressions);
exports.adImpressionBand = adImpressionBand;
/** Só o domínio do destino (para a biblioteca mostrar para onde o anúncio leva, sem entregar parâmetros). */
function adDestinationHost(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
            return null;
        return parsed.hostname.replace(/^www\./, '');
    }
    catch {
        return null;
    }
}
// ─── Tráfego inválido (antifraude) ─────────────────────────────────────────────────────────────
exports.AD_FRAUD_SIGNAL_LABELS = {
    CTR_ABNORMAL: 'Taxa de cliques muito acima do normal',
    CLICKS_WITHOUT_VIEW: 'Cliques sem o anúncio ter sido visto antes',
};
//# sourceMappingURL=ads.js.map