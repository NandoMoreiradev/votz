import { Logger, Optional } from '@nestjs/common'
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { JwtService } from '@nestjs/jwt'
import { Server, Socket } from 'socket.io'
import { DebateStatus, ReactionType } from '@prisma/client'
import { DebatesRepository } from './debates.repository'

interface ReactionBurst {
  type: ReactionType
  burst: number
}

@WebSocketGateway({
  namespace: '/ws/debates',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class DebatesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server

  private readonly logger = new Logger(DebatesGateway.name)

  // rate-limit timestamps: covers reactions (userId:debateId:type) and chat (msg:userId:debateId)
  private readonly rateLimitTimestamps = new Map<string, number>()

  // pending reaction bursts: debateId:type → count
  private readonly pendingBursts = new Map<string, number>()
  private readonly burstTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // viewer count intervals per debate room
  private readonly viewerCountIntervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(
    private readonly jwt: JwtService,
    private readonly repo: DebatesRepository,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const raw = client.handshake.auth?.token as string | undefined
      const token = raw?.startsWith('Bearer ') ? raw.slice(7) : raw
      if (!token) { client.disconnect(); return }

      const payload = this.jwt.verify<{ sub: string }>(token)
      client.data.userId = payload.sub
      this.logger.debug(`[ws/debates] connected: ${payload.sub}`)
    } catch {
      client.disconnect()
    }
  }

  async handleDisconnect(client: Socket) {
    const rooms = [...client.rooms].filter((r) => r.startsWith('debate:'))
    for (const room of rooms) {
      await this.broadcastViewerCount(room.replace('debate:', ''))
    }
    this.logger.debug(`[ws/debates] disconnected: ${client.data.userId ?? client.id}`)
  }

  @SubscribeMessage('debate:join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { debateId: string }) {
    const { debateId } = data
    const room = `debate:${debateId}`
    await client.join(room)

    if (!this.viewerCountIntervals.has(debateId)) {
      const interval = setInterval(() => this.broadcastViewerCount(debateId), 30_000)
      this.viewerCountIntervals.set(debateId, interval)
    }

    await this.broadcastViewerCount(debateId)
  }

  @SubscribeMessage('debate:leave')
  async handleLeave(@ConnectedSocket() client: Socket, @MessageBody() data: { debateId: string }) {
    const room = `debate:${data.debateId}`
    await client.leave(room)
    await this.broadcastViewerCount(data.debateId)
  }

  @SubscribeMessage('debate:reaction')
  async handleReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { debateId: string; type: ReactionType },
  ) {
    const userId = client.data.userId as string
    const key = `${userId}:${data.debateId}:${data.type}`
    const now = Date.now()
    const last = this.rateLimitTimestamps.get(key) ?? 0

    if (now - last < 2_000) return
    this.rateLimitTimestamps.set(key, now)

    this.repo.createReaction(data.debateId, data.type).catch(() => null)
    this.scheduleBurst(data.debateId, data.type)
  }

  @SubscribeMessage('debate:message')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { debateId: string; text: string },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    // Validate input type before any operation
    if (typeof data.text !== 'string' || typeof data.debateId !== 'string') return

    const debate = await this.repo.findById(data.debateId)
    if (!debate || debate.status !== DebateStatus.LIVE) return

    const cooldownSecs = debate.chatCooldownSecs ?? 5
    const rateLimitKey = `msg:${userId}:${data.debateId}`
    const now = Date.now()
    const last = this.rateLimitTimestamps.get(rateLimitKey) ?? 0

    if (now - last < cooldownSecs * 1_000) return
    this.rateLimitTimestamps.set(rateLimitKey, now)

    const message = await this.repo.createMessage(data.debateId, userId, data.text.trim().slice(0, 500))
    this.server.to(`debate:${data.debateId}`).emit('debate:new-message', message)
  }

  @SubscribeMessage('debate:poll-vote')
  async handlePollVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { debateId: string; pollId: string; optionId: string },
  ) {
    const userId = client.data.userId as string
    if (!userId) return

    try {
      const updated = await this.repo.votePoll(data.pollId, data.optionId, userId)
      if (updated) {
        this.server.to(`debate:${data.debateId}`).emit('debate:poll-result', updated)
      }
    } catch {
      // unique constraint: user already voted
    }
  }

  // ── Emitters called by DebatesService ─────────────────────────────────────

  emitStatusChange(debateId: string, status: DebateStatus) {
    this.server.to(`debate:${debateId}`).emit('debate:status-change', { status })
  }

  emitNewQuestion(debateId: string, question: unknown) {
    this.server.to(`debate:${debateId}`).emit('debate:new-question', { question })
  }

  emitNewPoll(debateId: string, poll: unknown) {
    this.server.to(`debate:${debateId}`).emit('debate:new-poll', { poll })
  }

  emitPollResult(debateId: string, poll: unknown) {
    this.server.to(`debate:${debateId}`).emit('debate:poll-result', poll)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private scheduleBurst(debateId: string, type: ReactionType) {
    const key = `${debateId}:${type}`
    this.pendingBursts.set(key, (this.pendingBursts.get(key) ?? 0) + 1)

    if (!this.burstTimers.has(key)) {
      const timer = setTimeout(() => {
        const burst = this.pendingBursts.get(key) ?? 1
        this.pendingBursts.delete(key)
        this.burstTimers.delete(key)
        this.server.to(`debate:${debateId}`).emit('debate:reaction', { type, burst })
      }, 500)
      this.burstTimers.set(key, timer)
    }
  }

  private async broadcastViewerCount(debateId: string) {
    try {
      const sockets = await this.server.in(`debate:${debateId}`).fetchSockets()
      const count = sockets.length
      this.server.to(`debate:${debateId}`).emit('debate:viewer-count', { count })

      if (count === 0) {
        const interval = this.viewerCountIntervals.get(debateId)
        if (interval) {
          clearInterval(interval)
          this.viewerCountIntervals.delete(debateId)
        }
      }
    } catch {
      // room may not exist yet
    }
  }
}
