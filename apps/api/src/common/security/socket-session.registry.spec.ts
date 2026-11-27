import { SocketSessionRegistry, startSocketSessionTracking, userRoom } from './socket-session.registry'

function fakeSocket(id: string) {
  return { id, data: {} as Record<string, unknown>, disconnect: jest.fn(), join: jest.fn().mockResolvedValue(undefined) }
}

function fakeServer() {
  const disconnectSockets = jest.fn()
  const inRoom = jest.fn().mockReturnValue({ disconnectSockets })
  return { in: inRoom, disconnectSockets, inRoom }
}

describe('SocketSessionRegistry.disconnectUser', () => {
  it('derruba os sockets locais do usuário', () => {
    const registry = new SocketSessionRegistry()
    const a = fakeSocket('a')
    const b = fakeSocket('b')
    registry.register('u1', a)
    registry.register('u1', b)
    registry.register('u2', fakeSocket('c'))

    expect(registry.disconnectUser('u1')).toBe(2)
    expect(a.disconnect).toHaveBeenCalledWith(true)
    expect(b.disconnect).toHaveBeenCalledWith(true)
    expect(registry.disconnectUser('u1')).toBe(0)
  })

  it('também avisa a sala do usuário em cada namespace, para alcançar as outras instâncias', () => {
    const registry = new SocketSessionRegistry()
    const notifications = fakeServer()
    const debates = fakeServer()
    registry.bindServer(notifications)
    registry.bindServer(debates)

    // nenhum socket local: a conta pode estar conectada só em outra instância
    expect(registry.disconnectUser('u1')).toBe(0)
    expect(notifications.inRoom).toHaveBeenCalledWith(userRoom('u1'))
    expect(notifications.disconnectSockets).toHaveBeenCalledWith(true)
    expect(debates.disconnectSockets).toHaveBeenCalledWith(true)
  })

  it('falha no aviso entre instâncias não impede derrubar os sockets locais', () => {
    const registry = new SocketSessionRegistry()
    registry.bindServer({
      in: () => {
        throw new Error('redis fora')
      },
    })
    const a = fakeSocket('a')
    registry.register('u1', a)

    expect(registry.disconnectUser('u1')).toBe(1)
    expect(a.disconnect).toHaveBeenCalledWith(true)
  })

  it('startSocketSessionTracking põe o socket na sala do usuário', () => {
    const socket = fakeSocket('a')
    const intervals = new Map<string, ReturnType<typeof setInterval>>()
    startSocketSessionTracking({
      client: socket,
      userId: 'u1',
      prisma: { user: { findUnique: jest.fn() } } as never,
      intervals,
      logger: { debug: jest.fn() } as never,
    })
    expect(socket.join).toHaveBeenCalledWith(userRoom('u1'))
    clearInterval(intervals.get('a'))
  })
})
