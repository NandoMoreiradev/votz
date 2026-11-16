"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEBHOOK_DELIVERY_STATUS_LABELS = exports.WEBHOOK_EVENT_LABELS = exports.SHARE_CARD_FORMAT_LABELS = exports.ALERT_FREQUENCY_LABELS = exports.ALERT_RULE_TYPE_LABELS = exports.ACCOUNTABILITY_STATUS_LABELS = exports.REPORT_STATUS_LABELS = void 0;
exports.getReportStatusLabel = getReportStatusLabel;
exports.getAccountabilityStatusLabel = getAccountabilityStatusLabel;
exports.getAlertRuleTypeLabel = getAlertRuleTypeLabel;
exports.getAlertFrequencyLabel = getAlertFrequencyLabel;
exports.getShareCardFormatLabel = getShareCardFormatLabel;
exports.getWebhookEventLabel = getWebhookEventLabel;
exports.getWebhookDeliveryStatusLabel = getWebhookDeliveryStatusLabel;
const enums_1 = require("./enums");
exports.REPORT_STATUS_LABELS = {
    [enums_1.ReportStatus.OPEN]: 'Aberto',
    [enums_1.ReportStatus.UNDER_REVIEW]: 'Em análise',
    [enums_1.ReportStatus.IN_PROGRESS]: 'Em andamento',
    [enums_1.ReportStatus.RESOLVED]: 'Resolvido',
    [enums_1.ReportStatus.DISPUTED]: 'Contestado',
    [enums_1.ReportStatus.ARCHIVED]: 'Arquivado',
};
function getReportStatusLabel(status) {
    return exports.REPORT_STATUS_LABELS[status] ?? status;
}
exports.ACCOUNTABILITY_STATUS_LABELS = {
    PENDING: 'Em processamento',
    READY: 'Pronto',
    FAILED: 'Falhou',
};
function getAccountabilityStatusLabel(status) {
    return exports.ACCOUNTABILITY_STATUS_LABELS[status] ?? status;
}
exports.ALERT_RULE_TYPE_LABELS = {
    NEW_REPORT: 'Novo relato na área',
    PRESSURE_THRESHOLD: 'Pressão acima de X',
    SURTO: 'Surto detectado',
    STALLED_REPORT: 'Relato parado há N dias',
};
function getAlertRuleTypeLabel(ruleType) {
    return exports.ALERT_RULE_TYPE_LABELS[ruleType] ?? ruleType;
}
exports.ALERT_FREQUENCY_LABELS = {
    IMMEDIATE: 'Imediato',
    DAILY_DIGEST: 'Digest diário',
};
function getAlertFrequencyLabel(frequency) {
    return exports.ALERT_FREQUENCY_LABELS[frequency] ?? frequency;
}
exports.SHARE_CARD_FORMAT_LABELS = {
    FEED: 'Feed vertical',
    STORIES: 'Stories',
};
function getShareCardFormatLabel(format) {
    return exports.SHARE_CARD_FORMAT_LABELS[format] ?? format;
}
exports.WEBHOOK_EVENT_LABELS = {
    REPORT_CREATED: 'Novo relato criado',
    REPORT_STATUS_CHANGED: 'Mudança de status do relato',
    REPORT_PRESSURE_THRESHOLD: 'Pressão acima do limite',
    OUTBREAK_DETECTED: 'Surto detectado',
    SLA_AT_RISK: 'Prazo SLA em risco',
    SLA_BREACHED: 'Prazo SLA vencido',
    REPORT_ASSIGNED: 'Relato atribuído na fila',
};
function getWebhookEventLabel(eventType) {
    return exports.WEBHOOK_EVENT_LABELS[eventType] ?? eventType;
}
exports.WEBHOOK_DELIVERY_STATUS_LABELS = {
    PENDING: 'Pendente',
    SUCCESS: 'Entregue',
    FAILED: 'Falhou',
    DEAD: 'Encerrada',
};
function getWebhookDeliveryStatusLabel(status) {
    return exports.WEBHOOK_DELIVERY_STATUS_LABELS[status] ?? status;
}
//# sourceMappingURL=statuses.js.map