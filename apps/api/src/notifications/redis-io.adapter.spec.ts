const mockClients: Array<{ connect: jest.Mock; quit: jest.Mock; disconnect: jest.Mock; on: jest.Mock }> = []

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => {
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
      on: jest.fn(),
    }
    mockClients.push(client)
    return client
  }),
}))
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn(() => 'adapter') }))
jest.mock('@nestjs/platform-socket.io', () => ({
  IoAdapter: class {
    async close() {}
    createIOServer() {
      return { adapter: jest.fn() }
    }
  },
}))

import { RedisIoAdapter } from './redis-io.adapter'

describe('RedisIoAdapter.close', () => {
  beforeEach(() => {
    mockClients.length = 0
  })

  it('fecha o servidor e as duas conexões Redis no encerramento', async () => {
    const adapter = new RedisIoAdapter({} as never)
    await adapter.connectToRedis('redis://x')
    expect(mockClients).toHaveLength(2)

    await adapter.close({} as never)

    expect(mockClients[0].quit).toHaveBeenCalledTimes(1)
    expect(mockClients[1].quit).toHaveBeenCalledTimes(1)
  })

  it('cai para disconnect se o quit falhar, e não quebra o encerramento', async () => {
    const adapter = new RedisIoAdapter({} as never)
    await adapter.connectToRedis('redis://x')
    mockClients[0].quit.mockRejectedValueOnce(new Error('fechado'))

    await expect(adapter.close({} as never)).resolves.toBeUndefined()
    expect(mockClients[0].disconnect).toHaveBeenCalledTimes(1)
  })

  it('sem Redis conectado, close não faz nada além de fechar o servidor', async () => {
    const adapter = new RedisIoAdapter({} as never)
    await expect(adapter.close({} as never)).resolves.toBeUndefined()
  })
})
