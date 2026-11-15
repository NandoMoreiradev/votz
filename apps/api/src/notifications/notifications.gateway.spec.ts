import {
  SOCKET_REVALIDATION_INTERVAL_MS,
  SocketSessionRegistry,
} from '../common/security/socket-session.registry'
import { NotificationsGateway } from './notifications.gateway'

describe('NotificationsGateway (H1 socket auth & L10 revalidation)', () => {
  let gateway: NotificationsGateway
  let jwt: any
  let prisma: any
  let registry: SocketSessionRegistry

  beforeEach(() => {
    jwt = { verify: jest.fn() }
    prisma = { user: { findUnique: jest.fn() } }
    registry = new SocketSessionRegistry()
    gateway = new NotificationsGateway(jwt, prisma, registry)
  })

  afterEach(() => {
    gateway.onModuleDestroy()
    jest.useRealTimers()
  })

  function makeSocket(token: string, id = 'sock-1') {
    return {
      id,
      handshake: { auth: { token } },
      data: {} as Record<string, unknown>,
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
    } as any
  }

  it('disconnects non-access tokens such as mfa_pending', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', type: 'mfa_pending' })
    const client = makeSocket('mfa-tok')

    await gateway.handleConnection(client)

    expect(jwt.verify).toHaveBeenCalledWith('mfa-tok', { algorithms: ['HS256'] })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.join).not.toHaveBeenCalled()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('disconnects banned or missing users', async () => {
    jwt.verify.mockReturnValue({ sub: 'u-banned', typ: 'access' })
    prisma.user.findUnique.mockResolvedValue({ id: 'u-banned', banned: true })
    const client = makeSocket('acc-tok')

    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.join).not.toHaveBeenCalled()
  })

  it('joins user room when token has typ: access and user is active', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', typ: 'access' })
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', banned: false })
    const client = makeSocket('acc-tok')

    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('u1')
    expect(client.join).toHaveBeenCalledWith('user:u1')
  })

  it('disconnects active socket immediately when disconnectUser is triggered or on 5m ban revalidation', async () => {
    jest.useFakeTimers()
    jwt.verify.mockReturnValue({ sub: 'u1', typ: 'access' })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', banned: false })
      .mockResolvedValueOnce({ id: 'u1', banned: true })

    const clientPeriodic = makeSocket('acc-tok', 'sock-periodic')
    await gateway.handleConnection(clientPeriodic)
    expect(clientPeriodic.disconnect).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(SOCKET_REVALIDATION_INTERVAL_MS)
    expect(clientPeriodic.disconnect).toHaveBeenCalledWith(true)

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', banned: false })
    jwt.verify.mockReturnValueOnce({ sub: 'u2', typ: 'access' })
    const clientImmediate = makeSocket('acc-tok', 'sock-immediate')
    await gateway.handleConnection(clientImmediate)

    expect(registry.disconnectUser('u2')).toBe(1)
    expect(clientImmediate.disconnect).toHaveBeenCalledWith(true)
  })
})
