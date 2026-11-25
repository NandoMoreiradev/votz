import { lazy, type ComponentType } from 'react'
import { matchPath } from 'react-router-dom'

/**
 * Telas carregadas sob demanda.
 *
 * O código de cada tela listada aqui só é baixado quando alguém vai abri-la, ou um pouco antes:
 * quando o mouse passa por cima de um link para ela, ou o dedo toca nele (`prefetchPath`).
 * Assim a primeira abertura do site fica mais leve, e a troca de tela continua imediata.
 *
 * Enquanto o código ainda está chegando, a tela anterior fica na frente (o roteador troca de
 * tela em transição) e a barra fina do topo (`NavigationProgress`) mostra que algo está vindo.
 */

type PageModule = { default: ComponentType }

const pages: Array<{ patterns: string[]; load: () => Promise<PageModule> }> = []
const listeners = new Set<() => void>()
let waiting = 0

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeLazyPageLoading(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Verdadeiro enquanto a pessoa pediu uma tela cujo código ainda não chegou. */
export function isLazyPageLoading(): boolean {
  return waiting > 0
}

/**
 * Cria uma tela carregada sob demanda.
 * @param factory  o `import()` do arquivo da tela
 * @param exportName  o nome exportado (`'default'` para export default)
 * @param patterns  os endereços que abrem a tela, iguais aos das `<Route>`, para baixar antes do clique
 */
export function lazyPage<M, K extends keyof M>(factory: () => Promise<M>, exportName: K, patterns: string[]) {
  let promise: Promise<PageModule> | null = null
  let settled = false

  const load = () => {
    if (!promise) {
      const current = factory().then((module) => ({ default: module[exportName] as unknown as ComponentType }))
      promise = current
      current.then(
        () => {
          settled = true
        },
        () => {
          // Falhou (rede caiu, versão nova no ar): a próxima tentativa baixa de novo.
          if (promise === current) promise = null
        },
      )
    }
    return promise
  }

  pages.push({ patterns, load })

  return lazy(() => {
    const pending = load()
    if (!settled) {
      waiting += 1
      emit()
      pending
        .finally(() => {
          waiting -= 1
          emit()
        })
        .catch(() => undefined)
    }
    return pending
  })
}

/** Baixa em segundo plano o código da tela que abre neste endereço, se ela for sob demanda. */
export function prefetchPath(pathname: string): void {
  for (const page of pages) {
    if (page.patterns.some((pattern) => matchPath(pattern, pathname))) {
      page.load().catch(() => undefined)
    }
  }
}
