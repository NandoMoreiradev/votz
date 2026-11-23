import { Job } from 'bullmq'
import { LgpdProcessor } from './lgpd.processor'

describe('LgpdProcessor', () => {
  let processor: LgpdProcessor
  let prisma: any
  let storage: any
  let mail: any
  let crypto: any

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      report: { findMany: jest.fn().mockResolvedValue([]) },
      comment: { findMany: jest.fn().mockResolvedValue([]) },
      vote: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { findMany: jest.fn().mockResolvedValue([]) },
      orgMembership: { findMany: jest.fn().mockResolvedValue([]) },
      timelineEvent: { findMany: jest.fn().mockResolvedValue([]) },
      debateMessage: { findMany: jest.fn().mockResolvedValue([]) },
      debateQuestion: { findMany: jest.fn().mockResolvedValue([]) },
      debatePollVote: { findMany: jest.fn().mockResolvedValue([]) },
      propostaVoto: { findMany: jest.fn().mockResolvedValue([]) },
      userPoliticianFollower: { findMany: jest.fn().mockResolvedValue([]) },
      apiKey: { findMany: jest.fn().mockResolvedValue([]) },
      registrationRequest: { findMany: jest.fn().mockResolvedValue([]) },
      accessLog: { findMany: jest.fn().mockResolvedValue([]) },
      contextNote: { findMany: jest.fn().mockResolvedValue([{ kind: 'CORRECTION', text: 'Minha nota', sources: ['https://exemplo.com/a'], status: 'SHOWN', createdAt: new Date(), post: { id: 'p1' }, report: null }]) },
      contextNoteRating: { findMany: jest.fn().mockResolvedValue([{ value: 'HELPFUL', reasons: [], createdAt: new Date(), note: { id: 'n1', postId: 'p2', reportId: null } }]) },
      contextNoteRequest: { findMany: jest.fn().mockResolvedValue([]) },
      contextContributor: { findUnique: jest.fn().mockResolvedValue({ termsVersion: '2026-11-23', ratingsGiven: 3 }) },
      adUserPreference: { findUnique: jest.fn().mockResolvedValue({ personalizationConsent: true, consentAt: null, consentVersion: '2026-11-21', interests: ['sports'], updatedAt: null }) },
    }
    storage = {
      uploadJson: jest.fn().mockResolvedValue(undefined),
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://r2.example.com/signed.json'),
    }
    mail = {
      sendDataExportReady: jest.fn().mockResolvedValue(undefined),
    }
    crypto = {
      decrypt: jest.fn().mockReturnValue('12345678900'),
    }

    processor = new LgpdProcessor(prisma, storage, mail, crypto)
  })

  it('skips export when user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null)
    await processor.process({ name: 'export-data', data: { userId: 'u1', email: 'a@b.com', name: 'Ana' } } as Job)
    expect(storage.uploadJson).not.toHaveBeenCalled()
  })

  it('exports complete user data including decrypted CPF, consent fields, anonymous reports, debate/proposta/apiKey/registration records without limits or secrets', async () => {
    const now = new Date('2026-11-14T18:00:00Z')
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: 'u1' }) // existence check
      .mockResolvedValueOnce({
        id: 'u1',
        name: 'Ana',
        email: 'ana@votz.app',
        type: 'CITIZEN',
        verified: false,
        bio: 'Cidadã',
        phone: '+5579999999999',
        cpf: 'iv:tag:cipher',
        zipCode: '49000000',
        street: 'Rua A',
        streetNumber: '10',
        complement: null,
        neighborhood: 'Centro',
        city: 'Aracaju',
        state: 'SE',
        country: 'BR',
        latitude: -10.9,
        longitude: -37.0,
        emailVerified: true,
        mfaEnabled: false,
        termsAcceptedAt: now,
        termsVersion: '2026-11-14',
        privacyVersion: '2026-11-14',
        ageConfirmedAt: now,
        lastLoginAt: now,
        createdAt: now,
      })

    prisma.report.findMany.mockResolvedValue([
      { id: 'r1', title: 'Public', anonymous: false },
      { id: 'r2', title: 'Secret Report', anonymous: true },
    ])
    prisma.comment.findMany.mockResolvedValue([{ id: 'c1', content: 'Áudio', mediaType: 'AUDIO', transcript: 'Olá' }])
    prisma.vote.findMany.mockResolvedValue([{ type: 'SUPPORT', createdAt: now }])
    prisma.notification.findMany.mockResolvedValue([{ type: 'NEW_COMMENT', read: false, createdAt: now }])
    prisma.orgMembership.findMany.mockResolvedValue([{ orgType: 'COMPANY', orgId: 'co1', status: 'ACTIVE', createdAt: now }])
    prisma.timelineEvent.findMany.mockResolvedValue([{ id: 't1', type: 'COMMENT', content: 'Ev', createdAt: now }])
    prisma.debateMessage.findMany.mockResolvedValue([{ id: 'dm1', text: 'Msg', createdAt: now }])
    prisma.debateQuestion.findMany.mockResolvedValue([{ id: 'dq1', text: 'Pergunta?', upvotes: 2, answered: false, createdAt: now }])
    prisma.debatePollVote.findMany.mockResolvedValue([{ id: 'dpv1', poll: { id: 'p1', question: 'Q?', debateId: 'd1' }, option: { id: 'o1', text: 'Sim' } }])
    prisma.propostaVoto.findMany.mockResolvedValue([{ id: 'pv1', apoio: true, createdAt: now, proposta: { id: 'pr1', titulo: 'PL 1' } }])
    prisma.userPoliticianFollower.findMany.mockResolvedValue([{ createdAt: now, politician: { id: 'pol1', name: 'Fulano', office: 'Deputado', state: 'SE' } }])
    prisma.apiKey.findMany.mockResolvedValue([{ name: 'Minha chave', prefix: 'votz_abc1234', tier: 'FREE', lastUsedAt: null, revokedAt: null, createdAt: now }])
    prisma.registrationRequest.findMany.mockResolvedValue([
      { type: 'ENTITY', status: 'PENDING', note: 'Sou o secretário de comunicação', createdAt: now, reviewNote: null },
    ])
    prisma.accessLog.findMany.mockResolvedValue([{ event: 'LOGIN', ip: '187.10.20.30', createdAt: now }])

    await processor.process({
      name: 'export-data',
      data: { userId: 'u1', email: 'ana@votz.app', name: 'Ana' },
    } as Job)

    // Verify no anonymous: false filter and no take limits
    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { authorId: 'u1' } }))
    expect(prisma.comment.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ take: expect.any(Number) }))
    expect(prisma.vote.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ take: expect.any(Number) }))
    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.not.objectContaining({ take: expect.any(Number) }))

    expect(crypto.decrypt).toHaveBeenCalledWith('iv:tag:cipher')
    expect(storage.uploadJson).toHaveBeenCalledTimes(1)

    const [key, payload] = storage.uploadJson.mock.calls[0]
    expect(key).toMatch(/^exports\/u1\/.+\.json$/)

    expect(payload.profile.cpf).toBe('12345678900')
    expect(payload.profile.termsVersion).toBe('2026-11-14')
    expect(payload.profile.privacyVersion).toBe('2026-11-14')
    expect(payload.profile.termsAcceptedAt).toEqual(now)
    expect(payload.profile.ageConfirmedAt).toEqual(now)

    expect(payload.reports.total).toBe(2)
    expect(payload.timelineEvents.total).toBe(1)
    expect(payload.debateMessages.total).toBe(1)
    expect(payload.debateQuestions.total).toBe(1)
    expect(payload.debatePollVotes.total).toBe(1)
    expect(payload.propostaVotos.total).toBe(1)
    expect(payload.politicianFollows.total).toBe(1)
    expect(payload.apiKeys.total).toBe(1)
    expect(prisma.registrationRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { requesterId: 'u1' },
        select: expect.objectContaining({ note: true, reviewNote: true }),
      }),
    )
    expect(payload.registrationRequests.total).toBe(1)
    expect(payload.registrationRequests.items[0].note).toBe('Sou o secretário de comunicação')
    expect(payload.accessLogs).toEqual({
      total: 1,
      items: [{ event: 'LOGIN', ip: '187.10.20.30', createdAt: now }],
    })

    // Preferências de anúncios entram na exportação (LGPD: acesso e portabilidade)
    expect(payload.adPreferences).toEqual(expect.objectContaining({ personalizationConsent: true, interests: ['sports'] }))

    // Contexto da Comunidade: o que a pessoa escreveu, avaliou e pediu entra na exportação, filtrado só pela conta dela.
    expect(prisma.contextNote.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { authorId: 'u1' } }))
    expect(prisma.contextNoteRating.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { raterId: 'u1' } }))
    expect(prisma.contextNoteRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { requesterId: 'u1' } }))
    expect(payload.contextNotes.total).toBe(1)
    expect(payload.contextNotes.items[0].text).toBe('Minha nota')
    expect(payload.contextNoteRatings.total).toBe(1)
    expect(payload.contextNoteRequests.total).toBe(0)
    expect(payload.contextContributor).toEqual(expect.objectContaining({ termsVersion: '2026-11-23', ratingsGiven: 3 }))

    // Ensure no secret fields are selected or exported
    const serialized = JSON.stringify(payload)
    for (const forbidden of ['password', 'mfaSecret', 'mfaBackupCodes', 'refreshTokenHash', 'keyHash', 'verification/']) {
      expect(serialized).not.toContain(forbidden)
    }

    expect(mail.sendDataExportReady).toHaveBeenCalledWith(
      'ana@votz.app',
      'Ana',
      'https://r2.example.com/signed.json',
    )
  })
})
