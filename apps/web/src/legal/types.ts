// Estrutura dos documentos legais do Votz.
// Inline suportado nos textos: **negrito** e [texto](/rota-interna | https://... | mailto:...)

export type LegalBlock =
  | { p: string }
  | { ul: string[] }
  | { ol: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { note: string }

export interface LegalSection {
  id: string
  title: string
  blocks: LegalBlock[]
}

export interface LegalDoc {
  title: string
  version: string
  updatedLabel: string
  summaryTitle?: string
  summary: string[]
  sections: LegalSection[]
}

export const LEGAL_ENTITY = {
  name: 'Votz do Brasil',
  cnpj: '55.188.948/0001-04',
  // Contato provisório do encarregado (DPO) e do suporte.
  email: 'fernandomoreira.dev@gmail.com',
  foro: 'Aracaju/SE',
} as const

export const LEGAL_UPDATED_LABEL = '14 de novembro de 2026'
