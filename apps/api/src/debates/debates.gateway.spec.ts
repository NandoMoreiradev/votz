import {
  SOCKET_REVALIDATION_INTERVAL_MS,
  SocketSessionRegistry,
} from '../common/security/socket-session.registry'
import { DebatesGateway } from './debates.gateway'

describe('DebatesGateway (H1 socket auth & L10 revalidation)', () => {
  let gateway: DebatesGateway
  let jwt: any
  let repo: any
  let prisma: any
  let registry: SocketSessionRegistry

  beforeEach(() => {
    jwt = { verify: jest.fn() }
    repo = {}
    prisma = { user: { findUnique: jest.fn() } }
    registry = new SocketSessionRegistry()
    gateway = new DebatesGateway(jwt, repo, prisma, registry)
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
      rooms: new Set<string>(),
      disconnect: jest.fn(),
    } as any
  }

  it('disconnects non-access tokens such as mfa_pending', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', type: 'mfa_pending' })
    const client = makeSocket('mfa-tok')

    await gateway.handleConnection(client)

    expect(jwt.verify).toHaveBeenCalledWith('mfa-tok', { algorithms: ['HS256'] })
    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('disconnects banned users', async () => {
    jwt.verify.mockReturnValue({ sub: 'u-banned', typ: 'access' })
    prisma.user.findUnique.mockResolvedValue({ id: 'u-banned', banned: true })
    const client = makeSocket('acc-tok')

    await gateway.handleConnection(client)

    expect(client.disconnect).toHaveBeenCalled()
    expect(client.data.userId).toBeUndefined()
  })

  it('authenticates valid typ: access non-banned user', async () => {
    jwt.verify.mockReturnValue({ sub: 'u1', typ: 'access' })
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', banned: false })
    const client = makeSocket('acc-tok')

    await gateway.handleConnection(client)

    expect(client.disconnect).not.toHaveBeenCalled()
    expect(client.data.userId).toBe('u1')
  })

  it('disconnects active debate socket on 5m ban revalidation or immediate disconnectUser call', async () => {
    jest.useFakeTimers()
    jwt.verify.mockReturnValue({ sub: 'u1', typ: 'access' })
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u1', banned: false })
      .mockResolvedValueOnce({ id: 'u1', banned: true })

    const clientPeriodic = makeSocket('acc-tok', 'sock-periodic')
    await gateway.handleConnection(clientPeriodic)

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
