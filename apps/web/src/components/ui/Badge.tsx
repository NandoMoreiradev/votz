import styled from 'styled-components'
import { Category, ReportStatus } from '@votz/shared-types'

export const CATEGORY_CONFIG: Record<Category, { label: string; color: string }> = {
  [Category.HEALTH]:        { label: 'Saúde',              color: '#F59E0B' },
  [Category.MOBILITY]:      { label: 'Mobilidade',         color: '#3B82F6' },
  [Category.SAFETY]:        { label: 'Segurança',          color: '#EF4444' },
  [Category.EDUCATION]:     { label: 'Educação',           color: '#8B5CF6' },
  [Category.SANITATION]:    { label: 'Saneamento',         color: '#10B981' },
  [Category.HOUSING]:       { label: 'Habitação',          color: '#F97316' },
  [Category.ENVIRONMENT]:   { label: 'Meio Ambiente',      color: '#16A34A' },
  [Category.INFRASTRUCTURE]:{ label: 'Infraestrutura',     color: '#78716C' },
  [Category.URBAN_SERVICES]:{ label: 'Serviços Urbanos',   color: '#0891B2' },
  [Category.CORRUPTION]:    { label: 'Corrupção',          color: '#9F1239' },
  [Category.ACCESSIBILITY]: { label: 'Acessibilidade',     color: '#7C3AED' },
  [Category.SOCIAL_WELFARE]:{ label: 'Assistência Social', color: '#DB2777' },
  [Category.OTHER]:         { label: 'Outros',             color: '#6B7280' },
}

export const STATUS_CONFIG: Record<ReportStatus, { label: string; color: string }> = {
  [ReportStatus.OPEN]:         { label: 'Aberto',        color: '#E63946' },
  [ReportStatus.UNDER_REVIEW]: { label: 'Em análise',    color: '#F59E0B' },
  [ReportStatus.IN_PROGRESS]:  { label: 'Em andamento',  color: '#3B82F6' },
  [ReportStatus.RESOLVED]:     { label: 'Resolvido',     color: '#2DC653' },
  [ReportStatus.DISPUTED]:     { label: 'Contestado',    color: '#F97316' },
  [ReportStatus.ARCHIVED]:     { label: 'Arquivado',     color: '#6B7280' },
}

interface BadgeRootProps {
  $color: string
  $variant?: 'solid' | 'soft'
}

const BadgeRoot = styled.span<BadgeRootProps>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.03em;
  text-transform: uppercase;

  ${({ $color, $variant = 'soft' }) =>
    $variant === 'soft'
      ? `background: ${$color}1a; color: ${$color};`
      : `background: ${$color}; color: #fff;`}
`

export function CategoryBadge({ category }: { category: Category }) {
  const config = CATEGORY_CONFIG[category]
  return <BadgeRoot $color={config.color}>{config.label}</BadgeRoot>
}

export function StatusBadge({ status }: { status: ReportStatus }) {
  const config = STATUS_CONFIG[status]
  return <BadgeRoot $color={config.color}>{config.label}</BadgeRoot>
}
