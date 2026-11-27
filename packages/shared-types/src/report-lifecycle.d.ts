import { ReportStatus } from './enums';
/**
 * Regras do ciclo de vida do relato, usadas pela API (que decide) e pelo site e app (que só mostram
 * as opções válidas). Mudar uma regra aqui muda as três pontas juntas.
 */
/** Status em que o relato ainda está "na mão" de quem deve resolver. */
export declare const ACTIVE_REPORT_STATUSES: readonly ReportStatus[];
/** Status que o destinatário pode escolher, a partir de cada status atual. */
export declare const RECIPIENT_STATUS_TRANSITIONS: Readonly<Record<ReportStatus, readonly ReportStatus[]>>;
export declare function recipientStatusOptions(current: string): ReportStatus[];
export declare function canRecipientChangeStatus(from: string, to: string): boolean;
export declare enum ArchiveReason {
    DUPLICATE = "DUPLICATE",
    OUT_OF_SCOPE = "OUT_OF_SCOPE",
    INSUFFICIENT_INFO = "INSUFFICIENT_INFO",
    NOT_A_PUBLIC_PROBLEM = "NOT_A_PUBLIC_PROBLEM"
}
export declare const ARCHIVE_REASON_LABELS: Record<ArchiveReason, string>;
export declare function getArchiveReasonLabel(reason: string | null | undefined): string;
/** Limites de texto de cada ação (iguais na API, no site e no app). */
export declare const REPORT_LIFECYCLE_LIMITS: {
    readonly UPDATE_MIN: 10;
    readonly UPDATE_MAX: 500;
    /** Marcar como resolvido pede uma explicação mais completa. */
    readonly RESOLVE_MIN: 30;
    readonly DISPUTE_MIN: 20;
    readonly DISPUTE_MAX: 500;
    readonly DECISION_MIN: 20;
    readonly WITHDRAW_MIN: 10;
    readonly ADVOCACY_MESSAGE_MAX: 1000;
    readonly MEDIA_MAX: 4;
    readonly DISPUTE_EVIDENCE_MAX: 5;
};
/** Dias que o cidadão tem para contestar uma resolução ou um arquivamento. */
export declare const DISPUTE_WINDOW_DAYS = 30;
/** Prazos que o político ou a entidade pode prometer ao avocar. */
export declare const ADVOCACY_PROMISE_DAYS: readonly number[];
export interface DisputeEligibilityInput {
    status: string;
    resolvedAt?: string | Date | null;
    archivedAt?: string | Date | null;
    /** Datas das contestações já feitas neste relato. */
    disputeDates?: readonly (string | Date)[];
    now?: Date;
}
export type DisputeIneligibleReason = 'NOT_CLOSED' | 'WINDOW_EXPIRED' | 'ALREADY_DISPUTED';
/**
 * Pode contestar quem é autor (ou marcou "Eu também"), dentro de 30 dias depois da resolução ou do
 * arquivamento, uma vez por resolução: se o relato for reaberto e "resolvido" de novo, vale nova contestação.
 */
export declare function checkDisputeWindow(input: DisputeEligibilityInput): {
    ok: true;
    closedAt: Date;
    deadline: Date;
} | {
    ok: false;
    reason: DisputeIneligibleReason;
    deadline?: Date;
};
/** Ações gravadas em `metadata.action` dos eventos da linha do tempo. */
export declare const TIMELINE_ACTIONS: {
    readonly ADVOCATED: "advocated";
    readonly ADVOCACY_WITHDRAWN: "advocacy_withdrawn";
    readonly RESPONDED: "responded";
    readonly UPDATE: "update";
    readonly STATUS_CHANGED: "status_changed";
    readonly RESOLUTION_CONFIRMED: "resolution_confirmed";
    readonly DISPUTE_DECIDED: "dispute_decided";
    readonly MANDATE_ENDED: "mandate_ended";
    readonly MANDATE_ENDED_UNRESOLVED: "mandate_ended_unresolved_commitment";
};
/** Rótulo de um evento da linha do tempo, olhando primeiro a ação e depois o tipo. */
export declare function timelineEventLabel(type: string, metadata?: Record<string, unknown> | null): string;
//# sourceMappingURL=report-lifecycle.d.ts.map