import styled, { css } from 'styled-components'

type Variant = 'primary' | 'action' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
}

const sizeStyles = {
  sm: css`
    padding: 6px 12px;
    font-size: 0.8125rem;
  `,
  md: css`
    padding: 10px 20px;
    font-size: 0.9375rem;
  `,
  lg: css`
    padding: 14px 28px;
    font-size: 1rem;
  `,
}

const variantStyles = {
  primary: css`
    background: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.white};
    border: 2px solid transparent;
    &:hover { background: #2a2a4a; }
  `,
  action: css`
    background: ${({ theme }) => theme.colors.action};
    color: ${({ theme }) => theme.colors.white};
    border: 2px solid transparent;
    &:hover { background: #c8313d; }
  `,
  outline: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.primary};
    border: 2px solid ${({ theme }) => theme.colors.primary};
    &:hover {
      background: ${({ theme }) => theme.colors.primary};
      color: ${({ theme }) => theme.colors.white};
    }
  `,
  ghost: css`
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    border: 2px solid transparent;
    &:hover { background: ${({ theme }) => theme.colors.neutral}; }
  `,
}

export const Button = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  width: ${({ fullWidth }) => fullWidth ? '100%' : 'auto'};

  ${({ size = 'md' }) => sizeStyles[size]}
  ${({ variant = 'primary' }) => variantStyles[variant]}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`
