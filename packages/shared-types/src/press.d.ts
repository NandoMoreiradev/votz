export declare const PRESS_OUTLET_TYPES: readonly ["TV", "RADIO", "NEWSPAPER", "PORTAL", "AGENCY", "INDEPENDENT", "FREELANCER", "OTHER"];
export type PressOutletType = (typeof PRESS_OUTLET_TYPES)[number];
export declare const PRESS_OUTLET_LABELS: Record<PressOutletType, string>;
export declare const PRESS_CREDENTIAL_STATUSES: readonly ["PENDING", "APPROVED", "REJECTED", "REVOKED"];
export type PressCredentialStatus = (typeof PRESS_CREDENTIAL_STATUSES)[number];
export declare const PRESS_CREDENTIAL_STATUS_LABELS: Record<PressCredentialStatus, string>;
export declare const PRESS_CREDENTIAL_LIMITS: {
    readonly OUTLET_NAME_MAX: 120;
    readonly JOB_TITLE_MAX: 80;
    readonly WEBSITE_MAX: 300;
    readonly EMAIL_MAX: 200;
    readonly COVERAGE_MAX: 160;
    readonly NOTE_MAX: 500;
    readonly REVIEW_NOTE_MAX: 500;
    readonly PORTFOLIO_MAX: 5;
    readonly PORTFOLIO_MIN: 1;
};
/** Dado que o jornalista vê do próprio pedido (nunca devolve o código do e-mail). */
export interface MyPressCredential {
    id: string;
    status: PressCredentialStatus;
    outletName: string;
    outletType: PressOutletType;
    jobTitle: string | null;
    website: string;
    newsroomEmail: string;
    coverageArea: string | null;
    portfolioUrls: string[];
    note: string | null;
    emailConfirmed: boolean;
    reviewNote: string | null;
    reviewedAt: string | null;
    createdAt: string;
}
export declare const PRESS_PLANS: readonly ["GRATUITA", "PRO"];
export type PressPlan = (typeof PRESS_PLANS)[number];
export declare const PRESS_PLAN_LABELS: Record<PressPlan, string>;
export declare const PRESS_RADAR_KINDS: readonly ["SURGE", "PRESSURE", "UNANSWERED"];
export type PressRadarKind = (typeof PRESS_RADAR_KINDS)[number];
export declare const PRESS_RADAR_KIND_LABELS: Record<PressRadarKind, string>;
export declare const PRESS_RADAR_KIND_HELP: Record<PressRadarKind, string>;
export declare const PRESS_RADAR_FREQUENCIES: readonly ["IMMEDIATE", "DAILY"];
export type PressRadarFrequency = (typeof PRESS_RADAR_FREQUENCIES)[number];
export declare const PRESS_RADAR_FREQUENCY_LABELS: Record<PressRadarFrequency, string>;
export declare const PRESS_RADAR_LIMITS: {
    readonly NAME_MAX: 80;
    readonly NAME_MIN: 2;
    readonly MAX_STATES: 5;
    readonly MAX_CITIES: 5;
    readonly CITY_MAX: 100;
    readonly MIN_PRESSURE_MIN: 1;
    readonly MIN_PRESSURE_MAX: 10000;
    readonly STALLED_DAYS_MIN: 1;
    readonly STALLED_DAYS_MAX: 90;
};
/** O que cada plano libera. A credencial gratuita já traz radar pequeno e CSV de 90 dias. */
export interface PressPlanLimits {
    maxRadarRules: number;
    radarFrequencies: readonly PressRadarFrequency[];
    exportMaxDays: number;
    exportMaxRows: number;
    /** CSV com descrição e destinatário do relato. */
    richExport: boolean;
    jsonExport: boolean;
    /** Série histórica (relatos, respondidos e resolvidos por semana ou mês). */
    timeSeries: boolean;
    /** Quantos relatos a busca por significado devolve. */
    searchResults: number;
    /** Briefing de surto escrito por IA. */
    aiBriefing: boolean;
    /**
     * O plano pode pedir contato a cidadãos. Sem teto por dia: a proteção do cidadão é a recusa, o bloqueio e a
     * suspensão do jornalista por denúncias de abuso.
     */
    canRequestContact: boolean;
}
export declare const PRESS_PLAN_LIMITS: Record<PressPlan, PressPlanLimits>;
export interface PressRadarRuleView {
    id: string;
    name: string;
    kind: PressRadarKind;
    states: string[];
    cities: string[];
    categories: string[];
    minPressure: number | null;
    stalledDays: number | null;
    frequency: PressRadarFrequency;
    active: boolean;
    lastDigestAt: string | null;
    createdAt: string;
}
/** Resposta de GET /imprensa/plano: o plano de quem está logado e o que ele libera. */
export interface PressPlanInfo {
    plan: PressPlan;
    limits: PressPlanLimits;
    /** Existe preço do plano Pro configurado no Stripe (senão, só a equipe libera). */
    checkoutAvailable: boolean;
    hasSubscription: boolean;
    supportEmail: string;
}
export declare const PRESS_SEARCH_LIMITS: {
    readonly QUERY_MIN: 3;
    readonly QUERY_MAX: 300;
};
export interface PressSearchResult {
    id: string;
    title: string;
    excerpt: string;
    category: string;
    status: string;
    city: string | null;
    state: string | null;
    pressureScore: number;
    createdAt: string;
    /** O autor aceita pedido de contato da imprensa (o botão fica na página do relato). */
    pressContactOk: boolean;
    /** 0 a 100: o quanto o relato "fala do mesmo assunto" da busca. */
    score: number;
}
export interface PressSearchResponse {
    query: string;
    total: number;
    results: PressSearchResult[];
    /** Relatos que ainda não entraram no índice da busca (são indexados aos poucos). */
    indexing: {
        missing: number;
    };
}
export interface PressBriefingComplaint {
    title: string;
    detail: string;
    /** Números dos relatos de apoio (ver `references`). */
    refs: number[];
}
/** Texto escrito pela IA. Nunca traz número: os números ficam em `stats`, calculados no banco. */
export interface PressBriefingContent {
    headline: string;
    summary: string;
    complaints: PressBriefingComplaint[];
    questions: string[];
    caveats: string[];
}
export interface PressBriefingStats {
    category: string;
    city: string;
    state: string;
    totalReports: number;
    publicReports: number;
    answeredReports: number;
    firstReportAt: string | null;
    lastReportAt: string | null;
    avgPressure: number;
    maxPressure: number;
    byStatus: Record<string, number>;
    topNeighborhoods: Array<{
        name: string;
        count: number;
    }>;
    topEntities: Array<{
        name: string;
        count: number;
    }>;
}
export interface PressBriefingReference {
    n: number;
    id: string;
    title: string;
    city: string | null;
    state: string | null;
}
export interface PressBriefing {
    surtoId: string;
    generatedAt: string;
    /** `false` quando a IA não respondeu ou não passou na checagem: só os números, sem texto escrito por IA. */
    aiGenerated: boolean;
    stats: PressBriefingStats;
    content: PressBriefingContent | null;
    references: PressBriefingReference[];
    disclaimer: string;
}
export declare const PRESS_CONTACT_LIMITS: {
    readonly MESSAGE_MIN: 20;
    readonly MESSAGE_MAX: 500;
    readonly REPLY_MAX: 300;
    /** Dias até o pedido sem resposta deixar de valer. */
    readonly EXPIRES_DAYS: 14;
    /** Depois que a pessoa recusa, o mesmo jornalista não pede de novo por este tempo. */
    readonly DECLINE_COOLDOWN_DAYS: 7;
    /** Denúncias de abuso (recusa "abusivo") que suspendem os pedidos do jornalista até a moderação revisar. */
    readonly ABUSE_SUSPEND_AT: 5;
};
export declare const PRESS_CONTACT_STATUSES: readonly ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"];
export type PressContactStatusView = (typeof PRESS_CONTACT_STATUSES)[number];
export declare const PRESS_CONTACT_STATUS_LABELS: Record<PressContactStatusView, string>;
export declare const PRESS_CONTACT_DECLINE_REASONS: readonly ["NOT_NOW", "NOT_INTERESTED", "ABUSIVE"];
export type PressContactDeclineReason = (typeof PRESS_CONTACT_DECLINE_REASONS)[number];
export declare const PRESS_CONTACT_DECLINE_LABELS: Record<PressContactDeclineReason, string>;
/** O que o cidadão vê de um pedido que recebeu. Nenhum contato do jornalista além do que ele mesmo escreveu. */
export interface PressContactReceived {
    id: string;
    status: PressContactStatusView;
    createdAt: string;
    expiresAt: string;
    message: string;
    outlet: {
        name: string;
        type: PressOutletType;
        website: string;
    };
    journalist: {
        id: string;
        name: string;
    };
    report: {
        id: string;
        title: string;
    };
    reply: string | null;
    viaVotzChat: boolean;
    respondedAt: string | null;
}
/** O que o jornalista vê de um pedido que enviou. Recusa nunca mostra o motivo. */
export interface PressContactSent {
    id: string;
    status: PressContactStatusView;
    createdAt: string;
    expiresAt: string;
    message: string;
    recipient: {
        name: string;
    };
    report: {
        id: string;
        title: string;
    };
    /** Só preenchido quando o cidadão aceitou. */
    reply: string | null;
    viaVotzChat: boolean;
    respondedAt: string | null;
}
/** Estado do "aceito falar com a imprensa" de um relato, do ponto de vista de quem está olhando. */
export interface PressContactReportStatus {
    optIn: boolean;
    isAuthor: boolean;
    /** O jornalista (Pro, credenciado) pode pedir contato agora? */
    canRequest: boolean;
    /** Quando não pode, o porquê em português. */
    reason: string | null;
    alreadyRequested: boolean;
}
//# sourceMappingURL=press.d.ts.map