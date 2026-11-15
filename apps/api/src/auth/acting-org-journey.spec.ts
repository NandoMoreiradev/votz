import { getQueueToken } from '@nestjs/bullmq'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { MembershipStatus, OrgPermission, OrgType, PoliticianStatus, ReportStatus } from '@prisma/client'
import { PropostaStatus, RecipientType, UserType } from '@votz/shared-types'
import { AccessLogService } from '../access-log/access-log.service'
import { AlertsService } from '../alerts/alerts.service'
import { CommentsController } from '../comments/comments.controller'
import { CommentsRepository } from '../comments/comments.repository'
import { CommentsService } from '../comments/comments.service'
import { CryptoService } from '../crypto/crypto.service'
import { EmbeddingService } from '../embedding/embedding.service'
import { EntitiesController } from '../entities/entities.controller'
import { EntitiesRepository } from '../entities/entities.repository'
import { EntitiesService } from '../entities/entities.service'
import { MailService } from '../mail/mail.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PoliticiansController } from '../politicians/politicians.controller'
import { PoliticiansRepository } from '../politicians/politicians.repository'
import { PoliticiansService } from '../politicians/politicians.service'
import { PressureService } from '../press/pressure.service'
import { PrismaService } from '../prisma/prisma.service'
import { PropostasController } from '../propostas/propostas.controller'
import { PropostasRepository } from '../propostas/propostas.repository'
import { PropostasService } from '../propostas/propostas.service'
import { REPORTS_QUEUE } from '../reports/jobs/generate-embedding.processor'
import { ReportsController } from '../reports/reports.controller'
import { ReportsRepository } from '../reports/reports.repository'
import { ReportsService } from '../reports/reports.service'
import { StorageService } from '../storage/storage.service'
import { TimelineService } from '../timeline/timeline.service'
import { TranscriptionService } from '../transcription/transcription.service'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { RolesGuard } from './guards/roles.guard'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { JwtStrategy } from './strategies/jwt.strategy'

const otpVerifyMock = jest.fn(async ({ token }: { token: string }) => ({ valid: token === '123456' }))

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'JBSWY3DPEHPK3PXP'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz?secret=JBSWY3DPEHPK3PXP'),
  verify: (args: { token: string }) => otpVerifyMock(args),
}))

jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (s: string) => s },
  sanitize: (s: string) => s,
}))

const JWT_SECRET = 'test-secret-t1-journey-32-chars-minimum'

describe('T1 Full HTTP Journey: institutional actions authorized by active MFA context (User.type stays CITIZEN)', () => {
  let app: INestApplication
  let baseUrl: string
  let jwt: JwtService

  // In-memory state reproducing production DB where entity/politician owners remain User.type = CITIZEN
  const users = new Map<string, any>()
  const entities = new Map<string, any>()
  const politicians = new Map<string, any>()
  const memberships = new Map<string, any>()
  const reports = new Map<string, any>()
  const followers = new Map<string, any>()
  const propostas = new Map<string, any>()

  const ENT_A_ID = '11111111-1111-4111-8111-111111111111'
  const ENT_B_ID = '22222222-2222-4222-8222-222222222222'
  const POL_ID = '33333333-3333-4333-8333-333333333333'
  const REP_ENT_A_ID = '44444444-4444-4444-8444-444444444444'
  const REP_ENT_B_ID = '55555555-5555-4555-8555-555555555555'
  const REP_POL_ID = '66666666-6666-4666-8666-666666666666'
  const PROP_ID = '77777777-7777-4777-8777-777777777777'

  const mKey = (userId: string, orgType: string, orgId: string) => `${userId}:${orgType}:${orgId}`
  const fKey = (reportId: string, actorType: string, actorId: string) => `${reportId}:${actorType}:${actorId}`

  function resetState() {
    users.clear()
    entities.clear()
    politicians.clear()
    memberships.clear()
    reports.clear()
    followers.clear()
    propostas.clear()

    users.set('owner-1', {
      id: 'owner-1',
      email: 'owner@votz.test',
      name: 'Cidadão Dono',
      type: UserType.CITIZEN,
      banned: false,
      emailVerified: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      avatarUrl: null,
    })
    users.set('agent-1', {
      id: 'agent-1',
      email: 'agent@votz.test',
      name: 'Atendente',
      type: UserType.CITIZEN,
      banned: false,
      emailVerified: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      avatarUrl: null,
    })
    users.set('viewer-1', {
      id: 'viewer-1',
      email: 'viewer@votz.test',
      name: 'Visualizador',
      type: UserType.CITIZEN,
      banned: false,
      emailVerified: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      avatarUrl: null,
    })
    users.set('mod-1', {
      id: 'mod-1',
      email: 'mod@votz.test',
      name: 'Moderador',
      type: UserType.MODERATOR,
      banned: false,
      emailVerified: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      avatarUrl: null,
    })
    users.set('admin-1', {
      id: 'admin-1',
      email: 'admin@votz.test',
      name: 'Admin',
      type: UserType.ADMIN,
      banned: false,
      emailVerified: true,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
      avatarUrl: null,
    })

    entities.set(ENT_A_ID, { id: ENT_A_ID, legalName: 'Entidade A', logoUrl: null })
    entities.set(ENT_B_ID, { id: ENT_B_ID, legalName: 'Entidade B', logoUrl: null })
    politicians.set(POL_ID, {
      id: POL_ID,
      office: 'Vereador',
      createdByUserId: 'owner-1',
      status: PoliticianStatus.ATIVO,
      plan: 'MANDATOMETRO_PRO',
    })

    // owner-1 belongs to BOTH Entidade A and Entidade B, plus Politician
    memberships.set(mKey('owner-1', 'ENTITY', ENT_A_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.MANAGE_PROFILE] },
    })
    memberships.set(mKey('owner-1', 'ENTITY', ENT_B_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.MANAGE_PROFILE] },
    })
    memberships.set(mKey('owner-1', 'POLITICIAN', POL_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.MANAGE_PROFILE] },
    })
    // agent-1 only has RESPOND_REPORTS
    memberships.set(mKey('agent-1', 'ENTITY', ENT_A_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    memberships.set(mKey('agent-1', 'POLITICIAN', POL_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    // viewer-1 only has VIEW_ANALYTICS
    memberships.set(mKey('viewer-1', 'ENTITY', ENT_A_ID), {
      status: MembershipStatus.ACTIVE,
      role: { permissions: [OrgPermission.VIEW_ANALYTICS] },
    })

    reports.set(REP_ENT_A_ID, {
      id: REP_ENT_A_ID,
      title: 'Relato Entidade A',
      status: ReportStatus.OPEN,
      recipientType: RecipientType.ENTITY,
      recipientId: ENT_A_ID,
      author: { id: 'author-1', name: 'Cidadão' },
      authorId: 'author-1',
      timeline: [],
    })
    reports.set(REP_ENT_B_ID, {
      id: REP_ENT_B_ID,
      title: 'Relato Entidade B',
      status: ReportStatus.OPEN,
      recipientType: RecipientType.ENTITY,
      recipientId: ENT_B_ID,
      author: { id: 'author-1', name: 'Cidadão' },
      authorId: 'author-1',
      timeline: [],
    })
    reports.set(REP_POL_ID, {
      id: REP_POL_ID,
      title: 'Relato Político',
      status: ReportStatus.OPEN,
      recipientType: RecipientType.POLITICIAN,
      recipientId: POL_ID,
      author: { id: 'author-1', name: 'Cidadão' },
      authorId: 'author-1',
      timeline: [],
    })
  }

  beforeAll(async () => {
    const prismaMock: any = {
      user: {
        findUnique: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
      },
      entity: {
        findUnique: jest.fn(async ({ where }: any) => entities.get(where.id) ?? null),
      },
      politician: {
        findUnique: jest.fn(async ({ where }: any) => politicians.get(where.id) ?? null),
      },
      orgMembership: {
        findUnique: jest.fn(async ({ where }: any) => {
          const k = where?.userId_orgType_orgId
          return k ? memberships.get(mKey(k.userId, k.orgType, k.orgId)) ?? null : null
        }),
      },
      report: {
        findUnique: jest.fn(async ({ where }: any) => reports.get(where.id) ?? null),
        update: jest.fn(async ({ where, data }: any) => {
          const r = reports.get(where.id)
          if (r) Object.assign(r, data)
          return r
        }),
      },
      reportFollower: {
        findUnique: jest.fn(async ({ where }: any) => {
          const k = where?.reportId_actorType_actorId
          return k ? followers.get(fKey(k.reportId, k.actorType, k.actorId)) ?? null : null
        }),
      },
      timelineEvent: {
        create: jest.fn(async ({ data }: any) => {
          const r = reports.get(data.reportId)
          if (r) r.timeline.push(data)
          return data
        }),
      },
    }

    const reportsRepoMock: any = {
      findById: jest.fn(async (id: string) => reports.get(id) ?? null),
      updateStatus: jest.fn(async (id: string, status: ReportStatus) => {
        const r = reports.get(id)
        if (r) r.status = status
        return r
      }),
      getFollowerUserIds: jest.fn().mockResolvedValue([]),
      addFollower: jest.fn(async (reportId: string, actorType: string, actorId: string) => {
        followers.set(fKey(reportId, actorType, actorId), { reportId, actorType, actorId })
      }),
      removeFollower: jest.fn(async (reportId: string, actorType: string, actorId: string) => {
        followers.delete(fKey(reportId, actorType, actorId))
      }),
      findFollower: jest.fn(async (reportId: string, actorType: string, actorId: string) =>
        followers.get(fKey(reportId, actorType, actorId)) ?? null,
      ),
    }

    const propostasRepoMock: any = {
      findPoliticianById: jest.fn(async (id: string) => politicians.get(id) ?? null),
      create: jest.fn(async (dto: any, politicoId: string) => {
        const p = { id: PROP_ID, ...dto, politicoId, status: PropostaStatus.DRAFT }
        propostas.set(PROP_ID, p)
        return p
      }),
      addTimeline: jest.fn().mockResolvedValue({}),
      findById: jest.fn(async (id: string) => propostas.get(id) ?? null),
      updateStatus: jest.fn(async (id: string, status: PropostaStatus) => {
        const p = propostas.get(id)
        if (p) p.status = status
        return p
      }),
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: JWT_SECRET,
          signOptions: { expiresIn: '15m', algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      controllers: [
        AuthController,
        ReportsController,
        PropostasController,
        EntitiesController,
        PoliticiansController,
        CommentsController,
      ],
      providers: [
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        Reflector,
        ReportsService,
        PropostasService,
        EntitiesService,
        PoliticiansService,
        CommentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReportsRepository, useValue: reportsRepoMock },
        { provide: PropostasRepository, useValue: propostasRepoMock },
        { provide: EntitiesRepository, useValue: { create: jest.fn() } },
        { provide: PoliticiansRepository, useValue: { mandatometerStats: jest.fn().mockResolvedValue({}), updateMandatometer: jest.fn() } },
        { provide: CommentsRepository, useValue: { create: jest.fn(async (d: any) => ({ id: 'c1', ...d })) } },
        { provide: TimelineService, useValue: { record: jest.fn().mockResolvedValue({}) } },
        { provide: NotificationsService, useValue: { notify: jest.fn().mockResolvedValue(undefined) } },
        { provide: AlertsService, useValue: { enqueueCheck: jest.fn().mockResolvedValue(undefined) } },
        { provide: EmbeddingService, useValue: { embed: jest.fn().mockResolvedValue([]) } },
        { provide: PressureService, useValue: { enqueueReport: jest.fn().mockResolvedValue(undefined) } },
        { provide: TranscriptionService, useValue: { enqueue: jest.fn().mockResolvedValue(undefined) } },
        {
          provide: StorageService,
          useValue: {
            assertOwnStorageUrls: jest.fn(),
            assertOwnStorageUrl: jest.fn(),
            getPublicUrl: (k: string) => `https://cdn.votz.app/${k}`,
          },
        },
        { provide: MailService, useValue: { sendModerationNotice: jest.fn() } },
        { provide: AccessLogService, useValue: { record: jest.fn() } },
        { provide: CryptoService, useValue: { decrypt: (v: string) => v, encrypt: (v: string) => v } },
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, d?: string) => (k === 'JWT_SECRET' ? JWT_SECRET : d),
            getOrThrow: () => JWT_SECRET,
          },
        },
        { provide: getQueueToken(REPORTS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    const reflector = app.get(Reflector)
    app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector))
    await app.init()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    jwt = moduleRef.get(JwtService)
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    resetState()
  })

  function signUserToken(userId: string) {
    const u = users.get(userId)!
    return jwt.sign({ sub: u.id, email: u.email, type: u.type, typ: 'access' })
  }

  async function req(method: string, path: string, token: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json: any = null
    try {
      json = JSON.parse(text)
    } catch {
      /* empty */
    }
    return { status: res.status, json, text }
  }

  it('completes CITIZEN -> entity & politician MFA context switch -> updateStatus, advocate, follow, propostas; enforces all 403 guards', async () => {
    const personalToken = signUserToken('owner-1') // User.type === CITIZEN

    // 1) Citizen token (without ctx, even though owner has ACTIVE memberships) -> 403 everywhere
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, personalToken, { status: 'IN_PROGRESS', content: 'Sem contexto ativo nao deve funcionar.' })).status).toBe(403)
    expect((await req('POST', `/reports/${REP_ENT_A_ID}/follow`, personalToken)).status).toBe(403)
    expect((await req('POST', `/entities/${ENT_A_ID}/advocate/${REP_ENT_A_ID}`, personalToken)).status).toBe(403)
    expect((await req('POST', `/politicians/${POL_ID}/advocate/${REP_POL_ID}`, personalToken)).status).toBe(403)
    expect((await req('POST', '/propostas', personalToken, { titulo: 'Proposta teste', descricao: 'Descricao suficientemente longa da proposta.', categorias: ['HEALTH'] })).status).toBe(403)

    // 2) Switch to ENTIDADE B via MFA -> actions happen in Entidade B (not first entity A!), cross-org A returns 403
    const swB = await req('POST', '/auth/switch-context', personalToken, {
      contextType: 'entity',
      contextId: ENT_B_ID,
      mfaCode: '123456',
    })
    expect(swB.status).toBe(200)
    const tokenEntB = swB.json.accessToken as string

    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, tokenEntB, { status: 'IN_PROGRESS', content: 'Tentativa em relato de outra entidade.' })).status).toBe(403)
    expect((await req('POST', `/entities/${ENT_A_ID}/advocate/${REP_ENT_A_ID}`, tokenEntB)).status).toBe(403)
    expect((await req('PATCH', `/reports/${REP_ENT_B_ID}/status`, tokenEntB, { status: 'IN_PROGRESS', content: 'Atendendo relato destinado a Entidade B.' })).status).toBe(200)
    expect((await req('POST', `/reports/${REP_ENT_B_ID}/follow`, tokenEntB)).json).toMatchObject({ following: true, actorId: ENT_B_ID })

    // 3) Switch to ENTIDADE A -> 200 on Entidade A's report; if removed/suspended while token valid -> 403
    const swA = await req('POST', '/auth/switch-context', personalToken, {
      contextType: 'entity',
      contextId: ENT_A_ID,
      mfaCode: '123456',
    })
    const tokenEntA = swA.json.accessToken as string
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, tokenEntA, { status: 'IN_PROGRESS', content: 'Equipe da Entidade A acionada.' })).status).toBe(200)

    memberships.set(mKey('owner-1', 'ENTITY', ENT_A_ID), {
      status: MembershipStatus.SUSPENDED,
      role: { permissions: [OrgPermission.RESPOND_REPORTS] },
    })
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, tokenEntA, { status: 'RESOLVED', content: 'Token valido mas membro removido da equipe.' })).status).toBe(403)

    // 4) Switch to POLITICIAN (MANDATOMETRO_PRO, User.type still CITIZEN) -> create proposta, update proposta status, follow & update report status
    const swPol = await req('POST', '/auth/switch-context', personalToken, {
      contextType: 'politician',
      contextId: POL_ID,
      mfaCode: '123456',
    })
    expect(swPol.status).toBe(200)
    const tokenPol = swPol.json.accessToken as string

    const crProp = await req('POST', '/propostas', tokenPol, {
      titulo: 'Mais creches no centro',
      descricao: 'Construcao de novas creches municipais com orcamento detalhado.',
      categorias: ['EDUCATION'],
    })
    expect(crProp.status).toBe(201)

    const updProp = await req('PATCH', `/propostas/${PROP_ID}/status`, tokenPol, {
      status: PropostaStatus.PRESENTED,
      conteudo: 'Proposta protocolada oficialmente na casa.',
    })
    expect(updProp.status).toBe(200)

    expect((await req('POST', `/reports/${REP_POL_ID}/follow`, tokenPol)).status).toBe(201)
    expect((await req('PATCH', `/reports/${REP_POL_ID}/status`, tokenPol, { status: 'UNDER_REVIEW', content: 'Gabinete analisando o caso relatado.' })).status).toBe(200)

    // 5) AGENT (RESPOND_REPORTS only) can update report status (200) but CANNOT create proposta (403); VIEWER cannot update status (403)
    const agentPersonal = signUserToken('agent-1')
    const agentEntToken = (await req('POST', '/auth/switch-context', agentPersonal, { contextType: 'entity', contextId: ENT_A_ID, mfaCode: '123456' })).json.accessToken
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, agentEntToken, { status: 'RESOLVED', content: 'Atendente concluiu o atendimento.' })).status).toBe(200)

    const agentPolToken = (await req('POST', '/auth/switch-context', agentPersonal, { contextType: 'politician', contextId: POL_ID, mfaCode: '123456' })).json.accessToken
    expect((await req('POST', '/propostas', agentPolToken, { titulo: 'Agente tentando propor', descricao: 'Atendente nao tem MANAGE_PROFILE na organizacao.', categorias: ['HEALTH'] })).status).toBe(403)

    const viewerToken = (await req('POST', '/auth/switch-context', signUserToken('viewer-1'), { contextType: 'entity', contextId: ENT_A_ID, mfaCode: '123456' })).json.accessToken
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, viewerToken, { status: 'IN_PROGRESS', content: 'Visualizador tentando responder relato.' })).status).toBe(403)

    // 6) MODERATOR and ADMIN still update status without institutional ctx (200)
    expect((await req('PATCH', `/reports/${REP_ENT_A_ID}/status`, signUserToken('mod-1'), { status: 'UNDER_REVIEW', content: 'Moderador analisando relato sem contexto.' })).status).toBe(200)
    expect((await req('PATCH', `/reports/${REP_ENT_B_ID}/status`, signUserToken('admin-1'), { status: 'RESOLVED', content: 'Admin resolvendo relato sem contexto.' })).status).toBe(200)
  })
})
