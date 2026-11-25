import styled, { css } from 'styled-components'

/** Peças visuais do gerenciador de anúncios do Estúdio. Cores sempre do tema. Mesmo visual de `components/studio/studio-ui`. */

export const Head = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`

export const Title = styled.h1`
  margin: 0 0 6px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.625rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 600px) { font-size: 1.375rem; }
`

export const Sub = styled.p`
  margin: 0;
  max-width: 720px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

export const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  padding: 18px 20px;
  margin-bottom: 16px;
  min-width: 0;

  @media (max-width: 600px) {
    padding: 16px;
  }
`

export const CardTitle = styled.h2`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
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
  gap: 8px;
  flex-wrap: wrap;
`

const buttonBase = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

export const PrimaryButton = styled.button`
  ${buttonBase}
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primary}E0; }
`

export const SecondaryButton = styled.button`
  ${buttonBase}
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.surfaceHover}; border-color: ${({ theme }) => theme.colors.borderStrong}; }
`

export const Label = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const fieldBase = css`
  width: 100%;
  box-sizing: border-box;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  font-family: inherit;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  transition: border-color 0.15s, box-shadow 0.15s;
  &:hover:not(:disabled) { border-color: ${({ theme }) => theme.colors.muted}; }
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}1A; }
  &[aria-invalid='true'] { border-color: ${({ theme }) => theme.colors.action}; }
  &:disabled { background: ${({ theme }) => theme.colors.neutral}; }
`

export const Input = styled.input`${fieldBase}`
export const TextArea = styled.textarea`${fieldBase} resize: vertical; min-height: 90px; line-height: 1.5;`
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-family: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ $selected, theme }) => ($selected ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  cursor: pointer;
  border: 1px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.borderStrong)};
  background: ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.white)};
  color: ${({ $selected, theme }) => ($selected ? theme.colors.white : theme.colors.text)};
  transition: background 0.12s, border-color 0.12s;
  &:hover:not(:disabled) { border-color: ${({ theme }) => theme.colors.primary}; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

export const Badge = styled.span<{ $tone?: 'positive' | 'action' | 'muted' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  line-height: 1.5;
  color: ${({ $tone, theme }) => ($tone === 'positive' ? theme.colors.positiveText : $tone === 'action' ? theme.colors.action : theme.colors.muted)};
  background: ${({ $tone, theme }) => ($tone === 'positive' ? `${theme.colors.positive}17` : $tone === 'action' ? `${theme.colors.action}14` : theme.colors.neutral)};
  white-space: nowrap;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $tone, theme }) => ($tone === 'positive' ? theme.colors.positive : $tone === 'action' ? theme.colors.action : theme.colors.borderStrong)};
  }
`

export const ErrorMsg = styled.p`
  margin: 8px 0 0;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
`

export const Mono = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
`
