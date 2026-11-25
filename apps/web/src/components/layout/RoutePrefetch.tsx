import { useEffect } from 'react'
import { prefetchPath } from '../../lib/lazy-page'

/**
 * Começa a baixar o código de uma tela sob demanda assim que a pessoa mostra que vai abri-la:
 * mouse em cima do link, foco pelo teclado ou o dedo encostando na tela.
 * Quando o clique termina, o código normalmente já chegou e a troca é imediata.
 */
export function RoutePrefetch() {
  useEffect(() => {
    const onIntent = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const link = target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement)) return
      if (link.origin !== window.location.origin || link.target === '_blank') return
      prefetchPath(link.pathname)
    }
    document.addEventListener('pointerover', onIntent, { passive: true })
    document.addEventListener('focusin', onIntent)
    document.addEventListener('touchstart', onIntent, { passive: true })
    return () => {
      document.removeEventListener('pointerover', onIntent)
      document.removeEventListener('focusin', onIntent)
      document.removeEventListener('touchstart', onIntent)
    }
  }, [])
  return null
}
