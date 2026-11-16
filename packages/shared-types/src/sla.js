"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SLA_HOURS_BY_CATEGORY = exports.SLA_PAUSABLE_STATUSES = exports.DEFAULT_SLA_ESCALATION_HOURS = exports.SLA_AT_RISK_THRESHOLD_RATIO = void 0;
exports.toSaoPauloDateKey = toSaoPauloDateKey;
exports.hasConfiguredOwnSla = hasConfiguredOwnSla;
exports.resolvePublicSlaDisplayState = resolvePublicSlaDisplayState;
exports.resolveCategorySlaHours = resolveCategorySlaHours;
exports.resolveOptionalResolutionSlaHours = resolveOptionalResolutionSlaHours;
exports.computeSla = computeSla;
const enums_1 = require("./enums");
/**
 * TODO(v2): considerar horário comercial, feriados nacionais/municipais
 * e status de pausa ("aguardando cidadão"). Na v1 o SLA corre em horas corridas.
 */
exports.SLA_AT_RISK_THRESHOLD_RATIO = 0.75;
exports.DEFAULT_SLA_ESCALATION_HOURS = 24;
exports.SLA_PAUSABLE_STATUSES = [];
exports.DEFAULT_SLA_HOURS_BY_CATEGORY = {
    [enums_1.Category.SAFETY]: 24,
    [enums_1.Category.HEALTH]: 48,
    [enums_1.Category.CORRUPTION]: 48,
    [enums_1.Category.SANITATION]: 72,
    [enums_1.Category.MOBILITY]: 72,
    [enums_1.Category.INFRASTRUCTURE]: 72,
    [enums_1.Category.URBAN_SERVICES]: 72,
    [enums_1.Category.ENVIRONMENT]: 72,
    [enums_1.Category.ACCESSIBILITY]: 72,
    [enums_1.Category.SOCIAL_WELFARE]: 72,
    [enums_1.Category.EDUCATION]: 96,
    [enums_1.Category.HOUSING]: 96,
    [enums_1.Category.OTHER]: 120,
};
const SP_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});
function toSaoPauloDateKey(date) {
    return SP_DATE_FORMATTER.format(date);
}
function hasConfiguredOwnSla(slaHours) {
    if (!slaHours || typeof slaHours !== 'object' || Array.isArray(slaHours)) {
        return false;
    }
    return Object.values(slaHours).some((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}
function resolvePublicSlaDisplayState(params) {
    if (params.hasOwnSla) {
        return {
            showPercentage: !params.suppressed,
            label: 'Cumprimento dos prazos declarados pela entidade',
            emptyMessage: null,
            showConfigureInvite: false,
        };
    }
    return {
        showPercentage: false,
        label: 'Prazos declarados (SLA)',
        emptyMessage: 'Esta entidade ainda não declarou seus prazos de resposta.',
        showConfigureInvite: Boolean(params.canConfigureSla),
    };
}
function resolveCategorySlaHours(category, slaHours) {
    const configured = slaHours?.[category];
    if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 1) {
        return Math.round(configured);
    }
    return exports.DEFAULT_SLA_HOURS_BY_CATEGORY[category] ?? 120;
}
function resolveOptionalResolutionSlaHours(category, resolutionSlaHours) {
    const configured = resolutionSlaHours?.[category];
    if (typeof configured === 'number' && Number.isFinite(configured) && configured >= 1) {
        return Math.round(configured);
    }
    return null;
}
function evaluateDeadline(params) {
    const totalMs = Math.max(1, params.targetHours) * 3_600_000;
    const dueAt = new Date(params.startedAt.getTime() + totalMs + Math.max(0, params.pausedMs));
    if (params.archivedWithoutCompletion) {
        const elapsedHours = Number((Math.max(0, params.now.getTime() - params.startedAt.getTime()) / 3_600_000).toFixed(2));
        return {
            targetHours: params.targetHours,
            startedAt: params.startedAt,
            dueAt,
            metAt: null,
            state: null,
            elapsedHours,
            remainingHours: Number(((dueAt.getTime() - params.now.getTime()) / 3_600_000).toFixed(2)),
            progressRatio: Number((Math.max(0, params.now.getTime() - params.startedAt.getTime()) / totalMs).toFixed(4)),
        };
    }
    if (params.completedAt) {
        const metOnTime = params.completedAt.getTime() <= dueAt.getTime();
        const elapsedMs = Math.max(0, params.completedAt.getTime() - params.startedAt.getTime() - Math.max(0, params.pausedMs));
        return {
            targetHours: params.targetHours,
            startedAt: params.startedAt,
            dueAt,
            metAt: params.completedAt,
            state: metOnTime ? 'MET' : 'MET_LATE',
            elapsedHours: Number((elapsedMs / 3_600_000).toFixed(2)),
            remainingHours: Number(((dueAt.getTime() - params.completedAt.getTime()) / 3_600_000).toFixed(2)),
            progressRatio: Number((elapsedMs / totalMs).toFixed(4)),
        };
    }
    const elapsedMs = Math.max(0, params.now.getTime() - params.startedAt.getTime() - Math.max(0, params.pausedMs));
    const progressRatio = elapsedMs / totalMs;
    const remainingHours = Number(((dueAt.getTime() - params.now.getTime()) / 3_600_000).toFixed(2));
    const elapsedHours = Number((elapsedMs / 3_600_000).toFixed(2));
    let state;
    if (params.isPaused) {
        state = params.previousState ?? 'ON_TIME';
    }
    else if (params.now.getTime() >= dueAt.getTime()) {
        state = 'BREACHED';
    }
    else if (progressRatio >= exports.SLA_AT_RISK_THRESHOLD_RATIO) {
        state = 'AT_RISK';
    }
    else {
        state = 'ON_TIME';
    }
    return {
        targetHours: params.targetHours,
        startedAt: params.startedAt,
        dueAt,
        metAt: null,
        state,
        elapsedHours,
        remainingHours,
        progressRatio: Number(progressRatio.toFixed(4)),
    };
}
/**
 * Calcula estado de SLA de primeira resposta (e opcionalmente resolução) de forma pura e determinística
 * no fuso America/Sao_Paulo, exigindo injeção explícita de `now`.
 */
function computeSla(report, policy, now) {
    const startedAt = report.slaStartedAt ?? report.createdAt;
    const responseTargetHours = resolveCategorySlaHours(report.category, policy?.slaHours);
    const pausedStatuses = policy?.pausedStatuses ?? exports.SLA_PAUSABLE_STATUSES;
    const isPaused = pausedStatuses.includes(report.status);
    const pausedMs = Math.max(0, report.slaPausedMs ?? 0);
    const effectiveFirstResponseAt = report.firstResponseAt ??
        (report.status === enums_1.ReportStatus.RESOLVED ? (report.resolvedAt ?? null) : null);
    const isArchivedWithoutCompletion = report.status === enums_1.ReportStatus.ARCHIVED && effectiveFirstResponseAt === null;
    const responseResult = evaluateDeadline({
        startedAt,
        targetHours: responseTargetHours,
        completedAt: effectiveFirstResponseAt,
        archivedWithoutCompletion: isArchivedWithoutCompletion,
        isPaused,
        previousState: report.slaState ?? null,
        pausedMs,
        now,
    });
    const resolutionHours = resolveOptionalResolutionSlaHours(report.category, policy?.resolutionSlaHours);
    let resolution = null;
    if (resolutionHours !== null) {
        const effectiveResolvedAt = report.status === enums_1.ReportStatus.RESOLVED ? (report.resolvedAt ?? null) : null;
        const archivedNoResolution = report.status === enums_1.ReportStatus.ARCHIVED && effectiveResolvedAt === null;
        resolution = evaluateDeadline({
            startedAt,
            targetHours: resolutionHours,
            completedAt: effectiveResolvedAt,
            archivedWithoutCompletion: archivedNoResolution,
            isPaused,
            previousState: null,
            pausedMs,
            now,
        });
    }
    const dueDaySp = toSaoPauloDateKey(responseResult.dueAt);
    const nowDaySp = toSaoPauloDateKey(now);
    const hoursOverdue = responseResult.state === 'BREACHED'
        ? Number(Math.max(0, (now.getTime() - responseResult.dueAt.getTime()) / 3_600_000).toFixed(2))
        : 0;
    const escalationThreshold = typeof policy?.escalationHours === 'number' && policy.escalationHours >= 1
        ? policy.escalationHours
        : exports.DEFAULT_SLA_ESCALATION_HOURS;
    return {
        slaStartedAt: startedAt,
        slaDueAt: responseResult.dueAt,
        slaState: responseResult.state,
        slaMetAt: responseResult.metAt,
        responseTargetHours,
        elapsedHours: responseResult.elapsedHours,
        remainingHours: responseResult.remainingHours,
        progressRatio: responseResult.progressRatio,
        dueDaySp,
        nowDaySp,
        isDueToday: dueDaySp === nowDaySp &&
            (responseResult.state === 'ON_TIME' || responseResult.state === 'AT_RISK'),
        isPaused,
        hoursOverdue,
        shouldEscalate: responseResult.state === 'BREACHED' && hoursOverdue >= escalationThreshold,
        resolution,
    };
}
//# sourceMappingURL=sla.js.map