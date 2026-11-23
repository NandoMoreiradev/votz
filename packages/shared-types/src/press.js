"use strict";
// Credenciamento de imprensa: valores e textos que API e site usam do mesmo jeito.
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESS_CONTACT_DECLINE_LABELS = exports.PRESS_CONTACT_DECLINE_REASONS = exports.PRESS_CONTACT_STATUS_LABELS = exports.PRESS_CONTACT_STATUSES = exports.PRESS_CONTACT_LIMITS = exports.PRESS_SEARCH_LIMITS = exports.PRESS_PLAN_LIMITS = exports.PRESS_RADAR_LIMITS = exports.PRESS_RADAR_FREQUENCY_LABELS = exports.PRESS_RADAR_FREQUENCIES = exports.PRESS_RADAR_KIND_HELP = exports.PRESS_RADAR_KIND_LABELS = exports.PRESS_RADAR_KINDS = exports.PRESS_PLAN_LABELS = exports.PRESS_PLANS = exports.PRESS_CREDENTIAL_LIMITS = exports.PRESS_CREDENTIAL_STATUS_LABELS = exports.PRESS_CREDENTIAL_STATUSES = exports.PRESS_OUTLET_LABELS = exports.PRESS_OUTLET_TYPES = void 0;
exports.PRESS_OUTLET_TYPES = [
    'TV',
    'RADIO',
    'NEWSPAPER',
    'PORTAL',
    'AGENCY',
    'INDEPENDENT',
    'FREELANCER',
    'OTHER',
];
exports.PRESS_OUTLET_LABELS = {
    TV: 'TV',
    RADIO: 'Rádio',
    NEWSPAPER: 'Jornal ou revista',
    PORTAL: 'Portal ou site de notícias',
    AGENCY: 'Agência de notícias',
    INDEPENDENT: 'Mídia independente ou blog',
    FREELANCER: 'Jornalista freelancer',
    OTHER: 'Outro',
};
exports.PRESS_CREDENTIAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'];
exports.PRESS_CREDENTIAL_STATUS_LABELS = {
    PENDING: 'Em análise',
    APPROVED: 'Aprovada',
    REJECTED: 'Recusada',
    REVOKED: 'Cancelada',
};
exports.PRESS_CREDENTIAL_LIMITS = {
    OUTLET_NAME_MAX: 120,
    JOB_TITLE_MAX: 80,
    WEBSITE_MAX: 300,
    EMAIL_MAX: 200,
    COVERAGE_MAX: 160,
    NOTE_MAX: 500,
    REVIEW_NOTE_MAX: 500,
    PORTFOLIO_MAX: 5,
    PORTFOLIO_MIN: 1,
};
// ── Plano da imprensa ────────────────────────────────────────────────────────
exports.PRESS_PLANS = ['GRATUITA', 'PRO'];
exports.PRESS_PLAN_LABELS = {
    GRATUITA: 'Credencial gratuita',
    PRO: 'Imprensa Pro',
};
exports.PRESS_RADAR_KINDS = ['SURGE', 'PRESSURE', 'UNANSWERED'];
exports.PRESS_RADAR_KIND_LABELS = {
    SURGE: 'Surto detectado',
    PRESSURE: 'Relato com muita pressão',
    UNANSWERED: 'Relato sem resposta da entidade',
};
exports.PRESS_RADAR_KIND_HELP = {
    SURGE: 'Avisa quando o Votz detecta um aumento de relatos do mesmo tema na mesma cidade.',
    PRESSURE: 'Avisa quando um relato passa da pressão que você escolher.',
    UNANSWERED: 'Avisa quando um relato fica sem nenhuma resposta da entidade pelo número de dias que você escolher.',
};
exports.PRESS_RADAR_FREQUENCIES = ['IMMEDIATE', 'DAILY'];
exports.PRESS_RADAR_FREQUENCY_LABELS = {
    IMMEDIATE: 'Na hora (até 15 minutos)',
    DAILY: 'Um resumo por dia',
};
exports.PRESS_RADAR_LIMITS = {
    NAME_MAX: 80,
    NAME_MIN: 2,
    MAX_STATES: 5,
    MAX_CITIES: 5,
    CITY_MAX: 100,
    MIN_PRESSURE_MIN: 1,
    MIN_PRESSURE_MAX: 10000,
    STALLED_DAYS_MIN: 1,
    STALLED_DAYS_MAX: 90,
};
exports.PRESS_PLAN_LIMITS = {
    GRATUITA: {
        maxRadarRules: 2,
        radarFrequencies: ['DAILY'],
        exportMaxDays: 90,
        exportMaxRows: 1000,
        richExport: false,
        jsonExport: false,
        timeSeries: false,
        searchResults: 10,
        aiBriefing: false,
        canRequestContact: false,
    },
    PRO: {
        maxRadarRules: 20,
        radarFrequencies: ['IMMEDIATE', 'DAILY'],
        exportMaxDays: 365,
        exportMaxRows: 5000,
        richExport: true,
        jsonExport: true,
        timeSeries: true,
        searchResults: 30,
        aiBriefing: true,
        canRequestContact: true,
    },
};
// ── Busca por significado e briefing de surto (IA) ────────────────────────────
exports.PRESS_SEARCH_LIMITS = { QUERY_MIN: 3, QUERY_MAX: 300 };
// ── Pedido de contato da imprensa ao cidadão (consentimento) ──────────────────
exports.PRESS_CONTACT_LIMITS = {
    MESSAGE_MIN: 20,
    MESSAGE_MAX: 500,
    REPLY_MAX: 300,
    /** Dias até o pedido sem resposta deixar de valer. */
    EXPIRES_DAYS: 14,
    /** Depois que a pessoa recusa, o mesmo jornalista não pede de novo por este tempo. */
    DECLINE_COOLDOWN_DAYS: 7,
    /** Denúncias de abuso (recusa "abusivo") que suspendem os pedidos do jornalista até a moderação revisar. */
    ABUSE_SUSPEND_AT: 5,
};
exports.PRESS_CONTACT_STATUSES = ['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'];
exports.PRESS_CONTACT_STATUS_LABELS = {
    PENDING: 'Aguardando resposta',
    ACCEPTED: 'Aceito',
    DECLINED: 'Sem disponibilidade',
    CANCELLED: 'Cancelado',
    EXPIRED: 'Venceu sem resposta',
};
exports.PRESS_CONTACT_DECLINE_REASONS = ['NOT_NOW', 'NOT_INTERESTED', 'ABUSIVE'];
exports.PRESS_CONTACT_DECLINE_LABELS = {
    NOT_NOW: 'Agora não posso',
    NOT_INTERESTED: 'Não quero falar sobre isso',
    ABUSIVE: 'Este pedido é abusivo ou suspeito (denunciar)',
};
//# sourceMappingURL=press.js.map