import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null

  async connectToRedis(redisUrl: string): Promise<void> {
    const opts = {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null
        return Math.min(times * 500, 2000)
      },
    }
    const pub = new Redis(redisUrl, opts)
    const sub = new Redis(redisUrl, opts)

    pub.on('error', (err) => console.error('[Redis WS pub]', err.message))
    sub.on('error', (err) => console.error('[Redis WS sub]', err.message))

    try {
      await pub.connect()
      await sub.connect()
      this.adapterConstructor = createAdapter(pub, sub)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[Redis WS] conexão falhou, WebSocket sem adapter Redis: ${msg}`)
    }
  }

  /** true quando o adapter Redis ligou: só com ele o tempo real funciona entre várias instâncias. */
  get hasRedisAdapter(): boolean {
    return this.adapterConstructor !== null
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options)
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor)
    }
    return server
  }
}

/**
 * Com `WS_REQUIRE_REDIS_ADAPTER=true` a API se recusa a subir sem o adapter Redis. Use em produção
 * com mais de uma instância: sem ele, notificação e chat só chegam a quem está na mesma instância
 * do emissor, e o erro não aparece em lugar nenhum. Desligado por padrão (desenvolvimento, 1 instância).
 */
export function requiresRedisAdapter(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.WS_REQUIRE_REDIS_ADAPTER?.trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'yes'
}
