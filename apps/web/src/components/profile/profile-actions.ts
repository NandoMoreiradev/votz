import styled, { css } from 'styled-components'
import { Link } from 'react-router-dom'

/**
 * Botões do topo dos perfis (político, entidade e empresa).
 * Todos com a mesma altura, formato e letra; só a cor muda (variante).
 */
export type ProfileActionVariant = 'action' | 'solid' | 'outline' | 'positive'

const base = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border-radius: 9999px;
  border: 1.5px solid transparent;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  line-height: 1;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: default; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: 2px; }
`

export const profileActionAction = css`
  ${base}
  background: ${({ theme }) => theme.colors.action};
  border-color: ${({ theme }) => theme.colors.action};
  color: #fff;
`

export const profileActionSolid = css`
  ${base}
  background: ${({ theme }) => theme.colors.primary};
  border-color: ${({ theme }) => theme.colors.primary};
  color: #fff;
`

export const profileActionPositive = css`
  ${base}
  background: ${({ theme }) => theme.colors.positive};
  border-color: ${({ theme }) => theme.colors.positive};
  color: #fff;
`

export const profileActionOutline = css`
  ${base}
  background: transparent;
  border-color: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.primary};
  &:hover { opacity: 1; background: ${({ theme }) => theme.colors.neutral}; }
`

const variants = {
  action: profileActionAction,
  solid: profileActionSolid,
  positive: profileActionPositive,
  outline: profileActionOutline,
}

/** Link com cara de botão. Padrão: vermelho (ação principal). */
export const ProfileLinkBtn = styled(Link)<{ $variant?: ProfileActionVariant }>`
  ${({ $variant }) => variants[$variant ?? 'action']}
`
