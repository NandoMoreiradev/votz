import { Category, ReportStatus } from './enums';
export type SlaStateValue = 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'MET' | 'MET_LATE';
/**
 * TODO(v2): considerar horário comercial, feriados nacionais/municipais
 * e status de pausa ("aguardando cidadão"). Na v1 o SLA corre em horas corridas.
 */
export declare const SLA_AT_RISK_THRESHOLD_RATIO = 0.75;
export declare const DEFAULT_SLA_ESCALATION_HOURS = 24;
export declare const SLA_PAUSABLE_STATUSES: readonly ReportStatus[];
export declare const DEFAULT_SLA_HOURS_BY_CATEGORY: Record<Category, number>;
export interface SlaReportInput {
    category: Category;
    status: ReportStatus | string;
    createdAt: Date;
    firstResponseAt?: Date | null;
    resolvedAt?: Date | null;
    slaStartedAt?: Date | null;
    slaState?: SlaStateValue | null;
    slaPausedMs?: number;
}
export interface SlaPolicyInput {
    slaHours?: Partial<Record<Category | string, number>> | null;
    resolutionSlaHours?: Partial<Record<Category | string, number>> | null;
    escalationHours?: number | null;
    pausedStatuses?: readonly (ReportStatus | string)[];
}
export interface SlaDeadlineResult {
    targetHours: number;
    startedAt: Date;
    dueAt: Date;
    metAt: Date | null;
    state: SlaStateValue | null;
    elapsedHours: number;
    remainingHours: number;
    progressRatio: number;
}
export interface ComputedSlaResult {
    slaStartedAt: Date;
    slaDueAt: Date;
    slaState: SlaStateValue | null;
    slaMetAt: Date | null;
    responseTargetHours: number;
    elapsedHours: number;
    remainingHours: number;
    progressRatio: number;
    dueDaySp: string;
    nowDaySp: string;
    isDueToday: boolean;
    isPaused: boolean;
    hoursOverdue: number;
    shouldEscalate: boolean;
    resolution: SlaDeadlineResult | null;
}
export declare function toSaoPauloDateKey(date: Date): string;
export declare function resolveCategorySlaHours(category: Category, slaHours?: Partial<Record<Category | string, number>> | null): number;
export declare function resolveOptionalResolutionSlaHours(category: Category, resolutionSlaHours?: Partial<Record<Category | string, number>> | null): number | null;
/**
 * Calcula estado de SLA de primeira resposta (e opcionalmente resolução) de forma pura e determinística
 * no fuso America/Sao_Paulo, exigindo injeção explícita de `now`.
 */
export declare function computeSla(report: SlaReportInput, policy: SlaPolicyInput, now: Date): ComputedSlaResult;
//# sourceMappingURL=sla.d.ts.map