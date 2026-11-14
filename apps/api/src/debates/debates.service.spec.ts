import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { DebateStatus, InviteStatus, ParticipantRole } from '@prisma/client'
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
  let config: any
  let queue: any
  let gateway: any

  beforeEach(() => {
    jest.clearAllMocks()
    repo = {
      findPoliticianByUserId: jest.fn(),
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
    }

    service = new DebatesService(repo, config, queue, gateway)
  })

  it('create forbids non-politician users and invites other politicians cleanly', async () => {
    repo.findPoliticianByUserId.mockResolvedValueOnce(null)
    await expect(service.create('u1', { title: 'D1', scheduledFor: '2026-10-01T18:00:00Z', invites: [] } as any)).rejects.toThrow(
      ForbiddenException,
    )

    repo.findPoliticianByUserId.mockResolvedValueOnce({ orgId: 'pol-1' })
    repo.create.mockResolvedValue({ id: 'deb-1' })
    repo.findById.mockResolvedValue({ id: 'deb-1', title: 'Debate Educação' })

    const res = await service.create('u1', {
      title: 'Debate Educação',
      scheduledFor: '2026-10-01T18:00:00Z',
      invites: ['pol-1', 'pol-2'],
    } as any)

    expect(repo.createParticipant).toHaveBeenCalledWith('deb-1', 'pol-1', ParticipantRole.MODERATOR, InviteStatus.CONFIRMED)
    expect(repo.createParticipant).toHaveBeenCalledWith('deb-1', 'pol-2', ParticipantRole.DEBATER, InviteStatus.PENDING)
    expect(repo.createParticipant).toHaveBeenCalledTimes(2)
    expect(res!.id).toBe('deb-1')
  })

  it('respondInvite validates politician representation and updates pending invite', async () => {
    repo.findPoliticianByUserId.mockResolvedValueOnce({ orgId: 'pol-1' })
    await expect(service.respondInvite('deb-1', 'pol-2', true, 'u1')).rejects.toThrow(ForbiddenException)

    repo.findPoliticianByUserId.mockResolvedValueOnce({ orgId: 'pol-2' })
    repo.findParticipant.mockResolvedValueOnce({ inviteStatus: InviteStatus.PENDING })
    const res = await service.respondInvite('deb-1', 'pol-2', true, 'u2')
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
    repo.findPoliticianByUserId.mockResolvedValue({ orgId: 'pol-1' })

    const res = await service.start('deb-1', 'u1')

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
    await expect(service.getLivekitToken('missing', 'u1')).rejects.toThrow(NotFoundException)

    repo.findById.mockResolvedValueOnce({ id: 'deb-1', livekitRoomName: null })
    await expect(service.getLivekitToken('deb-1', 'u1')).rejects.toThrow(BadRequestException)

    repo.findById.mockResolvedValueOnce({ id: 'deb-1', livekitRoomName: 'debate-deb-1' })
    repo.findPoliticianByUserId.mockResolvedValueOnce({ orgId: 'pol-1' })
    repo.isParticipant.mockResolvedValueOnce(true)

    const res = await service.getLivekitToken('deb-1', 'u1')
    expect(addGrantMock).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'debate-deb-1', canPublish: true, canSubscribe: true }),
    )
    expect(res).toEqual({ token: 'jwt-livekit-token', canPublish: true })
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
