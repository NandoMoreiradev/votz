/**
 * Anúncios do Votz: Etapa 0 do plano (docs/dev/anuncios-plano-implementacao-2026-11-21.md).
 *
 * Aqui ficam as regras que valem para a API, o site, o celular e os modelos de IA: taxonomia de interesses,
 * temas sensíveis, categorias proibidas e restritas, a LISTA FECHADA de sinais que a IA pode usar, faixas de
 * idade, gênero e o formato dos eventos. Mudar a lista de sinais ou os temas sensíveis exige aval do dono do
 * produto (decisões 1 e 2 do plano) e revisão do advogado.
 */
import { type MediaAssetKind, type MediaCrop, type MediaFormat, type MediaItemDto } from './media';
/**
 * Interesses que a pessoa pode escolher e que o anunciante pode usar para segmentar. Inspirada nas categorias de
 * primeiro nível da IAB Content Taxonomy 3.0, adaptada ao Brasil e ao Votz. Nenhuma categoria sensível (veja
 * `AD_SENSITIVE_TOPICS`) entra aqui: saúde, política, religião e afins não são interesse segmentável.
 */
export declare const AD_INTERESTS: readonly [{
    readonly id: "local-commerce";
    readonly label: "Comércio do bairro";
    readonly group: "Compras e serviços";
}, {
    readonly id: "local-services";
    readonly label: "Serviços perto de casa";
    readonly group: "Compras e serviços";
}, {
    readonly id: "shopping";
    readonly label: "Compras e promoções";
    readonly group: "Compras e serviços";
}, {
    readonly id: "food-drink";
    readonly label: "Comida e restaurantes";
    readonly group: "Lazer";
}, {
    readonly id: "events";
    readonly label: "Eventos e shows";
    readonly group: "Lazer";
}, {
    readonly id: "arts-culture";
    readonly label: "Arte e cultura";
    readonly group: "Lazer";
}, {
    readonly id: "music";
    readonly label: "Música";
    readonly group: "Lazer";
}, {
    readonly id: "movies-tv";
    readonly label: "Filmes e séries";
    readonly group: "Lazer";
}, {
    readonly id: "books";
    readonly label: "Livros";
    readonly group: "Lazer";
}, {
    readonly id: "games";
    readonly label: "Jogos eletrônicos";
    readonly group: "Lazer";
}, {
    readonly id: "travel";
    readonly label: "Viagem e turismo";
    readonly group: "Lazer";
}, {
    readonly id: "sports";
    readonly label: "Esportes";
    readonly group: "Esporte e bem-estar";
}, {
    readonly id: "fitness";
    readonly label: "Academia e atividade física";
    readonly group: "Esporte e bem-estar";
}, {
    readonly id: "style-beauty";
    readonly label: "Moda e beleza";
    readonly group: "Estilo de vida";
}, {
    readonly id: "home-garden";
    readonly label: "Casa e jardim";
    readonly group: "Estilo de vida";
}, {
    readonly id: "pets";
    readonly label: "Animais de estimação";
    readonly group: "Estilo de vida";
}, {
    readonly id: "family-kids";
    readonly label: "Família e filhos";
    readonly group: "Estilo de vida";
}, {
    readonly id: "automotive";
    readonly label: "Carros e motos";
    readonly group: "Estilo de vida";
}, {
    readonly id: "technology";
    readonly label: "Tecnologia";
    readonly group: "Trabalho e estudo";
}, {
    readonly id: "education";
    readonly label: "Cursos e educação";
    readonly group: "Trabalho e estudo";
}, {
    readonly id: "careers";
    readonly label: "Empregos e carreira";
    readonly group: "Trabalho e estudo";
}, {
    readonly id: "small-business";
    readonly label: "Pequenos negócios e empreender";
    readonly group: "Trabalho e estudo";
}, {
    readonly id: "personal-finance";
    readonly label: "Finanças pessoais";
    readonly group: "Trabalho e estudo";
}, {
    readonly id: "real-estate";
    readonly label: "Imóveis";
    readonly group: "Trabalho e estudo";
}];
export type AdInterestId = (typeof AD_INTERESTS)[number]['id'];
export declare const AD_INTEREST_IDS: readonly AdInterestId[];
export declare function isAdInterestId(value: unknown): value is AdInterestId;
/**
 * Temas que NUNCA viram perfil de ninguém nem segmentação de anúncio. Conteúdo com esses temas também não
 * alimenta os modelos. Base: dado pessoal sensível da LGPD (art. 5º, II) e a proibição de perfilamento para
 * publicidade dirigida a crianças e adolescentes (Lei 15.211/2025).
 */
export declare const AD_SENSITIVE_TOPICS: readonly [{
    readonly id: "politics";
    readonly label: "Política, eleições, partidos e opinião política";
}, {
    readonly id: "religion";
    readonly label: "Religião e crenças";
}, {
    readonly id: "health";
    readonly label: "Saúde, doenças, remédios e tratamentos";
}, {
    readonly id: "ethnicity";
    readonly label: "Origem racial ou étnica";
}, {
    readonly id: "sexuality";
    readonly label: "Vida sexual e orientação sexual";
}, {
    readonly id: "unions";
    readonly label: "Filiação a sindicato ou a organização religiosa, filosófica ou política";
}, {
    readonly id: "genetic-biometric";
    readonly label: "Dados genéticos e biométricos";
}, {
    readonly id: "minors";
    readonly label: "Crianças e adolescentes";
}];
export type AdSensitiveTopicId = (typeof AD_SENSITIVE_TOPICS)[number]['id'];
/** Nunca aceitos. */
export declare const AD_PROHIBITED_CATEGORIES: readonly [{
    readonly id: "political";
    readonly label: "Política, eleições, candidatos e partidos";
}, {
    readonly id: "government";
    readonly label: "Órgãos públicos e publicidade de governo";
}, {
    readonly id: "gambling";
    readonly label: "Apostas e jogos de azar";
}, {
    readonly id: "weapons";
    readonly label: "Armas, munição e explosivos";
}, {
    readonly id: "tobacco";
    readonly label: "Cigarro, vape e produtos de tabaco";
}, {
    readonly id: "adult";
    readonly label: "Conteúdo adulto";
}, {
    readonly id: "predatory-credit";
    readonly label: "Crédito com juros abusivos ou promessa de dinheiro fácil";
}, {
    readonly id: "health-claims";
    readonly label: "Saúde com promessa de cura ou resultado garantido";
}, {
    readonly id: "sensitive-targeting";
    readonly label: "Anúncio que fala do tema sensível da pessoa (saúde, religião, orientação sexual etc.)";
}];
/** Aceitos só com revisão humana. */
export declare const AD_RESTRICTED_CATEGORIES: readonly [{
    readonly id: "health";
    readonly label: "Saúde (clínicas, farmácias, planos)";
}, {
    readonly id: "education";
    readonly label: "Educação (cursos, faculdades)";
}, {
    readonly id: "finance";
    readonly label: "Serviços financeiros";
}, {
    readonly id: "real-estate";
    readonly label: "Imóveis";
}, {
    readonly id: "alcohol";
    readonly label: "Bebida alcoólica";
}];
export type AdProhibitedCategoryId = (typeof AD_PROHIBITED_CATEGORIES)[number]['id'];
export type AdRestrictedCategoryId = (typeof AD_RESTRICTED_CATEGORIES)[number]['id'];
/** Limites do Votz (decisão 4 do plano). */
export declare const AD_DELIVERY_LIMITS: {
    /** No máximo 1 anúncio a cada N itens do feed. */
    readonly FEED_ITEMS_PER_AD: 8;
    /** Fração das pessoas que nunca vê anúncio (grupo de controle). */
    readonly HOLDOUT_SHARE: 0.05;
    /** Menor grupo de pessoas que um relatório ou estimativa de alcance pode mostrar. */
    readonly MIN_AUDIENCE_SIZE: 100;
};
/**
 * Vizinhança do espaço de anúncio. Nenhum anúncio aparece perto de relato contra o próprio anunciante: o site e o
 * celular dizem ao servidor quais itens estão em volta do espaço (até 3 antes e 3 depois) e o servidor tira da
 * disputa as empresas que são alvo de relato nesses itens. `MAX_IDS` é o teto de cada lista no pedido.
 */
export declare const AD_ADJACENCY: {
    readonly BEFORE: 3;
    readonly AFTER: 3;
    readonly MAX_IDS: 8;
};
/**
 * Ids dos itens do feed ao redor de um espaço de anúncio. `position` é quantos itens vieram antes do espaço, então
 * o espaço fica entre `items[position - 1]` e `items[position]`. Só olha o que já foi carregado.
 */
export declare function adNeighborIds(items: readonly {
    id: string;
}[], position: number): string[];
export type AdSignalConsent = 'NONE' | 'PERSONALIZATION';
export interface AdSignalSpec {
    /** Descrição em português simples (aparece no "Por que estou vendo isto?" e na política). */
    label: string;
    /** De onde o sinal vem. Nunca de tabela política ou de conteúdo livre. */
    source: string;
    /** `NONE`: anúncio por contexto, vale sem aceite. `PERSONALIZATION`: só com a personalização ligada. */
    consent: AdSignalConsent;
}
/**
 * ÚNICOS atributos que os modelos e o servidor de anúncios podem usar (seção 3.1 do plano). Um teste falha se
 * aparecer qualquer outro. Para mudar: aval do dono do produto, revisão do advogado e atualização do RIPD.
 */
export declare const ADS_FEATURE_ALLOWLIST: {
    readonly 'context.city': {
        readonly label: "Cidade da tela que você está vendo";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'context.state': {
        readonly label: "Estado da tela que você está vendo";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'context.surface': {
        readonly label: "Seção do app (feed, busca)";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'context.position': {
        readonly label: "Posição no feed";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'context.hour': {
        readonly label: "Hora do dia";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'context.weekday': {
        readonly label: "Dia da semana";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'device.platform': {
        readonly label: "Tipo de aparelho (site, Android, iPhone)";
        readonly source: "pedido do feed";
        readonly consent: "NONE";
    };
    readonly 'user.city': {
        readonly label: "Sua cidade no cadastro";
        readonly source: "users.city";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.state': {
        readonly label: "Seu estado no cadastro";
        readonly source: "users.state";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.neighborhood': {
        readonly label: "Seu bairro no cadastro";
        readonly source: "users.neighborhood";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.ageBand': {
        readonly label: "Sua faixa de idade (nunca a data)";
        readonly source: "users.birth_date";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.gender': {
        readonly label: "Gênero, se você informou";
        readonly source: "users.gender";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.declaredInterests': {
        readonly label: "Interesses que você escolheu";
        readonly source: "preferências de anúncios";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.followedCompanies': {
        readonly label: "Empresas que você segue";
        readonly source: "company_followers";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.adEngagement': {
        readonly label: "Anúncios que você viu, tocou ou escondeu";
        readonly source: "eventos de anúncio";
        readonly consent: "PERSONALIZATION";
    };
    readonly 'user.nonSensitiveContentCategories': {
        readonly label: "Categorias não sensíveis de conteúdo com que você interagiu";
        readonly source: "classificador de sensibilidade";
        readonly consent: "PERSONALIZATION";
    };
};
export type AdFeatureKey = keyof typeof ADS_FEATURE_ALLOWLIST;
export declare const AD_FEATURE_KEYS: AdFeatureKey[];
/**
 * Origens que NUNCA podem alimentar anúncios (seção 3.2 do plano): atividade política, conteúdo livre,
 * mensagens, documentos. Usado pelo teste do muro e pela revisão de código.
 */
export declare const ADS_FORBIDDEN_SOURCES: readonly ["politician_followers", "entity_followers", "reports", "report_media", "votes", "comments", "proposta_votos", "propostas", "debates", "debate_questions", "debate_messages", "debate_poll_votes", "posts.content", "post_comments", "conversations", "conversation_members", "chat_attachments", "page_messages", "registration_requests", "users.cpf", "users.latitude", "users.longitude", "users.street", "users.zip_code"];
export declare class ForbiddenAdFeatureError extends Error {
    readonly features: string[];
    constructor(features: string[]);
}
/** Confere uma lista de atributos (do treino ou do servidor de anúncios). Lança erro se algum não for permitido. */
export declare function assertAllowedAdFeatures(features: readonly string[]): void;
/** Atributos que valem para quem NÃO ligou a personalização (só contexto). */
export declare function adFeaturesForConsent(personalization: boolean): AdFeatureKey[];
export declare const AGE_BANDS: readonly ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
export type AgeBand = (typeof AGE_BANDS)[number];
/** Idade completa em anos numa data (fuso de São Paulo não importa aqui: a data de nascimento é só dia). */
export declare function ageOn(birthDate: string | Date, today?: Date): number | null;
/**
 * Faixa de idade para anúncios. Menor de 18 (ou data inválida) devolve null: sem perfil para publicidade
 * (ECA Digital), mesmo que o cadastro já exija 18 anos.
 */
export declare function ageBandOf(birthDate: string | Date | null | undefined, today?: Date): AgeBand | null;
export declare const USER_GENDERS: readonly ["FEMALE", "MALE", "OTHER", "UNDISCLOSED"];
export type UserGender = (typeof USER_GENDERS)[number];
export declare const USER_GENDER_LABELS: Record<UserGender, string>;
/** Texto curto que explica para que servem data de nascimento e gênero (mesmo no site e no celular). */
export declare const PROFILE_DEMOGRAPHICS_PURPOSE = "Opcional. Usamos s\u00F3 para mostrar an\u00FAncios mais adequados, se voc\u00EA permitir. N\u00E3o aparece no seu perfil.";
/** Versão do texto do aceite. Muda quando o texto ou os sinais usados mudarem: aí o aceite antigo deixa de valer. */
export declare const AD_PERSONALIZATION_CONSENT_VERSION = "2026-11-21";
/** Quantos interesses a pessoa pode escolher. */
export declare const AD_MAX_DECLARED_INTERESTS = 10;
/** O que a API devolve para a tela "Preferências de anúncios". Idade só como faixa, nunca a data. */
export interface AdPreferencesView {
    personalizationConsent: boolean;
    consentAt: string | null;
    interests: AdInterestId[];
    ageBand: AgeBand | null;
    gender: UserGender | null;
}
/** O que a tela manda. Campo ausente não muda. */
export interface UpdateAdPreferencesInput {
    personalizationConsent?: boolean;
    interests?: AdInterestId[];
}
/** Textos da tela, iguais no site e no celular (português simples, sem juridiquês). */
export declare const AD_PREFERENCES_COPY: {
    readonly title: "Preferências de anúncios";
    readonly intro: "O Votz mostra anúncios de empresas. Aqui você decide se eles podem ser escolhidos pelo que você gosta.";
    readonly toggleLabel: "Anúncios mais adequados a mim";
    readonly toggleOff: "Desligado. Você vê só anúncios da sua cidade e da tela em que está. Nada sobre você é usado.";
    readonly toggleOn: "Ligado. Usamos só o que está na lista abaixo para escolher anúncios. Você pode desligar quando quiser.";
    readonly usedTitle: "O que usamos, só se você ligar";
    readonly usedItems: readonly ["Sua cidade, estado e bairro do cadastro", "Sua faixa de idade e seu gênero, se você informou (nunca a data de nascimento)", "Os interesses que você escolher aqui", "As empresas que você segue", "Os anúncios que você viu, tocou ou escondeu"];
    readonly neverTitle: "O que nunca usamos";
    readonly neverItems: readonly ["Seus relatos, apoios, votos, comentários e debates", "Os políticos e órgãos públicos que você segue", "Suas conversas (só você e quem conversa com você conseguem ler)", "Seu CPF, seu endereço e sua localização exata", "Temas como política, religião, saúde e outros dados sensíveis"];
    readonly interestsTitle: "Seus interesses";
    readonly interestsHint: "Escolha até 10. Eles só são usados se a opção acima estiver ligada.";
    readonly interestsLimit: "Você já escolheu 10 interesses. Tire um para escolher outro.";
    readonly demographicsHint: "Faixa de idade e gênero vêm do seu perfil. Para mudar, edite seu perfil.";
    readonly saved: "Preferências salvas.";
    readonly saveError: "Não foi possível salvar agora. Tente de novo.";
};
export declare const AD_OBJECTIVES: readonly ["AWARENESS", "TRAFFIC", "CONVERSIONS"];
export type AdObjective = (typeof AD_OBJECTIVES)[number];
export declare const AD_OBJECTIVE_LABELS: Record<AdObjective, {
    label: string;
    hint: string;
    billing: string;
}>;
export declare const AD_STATUSES: readonly ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];
export type AdStatus = (typeof AD_STATUSES)[number];
export declare const AD_STATUS_LABELS: Record<AdStatus, string>;
export declare const AD_REVIEW_STATUSES: readonly ["NOT_SUBMITTED", "PENDING", "APPROVED", "REJECTED"];
export type AdReviewStatus = (typeof AD_REVIEW_STATUSES)[number];
export declare const AD_REVIEW_STATUS_LABELS: Record<AdReviewStatus, string>;
/** Limites do formulário (o servidor confere de novo). */
export declare const AD_LIMITS: {
    readonly NAME_MAX: 80;
    readonly HEADLINE_MAX: 60;
    readonly BODY_MAX: 280;
    readonly CTA_MAX: 20;
    readonly URL_MAX: 500;
    /** Orçamento diário mínimo: R$ 6,00. */
    readonly MIN_DAILY_BUDGET_CENTS: 600;
    /** Orçamento diário máximo por conjunto na fase de teste: R$ 10.000,00. */
    readonly MAX_DAILY_BUDGET_CENTS: 1000000;
    readonly MAX_STATES: 27;
    readonly MAX_CITIES: 50;
};
/** Textos de botão que o anunciante pode escolher (sem texto livre, para não virar isca). */
export declare const AD_CTA_LABELS: readonly ["Saiba mais", "Comprar", "Pedir agora", "Agendar", "Falar no WhatsApp", "Ver cardápio", "Inscrever-se", "Ver oferta"];
export type AdCtaLabel = (typeof AD_CTA_LABELS)[number];
export interface AdAccountView {
    id: string;
    companyId: string;
    name: string;
    currency: string;
    timezone: string;
    balanceCents: number;
    createdAt: string;
}
/**
 * Foto ou vídeo do anúncio: mesmas molduras das publicações (1:1, 4:5, 16:9), com exigências a mais (plano do padrão
 * de mídia, seção 2.3). Quem confere é a API; o site usa a mesma função para avisar antes de enviar.
 */
export declare const AD_MEDIA_RULES: {
    readonly MIN_WIDTH: 1080;
    readonly MAX_VIDEO_SECONDS: 60;
    /** Formatos que o Votz recomenda ao anunciante (o paisagem também vale). */
    readonly RECOMMENDED_FORMATS: readonly ["SQUARE", "PORTRAIT"];
    /** Quanto o vídeo pode passar de 60 s por arredondamento da leitura do arquivo. */
    readonly DURATION_TOLERANCE_MS: 500;
};
export interface AdMediaCheckInput {
    kind: MediaAssetKind;
    /** Largura em pixels: do arquivo inteiro (`scope: 'file'`) ou só da parte que aparece depois do recorte (`'crop'`). */
    width: number;
    durationMs?: number | null;
    scope: 'file' | 'crop';
}
/** Mensagem para o anunciante (português simples) ou null se a mídia serve para anúncio. */
export declare function adMediaProblem(input: AdMediaCheckInput): string | null;
export interface AdCreativeView {
    id: string;
    headline: string;
    body: string;
    ctaLabel: string;
    destinationUrl: string;
    /** Foto ou vídeo do anúncio; null se o anúncio é só texto. */
    media: MediaItemDto | null;
}
export interface AdView {
    id: string;
    name: string;
    status: AdStatus;
    reviewStatus: AdReviewStatus;
    reviewNote: string | null;
    creative: AdCreativeView;
}
export interface AdSetView {
    id: string;
    name: string;
    status: AdStatus;
    dailyBudgetCents: number;
    bidCapCents: number | null;
    startAt: string;
    endAt: string | null;
    states: string[];
    cities: string[];
    interests: AdInterestId[];
    ageBands: AgeBand[];
    genders: UserGender[];
    automaticAudience: boolean;
    ads: AdView[];
}
export interface AdCampaignView {
    id: string;
    name: string;
    objective: AdObjective;
    status: AdStatus;
    createdAt: string;
    adSets: AdSetView[];
}
/** Passo a passo "Criar campanha": objetivo → público e orçamento → criativo → revisão. Cria tudo como rascunho. */
export interface CreateAdCampaignInput {
    name: string;
    objective: AdObjective;
    adSet: {
        name: string;
        dailyBudgetCents: number;
        bidCapCents?: number | null;
        startAt: string;
        endAt?: string | null;
        states: string[];
        cities: string[];
        interests: AdInterestId[];
        ageBands: AgeBand[];
        genders: UserGender[];
        automaticAudience: boolean;
    };
    creative: {
        headline: string;
        body: string;
        ctaLabel: AdCtaLabel;
        destinationUrl: string;
        /** Arquivo enviado pelo Estúdio (`POST .../media`) com a moldura e o enquadramento escolhidos. */
        media?: {
            id: string;
            format: MediaFormat;
            crop?: MediaCrop;
        };
    };
    /** Já manda o anúncio para revisão ao salvar. */
    submitForReview?: boolean;
}
export declare const AD_REVIEW_LIMITS: {
    readonly REASON_MIN: 10;
    readonly REASON_MAX: 500;
};
/** Um anúncio na fila de revisão, com tudo o que quem revisa precisa ver. */
/** Parecer da IA sobre o anúncio, mostrado ao moderador (nunca ao anunciante). */
export interface AdAiAnalysisView {
    /** Categoria de interesse sugerida (id de `AD_INTERESTS`). */
    category: string | null;
    /** Categoria restrita detectada (id de `AD_RESTRICTED_CATEGORIES`). */
    restricted: string | null;
    /** Categorias proibidas suspeitas, com a confiança de 0 a 1. */
    violations: {
        id: string;
        confidence: number;
    }[];
    sensitive: boolean;
    confidence: number;
    explanation: string;
    autoApproved: boolean;
    createdAt: string;
}
export interface AdReviewQueueItem {
    adId: string;
    reviewStatus: AdReviewStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    company: {
        id: string;
        name: string;
        verified: boolean;
    };
    accountName: string;
    campaignName: string;
    objective: AdObjective;
    creative: AdCreativeView;
    audience: {
        states: string[];
        cities: string[];
        interests: AdInterestId[];
        ageBands: AgeBand[];
        genders: UserGender[];
        automaticAudience: boolean;
    };
    dailyBudgetCents: number;
    /** Última leitura da IA, ou null se ainda não houve (ou a IA está desligada). */
    aiAnalysis: AdAiAnalysisView | null;
    /** Decisões anteriores sobre este anúncio (mais recente primeiro). */
    history: {
        decision: AdReviewStatus;
        reason: string | null;
        source: 'HUMAN' | 'AI';
        reviewerName: string | null;
        createdAt: string;
    }[];
}
export interface AdReviewQueueResponse {
    data: AdReviewQueueItem[];
    meta: {
        total: number;
        pendingCount: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}
export interface AdReviewDecisionInput {
    decision: 'APPROVED' | 'REJECTED';
    /** Obrigatório ao recusar (o anunciante lê este motivo). */
    reason?: string;
}
export declare const AD_TOPUP_METHODS: readonly ["PIX", "BOLETO", "CARD"];
export type AdTopUpMethod = (typeof AD_TOPUP_METHODS)[number];
export declare const AD_TOPUP_METHOD_LABELS: Record<AdTopUpMethod, string>;
export declare const AD_TOPUP_STATUSES: readonly ["PENDING", "PAID", "EXPIRED", "CANCELED"];
export type AdTopUpStatus = (typeof AD_TOPUP_STATUSES)[number];
export declare const AD_TOPUP_STATUS_LABELS: Record<AdTopUpStatus, string>;
/** Limites de uma recarga (em centavos). */
export declare const AD_BILLING_LIMITS: {
    /** Recarga mínima: R$ 20,00. */
    readonly MIN_TOPUP_CENTS: 2000;
    /** Recarga máxima por pedido na fase de teste: R$ 10.000,00. */
    readonly MAX_TOPUP_CENTS: 1000000;
    /** Quanto tempo o Pix ou o boleto vale: 3 dias. */
    readonly TOPUP_VALID_HOURS: 72;
};
/** "test": recarga de teste, sem chamar serviço externo. "live": Asaas (Pix e boleto) e Stripe (cartão). */
export type AdBillingMode = 'test' | 'live';
export interface AdTopUpView {
    id: string;
    amountCents: number;
    method: AdTopUpMethod;
    status: AdTopUpStatus;
    /** Pix copia e cola ou linha digitável do boleto. */
    paymentCode: string | null;
    checkoutUrl: string | null;
    expiresAt: string;
    paidAt: string | null;
    createdAt: string;
}
export declare const AD_LEDGER_TYPE_LABELS: {
    readonly TOPUP: "Recarga";
    readonly SPEND: "Gasto com anúncios";
    readonly REFUND: "Devolução";
    readonly ADJUSTMENT: "Ajuste";
};
export type AdLedgerEntryType = keyof typeof AD_LEDGER_TYPE_LABELS;
/** Uma linha do extrato: o que entrou ou saiu do saldo do anunciante. */
export interface AdStatementLine {
    id: string;
    type: AdLedgerEntryType;
    description: string;
    /** Positivo entra no saldo, negativo sai. */
    amountCents: number;
    balanceAfterCents: number;
    createdAt: string;
}
export interface AdBillingView {
    account: AdAccountView;
    mode: AdBillingMode;
    /** Formas de pagamento que estão disponíveis agora. */
    methods: AdTopUpMethod[];
    limits: {
        minTopUpCents: number;
        maxTopUpCents: number;
    };
    topUps: AdTopUpView[];
    statement: AdStatementLine[];
    /** O saldo da conta bate com a soma do livro-caixa. Se for falso, há erro de contabilidade e o suporte precisa olhar. */
    reconciled: boolean;
}
export declare const AD_EVENT_TYPES: readonly ["REQUEST", "IMPRESSION", "VIEWABLE_IMPRESSION", "CLICK", "HIDE", "HIDE_ADVERTISER", "REPORT", "CONVERSION"];
export type AdEventType = (typeof AD_EVENT_TYPES)[number];
/** Exibição só conta como vista com metade do card na tela por 1 segundo (padrão de mercado). */
export declare const AD_VIEWABILITY: {
    readonly MIN_VISIBLE_RATIO: 0.5;
    readonly MIN_VISIBLE_MS: 1000;
};
export declare const AD_SURFACES: readonly ["FEED_FOR_YOU", "FEED_RECENT", "FEED_CITY"];
export type AdSurface = (typeof AD_SURFACES)[number];
/**
 * Evento que o site e o celular mandam (em lote) para `POST /ads/events`. O `eventId` é gerado no aparelho e
 * evita contar duas vezes; o servidor confere a sessão, a ordem (clique sem exibição não conta) e o antifraude.
 * Sem dado pessoal: quem é a pessoa vem da sessão, nunca do corpo do evento.
 */
export interface AdClientEvent {
    eventId: string;
    type: Exclude<AdEventType, 'REQUEST' | 'CONVERSION'>;
    /** Identificador da exibição, devolvido junto com o anúncio. Liga exibição, visibilidade, clique e esconder. */
    impressionId: string;
    adId: string;
    surface: AdSurface;
    position: number;
    /** Momento no aparelho (ISO). O servidor guarda também a hora em que recebeu. */
    occurredAt: string;
    /** Só em VIEWABLE_IMPRESSION: quanto tempo ficou visível. */
    visibleMs?: number;
}
export declare const AD_CONVERSION_EVENT_NAMES: readonly ["PURCHASE", "LEAD", "SIGNUP", "CONTACT", "OTHER"];
export type AdConversionEventName = (typeof AD_CONVERSION_EVENT_NAMES)[number];
/**
 * Conversão enviada pelo anunciante (API de conversões, `POST /ads/conversions`): só o identificador do clique
 * (`votz_click_id`, que o Votz põe no link do anúncio), o que aconteceu e quando. Nada da pessoa.
 */
export interface AdConversionEvent {
    clickId: string;
    eventName: AdConversionEventName;
    /** Valor em centavos (opcional; só faz sentido para compra). */
    valueCents?: number;
    occurredAt: string;
    /** Para não contar a mesma conversão duas vezes. Vale por conta de anúncios. */
    dedupeKey: string;
}
/** Janela de atribuição: conversão até 7 dias depois do clique. */
export declare const AD_ATTRIBUTION_WINDOW_DAYS = 7;
export declare const AD_CONVERSIONS: {
    /** Eventos por chamada. */
    readonly MAX_BATCH: 100;
    /** Conversões que um mesmo clique pode ter (várias compras, sim; milhares, não). */
    readonly MAX_PER_CLICK: 20;
    /** Maior valor aceito por conversão: R$ 1.000.000,00. */
    readonly MAX_VALUE_CENTS: 100000000;
    /** Chaves ativas por conta de anúncios. */
    readonly MAX_ACTIVE_KEYS: 5;
    /** O relógio do anunciante pode errar um pouco para o futuro. */
    readonly MAX_CLOCK_SKEW_MS: number;
    readonly KEY_PREFIX: "vzc_";
    /** Nome do parâmetro que o Votz põe no link do anunciante. */
    readonly CLICK_PARAM: "votz_click_id";
    /** Tamanho do identificador do clique (16 bytes em base64url). */
    readonly CLICK_TOKEN_LENGTH: 22;
};
export type AdConversionRejection = 'UNKNOWN_CLICK' | 'OUTSIDE_WINDOW' | 'IN_THE_FUTURE' | 'TOO_MANY_FOR_CLICK';
export type AdConversionOutcome = {
    dedupeKey: string;
    status: 'ACCEPTED';
} | {
    dedupeKey: string;
    status: 'DUPLICATE';
} | {
    dedupeKey: string;
    status: 'REJECTED';
    reason: AdConversionRejection;
};
export interface AdConversionsResult {
    accepted: number;
    duplicates: number;
    rejected: number;
    results: AdConversionOutcome[];
}
/** Chave de conversões como o Estúdio mostra (nunca com o segredo inteiro). */
export interface AdConversionKeyView {
    id: string;
    name: string;
    /** Começo da chave, para reconhecer qual é. */
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
}
/** Resposta de criar a chave: o segredo aparece só desta vez. */
export interface AdConversionKeyCreated extends AdConversionKeyView {
    key: string;
}
/** Lote máximo de eventos por envio do aparelho. */
export declare const AD_EVENTS_MAX_BATCH = 50;
/**
 * Dinheiro dos anúncios corre em MILÉSIMOS DE CENTAVO ("millicents") durante a cobrança, para o preço por mil
 * exibições fechar exato: R$ 6,00 por mil exibições (600 centavos) custa 600 millicents por exibição. O livro-caixa
 * só recebe centavos inteiros: o resto fica acumulado na conta até completar um centavo.
 */
export declare const MILLICENTS_PER_CENT = 1000;
/**
 * Preços mínimos (valores de partida; mudar é decisão do dono do produto). Reconhecimento e Conversões pagam por mil
 * exibições visíveis (CPM); Tráfego paga por clique (CPC). O lance do conjunto é o máximo que o anunciante paga.
 */
export declare const AD_PRICING: {
    /** R$ 6,00 por mil exibições visíveis. */
    readonly MIN_CPM_CENTS: 600;
    /** R$ 0,40 por clique. */
    readonly MIN_CPC_CENTS: 40;
};
/** Regras de entrega do Votz (valem para qualquer anunciante). */
export declare const AD_DELIVERY: {
    /** Quantas vezes a mesma pessoa vê o mesmo anúncio em 24 horas. */
    readonly MAX_IMPRESSIONS_PER_USER_AD_DAY: 3;
    /** Depois deste prazo a exibição não aceita mais eventos (visível, clique). */
    readonly IMPRESSION_EVENT_TTL_HOURS: 24;
};
/** Antifraude da primeira versão: regras simples e transparentes. Tráfego inválido nunca é cobrado. */
export declare const AD_FRAUD: {
    /** Clique antes disso depois da exibição é de robô. */
    readonly MIN_CLICK_DELAY_MS: 300;
    /** Cliques cobrados da mesma pessoa no mesmo anúncio por dia. */
    readonly MAX_BILLED_CLICKS_PER_USER_AD_DAY: 2;
    /** O relógio do aparelho pode errar um pouco, mas não tanto. */
    readonly MAX_CLOCK_SKEW_MS: number;
};
export type AdInvalidReason = 'IMPRESSION_UNKNOWN' | 'IMPRESSION_EXPIRED' | 'NOT_VIEWABLE' | 'CLICK_TOO_FAST' | 'TOO_MANY_CLICKS' | 'CLOCK_SKEW' | 'DUPLICATE_ACTION';
export declare function adChargeUnit(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS'): 'VIEWABLE_IMPRESSION' | 'CLICK';
/** Preço mínimo, em centavos, da unidade cobrada (mil exibições visíveis ou um clique). */
export declare function adFloorCents(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS'): number;
/** Quanto custa UMA exibição visível (CPM) ou UM clique (CPC), em millicents, dado o preço em centavos da unidade. */
export declare function adChargeMillicents(objective: 'AWARENESS' | 'TRAFFIC' | 'CONVERSIONS', priceCents: number): number;
/** O anúncio como o feed mostra. Nunca leva dado do anunciante além da página dele; nunca leva o alvo escolhido. */
export interface SponsoredAdView {
    /** Identifica esta exibição; volta em todos os eventos (visível, clique, esconder). */
    impressionId: string;
    adId: string;
    headline: string;
    body: string;
    ctaLabel: string;
    destinationUrl: string;
    /**
     * O que o botão abre: passa pelo Votz (`votz.app/c/<id>`), que leva ao `destinationUrl` com o `votz_click_id` no
     * link. É isso que deixa o anunciante contar conversões sem rastrear a pessoa.
     */
    clickUrl: string;
    /** Foto ou vídeo já pronto para desenhar (só chega anúncio com a mídia processada); null se é só texto. */
    media: MediaItemDto | null;
    advertiser: {
        id: string;
        name: string;
        username: string | null;
        logoUrl: string | null;
    };
    /** "Por que estou vendo isto?" em português simples. */
    why: string;
}
export interface AdEventsResult {
    accepted: number;
    duplicates: number;
    rejected: number;
}
/** Uma linha do relatório diário de um anúncio. */
export interface AdDailyStatView {
    day: string;
    impressions: number;
    viewableImpressions: number;
    clicks: number;
    hides: number;
    spendCents: number;
    /** Conversões que o anunciante contou para os cliques deste dia (API de conversões). */
    conversions: number;
    /** Soma dos valores das conversões, em centavos. */
    conversionValueCents: number;
}
export declare const AD_REPORT_PERIODS: readonly [7, 30, 90];
export type AdReportPeriod = (typeof AD_REPORT_PERIODS)[number];
export interface AdReportTotals {
    impressions: number;
    viewableImpressions: number;
    clicks: number;
    hides: number;
    spendCents: number;
    conversions: number;
    conversionValueCents: number;
    /** Custo por conversão, em centavos. Nulo se não houve conversão. */
    cpaCents: number | null;
    /** Cliques sobre exibições vistas, em %. Nulo se ninguém viu ainda. */
    ctrPercent: number | null;
    /** Custo por mil exibições vistas, em centavos. */
    cpmCents: number | null;
    /** Custo por clique, em centavos. */
    cpcCents: number | null;
}
export declare function summarizeAdStats(rows: readonly AdDailyStatView[]): AdReportTotals;
/** Completa com zeros os dias sem movimento, do mais antigo até `today` ("AAAA-MM-DD"), para o gráfico não pular dia. */
export declare function fillAdStatDays(rows: readonly AdDailyStatView[], days: number, today: string): AdDailyStatView[];
export declare const AD_LIBRARY: {
    /** Anúncio que parou de rodar continua na biblioteca por este tempo. */
    readonly RETENTION_MONTHS: 12;
    readonly PAGE_SIZE: 24;
    readonly MAX_PAGE_SIZE: 48;
    readonly SEARCH_MAX: 80;
};
export interface AdRangeBand {
    /** Limite de baixo (incluso). */
    min: number;
    /** Limite de cima (excluso); nulo na última faixa ("mais de..."). */
    max: number | null;
    label: string;
}
export declare const AD_SPEND_BANDS: readonly AdRangeBand[];
export declare const AD_IMPRESSION_BANDS: readonly AdRangeBand[];
export declare const adSpendBand: (spendCents: number) => AdRangeBand;
export declare const adImpressionBand: (impressions: number) => AdRangeBand;
export interface AdLibraryItem {
    adId: string;
    /** Quem pagou o anúncio. */
    advertiser: {
        id: string;
        name: string;
        username: string | null;
        logoUrl: string | null;
        verified: boolean;
    };
    headline: string;
    body: string;
    ctaLabel: string;
    /** Só o endereço do site (ex.: padaria.com.br), sem caminho nem parâmetros. */
    destinationHost: string | null;
    media: MediaItemDto | null;
    /** Está rodando agora (campanha ligada, no período, com saldo). */
    active: boolean;
    /** "AAAA-MM-DD". */
    startedOn: string;
    /** Dia em que acaba ou acabou; nulo se não tem data para acabar. */
    endsOn: string | null;
    /** Estados e cidades onde a empresa escolheu mostrar; vazio = todo o Brasil. */
    states: string[];
    cities: string[];
    spend: AdRangeBand;
    impressions: AdRangeBand;
}
export interface AdLibraryResponse {
    data: AdLibraryItem[];
    meta: {
        page: number;
        limit: number;
        hasMore: boolean;
    };
}
/** Só o domínio do destino (para a biblioteca mostrar para onde o anúncio leva, sem entregar parâmetros). */
export declare function adDestinationHost(url: string): string | null;
export declare const AD_FRAUD_SIGNAL_LABELS: {
    readonly CTR_ABNORMAL: "Taxa de cliques muito acima do normal";
    readonly CLICKS_WITHOUT_VIEW: "Cliques sem o anúncio ter sido visto antes";
};
export type AdFraudSignal = keyof typeof AD_FRAUD_SIGNAL_LABELS;
export type AdFraudStatus = 'OPEN' | 'CONFIRMED' | 'DISMISSED';
export type AdFraudLevel = 'REVIEW' | 'EXTREME';
/** Um caso de tráfego suspeito na fila da moderação: um anúncio num dia. */
export interface AdFraudFlagItem {
    id: string;
    status: AdFraudStatus;
    level: AdFraudLevel;
    /** "AAAA-MM-DD" (fuso de São Paulo). */
    day: string;
    signals: AdFraudSignal[];
    viewable: number;
    clicks: number;
    clicksWithoutView: number;
    invalidClicks: number;
    /** Taxa de cliques do dia, em %. Nulo se ninguém viu. */
    ctrPercent: number | null;
    /** Já devolvido ao anunciante, em centavos. */
    creditedCents: number;
    pausedAd: boolean;
    ad: {
        id: string;
        name: string;
        headline: string;
        status: AdStatus;
    };
    campaignName: string;
    objective: AdObjective;
    company: {
        id: string;
        name: string;
    };
    resolvedAt: string | null;
    resolutionNote: string | null;
    createdAt: string;
}
export interface AdFraudQueueResponse {
    data: AdFraudFlagItem[];
    meta: {
        total: number;
        openCount: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}
export interface AdFraudResolveInput {
    resolution: 'CONFIRMED' | 'DISMISSED';
    note?: string;
}
//# sourceMappingURL=ads.d.ts.map