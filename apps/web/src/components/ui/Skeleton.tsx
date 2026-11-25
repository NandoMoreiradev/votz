import styled, { keyframes } from 'styled-components'

/**
 * Blocos cinza que ocupam o lugar do conteúdo enquanto ele chega.
 * Use no lugar de "Carregando...": a pessoa já vê o formato da tela e nada pula quando os dados chegam.
 *
 * - `<SkeletonRows />`: lista ou tabela (linhas iguais).
 * - `<SkeletonCards />`: grade de cartões ou painéis.
 * - `<SkeletonBlock />`: um bloco solto, com altura e largura à escolha.
 */

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`

export const SkeletonBlock = styled.div<{ $h?: number; $w?: string; $radius?: string }>`
  height: ${({ $h }) => $h ?? 16}px;
  width: ${({ $w }) => $w ?? '100%'};
  border-radius: ${({ $radius, theme }) => $radius ?? theme.radii.md};
  background: ${({ theme }) => theme.colors.border};
  animation: ${pulse} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Stack = styled.div<{ $gap: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => $gap}px;
  width: 100%;
`

const Grid = styled.div<{ $min: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${({ $min }) => $min}px, 1fr));
  gap: 12px;
  width: 100%;
`

interface RowsProps {
  /** Quantas linhas desenhar. */
  rows?: number
  /** Altura de cada linha, em px. */
  height?: number
  /** Texto lido por leitor de tela. */
  label?: string
}

export function SkeletonRows({ rows = 5, height = 52, label = 'Carregando' }: RowsProps) {
  return (
    <Stack $gap={8} role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} $h={height} />
      ))}
    </Stack>
  )
}

interface CardsProps {
  count?: number
  height?: number
  /** Largura mínima de cada cartão, em px. */
  minWidth?: number
  label?: string
}

export function SkeletonCards({ count = 4, height = 120, minWidth = 220, label = 'Carregando' }: CardsProps) {
  return (
    <Grid $min={minWidth} role="status" aria-label={label} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} $h={height} $radius="12px" />
      ))}
    </Grid>
  )
}
