import { useEffect, useState, useSyncExternalStore } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { useIsFetching } from '@tanstack/react-query'
import { isLazyPageLoading, subscribeLazyPageLoading } from '../../lib/lazy-page'

/**
 * Barra fina no topo da janela que aparece enquanto a tela está chegando:
 * o código de uma tela sob demanda ou os dados que a tela ainda não tem.
 *
 * Só conta o que ainda não tem nada para mostrar (dados que já estão na tela e são
 * atualizados por trás não acendem a barra). Uma consulta pode ficar de fora com
 * `meta: { silentLoading: true }`.
 * Espera um instante antes de aparecer, para não piscar quando tudo chega rápido.
 */

const SHOW_DELAY_MS = 150
const HIDE_AFTER_MS = 300

type Phase = 'idle' | 'running' | 'done'

const grow = keyframes`
  0% { transform: scaleX(0); }
  20% { transform: scaleX(0.35); }
  60% { transform: scaleX(0.7); }
  100% { transform: scaleX(0.9); }
`

const Bar = styled.div<{ $phase: Phase }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 2000;
  pointer-events: none;
  transform-origin: left center;
  background: ${({ theme }) => theme.colors.action};
  box-shadow: 0 0 8px ${({ theme }) => theme.colors.action};

  ${({ $phase }) =>
    $phase === 'running'
      ? css`
          opacity: 1;
          animation: ${grow} 8s cubic-bezier(0.1, 0.6, 0.3, 1) forwards;
        `
      : $phase === 'done'
        ? css`
            opacity: 0;
            transform: scaleX(1);
            transition: opacity 200ms ease 100ms;
          `
        : css`
            opacity: 0;
            transform: scaleX(0);
          `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transform: scaleX(1);
    transition: none;
  }
`

export function NavigationProgress() {
  const fetchingFirstData = useIsFetching({
    predicate: (query) => query.state.data === undefined && query.meta?.silentLoading !== true,
  })
  const pageLoading = useSyncExternalStore(subscribeLazyPageLoading, isLazyPageLoading)
  const busy = pageLoading || fetchingFirstData > 0

  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    if (busy) {
      if (phase === 'running') return
      const timer = window.setTimeout(() => setPhase('running'), SHOW_DELAY_MS)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'running') setPhase('done')
  }, [busy, phase])

  useEffect(() => {
    if (phase !== 'done') return
    const timer = window.setTimeout(() => setPhase('idle'), HIDE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  return <Bar $phase={phase} aria-hidden="true" />
}
