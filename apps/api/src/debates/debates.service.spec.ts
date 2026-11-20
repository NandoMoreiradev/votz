import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DebateStatus, InviteStatus, OrgPermission, ParticipantRole, StreamProvider } from '@prisma/client'
import { DebatesService } from './debates.service'

const createRoomMock = jest.fn().mockResolvedValue({})
const toJwtMock = jest.fn().mockResolvedValue('jwt-livekit-token')
const addGrantMock = jest.fn()
const stopEgressMock = jest.fn().mockResolvedValue({})

jest.mock('livekit-server-sdk', () => ({
  RoomServiceClient: jest.fn(() => ({ createRoom: createRoomMock })),
  AccessToken: jest.fn(() => ({ addGrant: addGrantMock, toJwt: toJwtMock })),
  EgressClient: jest.fn(() => ({ stopEgress: stopEgressMock, startRoomCompositeEgress: jest.fn() })),
  SegmentedFileOutput: jest.fn(),
  S3Upload: jest.fn(),
}))

describe('DebatesService', () => {
  let service: DebatesService
  let repo: any
  let prisma: any
  let config: any
  let queue: any
  let gateway: any
  let youtube: any

  const polUser = (id = 'u1', orgId = 'pol-1') => ({
    id,
    type: 'CITIZEN',
    ctx: {
      type: 'POLITICIAN' as const,
      id: orgId,
      name: 'Pol',
      logoUrl: null,
      permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS],
    },
  })

  const entityUser = (id = 'u9', orgId = 'ent-1') => ({
    id,
    type: 'CITIZEN',
    ctx: {
      type: 'ENTITY' as const,
      id: orgId,
      name: 'Entidade',
      logoUrl: null,
      permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS],
    },
  })

  beforeEach(() => {
    jest.clearAllMocks()
    repo = {
      create: jest.fn(),
      createParticipant: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      findParticipant: jest.fn(),
      updateParticipantInvite: jest.fn(),
      updateStatus: jest.fn(),
      isParticipant: jest.fn(),
      createQuestion: jest.fn(),
      upvoteQuestion: jest.fn(),
      findQuestions: jest.fn(),
      createPoll: jest.fn(),
      votePoll: jest.fn(),
      isFollowing: jest.fn(),
      followPolitician: jest.fn(),
      unfollowPolitician: jest.fn(),
    }
    prisma = {
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'ACTIVE',
          role: { permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS] },
        }),
      },
    }
    config = {
      getOrThrow: jest.fn((k: string) => `val_${k}`),
      get: jest.fn().mockReturnValue(undefined),
    }
    queue = { add: jest.fn().mockResolvedValue({ id: 'j1' }) }
    gateway = {
      emitStatusChange: jest.fn(),
      emitNewQuestion: jest.fn(),
      emitNewPoll: jest.fn(),
      emitPollResult: jest.fn(),
      emitStreamChange: jest.fn(),
    }
    youtube = {
      resolveVerifiedStream: jest.fn().mockResolvedValue({
        videoId: 'dQw4w9WgXcQ',
        channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        channelTitle: 'Canal do João',
      }),
    }
    repo.updateParticipantStream = jest.fn()

    service = new DebatesService(repo, prisma, config, queue, youtube, gateway)
  })

  it('create forbids users without active POLITICIAN context and invites other politicians cleanly', async () => {
    await expect(
      service.create({ id: 'u1', type: 'POLITICIAN', ctx: null }, { title: 'D1', scheduledFor: '2026-10-01T18:00:00Z', invites: [] } as any),
    ).rejects.toThrow(ForbiddenException)

    repo.create.mockResolvedValue({ id: 'deb-1' })
    repo.findById.mockResolvedValue({ id: 'deb-1', title: 'Debate Educação' })

    const res = await service.create(polUser('u1', 'pol-1'), {
      title: 'Debate Educação',
      scheduledFor: '2026-10-01T18:00:00Z',
      invites: ['pol-1', 'pol-2'],
    } as any)

    expect(repo.createParticipant).toHaveBeenCalledWith('deb-1', 'pol-1', ParticipantRole.MODERATOR, InviteStatus.CONFIRMED)
    expect(repo.createParticipant).toHaveBeenCalledWith('deb-1', 'pol-2', ParticipantRole.DEBATER, InviteStatus.PENDING)
    expect(repo.createParticipant).toHaveBeenCalledTimes(2)
    expect(res!.id).toBe('deb-1')
  })

  it('respondInvite validates active context politician and updates pending invite', async () => {
    await expect(service.respondInvite('deb-1', 'pol-2', true, polUser('u1', 'pol-1'))).rejects.toThrow(
      ForbiddenException,
    )

    repo.findParticipant.mockResolvedValueOnce({ inviteStatus: InviteStatus.PENDING })
    const res = await service.respondInvite('deb-1', 'pol-2', true, polUser('u2', 'pol-2'))
    expect(repo.updateParticipantInvite).toHaveBeenCalledWith('deb-1', 'pol-2', InviteStatus.CONFIRMED)
    expect(res).toEqual({ accepted: true })
  })

  it('start creates LiveKit room, marks debate LIVE, emits gateway event and enqueues notification job', async () => {
    const debate = {
      id: 'deb-1',
      title: 'Debate',
      creatorId: 'pol-1',
      status: DebateStatus.SCHEDULED,
      participants: [{ politicianId: 'pol-1' }, { politicianId: 'pol-2' }],
    }
    repo.findById.mockResolvedValueOnce(debate).mockResolvedValueOnce({ ...debate, status: DebateStatus.LIVE })

    const res = await service.start('deb-1', polUser('u1', 'pol-1'))

    expect(createRoomMock).toHaveBeenCalledWith({ name: 'debate-deb-1', maxParticipants: 2000 })
    expect(repo.updateStatus).toHaveBeenCalledWith('deb-1', DebateStatus.LIVE, { livekitRoomName: 'debate-deb-1' })
    expect(gateway.emitStatusChange).toHaveBeenCalledWith('deb-1', DebateStatus.LIVE)
    expect(queue.add).toHaveBeenCalledWith(
      'debate:live',
      { type: 'debate:live', debateId: 'deb-1', title: 'Debate', participantIds: ['pol-1', 'pol-2'] },
    )
    expect(res!.status).toBe(DebateStatus.LIVE)
  })

  it('getLivekitToken grants publish rights only to confirmed participant politicians', async () => {
    repo.findById.mockResolvedValueOnce(null)
    await expect(service.getLivekitToken('missing', polUser('u1', 'pol-1'))).rejects.toThrow(NotFoundException)

    repo.findById.mockResolvedValueOnce({ id: 'deb-1', livekitRoomName: null })
    await expect(service.getLivekitToken('deb-1', polUser('u1', 'pol-1'))).rejects.toThrow(BadRequestException)

    repo.findById.mockResolvedValueOnce({ id: 'deb-1', livekitRoomName: 'debate-deb-1' })
    repo.isParticipant.mockResolvedValueOnce(true)

    const res = await service.getLivekitToken('deb-1', polUser('u1', 'pol-1'))
    expect(addGrantMock).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'debate-deb-1', canPublish: true, canSubscribe: true }),
    )
    expect(res).toEqual({ token: 'jwt-livekit-token', canPublish: true })
  })

  describe('transmissão pelo YouTube', () => {
    const youtubeDebate = (over: Record<string, unknown> = {}) => ({
      id: 'deb-1',
      title: 'Debate',
      status: DebateStatus.SCHEDULED,
      streamProvider: StreamProvider.YOUTUBE,
      creatorId: 'pol-1',
      hostEntityId: null,
      youtubeVideoId: null,
      participants: [{ politicianId: 'pol-1' }, { politicianId: 'pol-2' }],
      ...over,
    })

    it('create: político anfitrião nasce com YouTube, vira moderador e convida os outros', async () => {
      repo.create.mockResolvedValue({ id: 'deb-1' })
      repo.findById.mockResolvedValue(youtubeDebate())

      await service.create(polUser('u1', 'pol-1'), {
        title: 'Debate Saúde',
        scheduledFor: '2026-10-01T18:00:00Z',
        invites: ['pol-2', 'pol-2', 'pol-3'],
      } as any)

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ creatorId: 'pol-1', streamProvider: StreamProvider.YOUTUBE }),
      )
      expect(repo.create.mock.calls[0][0].hostEntityId).toBeUndefined()
      expect(repo.createParticipant).toHaveBeenCalledWith('deb-1', 'pol-1', ParticipantRole.MODERATOR, InviteStatus.CONFIRMED)
      // convite repetido não duplica
      expect(repo.createParticipant).toHaveBeenCalledTimes(3)
    })

    it('create: entidade anfitriã organiza sem debater e precisa convidar ao menos um político', async () => {
      await expect(
        service.create(entityUser(), { title: 'Debate Entidade', scheduledFor: '2026-10-01T18:00:00Z', invites: [] } as any),
      ).rejects.toThrow(BadRequestException)
      expect(repo.create).not.toHaveBeenCalled()

      repo.create.mockResolvedValue({ id: 'deb-2' })
      repo.findById.mockResolvedValue(youtubeDebate({ id: 'deb-2', creatorId: null, hostEntityId: 'ent-1' }))

      await service.create(entityUser(), {
        title: 'Debate Entidade',
        scheduledFor: '2026-10-01T18:00:00Z',
        invites: ['pol-1', 'pol-2'],
      } as any)

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ hostEntityId: 'ent-1' }))
      expect(repo.create.mock.calls[0][0].creatorId).toBeUndefined()
      expect(repo.createParticipant).not.toHaveBeenCalledWith('deb-2', expect.anything(), ParticipantRole.MODERATOR, expect.anything())
      expect(repo.createParticipant).toHaveBeenCalledWith('deb-2', 'pol-1', ParticipantRole.DEBATER, InviteStatus.PENDING)
      expect(repo.createParticipant).toHaveBeenCalledTimes(2)
    })

    it('start: exige o link da live e, com ele, não cria sala nem Egress no LiveKit', async () => {
      repo.findById.mockResolvedValueOnce(youtubeDebate())
      await expect(service.start('deb-1', polUser('u1', 'pol-1'))).rejects.toThrow(BadRequestException)
      expect(repo.updateStatus).not.toHaveBeenCalled()

      repo.findById
        .mockResolvedValueOnce(youtubeDebate({ youtubeVideoId: 'dQw4w9WgXcQ' }))
        .mockResolvedValueOnce(youtubeDebate({ youtubeVideoId: 'dQw4w9WgXcQ', status: DebateStatus.LIVE }))

      const res = await service.start('deb-1', polUser('u1', 'pol-1'))

      expect(createRoomMock).not.toHaveBeenCalled()
      expect(repo.updateStatus).toHaveBeenCalledWith('deb-1', DebateStatus.LIVE, {})
      expect(gateway.emitStatusChange).toHaveBeenCalledWith('deb-1', DebateStatus.LIVE)
      expect(queue.add).toHaveBeenCalledWith(
        'debate:live',
        expect.objectContaining({ debateId: 'deb-1', participantIds: ['pol-1', 'pol-2'] }),
      )
      expect(res!.status).toBe(DebateStatus.LIVE)
    })

    it('start: entidade anfitriã inicia o debate; outra entidade não', async () => {
      const debate = youtubeDebate({ creatorId: null, hostEntityId: 'ent-1', youtubeVideoId: 'dQw4w9WgXcQ' })

      repo.findById.mockResolvedValueOnce(debate)
      await expect(service.start('deb-1', entityUser('u8', 'ent-2'))).rejects.toThrow(ForbiddenException)

      repo.findById.mockResolvedValueOnce(debate).mockResolvedValueOnce(debate)
      await service.start('deb-1', entityUser('u9', 'ent-1'))
      expect(repo.updateStatus).toHaveBeenCalledWith('deb-1', DebateStatus.LIVE, {})
    })

    it('setStream: só o anfitrião, valida o canal pela organização dele e avisa quem está assistindo', async () => {
      const updated = youtubeDebate({ youtubeVideoId: 'dQw4w9WgXcQ' })
      repo.findById.mockResolvedValue(youtubeDebate())
      await expect(
        service.setStream('deb-1', polUser('u2', 'pol-2'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(ForbiddenException)
      expect(youtube.resolveVerifiedStream).not.toHaveBeenCalled()

      // 1ª leitura: o debate antes; 2ª: o debate já com o vídeo gravado
      repo.findById.mockResolvedValueOnce(youtubeDebate()).mockResolvedValueOnce(updated)
      const res = await service.setStream('deb-1', polUser('u1', 'pol-1'), 'https://youtu.be/dQw4w9WgXcQ')

      expect(youtube.resolveVerifiedStream).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'POLITICIAN', 'pol-1')
      expect(repo.update).toHaveBeenCalledWith('deb-1', {
        youtubeVideoId: 'dQw4w9WgXcQ',
        youtubeChannelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        youtubeChannelTitle: 'Canal do João',
      })
      expect(gateway.emitStreamChange).toHaveBeenCalledWith('deb-1', updated)
      expect(res).toBe(updated)
    })

    it('setStream: não grava nada quando o canal não é verificado e usa a entidade como dona quando ela hospeda', async () => {
      repo.findById.mockResolvedValue(youtubeDebate({ creatorId: null, hostEntityId: 'ent-1' }))
      youtube.resolveVerifiedStream.mockRejectedValueOnce(new ForbiddenException('canal não verificado'))

      await expect(
        service.setStream('deb-1', entityUser('u9', 'ent-1'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(ForbiddenException)

      expect(youtube.resolveVerifiedStream).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'ENTITY', 'ent-1')
      expect(repo.update).not.toHaveBeenCalled()
      expect(gateway.emitStreamChange).not.toHaveBeenCalled()
    })

    it('setStream: recusa debate do LiveKit e debate já encerrado', async () => {
      repo.findById.mockResolvedValue(youtubeDebate({ streamProvider: StreamProvider.LIVEKIT }))
      await expect(
        service.setStream('deb-1', polUser('u1', 'pol-1'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(BadRequestException)

      repo.findById.mockResolvedValue(youtubeDebate({ status: DebateStatus.ENDED }))
      await expect(
        service.setStream('deb-1', polUser('u1', 'pol-1'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(BadRequestException)
      expect(repo.update).not.toHaveBeenCalled()
    })

    it('setParticipantStream: só o próprio debatedor confirmado, com canal verificado dele', async () => {
      repo.findById.mockResolvedValue(youtubeDebate())

      // outro político tentando mexer no link do João
      await expect(
        service.setParticipantStream('deb-1', 'pol-2', polUser('u1', 'pol-1'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(ForbiddenException)

      // convite ainda pendente
      repo.findParticipant.mockResolvedValueOnce({ inviteStatus: InviteStatus.PENDING })
      await expect(
        service.setParticipantStream('deb-1', 'pol-2', polUser('u2', 'pol-2'), 'https://youtu.be/dQw4w9WgXcQ'),
      ).rejects.toThrow(ForbiddenException)
      expect(repo.updateParticipantStream).not.toHaveBeenCalled()

      repo.findParticipant.mockResolvedValueOnce({ inviteStatus: InviteStatus.CONFIRMED })
      await service.setParticipantStream('deb-1', 'pol-2', polUser('u2', 'pol-2'), 'https://youtu.be/dQw4w9WgXcQ')

      expect(youtube.resolveVerifiedStream).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'POLITICIAN', 'pol-2')
      expect(repo.updateParticipantStream).toHaveBeenCalledWith('deb-1', 'pol-2', {
        youtubeVideoId: 'dQw4w9WgXcQ',
        youtubeChannelTitle: 'Canal do João',
      })
      expect(gateway.emitStreamChange).toHaveBeenCalled()
    })

    it('setParticipantStream: link vazio tira o vídeo sem consultar o YouTube', async () => {
      repo.findById.mockResolvedValue(youtubeDebate())
      repo.findParticipant.mockResolvedValueOnce({ inviteStatus: InviteStatus.CONFIRMED })

      await service.setParticipantStream('deb-1', 'pol-2', polUser('u2', 'pol-2'), null)

      expect(youtube.resolveVerifiedStream).not.toHaveBeenCalled()
      expect(repo.updateParticipantStream).toHaveBeenCalledWith('deb-1', 'pol-2', {
        youtubeVideoId: null,
        youtubeChannelTitle: null,
      })
    })

    it('getLivekitToken: debate do YouTube não entrega token do LiveKit', async () => {
      repo.findById.mockResolvedValueOnce(youtubeDebate())
      await expect(service.getLivekitToken('deb-1', polUser('u1', 'pol-1'))).rejects.toThrow(BadRequestException)
      expect(addGrantMock).not.toHaveBeenCalled()
    })

    it('createPoll: entidade só cria enquete no debate que ela hospeda', async () => {
      repo.createPoll.mockResolvedValue({ id: 'poll-1' })
      repo.findById.mockResolvedValue(youtubeDebate({ creatorId: null, hostEntityId: 'ent-1' }))

      await expect(
        service.createPoll('deb-1', entityUser('u8', 'ent-2'), { question: 'Aprova?', options: ['Sim', 'Não'] } as any),
      ).rejects.toThrow(ForbiddenException)

      await service.createPoll('deb-1', entityUser('u9', 'ent-1'), { question: 'Aprova?', options: ['Sim', 'Não'] } as any)
      expect(repo.createPoll).toHaveBeenCalledWith('deb-1', 'Aprova?', ['Sim', 'Não'])
      expect(gateway.emitNewPoll).toHaveBeenCalled()
    })
  })

  it('followPolitician toggles follow state', async () => {
    repo.isFollowing.mockResolvedValueOnce(true)
    await expect(service.followPolitician('pol-1', 'u1')).resolves.toEqual({ following: false })
    expect(repo.unfollowPolitician).toHaveBeenCalledWith('u1', 'pol-1')

    repo.isFollowing.mockResolvedValueOnce(false)
    await expect(service.followPolitician('pol-1', 'u1')).resolves.toEqual({ following: true })
    expect(repo.followPolitician).toHaveBeenCalledWith('u1', 'pol-1')
  })
})
