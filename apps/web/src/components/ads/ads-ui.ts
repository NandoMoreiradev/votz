import styled, { css } from 'styled-components'

/** Peças visuais do gerenciador de anúncios do Estúdio. Cores sempre do tema. */

export const Head = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`

export const Title = styled.h1`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

export const Sub = styled.p`
  margin: 0;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

export const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
  margin-bottom: 16px;

  @media (max-width: 600px) {
    padding: 16px;
  }
`

export const CardTitle = styled.h2`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
`

export const Hint = styled.p`
  margin: 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
`

const buttonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  text-decoration: none;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

export const PrimaryButton = styled.button`
  ${buttonBase}
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
`

export const SecondaryButton = styled.button`
  ${buttonBase}
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
`

export const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const fieldBase = css`
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

export const Input = styled.input`${fieldBase}`
export const TextArea = styled.textarea`${fieldBase} resize: vertical; min-height: 90px;`
export const Select = styled.select`${fieldBase}`

export const Field = styled.div`
  margin-bottom: 16px;
`

export const Grid2 = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`

export const Chip = styled.button<{ $selected: boolean }>`
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.875rem;
  cursor: pointer;
  border: 1.5px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) => ($selected ? theme.colors.primary : 'transparent')};
  color: ${({ $selected, theme }) => ($selected ? theme.colors.white : theme.colors.text)};
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

export const Badge = styled.span<{ $tone?: 'positive' | 'action' | 'muted' }>`
  display: inline-block;
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  border: 1px solid ${({ $tone, theme }) => ($tone === 'positive' ? theme.colors.positive : $tone === 'action' ? theme.colors.action : theme.colors.border)};
  color: ${({ $tone, theme }) => ($tone === 'positive' ? theme.colors.positive : $tone === 'action' ? theme.colors.action : theme.colors.muted)};
  white-space: nowrap;
`

export const ErrorMsg = styled.p`
  margin: 8px 0 0;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
`

export const Mono = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
`
