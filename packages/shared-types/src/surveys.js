"use strict";
/**
 * Pesquisa Votz (pesquisas oficiais anonimizadas) — tipos, enums, limites e textos compartilhados
 * entre API, Web e Mobile.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SURVEY_ANONYMITY_NOTICE = exports.SURVEY_METHODOLOGY_LABELS = exports.SURVEY_ORIGIN_LABELS = exports.SURVEY_KIND_LABELS = exports.SURVEY_DEFAULTS = exports.SURVEY_REVIEW_LABELS = exports.SURVEY_INVITATION_STATUSES = exports.SURVEY_REVIEW_STATUSES = exports.SURVEY_RESULTS_VISIBILITIES = exports.SURVEY_QUESTION_TYPES = exports.SURVEY_VERIFICATION_LEVELS = exports.SURVEY_SCOPES = exports.SURVEY_STATUSES = exports.SURVEY_METHODOLOGY_TYPES = exports.SURVEY_DISTRIBUTION_MODES = exports.SURVEY_ORIGINS = exports.SURVEY_KINDS = void 0;
exports.SURVEY_KINDS = ['VOTING_INTENTION', 'APPROVAL_RATING', 'CIVIC_TOPIC'];
exports.SURVEY_ORIGINS = ['VOTZ', 'PARTNER_INSTITUTE', 'PUBLIC_ENTITY'];
exports.SURVEY_DISTRIBUTION_MODES = ['OPEN', 'INVITED_SAMPLE'];
exports.SURVEY_METHODOLOGY_TYPES = ['OPEN_PANEL', 'WEIGHTED_QUOTA', 'REGISTERED_TSE'];
exports.SURVEY_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED', 'CANCELLED'];
exports.SURVEY_SCOPES = ['NATIONAL', 'STATE', 'MUNICIPAL'];
exports.SURVEY_VERIFICATION_LEVELS = ['STANDARD', 'VERIFIED_CPF'];
exports.SURVEY_QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'SCALE_5'];
exports.SURVEY_RESULTS_VISIBILITIES = ['AFTER_VOTE', 'AFTER_CLOSE'];
exports.SURVEY_REVIEW_STATUSES = ['APPROVED', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'REJECTED'];
exports.SURVEY_INVITATION_STATUSES = ['INVITED', 'RESPONDED', 'DECLINED', 'EXPIRED'];
exports.SURVEY_REVIEW_LABELS = {
    APPROVED: 'Aprovada',
    PENDING_REVIEW: 'Em revisão',
    CHANGES_REQUESTED: 'Ajustes pedidos',
    REJECTED: 'Recusada',
};
exports.SURVEY_DEFAULTS = {
    MIN_QUORUM_TO_PUBLISH: 100,
    K_ANONYMITY_THRESHOLD: 30,
    MIN_ACCOUNT_AGE_DAYS: 7,
    MIX_POOL_BATCH_SIZE: 20,
    MAX_QUESTIONS: 20,
    MAX_OPTIONS_PER_QUESTION: 25,
};
exports.SURVEY_KIND_LABELS = {
    VOTING_INTENTION: 'Intenção de voto',
    APPROVAL_RATING: 'Avaliação de gestão',
    CIVIC_TOPIC: 'Pesquisa cívica',
};
exports.SURVEY_ORIGIN_LABELS = {
    VOTZ: 'Pesquisa Votz · Oficial',
    PARTNER_INSTITUTE: 'Instituto Credenciado',
    PUBLIC_ENTITY: 'Consulta Pública',
};
exports.SURVEY_METHODOLOGY_LABELS = {
    OPEN_PANEL: 'Sondagem aberta entre usuários do Votz (amostra não probabilística)',
    WEIGHTED_QUOTA: 'Amostra estratificada / ponderada por cotas (IBGE)',
    REGISTERED_TSE: 'Pesquisa eleitoral registrada no TSE (PesqEle)',
};
exports.SURVEY_ANONYMITY_NOTICE = 'Seu voto é anônimo e definitivo. Ao confirmar, o Votz separa sua identidade da sua resposta: nem você nem o sistema poderão alterar ou consultar em quem você votou.';
//# sourceMappingURL=surveys.js.map