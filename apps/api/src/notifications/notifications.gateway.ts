import { Logger, OnModuleDestroy, Optional } from '@nestjs/common'
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'
import {
  SocketSessionRegistry,
  startSocketSessionTracking,
  stopSocketSessionTracking,
} from '../common/security/socket-session.registry'

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer() server: Server

  private readonly logger = new Logger(NotificationsGateway.name)
  private readonly revalidationIntervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Optional() private readonly socketRegistry?: SocketSessionRegistry,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined
      const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw
      if (!token) { client.disconnect(); return }

      const payload = this.jwt.verify<{ sub?: string; typ?: string }>(token, {
        algorithms: ['HS256'],
      })
      if (!payload?.sub || payload.typ !== 'access') { client.disconnect(); return }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, banned: true },
      })
      if (!user || user.banned) { client.disconnect(); return }

      client.data.userId = payload.sub
      await client.join(`user:${payload.sub}`)
      startSocketSessionTracking({
        client,
        userId: payload.sub,
        prisma: this.prisma,
        intervals: this.revalidationIntervals,
        registry: this.socketRegistry,
        logger: this.logger,
      })
      this.logger.debug(`[ws] conectado: ${payload.sub}`)
    } catch {
      client.disconnect()
    }
  }

  handleDisconnect(client: Socket) {
    stopSocketSessionTracking(client, this.revalidationIntervals, this.socketRegistry)
    this.logger.debug(`[ws] desconectado: ${client.data.userId ?? client.id}`)
  }

  onModuleDestroy() {
    for (const interval of this.revalidationIntervals.values()) {
      clearInterval(interval)
    }
    this.revalidationIntervals.clear()
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data)
  }
}
