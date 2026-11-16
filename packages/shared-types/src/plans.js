"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLANS_CATALOG = exports.COMPANY_PLANS = exports.ENTITY_PLANS = exports.POLITICIAN_PLANS = exports.PLAN_PRICES = exports.ENTITY_POPULATION_TIER_LABELS = exports.POLITICIAN_TIER_LABELS = exports.FEATURE_CATALOG = exports.FEATURE_STATUS = void 0;
exports.getPlanConfig = getPlanConfig;
exports.hasFeature = hasFeature;
exports.getMaxMembers = getMaxMembers;
exports.getRequiredPlanForFeature = getRequiredPlanForFeature;
exports.getPoliticianTier = getPoliticianTier;
const election_1 = require("./election");
const enums_1 = require("./enums");
/**
 * Status real de implementação de cada funcionalidade no código atual.
 * Regra de ouro: só marcar como 'available' o que já existe funcionalmente.
 */
exports.FEATURE_STATUS = {
    respond_reports: 'available',
    team: 'available',
    export_data: 'available',
    propostas: 'available',
    outbreak_alerts: 'available',
    analytics_basic: 'available',
    analytics_full: 'available',
    heatmap: 'available',
    sla_panel: 'available',
    pdf_report: 'available',
    share_card: 'available',
    api_access: 'available',
    webhooks: 'available',
    peer_comparison: 'soon',
    reply_templates: 'available',
    priority_support: 'available',
};
exports.FEATURE_CATALOG = {
    respond_reports: {
        key: 'respond_reports',
        label: 'Responder relatos e atualizar status',
        description: 'Resposta oficial pública e atualização de andamento com histórico',
        status: exports.FEATURE_STATUS.respond_reports,
    },
    team: {
        key: 'team',
        label: 'Gestão de equipe',
        description: 'Convite de membros com controle de papéis e permissões',
        status: exports.FEATURE_STATUS.team,
    },
    export_data: {
        key: 'export_data',
        label: 'Exportação de dados agregados',
        description: 'Exportação CSV/JSON dos relatos e métricas sem expor autores anônimos',
        status: exports.FEATURE_STATUS.export_data,
    },
    propostas: {
        key: 'propostas',
        label: 'Propostas no Mandatômetro',
        description: 'Cadastro e acompanhamento de propostas vinculadas ao mandato',
        status: exports.FEATURE_STATUS.propostas,
    },
    outbreak_alerts: {
        key: 'outbreak_alerts',
        label: 'Alertas de surto',
        description: 'Detecção e notificação quando relatos de uma categoria crescem rapidamente',
        status: exports.FEATURE_STATUS.outbreak_alerts,
    },
    analytics_basic: {
        key: 'analytics_basic',
        label: 'Visão geral e números básicos',
        description: 'Indicadores gerais e contagem de relatos por status e categoria',
        status: exports.FEATURE_STATUS.analytics_basic,
    },
    analytics_full: {
        key: 'analytics_full',
        label: 'Painel completo com filtros por período e bairro',
        description: 'Análise detalhada por recorte temporal e territorial',
        status: exports.FEATURE_STATUS.analytics_full,
    },
    heatmap: {
        key: 'heatmap',
        label: 'Mapa de calor por bairro',
        description: 'Visualização geográfica da concentração de relatos',
        status: exports.FEATURE_STATUS.heatmap,
    },
    sla_panel: {
        key: 'sla_panel',
        label: 'Painel de SLA por categoria e setor',
        description: 'Acompanhamento de prazos médios de atendimento por área',
        status: exports.FEATURE_STATUS.sla_panel,
    },
    pdf_report: {
        key: 'pdf_report',
        label: 'Relatório mensal em PDF',
        description: 'Relatório consolidado pronto para prestação de contas',
        status: exports.FEATURE_STATUS.pdf_report,
    },
    share_card: {
        key: 'share_card',
        label: 'Cartão compartilhável do Mandatômetro',
        description: 'Imagem pronta para redes sociais com resumo do mandato',
        status: exports.FEATURE_STATUS.share_card,
    },
    api_access: {
        key: 'api_access',
        label: 'Acesso à API pública de dados',
        description: 'Chaves de API para consulta programática de dados públicos',
        status: exports.FEATURE_STATUS.api_access,
    },
    webhooks: {
        key: 'webhooks',
        label: 'Webhooks de eventos',
        description: 'Notificações automáticas em tempo real para sistemas externos',
        status: exports.FEATURE_STATUS.webhooks,
    },
    peer_comparison: {
        key: 'peer_comparison',
        label: 'Comparativo entre municípios semelhantes',
        description: 'Referência comparativa com cidades e entidades de porte parecido',
        status: exports.FEATURE_STATUS.peer_comparison,
    },
    reply_templates: {
        key: 'reply_templates',
        label: 'Modelos prontos de resposta',
        description: 'Respostas padrão reutilizáveis para agilizar o atendimento',
        status: exports.FEATURE_STATUS.reply_templates,
    },
    priority_support: {
        key: 'priority_support',
        label: 'Suporte prioritário',
        description: 'Atendimento dedicado para dúvidas técnicas e operacionais',
        status: exports.FEATURE_STATUS.priority_support,
    },
};
exports.POLITICIAN_TIER_LABELS = {
    1: 'Faixa 1 — Vereador (município até 50 mil hab.)',
    2: 'Faixa 2 — Vereador (município acima de 50 mil hab.)',
    3: 'Faixa 3 — Prefeito, Vice-Prefeito e Deputado Estadual',
    4: 'Faixa 4 — Deputado Federal, Senador e Governador',
};
exports.ENTITY_POPULATION_TIER_LABELS = {
    UP_TO_50K: 'Município até 50 mil habitantes',
    FROM_50K_TO_300K: 'Município de 50 mil a 300 mil habitantes',
    OVER_300K: 'Município acima de 300 mil habitantes',
};
/**
 * Tabela editável de preços em centavos (BRL/mês).
 * Preços são hipóteses iniciais de negócio — manter centralizados aqui.
 */
exports.PLAN_PRICES = {
    POLITICIAN: {
        BASICO: { 1: 0, 2: 0, 3: 0, 4: 0 },
        MANDATO: { 1: 19000, 2: 29000, 3: 49000, 4: 79000 },
        MANDATO_PRO: { 1: 39000, 2: 59000, 3: 99000, 4: 149000 },
    },
    ENTITY: {
        BASICO: {
            UP_TO_50K: 0,
            FROM_50K_TO_300K: 0,
            OVER_300K: 0,
        },
        GESTAO: {
            UP_TO_50K: 59000,
            FROM_50K_TO_300K: 149000,
            OVER_300K: 320000,
        },
        // TODO: confirmar preço específico para o plano INTEGRACAO; usando valores de GESTAO provisoriamente
        INTEGRACAO: {
            UP_TO_50K: 59000,
            FROM_50K_TO_300K: 149000,
            OVER_300K: 320000,
        },
    },
    // Fase 2 do negócio: valores históricos, NÃO validados. Não alterar sem decisão do dono do produto.
    COMPANY: {
        [enums_1.CompanyPlan.STARTER]: 30000,
        [enums_1.CompanyPlan.BUSINESS]: 120000,
        // R$ 3.500+ é o piso de referência do Enterprise
        [enums_1.CompanyPlan.ENTERPRISE]: 350000,
        [enums_1.CompanyPlan.WHITE_LABEL]: null,
    },
};
function buildFeatures(enabled) {
    const set = new Set(enabled);
    return {
        respond_reports: set.has('respond_reports'),
        team: set.has('team'),
        export_data: set.has('export_data'),
        propostas: set.has('propostas'),
        outbreak_alerts: set.has('outbreak_alerts'),
        analytics_basic: set.has('analytics_basic'),
        analytics_full: set.has('analytics_full'),
        heatmap: set.has('heatmap'),
        sla_panel: set.has('sla_panel'),
        pdf_report: set.has('pdf_report'),
        share_card: set.has('share_card'),
        api_access: set.has('api_access'),
        webhooks: set.has('webhooks'),
        peer_comparison: set.has('peer_comparison'),
        reply_templates: set.has('reply_templates'),
        priority_support: set.has('priority_support'),
    };
}
exports.POLITICIAN_PLANS = {
    BASICO: {
        code: 'BASICO',
        orgType: 'POLITICIAN',
        label: 'Básico',
        description: 'Presença pública no Mandatômetro e resposta gratuita a relatos',
        limits: {
            maxMembers: 1,
            maxMembersByTier: { 1: 1, 2: 1, 3: 1, 4: 1 },
            historyDays: null,
            maxAlertRules: 0,
            maxReplyTemplates: 0,
            maxPdfReportsPerMonth: 0,
            maxShareCardsPerMonth: 0,
            maxWebhookEndpoints: 0,
        },
        features: buildFeatures(['respond_reports', 'analytics_basic']),
        status: { ...exports.FEATURE_STATUS },
    },
    MANDATO: {
        code: 'MANDATO',
        orgType: 'POLITICIAN',
        label: 'Mandato',
        description: 'Equipe de gabinete, propostas do mandato e alertas de surto',
        limits: {
            maxMembers: 3,
            maxMembersByTier: { 1: 2, 2: 3, 3: 5, 4: 8 },
            historyDays: null,
            maxAlertRules: 5,
            maxReplyTemplates: 0,
            maxPdfReportsPerMonth: 4,
            maxShareCardsPerMonth: 10,
            maxWebhookEndpoints: 0,
        },
        features: buildFeatures([
            'respond_reports',
            'team',
            'propostas',
            'outbreak_alerts',
            'analytics_basic',
            'analytics_full',
            'heatmap',
            'pdf_report',
            'share_card',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
    MANDATO_PRO: {
        code: 'MANDATO_PRO',
        orgType: 'POLITICIAN',
        label: 'Mandato Pro',
        description: 'Operação completa de gabinete com exportação de dados, API e suporte prioritário',
        limits: {
            maxMembers: 8,
            maxMembersByTier: { 1: 5, 2: 8, 3: 12, 4: 20 },
            historyDays: null,
            maxAlertRules: 25,
            maxReplyTemplates: 30,
            maxPdfReportsPerMonth: null,
            maxShareCardsPerMonth: null,
            maxWebhookEndpoints: 5,
        },
        features: buildFeatures([
            'respond_reports',
            'team',
            'export_data',
            'propostas',
            'outbreak_alerts',
            'analytics_basic',
            'analytics_full',
            'heatmap',
            'sla_panel',
            'pdf_report',
            'share_card',
            'api_access',
            'webhooks',
            'peer_comparison',
            'reply_templates',
            'priority_support',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
};
exports.ENTITY_PLANS = {
    BASICO: {
        code: 'BASICO',
        orgType: 'ENTITY',
        label: 'Básico',
        description: 'Atendimento gratuito de relatos com histórico dos últimos 30 dias',
        limits: {
            maxMembers: 2,
            historyDays: 30,
            maxAlertRules: 0,
            maxReplyTemplates: 0,
            maxPdfReportsPerMonth: 0,
            maxWebhookEndpoints: 0,
        },
        features: buildFeatures(['respond_reports', 'team', 'analytics_basic']),
        status: { ...exports.FEATURE_STATUS },
    },
    GESTAO: {
        code: 'GESTAO',
        orgType: 'ENTITY',
        label: 'Gestão',
        description: 'Histórico completo, exportação agregada, alertas de surto e equipe ampliada',
        limits: {
            maxMembers: 10,
            historyDays: null,
            maxAlertRules: 10,
            maxReplyTemplates: 15,
            maxPdfReportsPerMonth: 4,
            maxWebhookEndpoints: 0,
        },
        features: buildFeatures([
            'respond_reports',
            'team',
            'export_data',
            'outbreak_alerts',
            'analytics_basic',
            'analytics_full',
            'heatmap',
            'sla_panel',
            'pdf_report',
            'reply_templates',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
    INTEGRACAO: {
        code: 'INTEGRACAO',
        orgType: 'ENTITY',
        label: 'Integração',
        description: 'Equipe ilimitada, API pública de dados, suporte prioritário e recursos avançados',
        limits: {
            maxMembers: null,
            historyDays: null,
            maxAlertRules: 25,
            maxReplyTemplates: 50,
            maxPdfReportsPerMonth: null,
            maxWebhookEndpoints: 5,
        },
        features: buildFeatures([
            'respond_reports',
            'team',
            'export_data',
            'outbreak_alerts',
            'analytics_basic',
            'analytics_full',
            'heatmap',
            'sla_panel',
            'pdf_report',
            'api_access',
            'webhooks',
            'peer_comparison',
            'reply_templates',
            'priority_support',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
};
exports.COMPANY_PLANS = {
    [enums_1.CompanyPlan.STARTER]: {
        code: enums_1.CompanyPlan.STARTER,
        orgType: 'COMPANY',
        label: 'Starter',
        description: 'Plano inicial para empresas',
        limits: { maxMembers: 3, historyDays: 30 },
        features: buildFeatures(['respond_reports', 'team', 'analytics_basic']),
        status: { ...exports.FEATURE_STATUS },
    },
    [enums_1.CompanyPlan.BUSINESS]: {
        code: enums_1.CompanyPlan.BUSINESS,
        orgType: 'COMPANY',
        label: 'Business',
        description: 'Gestão corporativa de relatos',
        limits: { maxMembers: 10, historyDays: null },
        features: buildFeatures(['respond_reports', 'team', 'export_data', 'analytics_basic', 'analytics_full']),
        status: { ...exports.FEATURE_STATUS },
    },
    [enums_1.CompanyPlan.ENTERPRISE]: {
        code: enums_1.CompanyPlan.ENTERPRISE,
        orgType: 'COMPANY',
        label: 'Enterprise',
        description: 'Operação corporativa com API e suporte prioritário',
        limits: { maxMembers: 25, historyDays: null },
        features: buildFeatures([
            'respond_reports',
            'team',
            'export_data',
            'analytics_basic',
            'analytics_full',
            'api_access',
            'priority_support',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
    [enums_1.CompanyPlan.WHITE_LABEL]: {
        code: enums_1.CompanyPlan.WHITE_LABEL,
        orgType: 'COMPANY',
        label: 'White Label',
        description: 'Canal dedicado sob medida',
        limits: { maxMembers: null, historyDays: null },
        features: buildFeatures([
            'respond_reports',
            'team',
            'export_data',
            'analytics_basic',
            'analytics_full',
            'api_access',
            'webhooks',
            'priority_support',
        ]),
        status: { ...exports.FEATURE_STATUS },
    },
};
exports.PLANS_CATALOG = {
    POLITICIAN: exports.POLITICIAN_PLANS,
    ENTITY: exports.ENTITY_PLANS,
    COMPANY: exports.COMPANY_PLANS,
};
function getPlanConfig(orgType, plan) {
    if (orgType === 'POLITICIAN') {
        return exports.POLITICIAN_PLANS[plan] ?? null;
    }
    if (orgType === 'ENTITY') {
        return exports.ENTITY_PLANS[plan] ?? null;
    }
    if (orgType === 'COMPANY') {
        return exports.COMPANY_PLANS[plan] ?? null;
    }
    return null;
}
function hasFeature(orgType, plan, feature) {
    const config = getPlanConfig(orgType, plan);
    if (!config)
        return false;
    return Boolean(config.features[feature]);
}
function getMaxMembers(orgType, plan, tier) {
    const config = getPlanConfig(orgType, plan);
    if (!config)
        return 1;
    if (orgType === 'POLITICIAN' && config.limits.maxMembersByTier) {
        const resolvedTier = tier ?? 2;
        return config.limits.maxMembersByTier[resolvedTier];
    }
    return config.limits.maxMembers;
}
function getRequiredPlanForFeature(orgType, feature) {
    const plans = Object.values(exports.PLANS_CATALOG[orgType]);
    return plans.find((plan) => plan.features[feature]) ?? null;
}
const TIER_3_OFFICES = new Set([
    'prefeito',
    'prefeita',
    'vice prefeito',
    'vice prefeita',
    'deputado estadual',
    'deputada estadual',
    'deputado distrital',
    'deputada distrital',
]);
const TIER_4_OFFICES = new Set([
    'deputado federal',
    'deputada federal',
    'senador',
    'senadora',
    'governador',
    'governadora',
    'vice governador',
    'vice governadora',
    'presidente',
    'presidente da republica',
    'vice presidente',
    'vice presidente da republica',
]);
function getPoliticianTier(office, logger = console) {
    const raw = (office ?? '').trim();
    if (!raw) {
        logger.warn('[plans] Cargo do político vazio ao calcular faixa; usando faixa 2 por padrão.');
        return 2;
    }
    const normalized = (0, election_1.normalizePersonName)(raw.replace(/\(a\)/gi, '').replace(/-/g, ' '))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    if (normalized === 'vereador' || normalized === 'vereadora') {
        // TODO: distinguir Faixa 1 (município até 50 mil hab.) quando a população do município existir no modelo
        return 2;
    }
    if (TIER_3_OFFICES.has(normalized)) {
        return 3;
    }
    if (TIER_4_OFFICES.has(normalized)) {
        return 4;
    }
    logger.warn(`[plans] Cargo desconhecido "${raw}" ao calcular faixa; usando faixa 2 por padrão.`);
    return 2;
}
//# sourceMappingURL=plans.js.map