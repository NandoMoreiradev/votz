import { Injectable, Logger } from '@nestjs/common'
import type { Socket } from 'socket.io'
import type { PrismaService } from '../../prisma/prisma.service'

export const SOCKET_REVALIDATION_INTERVAL_MS = 5 * 60_000

type RegisteredSocket = Pick<Socket, 'id' | 'disconnect' | 'data'> & Partial<Pick<Socket, 'join'>>

/** Sala de cada usuário autenticado: com o Redis adapter, alcança os sockets de TODAS as instâncias. */
export const userRoom = (userId: string): string => `user:${userId}`

/** O mínimo que o registro precisa de um namespace do Socket.IO (`server.in(sala).disconnectSockets()`). */
export interface RoomServer {
  in(room: string): { disconnectSockets(close?: boolean): unknown }
}

/**
 * Global in-memory registry mapping authenticated userId -> active sockets across gateways.
 * Enables immediate forced socket termination when an account is banned without introducing
 * circular module dependencies between AdminModule and WebSocket gateways.
 */
@Injectable()
export class SocketSessionRegistry {
  private readonly socketsByUser = new Map<string, Map<string, RegisteredSocket>>()
  private readonly servers = new Set<RoomServer>()

  /** Cada gateway entrega o seu namespace ao subir, para o banimento alcançar outras instâncias. */
  bindServer(server: RoomServer): void {
    this.servers.add(server)
  }

  register(userId: string, client: RegisteredSocket): void {
    let userSockets = this.socketsByUser.get(userId)
    if (!userSockets) {
      userSockets = new Map()
      this.socketsByUser.set(userId, userSockets)
    }
    userSockets.set(client.id, client)
  }

  unregister(userId: string | undefined, clientId: string): void {
    if (!userId) return
    const userSockets = this.socketsByUser.get(userId)
    if (!userSockets) return
    userSockets.delete(clientId)
    if (userSockets.size === 0) {
      this.socketsByUser.delete(userId)
    }
  }

  /**
   * Derruba todas as conexões do usuário. Os sockets desta instância caem na hora; os das outras
   * instâncias caem pela sala `user:<id>` (precisa do Redis adapter). Sem o adapter, as outras
   * instâncias só derrubam na revalidação periódica (SOCKET_REVALIDATION_INTERVAL_MS).
   * Devolve quantos sockets desta instância foram derrubados.
   */
  disconnectUser(userId: string): number {
    for (const server of this.servers) {
      try {
        server.in(userRoom(userId)).disconnectSockets(true)
      } catch {
        // a revalidação periódica garante a queda mesmo se o aviso entre instâncias falhar
      }
    }

    const userSockets = this.socketsByUser.get(userId)
    if (!userSockets || userSockets.size === 0) return 0

    let disconnected = 0
    for (const socket of userSockets.values()) {
      socket.disconnect(true)
      disconnected++
    }
    this.socketsByUser.delete(userId)
    return disconnected
  }
}

/** Registers an authenticated socket and schedules 5-minute DB ban/existence revalidation. */
export function startSocketSessionTracking(options: {
  client: RegisteredSocket
  userId: string
  prisma: Pick<PrismaService, 'user'>
  intervals: Map<string, ReturnType<typeof setInterval>>
  registry?: SocketSessionRegistry
  logger: Logger
}): void {
  const { client, userId, prisma, intervals, registry, logger } = options
  registry?.register(userId, client)
  void Promise.resolve(client.join?.(userRoom(userId))).catch(() => undefined)

  const existing = intervals.get(client.id)
  if (existing) clearInterval(existing)

  const interval = setInterval(async () => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, banned: true },
      })
      if (!user || user.banned) {
        logger.debug(`[ws] disconnecting banned/removed user ${userId} (socket ${client.id})`)
        stopSocketSessionTracking(client, intervals, registry)
        client.disconnect(true)
      }
    } catch {
      stopSocketSessionTracking(client, intervals, registry)
      client.disconnect(true)
    }
  }, SOCKET_REVALIDATION_INTERVAL_MS)

  interval.unref?.()
  intervals.set(client.id, interval)
}

/** Clears periodic revalidation interval and unregisters a disconnecting socket. */
export function stopSocketSessionTracking(
  client: Pick<Socket, 'id' | 'data'>,
  intervals: Map<string, ReturnType<typeof setInterval>>,
  registry?: SocketSessionRegistry,
): void {
  const interval = intervals.get(client.id)
  if (interval) {
    clearInterval(interval)
    intervals.delete(client.id)
  }
  const userId = client.data?.userId as string | undefined
  registry?.unregister(userId, client.id)
}
