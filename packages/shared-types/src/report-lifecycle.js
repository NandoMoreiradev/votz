"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMELINE_ACTIONS = exports.ADVOCACY_PROMISE_DAYS = exports.DISPUTE_WINDOW_DAYS = exports.REPORT_LIFECYCLE_LIMITS = exports.ARCHIVE_REASON_LABELS = exports.ArchiveReason = exports.RECIPIENT_STATUS_TRANSITIONS = exports.ACTIVE_REPORT_STATUSES = void 0;
exports.recipientStatusOptions = recipientStatusOptions;
exports.canRecipientChangeStatus = canRecipientChangeStatus;
exports.getArchiveReasonLabel = getArchiveReasonLabel;
exports.checkDisputeWindow = checkDisputeWindow;
exports.timelineEventLabel = timelineEventLabel;
const enums_1 = require("./enums");
/**
 * Regras do ciclo de vida do relato, usadas pela API (que decide) e pelo site e app (que só mostram
 * as opções válidas). Mudar uma regra aqui muda as três pontas juntas.
 */
/** Status em que o relato ainda está "na mão" de quem deve resolver. */
exports.ACTIVE_REPORT_STATUSES = [
    enums_1.ReportStatus.OPEN,
    enums_1.ReportStatus.UNDER_REVIEW,
    enums_1.ReportStatus.IN_PROGRESS,
];
/** Status que o destinatário pode escolher, a partir de cada status atual. */
exports.RECIPIENT_STATUS_TRANSITIONS = {
    [enums_1.ReportStatus.OPEN]: [enums_1.ReportStatus.UNDER_REVIEW, enums_1.ReportStatus.IN_PROGRESS, enums_1.ReportStatus.RESOLVED, enums_1.ReportStatus.ARCHIVED],
    [enums_1.ReportStatus.UNDER_REVIEW]: [enums_1.ReportStatus.IN_PROGRESS, enums_1.ReportStatus.RESOLVED, enums_1.ReportStatus.ARCHIVED],
    [enums_1.ReportStatus.IN_PROGRESS]: [enums_1.ReportStatus.RESOLVED, enums_1.ReportStatus.ARCHIVED],
    // Resolvido e arquivado só mudam por contestação; contestado só muda por decisão da moderação.
    [enums_1.ReportStatus.RESOLVED]: [],
    [enums_1.ReportStatus.ARCHIVED]: [],
    [enums_1.ReportStatus.DISPUTED]: [],
};
function recipientStatusOptions(current) {
    return [...(exports.RECIPIENT_STATUS_TRANSITIONS[current] ?? [])];
}
function canRecipientChangeStatus(from, to) {
    return recipientStatusOptions(from).includes(to);
}
var ArchiveReason;
(function (ArchiveReason) {
    ArchiveReason["DUPLICATE"] = "DUPLICATE";
    ArchiveReason["OUT_OF_SCOPE"] = "OUT_OF_SCOPE";
    ArchiveReason["INSUFFICIENT_INFO"] = "INSUFFICIENT_INFO";
    ArchiveReason["NOT_A_PUBLIC_PROBLEM"] = "NOT_A_PUBLIC_PROBLEM";
})(ArchiveReason || (exports.ArchiveReason = ArchiveReason = {}));
exports.ARCHIVE_REASON_LABELS = {
    [ArchiveReason.DUPLICATE]: 'Relato repetido (já existe outro sobre o mesmo problema)',
    [ArchiveReason.OUT_OF_SCOPE]: 'Não é com a gente (outro órgão cuida disso)',
    [ArchiveReason.INSUFFICIENT_INFO]: 'Faltam informações para atender',
    [ArchiveReason.NOT_A_PUBLIC_PROBLEM]: 'Não é um problema público',
};
function getArchiveReasonLabel(reason) {
    if (!reason)
        return '';
    return exports.ARCHIVE_REASON_LABELS[reason] ?? reason;
}
/** Limites de texto de cada ação (iguais na API, no site e no app). */
exports.REPORT_LIFECYCLE_LIMITS = {
    UPDATE_MIN: 10,
    UPDATE_MAX: 500,
    /** Marcar como resolvido pede uma explicação mais completa. */
    RESOLVE_MIN: 30,
    DISPUTE_MIN: 20,
    DISPUTE_MAX: 500,
    DECISION_MIN: 20,
    WITHDRAW_MIN: 10,
    ADVOCACY_MESSAGE_MAX: 1000,
    MEDIA_MAX: 4,
    DISPUTE_EVIDENCE_MAX: 5,
};
/** Dias que o cidadão tem para contestar uma resolução ou um arquivamento. */
exports.DISPUTE_WINDOW_DAYS = 30;
/** Prazos que o político ou a entidade pode prometer ao avocar. */
exports.ADVOCACY_PROMISE_DAYS = [7, 15, 30, 60, 90];
/**
 * Pode contestar quem é autor (ou marcou "Eu também"), dentro de 30 dias depois da resolução ou do
 * arquivamento, uma vez por resolução: se o relato for reaberto e "resolvido" de novo, vale nova contestação.
 */
function checkDisputeWindow(input) {
    const closedRaw = input.status === enums_1.ReportStatus.RESOLVED
        ? input.resolvedAt
        : input.status === enums_1.ReportStatus.ARCHIVED
            ? input.archivedAt
            : null;
    if (!closedRaw)
        return { ok: false, reason: 'NOT_CLOSED' };
    const closedAt = new Date(closedRaw);
    const deadline = new Date(closedAt.getTime() + exports.DISPUTE_WINDOW_DAYS * 86_400_000);
    const now = input.now ?? new Date();
    const alreadyDisputed = (input.disputeDates ?? []).some((d) => new Date(d).getTime() >= closedAt.getTime());
    if (alreadyDisputed)
        return { ok: false, reason: 'ALREADY_DISPUTED', deadline };
    if (now.getTime() > deadline.getTime())
        return { ok: false, reason: 'WINDOW_EXPIRED', deadline };
    return { ok: true, closedAt, deadline };
}
/** Ações gravadas em `metadata.action` dos eventos da linha do tempo. */
exports.TIMELINE_ACTIONS = {
    ADVOCATED: 'advocated',
    ADVOCACY_WITHDRAWN: 'advocacy_withdrawn',
    RESPONDED: 'responded',
    UPDATE: 'update',
    STATUS_CHANGED: 'status_changed',
    RESOLUTION_CONFIRMED: 'resolution_confirmed',
    DISPUTE_DECIDED: 'dispute_decided',
    MANDATE_ENDED: 'mandate_ended',
    MANDATE_ENDED_UNRESOLVED: 'mandate_ended_unresolved_commitment',
};
/** Rótulo de um evento da linha do tempo, olhando primeiro a ação e depois o tipo. */
function timelineEventLabel(type, metadata) {
    const action = typeof metadata?.action === 'string' ? metadata.action : '';
    switch (action) {
        case exports.TIMELINE_ACTIONS.ADVOCATED:
            return 'Avocado';
        case exports.TIMELINE_ACTIONS.ADVOCACY_WITHDRAWN:
            return 'Desistiu da avocação';
        case exports.TIMELINE_ACTIONS.RESOLUTION_CONFIRMED:
            return 'Resolução confirmada';
        case exports.TIMELINE_ACTIONS.DISPUTE_DECIDED:
            return metadata?.decision === 'REOPEN' ? 'Contestação aceita' : 'Contestação negada';
        case exports.TIMELINE_ACTIONS.MANDATE_ENDED:
        case exports.TIMELINE_ACTIONS.MANDATE_ENDED_UNRESOLVED:
            return 'Mandato encerrado';
    }
    const byType = {
        CREATED: 'Registrado',
        RESPONDED: 'Resposta oficial',
        STATUS_CHANGED: 'Status alterado',
        UPDATE: 'Atualização',
        DISPUTED: 'Contestado',
        RESOLVED: 'Resolvido',
        ARCHIVED: 'Arquivado',
    };
    return byType[type] ?? type;
}
//# sourceMappingURL=report-lifecycle.js.map