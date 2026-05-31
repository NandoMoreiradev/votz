import { IoAdapter } from '@nestjs/platform-socket.io'
import { ServerOptions } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import Redis from 'ioredis'

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null

  async connectToRedis(redisUrl: string): Promise<void> {
    const opts = {
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null // para de tentar após 3 falhas
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

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options)
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor)
    }
    return server
  }
}
