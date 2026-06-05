import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { ConfigService } from '@nestjs/config'
import { DebateStatus, InviteStatus, ParticipantRole, ReactionType } from '@prisma/client'
import {
  AccessToken,
  EgressClient,
  RoomServiceClient,
  S3Upload,
  SegmentedFileOutput,
} from 'livekit-server-sdk'
import { DebatesRepository } from './debates.repository'
import { DebatesGateway } from './debates.gateway'
import { CreateDebateDto } from './dto/create-debate.dto'
import { ListDebatesDto } from './dto/list-debates.dto'
import { UpdateDebateDto } from './dto/update-debate.dto'
import { CreateQuestionDto } from './dto/create-question.dto'
import { CreatePollDto } from './dto/create-poll.dto'

export const DEBATES_QUEUE = 'debates'

export type DebateJob =
  | { type: 'debate:live'; debateId: string; title: string; participantIds: string[] }
  | { type: 'debate:recording-done'; debateId: string; egressId: string }

@Injectable()
export class DebatesService {
  private readonly logger = new Logger(DebatesService.name)

  private get livekitUrl() { return this.config.getOrThrow('LIVEKIT_URL') }
  private get apiKey() { return this.config.getOrThrow('LIVEKIT_API_KEY') }
  private get apiSecret() { return this.config.getOrThrow('LIVEKIT_API_SECRET') }

  constructor(
    private readonly repo: DebatesRepository,
    private readonly config: ConfigService,
    @InjectQueue(DEBATES_QUEUE) private readonly queue: Queue,
    @Optional() private readonly gateway: DebatesGateway,
  ) {}

  async create(userId: string, dto: CreateDebateDto) {
    const membership = await this.repo.findPoliticianByUserId(userId)
    if (!membership) throw new ForbiddenException('Apenas políticos com conta ativa podem criar debates')

    const creatorId = membership.orgId
    const debate = await this.repo.create({
      title: dto.title,
      description: dto.description,
      scheduledFor: new Date(dto.scheduledFor),
      creatorId,
    })

    await this.repo.createParticipant(debate.id, creatorId, ParticipantRole.MODERATOR, InviteStatus.CONFIRMED)

    for (const politicianId of dto.invites) {
      if (politicianId === creatorId) continue
      await this.repo.createParticipant(debate.id, politicianId, ParticipantRole.DEBATER, InviteStatus.PENDING)
    }

    return this.repo.findById(debate.id)
  }

  async findAll(query: ListDebatesDto) {
    const [data, total] = await this.repo.findAll({
      status: query.status,
      politicianId: query.politicianId,
      upcoming: query.upcoming,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    })
    return {
      data,
      meta: {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        total,
        totalPages: Math.ceil(total / (query.limit ?? 20)),
      },
    }
  }

  async findById(id: string) {
    const debate = await this.repo.findById(id)
    if (!debate) throw new NotFoundException('Debate not found')
    return debate
  }

  async update(id: string, userId: string, dto: UpdateDebateDto) {
    await this.assertCreator(id, userId)
    const data: Record<string, unknown> = {}
    if (dto.title !== undefined) data.title = dto.title
    if (dto.description !== undefined) data.description = dto.description
    if (dto.scheduledFor !== undefined) data.scheduledFor = new Date(dto.scheduledFor)
    if (dto.recordingUrl !== undefined) data.recordingUrl = dto.recordingUrl
    if (dto.chatCooldownSecs !== undefined) data.chatCooldownSecs = dto.chatCooldownSecs
    return this.repo.update(id, data)
  }

  async respondInvite(debateId: string, politicianId: string, accept: boolean, userId: string) {
    const membership = await this.repo.findPoliticianByUserId(userId)
    if (!membership || membership.orgId !== politicianId) {
      throw new ForbiddenException('Você não representa este político')
    }

    const participant = await this.repo.findParticipant(debateId, politicianId)
    if (!participant) throw new NotFoundException('Convite não encontrado')
    if (participant.inviteStatus !== InviteStatus.PENDING) {
      throw new BadRequestException('Convite já respondido')
    }

    const status = accept ? InviteStatus.CONFIRMED : InviteStatus.DECLINED
    await this.repo.updateParticipantInvite(debateId, politicianId, status)

    return { accepted: accept }
  }

  async start(debateId: string, userId: string) {
    const debate = await this.repo.findById(debateId)
    if (!debate) throw new NotFoundException('Debate not found')
    await this.assertCreatorById(debate, userId)
    if (debate.status !== DebateStatus.SCHEDULED) {
      throw new BadRequestException('Debate não está no status SCHEDULED')
    }

    const roomName = `debate-${debateId}`
    const roomService = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret)
    await roomService.createRoom({ name: roomName, maxParticipants: 2000 })

    let hlsUrl: string | null = null
    let egressId: string | null = null

    // HLS Egress via Cloudflare R2 — only if R2 is configured
    const r2Bucket = this.config.get<string>('CLOUDFLARE_R2_BUCKET')
    const r2AccessKey = this.config.get<string>('CLOUDFLARE_R2_ACCESS_KEY')
    const r2SecretKey = this.config.get<string>('CLOUDFLARE_R2_SECRET_KEY')
    const r2Endpoint = this.config.get<string>('CLOUDFLARE_R2_ENDPOINT')
    const r2PublicUrl = this.config.get<string>('CLOUDFLARE_R2_PUBLIC_URL')

    if (r2Bucket && r2AccessKey && r2SecretKey && r2Endpoint) {
      try {
        const egressClient = new EgressClient(this.livekitUrl, this.apiKey, this.apiSecret)
        const output = new SegmentedFileOutput()
        output.filenamePrefix = `debates/${debateId}/segment`
        output.playlistName = 'playlist.m3u8'
        output.livePlaylistName = 'live.m3u8'
        output.segmentDuration = 6
        output.output = {
          case: 's3',
          value: new S3Upload({
            accessKey: r2AccessKey,
            secret: r2SecretKey,
            bucket: r2Bucket,
            region: 'auto',
            endpoint: r2Endpoint,
            forcePathStyle: true,
          }),
        }
        const egressInfo = await egressClient.startRoomCompositeEgress(roomName, output)
        egressId = egressInfo.egressId

        const publicBase = r2PublicUrl?.replace(/\/$/, '') ?? `${r2Endpoint}/${r2Bucket}`
        hlsUrl = `${publicBase}/debates/${debateId}/live.m3u8`
      } catch (err) {
        this.logger.warn(`HLS Egress failed — citizens will watch via LiveKit: ${(err as Error).message}`)
      }
    } else {
      this.logger.log('R2 not configured — citizens will connect as LiveKit subscribers')
    }

    await this.repo.updateStatus(debateId, DebateStatus.LIVE, {
      livekitRoomName: roomName,
      ...(hlsUrl && { hlsUrl }),
      ...(egressId && { egressId }),
    })

    this.gateway?.emitStatusChange(debateId, DebateStatus.LIVE)

    const participantIds = debate.participants.map((p) => p.politicianId)
    await this.queue.add('debate:live', { type: 'debate:live', debateId, title: debate.title, participantIds })

    return this.repo.findById(debateId)
  }

  async end(debateId: string, userId: string) {
    const debate = await this.repo.findById(debateId)
    if (!debate) throw new NotFoundException('Debate not found')
    await this.assertCreatorById(debate, userId)
    if (debate.status !== DebateStatus.LIVE) {
      throw new BadRequestException('Debate não está ao vivo')
    }

    if (debate.egressId) {
      try {
        const egressClient = new EgressClient(this.livekitUrl, this.apiKey, this.apiSecret)
        await egressClient.stopEgress(debate.egressId)
        await this.queue.add('debate:recording-done', {
          type: 'debate:recording-done',
          debateId,
          egressId: debate.egressId,
        })
      } catch (err) {
        this.logger.warn(`Could not stop egress: ${(err as Error).message}`)
      }
    }

    await this.repo.updateStatus(debateId, DebateStatus.ENDED)
    this.gateway?.emitStatusChange(debateId, DebateStatus.ENDED)

    return this.repo.findById(debateId)
  }

  async getLivekitToken(debateId: string, userId: string) {
    const debate = await this.repo.findById(debateId)
    if (!debate) throw new NotFoundException('Debate not found')
    if (!debate.livekitRoomName) throw new BadRequestException('Debate ainda não foi iniciado')

    // Politicians who are confirmed participants can publish; everyone else subscribes only
    const membership = await this.repo.findPoliticianByUserId(userId)
    const canPublish = membership ? await this.repo.isParticipant(debateId, membership.orgId) : false

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      ttl: '4h',
    })
    token.addGrant({
      room: debate.livekitRoomName,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
    })
    return { token: await token.toJwt(), canPublish }
  }

  findMessages(debateId: string) {
    return this.repo.findMessages(debateId)
  }

  findActivePoll(debateId: string) {
    return this.repo.findActivePoll(debateId)
  }

  async createQuestion(debateId: string, authorId: string, dto: CreateQuestionDto) {
    await this.assertExists(debateId)
    const question = await this.repo.createQuestion(debateId, authorId, dto.text)
    this.gateway?.emitNewQuestion(debateId, question)
    return question
  }

  async upvoteQuestion(debateId: string, questionId: string) {
    await this.assertExists(debateId)
    return this.repo.upvoteQuestion(questionId)
  }

  findQuestions(debateId: string) {
    return this.repo.findQuestions(debateId)
  }

  async createPoll(debateId: string, userId: string, dto: CreatePollDto) {
    const membership = await this.repo.findPoliticianByUserId(userId)
    if (!membership) throw new ForbiddenException()
    const isParticipant = await this.repo.isParticipant(debateId, membership.orgId)
    if (!isParticipant) throw new ForbiddenException('Apenas participantes podem criar enquetes')

    const poll = await this.repo.createPoll(debateId, dto.question, dto.options)
    this.gateway?.emitNewPoll(debateId, poll)
    return poll
  }

  async votePoll(debateId: string, pollId: string, optionId: string, userId: string) {
    await this.assertExists(debateId)
    const updated = await this.repo.votePoll(pollId, optionId, userId)
    if (updated) this.gateway?.emitPollResult(debateId, updated)
    return updated
  }

  async followPolitician(politicianId: string, userId: string) {
    const existing = await this.repo.isFollowing(userId, politicianId)
    if (existing) {
      await this.repo.unfollowPolitician(userId, politicianId)
      return { following: false }
    }
    await this.repo.followPolitician(userId, politicianId)
    return { following: true }
  }

  private async assertExists(debateId: string) {
    const exists = await this.repo.findById(debateId)
    if (!exists) throw new NotFoundException('Debate not found')
    return exists
  }

  private async assertCreator(debateId: string, userId: string) {
    const debate = await this.repo.findById(debateId)
    if (!debate) throw new NotFoundException('Debate not found')
    return this.assertCreatorById(debate, userId)
  }

  private async assertCreatorById(debate: { creatorId: string }, userId: string) {
    const membership = await this.repo.findPoliticianByUserId(userId)
    if (!membership || membership.orgId !== debate.creatorId) {
      throw new ForbiddenException('Apenas o criador do debate pode realizar esta ação')
    }
  }
}
