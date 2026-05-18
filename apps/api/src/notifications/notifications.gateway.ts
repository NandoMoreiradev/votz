import { Logger } from '@nestjs/common'
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server

  private readonly logger = new Logger(NotificationsGateway.name)

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined
      const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw
      if (!token) { client.disconnect(); return }

      const payload = this.jwt.verify<{ sub: string }>(token)
      client.data.userId = payload.sub
      await client.join(`user:${payload.sub}`)
      this.logger.debug(`[ws] conectado: ${payload.sub}`)
    } catch {
      client.disconnect()
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[ws] desconectado: ${client.data.userId ?? client.id}`)
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data)
  }
}
