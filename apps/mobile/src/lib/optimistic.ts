import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'

/**
 * Ajuda para "atualização otimista": a tela muda no mesmo instante do toque e o servidor confirma depois.
 * Se o servidor recusar, `rollback` devolve o que estava antes.
 */
export type Rollback = () => void

type Paged<T> = { data: T[] } & Record<string, unknown>

function mapCache(old: unknown, id: string, change: (item: never) => unknown): unknown {
  if (!old || typeof old !== 'object') return old
  if ('pages' in old && Array.isArray((old as InfiniteData<Paged<{ id: string }>>).pages)) {
    const infinite = old as InfiniteData<Paged<{ id: string }>>
    return { ...infinite, pages: infinite.pages.map((page) => ({ ...page, data: page.data.map((item) => item.id === id ? change(item as never) : item) })) }
  }
  if ('id' in old && (old as { id: string }).id === id) return change(old as never)
  return old
}

/** Muda o item `id` em todas as listas e telas de detalhe guardadas sob `prefix` (ex.: ['posts']). */
export function patchItem<T extends { id: string }>(client: QueryClient, prefix: QueryKey, id: string, change: (item: T) => T): Rollback {
  const snapshot = client.getQueriesData({ queryKey: prefix })
  client.setQueriesData({ queryKey: prefix }, (old: unknown) => mapCache(old, id, change as (item: never) => unknown))
  return () => snapshot.forEach(([key, data]) => client.setQueryData(key, data))
}

/** Coloca `item` no topo da primeira página das listas de `prefix` aceitas por `accept`. */
export function prependItem<T extends { id: string }>(client: QueryClient, prefix: QueryKey, item: T, accept: (key: QueryKey) => boolean = () => true): void {
  for (const [key, old] of client.getQueriesData<InfiniteData<Paged<T>>>({ queryKey: prefix })) {
    if (!old?.pages?.length || !accept(key)) continue
    if (old.pages.some((page) => page.data.some((existing) => existing.id === item.id))) continue
    const [first, ...rest] = old.pages
    client.setQueryData(key, { ...old, pages: [{ ...first, data: [item, ...first.data], meta: first.meta && typeof first.meta === 'object' ? { ...(first.meta as object), total: Number((first.meta as { total?: number }).total ?? 0) + 1 } : first.meta }, ...rest] })
  }
}

/** Tira o item `id` de todas as listas de `prefix` na hora; `rollback` devolve se o servidor recusar. */
export function removeItem(client: QueryClient, prefix: QueryKey, id: string): Rollback {
  const snapshot = client.getQueriesData({ queryKey: prefix })
  client.setQueriesData({ queryKey: prefix }, (old: unknown) => {
    const infinite = old as InfiniteData<Paged<{ id: string }>> | undefined
    if (!infinite || !Array.isArray(infinite.pages)) return old
    return { ...infinite, pages: infinite.pages.map((page) => ({ ...page, data: page.data.filter((item) => item.id !== id) })) }
  })
  return () => snapshot.forEach(([key, data]) => client.setQueryData(key, data))
}
