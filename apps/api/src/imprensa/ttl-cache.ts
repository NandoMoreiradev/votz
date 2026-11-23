/**
 * Cache em memória, por processo, com validade curta. Serve os dados públicos da imprensa
 * (agregados pesados que mudam pouco): uma consulta por chave dentro da validade, e pedidos
 * simultâneos esperam a mesma consulta em vez de repetir. Falha da consulta não fica guardada.
 */
export class TtlCache {
  private readonly entries = new Map<string, { value: unknown; expiresAt: number }>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(private readonly maxEntries = 200) {}

  async get<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const hit = this.entries.get(key)
    if (hit && hit.expiresAt > now) return hit.value as T

    const pending = this.inflight.get(key)
    if (pending) return pending as Promise<T>

    const promise = load()
      .then((value) => {
        this.set(key, value, ttlMs)
        return value
      })
      .finally(() => this.inflight.delete(key))
    this.inflight.set(key, promise)
    return promise
  }

  clear() {
    this.entries.clear()
    this.inflight.clear()
  }

  private set(key: string, value: unknown, ttlMs: number) {
    if (this.entries.size >= this.maxEntries) {
      const now = Date.now()
      for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k)
      if (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value
        if (oldest !== undefined) this.entries.delete(oldest)
      }
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
