export declare enum ContextNoteTargetType {
    POST = "POST",
    REPORT = "REPORT"
}
export declare enum ContextNoteKind {
    CORRECTION = "CORRECTION",
    MISSING_CONTEXT = "MISSING_CONTEXT",
    OUT_OF_CONTEXT_MEDIA = "OUT_OF_CONTEXT_MEDIA",
    EXTRA_EVIDENCE = "EXTRA_EVIDENCE",
    UPDATE = "UPDATE",
    DUPLICATE = "DUPLICATE"
}
export declare enum ContextNoteStatus {
    NEEDS_RATINGS = "NEEDS_RATINGS",
    SHOWN = "SHOWN",
    NOT_SHOWN = "NOT_SHOWN",
    REMOVED = "REMOVED"
}
export declare enum ContextNoteRatingValue {
    HELPFUL = "HELPFUL",
    SOMEWHAT = "SOMEWHAT",
    NOT_HELPFUL = "NOT_HELPFUL"
}
export declare const CONTEXT_NOTES_BRAND: {
    readonly feature: "Contexto da Comunidade";
    readonly shownTitle: "Pessoas do Votz acrescentaram contexto";
    readonly ai: "Confere";
};
/** Versão do termo do colaborador. Mudar o texto exige trocar esta versão e pedir novo aceite. */
export declare const CONTEXT_CONTRIBUTOR_TERMS_VERSION = "2026-11-23";
export declare const CONTEXT_NOTE_TEXT_MAX = 500;
export declare const CONTEXT_NOTE_TEXT_MIN = 20;
export declare const CONTEXT_NOTE_SOURCES_MAX = 3;
/** O que cada tipo de conteúdo aceita. Relato nunca recebe "é falso": suspeita de relato falso vai pela denúncia. */
export declare const CONTEXT_NOTE_KINDS_BY_TARGET: Record<ContextNoteTargetType, readonly ContextNoteKind[]>;
export declare const CONTEXT_NOTE_KIND_LABELS: Record<ContextNoteKind, {
    label: string;
    hint: string;
}>;
export declare const CONTEXT_NOTE_STATUS_LABELS: Record<ContextNoteStatus, string>;
export declare const CONTEXT_NOTE_RATING_LABELS: Record<ContextNoteRatingValue, string>;
/** Motivos que a pessoa pode marcar ao avaliar. `side` diz para qual avaliação o motivo serve. */
export declare const CONTEXT_NOTE_RATING_REASONS: readonly [{
    readonly value: "GOOD_SOURCES";
    readonly label: "Tem fonte boa";
    readonly side: "helpful";
}, {
    readonly value: "CLEAR";
    readonly label: "Explica com clareza";
    readonly side: "helpful";
}, {
    readonly value: "ADDS_CONTEXT";
    readonly label: "Traz o que faltava";
    readonly side: "helpful";
}, {
    readonly value: "NEUTRAL";
    readonly label: "Fala do fato, sem atacar ninguém";
    readonly side: "helpful";
}, {
    readonly value: "WEAK_SOURCE";
    readonly label: "A fonte é fraca ou não confirma";
    readonly side: "not_helpful";
}, {
    readonly value: "OPINION";
    readonly label: "É opinião, não fato";
    readonly side: "not_helpful";
}, {
    readonly value: "ATTACKS_PERSON";
    readonly label: "Ataca a pessoa, não o conteúdo";
    readonly side: "not_helpful";
}, {
    readonly value: "OFF_TOPIC";
    readonly label: "Não tem a ver com a publicação";
    readonly side: "not_helpful";
}, {
    readonly value: "HAS_ERRORS";
    readonly label: "Tem erro";
    readonly side: "not_helpful";
}, {
    readonly value: "CONFUSING";
    readonly label: "Está confusa";
    readonly side: "not_helpful";
}];
export type ContextNoteRatingReason = (typeof CONTEXT_NOTE_RATING_REASONS)[number]['value'];
/** Regras de escrita mostradas antes de a pessoa escrever e no termo do colaborador (diretrizes, seção 10.2 do plano). */
export declare const CONTEXT_NOTE_WRITING_RULES: readonly string[];
export interface ContextNoteView {
    id: string;
    kind: ContextNoteKind;
    text: string;
    sources: string[];
    origin: 'HUMAN' | 'AI';
    shownAt: string | null;
}
//# sourceMappingURL=context-notes.d.ts.map