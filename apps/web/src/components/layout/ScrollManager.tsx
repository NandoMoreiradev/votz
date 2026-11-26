import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Cuida da rolagem ao trocar de tela, como num site comum:
 * - abrir outra tela (clique em link, `navigate`) começa do topo;
 * - voltar ou avançar (botões do navegador) devolve a pessoa ao ponto onde estava;
 * - endereço com âncora (`#secao`) rola até a seção;
 * - mudar só filtros na mesma tela (`?aba=...`) não mexe na rolagem.
 *
 * As posições ficam guardadas por entrada do histórico, e sobrevivem a recarregar a página.
 */

const STORAGE_KEY = 'votz:scroll-positions'
const MAX_ENTRIES = 50
const RESTORE_TIMEOUT_MS = 1500

function readSaved(): Map<string, number> {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    const entries = raw ? (JSON.parse(raw) as Array<[string, number]>) : []
    return new Map(Array.isArray(entries) ? entries : [])
  } catch {
    return new Map()
  }
}

function scrollToHash(hash: string): boolean {
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    // âncora malformada: usa como veio
  }
  const target = id ? document.getElementById(id) : null
  if (!target) return false
  target.scrollIntoView()
  return true
}

export function ScrollManager() {
  const { pathname, hash, key } = useLocation()
  const navigationType = useNavigationType()
  const positions = useRef<Map<string, number> | null>(null)
  if (positions.current === null) positions.current = readSaved()
  const lastPathname = useRef<string | null>(null)
  const currentKey = useRef(key)

  // O navegador não tenta adivinhar: quem decide a rolagem é este componente.
  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'

    const persist = () => {
      try {
        const entries = Array.from(positions.current ?? []).slice(-MAX_ENTRIES)
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
      } catch {
        // sem sessionStorage (aba privada, bloqueio): só não lembra depois de recarregar
      }
    }
    window.addEventListener('pagehide', persist)
    return () => {
      window.removeEventListener('pagehide', persist)
      window.history.scrollRestoration = previous
    }
  }, [])

  // Guarda a posição da tela atual enquanto a pessoa rola. A chave vem de um ref atualizado
  // antes de qualquer rolagem da tela nova, para a posição de uma tela nunca cair na outra.
  useEffect(() => {
    const onScroll = () => {
      const saved = positions.current!
      const current = currentKey.current
      saved.delete(current)
      saved.set(current, window.scrollY)
      if (saved.size > MAX_ENTRIES) saved.delete(saved.keys().next().value as string)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Decide para onde rolar quando a tela muda (antes de pintar, para não "pular").
  useLayoutEffect(() => {
    currentKey.current = key
    const pathChanged = lastPathname.current !== null && lastPathname.current !== pathname
    lastPathname.current = pathname

    let frame = 0
    let stopped = false
    const deadline = performance.now() + RESTORE_TIMEOUT_MS
    const stop = () => {
      stopped = true
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
    // A tela pode ainda estar montando (dados chegando): tenta de novo a cada quadro, por pouco tempo,
    // e desiste se a pessoa começar a rolar por conta própria.
    const retryUntil = (attempt: () => boolean) => {
      if (attempt()) return
      window.addEventListener('wheel', stop, { passive: true })
      window.addEventListener('touchstart', stop, { passive: true })
      window.addEventListener('keydown', stop)
      const tick = () => {
        if (stopped) return
        if (attempt() || performance.now() > deadline) {
          stop()
          return
        }
        frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    }

    if (hash) {
      retryUntil(() => scrollToHash(hash))
    } else if (navigationType === 'POP') {
      const target = positions.current!.get(key)
      if (target !== undefined) {
        retryUntil(() => {
          window.scrollTo(0, target)
          return Math.abs(window.scrollY - target) < 2
        })
      } else if (pathChanged) {
        window.scrollTo(0, 0)
        frame = window.requestAnimationFrame(() => {
          if (!stopped && window.scrollY > 0) window.scrollTo(0, 0)
        })
      }
    } else if (pathChanged) {
      window.scrollTo(0, 0)
      frame = window.requestAnimationFrame(() => {
        if (!stopped && window.scrollY > 0) window.scrollTo(0, 0)
      })
    }

    return stop
  }, [key, pathname, hash, navigationType])

  return null
}
