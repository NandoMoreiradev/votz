import styled from 'styled-components'
import { Category } from '@votz/shared-types'
import { CATEGORY_CONFIG } from '../ui/Badge'

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;

  &::-webkit-scrollbar { display: none; }
  scrollbar-width: none;
`

interface PillProps {
  $active: boolean
  $color?: string
}

const Pill = styled.button<PillProps>`
  flex-shrink: 0;
  padding: 6px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid ${({ $active, $color, theme }) =>
    $active ? ($color || theme.colors.primary) : theme.colors.border};
  background: ${({ $active, $color, theme }) =>
    $active ? ($color ? `${$color}18` : theme.colors.primary) : theme.colors.white};
  color: ${({ $active, $color, theme }) =>
    $active ? ($color || theme.colors.white) : theme.colors.muted};

  &:hover {
    border-color: ${({ $color, theme }) => $color || theme.colors.primary};
    color: ${({ $color, theme }) => $color || theme.colors.primary};
  }
`

interface CategoryFilterProps {
  selected: Category | undefined
  onChange: (category: Category | undefined) => void
}

export function CategoryFilter({ selected, onChange }: CategoryFilterProps) {
  return (
    <Wrapper>
      <Pill
        $active={selected === undefined}
        onClick={() => onChange(undefined)}
      >
        Todos
      </Pill>

      {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
        <Pill
          key={key}
          $active={selected === key}
          $color={config.color}
          onClick={() => onChange(selected === key ? undefined : key as Category)}
        >
          {config.label}
        </Pill>
      ))}
    </Wrapper>
  )
}
