// Contexto da Comunidade: notas escritas por pessoas, com fonte, sobre publicações do feed e relatos.
// Plano e decisões: docs/dev/contexto-da-comunidade-analise-2026-11-23.md (seções 4, 6 e 10).
// Os nomes de tela ficam todos aqui para trocar de uma vez se a marca mudar (consulta no INPI pendente).

export enum ContextNoteTargetType {
  POST = 'POST',
  REPORT = 'REPORT',
}

export enum ContextNoteKind {
  CORRECTION = 'CORRECTION',
  MISSING_CONTEXT = 'MISSING_CONTEXT',
  OUT_OF_CONTEXT_MEDIA = 'OUT_OF_CONTEXT_MEDIA',
  EXTRA_EVIDENCE = 'EXTRA_EVIDENCE',
  UPDATE = 'UPDATE',
  DUPLICATE = 'DUPLICATE',
}

export enum ContextNoteStatus {
  NEEDS_RATINGS = 'NEEDS_RATINGS',
  SHOWN = 'SHOWN',
  NOT_SHOWN = 'NOT_SHOWN',
  REMOVED = 'REMOVED',
}

export enum ContextNoteRatingValue {
  HELPFUL = 'HELPFUL',
  SOMEWHAT = 'SOMEWHAT',
  NOT_HELPFUL = 'NOT_HELPFUL',
}

export const CONTEXT_NOTES_BRAND = {
  feature: 'Contexto da Comunidade',
  shownTitle: 'Pessoas do Votz acrescentaram contexto',
  // Nome da IA do Votz (etapa 2, ainda não existe). Fica aqui só para a marca nascer num lugar.
  ai: 'Confere',
} as const

/** Versão do termo do colaborador. Mudar o texto exige trocar esta versão e pedir novo aceite. */
export const CONTEXT_CONTRIBUTOR_TERMS_VERSION = '2026-11-23'

export const CONTEXT_NOTE_TEXT_MAX = 500
export const CONTEXT_NOTE_TEXT_MIN = 20
export const CONTEXT_NOTE_SOURCES_MAX = 3

/** O que cada tipo de conteúdo aceita. Relato nunca recebe "é falso": suspeita de relato falso vai pela denúncia. */
export const CONTEXT_NOTE_KINDS_BY_TARGET: Record<ContextNoteTargetType, readonly ContextNoteKind[]> = {
  [ContextNoteTargetType.POST]: [
    ContextNoteKind.CORRECTION,
    ContextNoteKind.MISSING_CONTEXT,
    ContextNoteKind.OUT_OF_CONTEXT_MEDIA,
  ],
  [ContextNoteTargetType.REPORT]: [
    ContextNoteKind.EXTRA_EVIDENCE,
    ContextNoteKind.UPDATE,
    ContextNoteKind.DUPLICATE,
  ],
}

export const CONTEXT_NOTE_KIND_LABELS: Record<ContextNoteKind, { label: string; hint: string }> = {
  [ContextNoteKind.CORRECTION]: {
    label: 'Corrige uma informação',
    hint: 'Algo que a publicação afirma está errado, e você tem a fonte que mostra isso.',
  },
  [ContextNoteKind.MISSING_CONTEXT]: {
    label: 'Falta contexto',
    hint: 'A publicação não está errada, mas deixa de dizer algo que muda o entendimento.',
  },
  [ContextNoteKind.OUT_OF_CONTEXT_MEDIA]: {
    label: 'Foto ou vídeo fora de contexto',
    hint: 'A imagem é de outra data, outro lugar ou outro assunto.',
  },
  [ContextNoteKind.EXTRA_EVIDENCE]: {
    label: 'Mais uma prova',
    hint: 'Uma notícia, documento ou registro que confirma ou completa o relato.',
  },
  [ContextNoteKind.UPDATE]: {
    label: 'Novidade sobre o caso',
    hint: 'O problema foi resolvido, mudou ou o local é outro.',
  },
  [ContextNoteKind.DUPLICATE]: {
    label: 'É o mesmo problema de outro relato',
    hint: 'Já existe relato sobre o mesmo problema. Cole o link dele como fonte.',
  },
}

export const CONTEXT_NOTE_STATUS_LABELS: Record<ContextNoteStatus, string> = {
  [ContextNoteStatus.NEEDS_RATINGS]: 'Esperando avaliações',
  [ContextNoteStatus.SHOWN]: 'Exibida',
  [ContextNoteStatus.NOT_SHOWN]: 'Não exibida',
  [ContextNoteStatus.REMOVED]: 'Removida pela moderação',
}

export const CONTEXT_NOTE_RATING_LABELS: Record<ContextNoteRatingValue, string> = {
  [ContextNoteRatingValue.HELPFUL]: 'Ajuda',
  [ContextNoteRatingValue.SOMEWHAT]: 'Ajuda um pouco',
  [ContextNoteRatingValue.NOT_HELPFUL]: 'Não ajuda',
}

/** Motivos que a pessoa pode marcar ao avaliar. `side` diz para qual avaliação o motivo serve. */
export const CONTEXT_NOTE_RATING_REASONS = [
  { value: 'GOOD_SOURCES', label: 'Tem fonte boa', side: 'helpful' },
  { value: 'CLEAR', label: 'Explica com clareza', side: 'helpful' },
  { value: 'ADDS_CONTEXT', label: 'Traz o que faltava', side: 'helpful' },
  { value: 'NEUTRAL', label: 'Fala do fato, sem atacar ninguém', side: 'helpful' },
  { value: 'WEAK_SOURCE', label: 'A fonte é fraca ou não confirma', side: 'not_helpful' },
  { value: 'OPINION', label: 'É opinião, não fato', side: 'not_helpful' },
  { value: 'ATTACKS_PERSON', label: 'Ataca a pessoa, não o conteúdo', side: 'not_helpful' },
  { value: 'OFF_TOPIC', label: 'Não tem a ver com a publicação', side: 'not_helpful' },
  { value: 'HAS_ERRORS', label: 'Tem erro', side: 'not_helpful' },
  { value: 'CONFUSING', label: 'Está confusa', side: 'not_helpful' },
] as const

export type ContextNoteRatingReason = (typeof CONTEXT_NOTE_RATING_REASONS)[number]['value']

/** Regras de escrita mostradas antes de a pessoa escrever e no termo do colaborador (diretrizes, seção 10.2 do plano). */
export const CONTEXT_NOTE_WRITING_RULES: readonly string[] = [
  'Fale do conteúdo, não da pessoa. Nada de adjetivo nem de ironia.',
  'Só fato e fonte. Cole pelo menos um link que qualquer pessoa consiga abrir.',
  'Não acuse ninguém de crime. Se você acha que há crime, use "Denunciar".',
  'Não exponha dados pessoais de ninguém.',
  'Se você não tem fonte, não escreva a nota: avalie as que já existem.',
]

export interface ContextNoteView {
  id: string
  kind: ContextNoteKind
  text: string
  sources: string[]
  origin: 'HUMAN' | 'AI'
  shownAt: string | null
}
