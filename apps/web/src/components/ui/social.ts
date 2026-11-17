import { css } from 'styled-components'

// Shared social surfaces keep feeds, conversations and profile tabs consistent.
export const socialRow = css`
  background: ${({ theme }) => theme.colors.white};
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 0;
  padding: 16px;
  min-width: 0;
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; box-shadow: none; }
`

export const socialTab = css<{ $active: boolean }>`
  position: relative;
  flex: 1;
  min-height: 48px;
  padding: 10px 12px;
  border: none;
  border-radius: 0;
  background: transparent;
  color: ${({ $active, theme }) => $active ? theme.colors.text : theme.colors.muted};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 25%;
    right: 25%;
    height: 3px;
    border-radius: 3px;
    background: ${({ $active, theme }) => $active ? theme.colors.action : 'transparent'};
  }
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: -3px; }
`

export const socialCover = css`
  position: relative;
  isolation: isolate;
  padding-top: 132px;
  &::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0 0 auto;
    height: 112px;
    background: ${({ theme }) => theme.colors.primary};
  }
`
