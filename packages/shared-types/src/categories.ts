import { Category } from './enums'

export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.HEALTH]: 'Saúde',
  [Category.MOBILITY]: 'Mobilidade',
  [Category.SAFETY]: 'Segurança',
  [Category.EDUCATION]: 'Educação',
  [Category.SANITATION]: 'Saneamento',
  [Category.HOUSING]: 'Habitação',
  [Category.ENVIRONMENT]: 'Meio Ambiente',
  [Category.INFRASTRUCTURE]: 'Infraestrutura',
  [Category.URBAN_SERVICES]: 'Serviços Urbanos',
  [Category.CORRUPTION]: 'Corrupção',
  [Category.ACCESSIBILITY]: 'Acessibilidade',
  [Category.SOCIAL_WELFARE]: 'Assistência Social',
  [Category.OTHER]: 'Outros',
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as Category] ?? category
}

const PT_LOWER_CONNECTORS = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'em'])

function toTitleCasePt(raw: string): string {
  const words = raw.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  return words
    .map((word, idx) => {
      const lower = word.toLocaleLowerCase('pt-BR')
      if (idx > 0 && PT_LOWER_CONNECTORS.has(lower)) {
        return lower
      }
      return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1)
    })
    .join(' ')
}

/**
 * Formats a normalized or raw neighborhood into a readable public area label
 * (without exposing geohash codes or coordinates).
 */
export function formatRecurrenceAreaLabel(rawNeighborhood?: string | null): string {
  const trimmed = rawNeighborhood?.replace(/\s+/g, ' ').trim()
  if (!trimmed) {
    return 'Área sem bairro informado'
  }
  const titled = toTitleCasePt(trimmed)
  if (/^bairro\b/i.test(titled)) {
    return titled
  }
  return `Bairro ${titled}`
}
