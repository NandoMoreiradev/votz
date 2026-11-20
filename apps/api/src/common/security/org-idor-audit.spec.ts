jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz'),
  verify: jest.fn(async () => ({ valid: false })),
}))
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (v: string) => v },
}))

import { getQueueToken } from '@nestjs/bullmq'
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { OrgPermission, OrgType, UserType } from '@prisma/client'
import { PropostaStatus } from '@votz/shared-types'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../../auth/guards/roles.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { DebatesController } from '../../debates/debates.controller'
import { DebatesRepository } from '../../debates/debates.repository'
import { DEBATES_QUEUE, DebatesService } from '../../debates/debates.service'
import { YoutubeChannelsService } from '../../youtube/youtube-channels.service'
import { OrgMembershipsController } from '../../org-memberships/org-memberships.controller'
import { OrgPermissionGuard } from '../../org-memberships/org-memberships.guard'
import { OrgMembershipsRepository } from '../../org-memberships/org-memberships.repository'
import { OrgMembershipsService } from '../../org-memberships/org-memberships.service'
import { PropostasController } from '../../propostas/propostas.controller'
import { PropostasRepository } from '../../propostas/propostas.repository'
import { PropostasService } from '../../propostas/propostas.service'
import { RegistrationRequestsController } from '../../registration-requests/registration-requests.controller'
import { RegistrationRequestsService } from '../../registration-requests/registration-requests.service'
import { SubscricoesController } from '../../subscricoes/subscricoes.controller'
import { SubscricoesService } from '../../subscricoes/subscricoes.service'

const ORG_A_ID = '11111111-1111-4111-8111-111111111111'
const ORG_B_ID = '22222222-2222-4222-8222-222222222222'
const TARGET_USER_ID = '33333333-3333-4333-8333-333333333333'
const ROLE_B_ID = '44444444-4444-4444-8444-444444444444'
const PROPOSTA_B_ID = '55555555-5555-4555-8555-555555555555'
const PROPOSTA_MISSING_ID = '66666666-6666-4666-8666-666666666666'
const DEBATE_B_ID = '77777777-7777-4777-8777-777777777777'
const DEBATE_A_ID = '88888888-8888-4888-8888-888888888888'
const DEBATE_ENTITY_ID = '99999999-9999-4999-8999-999999999999'
const ENTITY_X_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('Cross-tenant & Organization Authorization IDOR audit', () => {
  let app: INestApplication
  let baseUrl: string
  let orgMembershipRepo: any
  let propostasRepo: any
  let debatesRepo: any
  let youtubeChannels: any
  let orgMembershipsService: any
  let subscricoesService: any
  let regReqService: any

  const userA = {
    id: 'user-a',
    email: 'a@votz.app',
    type: UserType.CITIZEN,
    ctx: {
      type: 'POLITICIAN',
      id: ORG_A_ID,
      name: 'Político A',
      logoUrl: null,
      permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS],
    },
  }

  let prismaMock: any

  beforeAll(async () => {
    prismaMock = {
      orgMembership: {
        findUnique: jest.fn(async ({ where }: any) => {
          const k = where?.userId_orgType_orgId
          if (k?.userId === userA.id && k?.orgType === OrgType.POLITICIAN && k?.orgId === ORG_A_ID) {
            return {
              status: 'ACTIVE',
              role: { permissions: [OrgPermission.MANAGE_PROFILE, OrgPermission.RESPOND_REPORTS] },
            }
          }
          return null
        }),
      },
    }
    orgMembershipRepo = {
      findMembership: jest.fn(async (userId: string, orgType: OrgType, orgId: string) => {
        if (userId === userA.id && orgType === OrgType.ENTITY && orgId === ORG_A_ID) {
          return {
            status: 'ACTIVE',
            role: { permissions: [OrgPermission.MANAGE_MEMBERS, OrgPermission.MANAGE_BILLING] },
          }
        }
        return null
      }),
    }

    orgMembershipsService = {
      listRoles: jest.fn().mockResolvedValue([]),
      createRole: jest.fn().mockResolvedValue({ id: 'role-new' }),
      updateRole: jest.fn().mockResolvedValue({}),
      deleteRole: jest.fn().mockResolvedValue({}),
      listMembers: jest.fn().mockResolvedValue([]),
      updateMemberRole: jest.fn().mockResolvedValue({}),
      removeMember: jest.fn().mockResolvedValue({}),
      invite: jest.fn().mockResolvedValue({}),
    }

    subscricoesService = {
      criarCheckout: jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
      criarPortal: jest.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' }),
      handleWebhook: jest.fn().mockResolvedValue({ received: true }),
    }

    regReqService = {
      create: jest.fn(),
      findMyRequests: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      approve: jest.fn().mockResolvedValue({}),
      reject: jest.fn().mockResolvedValue({}),
      getDocumentUrls: jest.fn().mockResolvedValue({}),
    }

    propostasRepo = {
      findPoliticianById: jest.fn(async (id: string) =>
        id === ORG_A_ID ? { id: ORG_A_ID, plan: 'MANDATO_PRO' } : null,
      ),
      findById: jest.fn(async (id: string) => {
        if (id === PROPOSTA_B_ID) return { id: PROPOSTA_B_ID, politicoId: ORG_B_ID }
        return null
      }),
      updateStatus: jest.fn().mockResolvedValue({}),
      addTimeline: jest.fn().mockResolvedValue({}),
    }

    const debateFixture = (over: Record<string, unknown>) => ({
      status: 'SCHEDULED', streamProvider: 'YOUTUBE', creatorId: null, hostEntityId: null, participants: [], ...over,
    })
    debatesRepo = {
      findById: jest.fn(async (id: string) => {
        if (id === DEBATE_B_ID) return debateFixture({ id: DEBATE_B_ID, creatorId: ORG_B_ID })
        if (id === DEBATE_A_ID) return debateFixture({ id: DEBATE_A_ID, creatorId: ORG_A_ID })
        if (id === DEBATE_ENTITY_ID) return debateFixture({ id: DEBATE_ENTITY_ID, hostEntityId: ENTITY_X_ID })
        return null
      }),
      update: jest.fn().mockResolvedValue({}),
      updateParticipantStream: jest.fn().mockResolvedValue({}),
      createPoll: jest.fn().mockResolvedValue({ id: 'poll-1' }),
      findParticipant: jest.fn().mockResolvedValue(null),
      isParticipant: jest.fn().mockResolvedValue(false),
    }
    youtubeChannels = {
      resolveVerifiedStream: jest.fn().mockResolvedValue({
        videoId: 'dQw4w9WgXcQ', channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Canal',
      }),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [
        OrgMembershipsController,
        SubscricoesController,
        RegistrationRequestsController,
        PropostasController,
        DebatesController,
      ],
      providers: [
        Reflector,
        RolesGuard,
        OrgPermissionGuard,
        PropostasService,
        DebatesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OrgMembershipsRepository, useValue: orgMembershipRepo },
        { provide: OrgMembershipsService, useValue: orgMembershipsService },
        { provide: SubscricoesService, useValue: subscricoesService },
        { provide: RegistrationRequestsService, useValue: regReqService },
        { provide: PropostasRepository, useValue: propostasRepo },
        { provide: DebatesRepository, useValue: debatesRepo },
        { provide: YoutubeChannelsService, useValue: youtubeChannels },
        { provide: ConfigService, useValue: { get: jest.fn(), getOrThrow: jest.fn() } },
        { provide: getQueueToken(DEBATES_QUEUE), useValue: { add: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: ExecutionContext) {
          const req = ctx.switchToHttp().getRequest()
          const header = req.headers['x-test-user']
          if (!header || typeof header !== 'string') {
            throw new UnauthorizedException()
          }
          req.user = JSON.parse(header)
          return true
        },
      })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await app.init()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterAll(async () => {
    await app?.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  async function requestAs(
    method: string,
    path: string,
    body?: unknown,
    user: Record<string, unknown> = userA,
  ) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-test-user': JSON.stringify(user),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  it('org-memberships: blocks user from Org A across Org B endpoints with 403 while allowing Org A', async () => {
    const allowed = await requestAs('GET', `/org-memberships/ENTITY/${ORG_A_ID}/roles`)
    expect(allowed.status).toBe(200)

    const crossRead = await requestAs('GET', `/org-memberships/ENTITY/${ORG_B_ID}/roles`)
    expect(crossRead.status).toBe(403)

    const crossMembers = await requestAs('GET', `/org-memberships/ENTITY/${ORG_B_ID}/members`)
    expect(crossMembers.status).toBe(403)

    const crossCreateRole = await requestAs('POST', '/org-memberships/roles', {
      orgType: 'ENTITY',
      orgId: ORG_B_ID,
      name: 'IntruderRole',
      permissions: ['MANAGE_MEMBERS'],
    })
    expect(crossCreateRole.status).toBe(403)

    const crossPatchRole = await requestAs(
      'PATCH',
      `/org-memberships/ENTITY/${ORG_B_ID}/roles/${ROLE_B_ID}`,
      { name: 'Hijacked' },
    )
    expect(crossPatchRole.status).toBe(403)

    const crossDeleteMember = await requestAs(
      'DELETE',
      `/org-memberships/ENTITY/${ORG_B_ID}/members/${TARGET_USER_ID}`,
    )
    expect(crossDeleteMember.status).toBe(403)

    expect(orgMembershipsService.listRoles).toHaveBeenCalledTimes(1)
    expect(orgMembershipsService.createRole).not.toHaveBeenCalled()
    expect(orgMembershipsService.updateRole).not.toHaveBeenCalled()
    expect(orgMembershipsService.removeMember).not.toHaveBeenCalled()
  })

  it('subscricoes: blocks checkout and portal creation for Org B with 403', async () => {
    const allowedCheckout = await requestAs('POST', '/subscricoes/checkout', {
      orgId: ORG_A_ID,
      orgType: OrgType.ENTITY,
      plan: 'GESTAO',
    })
    expect(allowedCheckout.status).toBe(201)

    const crossCheckout = await requestAs('POST', '/subscricoes/checkout', {
      orgId: ORG_B_ID,
      orgType: OrgType.ENTITY,
      plan: 'GESTAO',
    })
    expect(crossCheckout.status).toBe(403)

    const crossPortal = await requestAs('POST', '/subscricoes/portal', {
      orgId: ORG_B_ID,
      orgType: OrgType.ENTITY,
    })
    expect(crossPortal.status).toBe(403)

    expect(subscricoesService.criarCheckout).toHaveBeenCalledTimes(1)
    expect(subscricoesService.criarPortal).not.toHaveBeenCalled()
  })

  it('registration-requests: blocks non-moderator users from listing, reviewing, or accessing doc URLs', async () => {
    const rList = await requestAs('GET', '/registration-requests')
    const rApprove = await requestAs('POST', `/registration-requests/${ORG_B_ID}/approve`, {
      reviewNote: 'bypass',
    })
    const rReject = await requestAs('POST', `/registration-requests/${ORG_B_ID}/reject`, {
      reviewNote: 'bypass',
    })
    const rDocs = await requestAs('GET', `/registration-requests/${ORG_B_ID}/document-urls`)

    expect(rList.status).toBe(403)
    expect(rApprove.status).toBe(403)
    expect(rReject.status).toBe(403)
    expect(rDocs.status).toBe(403)
    expect(regReqService.findAll).not.toHaveBeenCalled()
    expect(regReqService.approve).not.toHaveBeenCalled()
    expect(regReqService.reject).not.toHaveBeenCalled()
    expect(regReqService.getDocumentUrls).not.toHaveBeenCalled()
  })

  it('propostas: blocks Politician A from mutating Politician B proposal (403) and returns 404 when missing', async () => {
    const validStatus = Object.values(PropostaStatus)[0]
    const payload = {
      status: validStatus,
      conteudo: 'Atualização não autorizada em proposta alheia.',
    }

    const crossUpdate = await requestAs('PATCH', `/propostas/${PROPOSTA_B_ID}/status`, payload)
    expect(crossUpdate.status).toBe(403)

    const missingUpdate = await requestAs('PATCH', `/propostas/${PROPOSTA_MISSING_ID}/status`, payload)
    expect(missingUpdate.status).toBe(404)

    expect(propostasRepo.updateStatus).not.toHaveBeenCalled()
  })

  it('debates: blocks Politician A from managing Org B debates or responding to Org B invites (403)', async () => {
    const crossUpdate = await requestAs('PATCH', `/debates/${DEBATE_B_ID}`, {
      title: 'Título alterado indevidamente',
    })
    const crossStart = await requestAs('POST', `/debates/${DEBATE_B_ID}/start`)
    const crossEnd = await requestAs('POST', `/debates/${DEBATE_B_ID}/end`)
    const crossRespond = await requestAs(
      'POST',
      `/debates/${DEBATE_B_ID}/invite/${ORG_B_ID}/respond`,
      { accept: true },
    )

    expect(crossUpdate.status).toBe(403)
    expect(crossStart.status).toBe(403)
    expect(crossEnd.status).toBe(403)
    expect(crossRespond.status).toBe(403)
    expect(debatesRepo.update).not.toHaveBeenCalled()
  })

  it('debates (YouTube): only the host changes the live link, and only a debater changes their own', async () => {
    const link = { url: 'https://youtu.be/dQw4w9WgXcQ' }

    // controle positivo: o dono do debate consegue (garante que os 403 abaixo não são "tudo bloqueado")
    const own = await requestAs('PUT', `/debates/${DEBATE_A_ID}/stream`, link)
    expect(own.status).toBe(200)
    expect(debatesRepo.update).toHaveBeenCalledTimes(1)
    debatesRepo.update.mockClear()
    youtubeChannels.resolveVerifiedStream.mockClear()

    // político A no debate do político B
    expect((await requestAs('PUT', `/debates/${DEBATE_B_ID}/stream`, link)).status).toBe(403)
    // político A mexendo no link do debatedor B (qualquer debate)
    expect((await requestAs('PUT', `/debates/${DEBATE_B_ID}/participants/${ORG_B_ID}/stream`, link)).status).toBe(403)
    expect((await requestAs('PUT', `/debates/${DEBATE_A_ID}/participants/${ORG_B_ID}/stream`, link)).status).toBe(403)
    // debate cujo anfitrião é uma entidade: um político nunca é o anfitrião
    expect((await requestAs('PUT', `/debates/${DEBATE_ENTITY_ID}/stream`, link)).status).toBe(403)
    expect((await requestAs('POST', `/debates/${DEBATE_ENTITY_ID}/start`)).status).toBe(403)
    expect((await requestAs('POST', `/debates/${DEBATE_ENTITY_ID}/end`)).status).toBe(403)
    expect((await requestAs('PATCH', `/debates/${DEBATE_ENTITY_ID}`, { title: 'Título alterado indevidamente' })).status).toBe(403)
    // e um político que não é debatedor não cria enquete no debate da entidade
    expect((await requestAs('POST', `/debates/${DEBATE_ENTITY_ID}/polls`, { question: 'Aprova?', options: ['Sim', 'Não'] })).status).toBe(403)

    // nada disso chegou a consultar o YouTube nem a gravar
    expect(youtubeChannels.resolveVerifiedStream).not.toHaveBeenCalled()
    expect(debatesRepo.update).not.toHaveBeenCalled()
    expect(debatesRepo.updateParticipantStream).not.toHaveBeenCalled()
    expect(debatesRepo.createPoll).not.toHaveBeenCalled()
  })
})
