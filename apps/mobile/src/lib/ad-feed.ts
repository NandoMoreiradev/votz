/** Espaço de anúncio no meio do feed. `adSlot` é a posição (quantos itens reais vieram antes dele). */
export interface AdSlotItem { id: string; adSlot: number; /** Ids dos itens em volta do espaço (para não pôr anúncio perto de relato contra o anunciante). */ near: string[] }

export function isAdSlot(item: unknown): item is AdSlotItem {
  return typeof item === 'object' && item !== null && typeof (item as AdSlotItem).adSlot === 'number'
}

/**
 * Põe um espaço de anúncio depois de cada `every` itens reais (decisão 4 do plano: 1 anúncio a cada 8 itens).
 * Os ids dos espaços são estáveis (`__ad__8`, `__ad__16`...), então ao carregar mais páginas os anteriores não mudam.
 * Sem `enabled` (pessoa sem login), devolve a lista como veio. `neighborsOf` diz quais itens estão em volta do espaço
 * (`adNeighborIds` do shared-types); cada espaço leva essa lista para o pedido do anúncio.
 */
export function withAdSlots<T extends { id: string }>(
  items: readonly T[],
  every: number,
  enabled: boolean,
  neighborsOf?: (items: readonly T[], position: number) => string[],
  pendingNeighbors = 0,
): (T | AdSlotItem)[] {
  if (!enabled || every < 1) return [...items]
  const result: (T | AdSlotItem)[] = []
  items.forEach((item, index) => {
    result.push(item)
    const position = index + 1
    if (position % every === 0 && items.length - position >= pendingNeighbors) {
      result.push({ id: `__ad__${position}`, adSlot: position, near: neighborsOf ? neighborsOf(items, position) : [] })
    }
  })
  return result
}
