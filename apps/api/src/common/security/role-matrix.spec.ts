jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz'),
  verify: jest.fn(async () => ({ valid: false })),
}))
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (v: string) => v },
}))

import 'reflect-metadata'
import { getQueueToken } from '@nestjs/bullmq'
import { INestApplication, RequestMethod } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { UserType } from '@votz/shared-types'
import { AdminController } from '../../admin/admin.controller'
import { AdminService } from '../../admin/admin.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../../auth/guards/roles.guard'
import { JwtStrategy } from '../../auth/strategies/jwt.strategy'
import { CamaraSyncController } from '../../camara-sync/camara-sync.controller'
import { CAMARA_SYNC_QUEUE, CamaraSyncService } from '../../camara-sync/camara-sync.service'
import { IbgeSyncController } from '../../ibge-sync/ibge-sync.controller'
import { IBGE_SYNC_QUEUE, IbgeSyncService } from '../../ibge-sync/ibge-sync.service'
import { AdminFlagsController } from '../../moderation/moderation.controller'
import { ModerationService } from '../../moderation/moderation.service'
import { PrismaService } from '../../prisma/prisma.service'
import { RegistrationRequestsController } from '../../registration-requests/registration-requests.controller'
import { RegistrationRequestsService } from '../../registration-requests/registration-requests.service'
import { SenadoSyncController } from '../../senado-sync/senado-sync.controller'
import { SENADO_SYNC_QUEUE, SenadoSyncService } from '../../senado-sync/senado-sync.service'
import { TseSyncController } from '../../tse-sync/tse-sync.controller'
import { TSE_SYNC_QUEUE, TseSyncService } from '../../tse-sync/tse-sync.service'

const ALL_ROLES = Object.values(UserType) as UserType[]
const MOD_AND_ADMIN: UserType[] = [UserType.MODERATOR, UserType.ADMIN]
const ADMIN_ONLY: UserType[] = [UserType.ADMIN]

const TEST_JWT_SECRET = 'test-role-matrix-secret-at-least-32-chars'
const SAMPLE_UUID = '11111111-1111-4111-8111-111111111111'

interface MatrixEntry {
  method: string
  pattern: string
  requestPath: string
  allowedRoles: UserType[]
  body?: Record<string, unknown>
}

const ROUTE_MATRIX: MatrixEntry[] = [
  // AdminController
  { method: 'GET', pattern: '/admin/stats', requestPath: '/admin/stats', allowedRoles: MOD_AND_ADMIN },
  { method: 'GET', pattern: '/admin/users', requestPath: '/admin/users', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'PATCH',
    pattern: '/admin/users/:id/ban',
    requestPath: `/admin/users/${SAMPLE_UUID}/ban`,
    allowedRoles: MOD_AND_ADMIN,
    body: { banned: false },
  },
  {
    method: 'PATCH',
    pattern: '/admin/users/:id/type',
    requestPath: `/admin/users/${SAMPLE_UUID}/type`,
    allowedRoles: ADMIN_ONLY,
    body: { type: UserType.CITIZEN, reason: 'Motivo administrativo com mais de dez caracteres.' },
  },
  { method: 'GET', pattern: '/admin/reports', requestPath: '/admin/reports', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'DELETE',
    pattern: '/admin/reports/:id',
    requestPath: `/admin/reports/${SAMPLE_UUID}`,
    allowedRoles: MOD_AND_ADMIN,
    body: { reason: 'Conteúdo removido em conformidade com moderação.' },
  },
  { method: 'GET', pattern: '/admin/entities', requestPath: '/admin/entities', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'PATCH',
    pattern: '/admin/entities/:id/verify',
    requestPath: `/admin/entities/${SAMPLE_UUID}/verify`,
    allowedRoles: MOD_AND_ADMIN,
    body: { verified: true },
  },
  {
    method: 'PATCH',
    pattern: '/admin/entities/:id/plan',
    requestPath: `/admin/entities/${SAMPLE_UUID}/plan`,
    allowedRoles: ADMIN_ONLY,
    body: { plan: 'BASICO' },
  },
  { method: 'GET', pattern: '/admin/politicians', requestPath: '/admin/politicians', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'PATCH',
    pattern: '/admin/politicians/:id/verify',
    requestPath: `/admin/politicians/${SAMPLE_UUID}/verify`,
    allowedRoles: MOD_AND_ADMIN,
    body: { verified: true },
  },
  {
    method: 'PATCH',
    pattern: '/admin/politicians/:id/plan',
    requestPath: `/admin/politicians/${SAMPLE_UUID}/plan`,
    allowedRoles: ADMIN_ONLY,
    body: { plan: 'BASICO' },
  },
  {
    method: 'PATCH',
    pattern: '/admin/companies/:id/plan',
    requestPath: `/admin/companies/${SAMPLE_UUID}/plan`,
    allowedRoles: ADMIN_ONLY,
    body: { plan: 'STARTER' },
  },
  {
    method: 'PATCH',
    pattern: '/admin/api-keys/:id/tier',
    requestPath: `/admin/api-keys/${SAMPLE_UUID}/tier`,
    allowedRoles: ADMIN_ONLY,
    body: { tier: 'PAID', reason: 'Concessão comercial aprovada para portal parceiro.' },
  },

  // AdminFlagsController
  { method: 'GET', pattern: '/admin/flags', requestPath: '/admin/flags', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'PATCH',
    pattern: '/admin/flags/:id/resolve',
    requestPath: `/admin/flags/${SAMPLE_UUID}/resolve`,
    allowedRoles: MOD_AND_ADMIN,
    body: {},
  },

  // RegistrationRequestsController (citizen + review routes all accounted for)
  { method: 'POST', pattern: '/registration-requests', requestPath: '/registration-requests', allowedRoles: ALL_ROLES, body: {} },
  { method: 'GET', pattern: '/registration-requests/mine', requestPath: '/registration-requests/mine', allowedRoles: ALL_ROLES },
  { method: 'GET', pattern: '/registration-requests', requestPath: '/registration-requests', allowedRoles: MOD_AND_ADMIN },
  {
    method: 'POST',
    pattern: '/registration-requests/:id/approve',
    requestPath: `/registration-requests/${SAMPLE_UUID}/approve`,
    allowedRoles: MOD_AND_ADMIN,
    body: {},
  },
  {
    method: 'POST',
    pattern: '/registration-requests/:id/reject',
    requestPath: `/registration-requests/${SAMPLE_UUID}/reject`,
    allowedRoles: MOD_AND_ADMIN,
    body: { reviewNote: 'Motivo de teste' },
  },
  {
    method: 'GET',
    pattern: '/registration-requests/:id/document-urls',
    requestPath: `/registration-requests/${SAMPLE_UUID}/document-urls`,
    allowedRoles: MOD_AND_ADMIN,
  },

  // Sync Controllers (admin only)
  { method: 'POST', pattern: '/camara-sync/trigger', requestPath: '/camara-sync/trigger', allowedRoles: ADMIN_ONLY },
  { method: 'GET', pattern: '/camara-sync/status', requestPath: '/camara-sync/status', allowedRoles: ADMIN_ONLY },
  { method: 'POST', pattern: '/senado-sync/trigger', requestPath: '/senado-sync/trigger', allowedRoles: ADMIN_ONLY },
  { method: 'GET', pattern: '/senado-sync/status', requestPath: '/senado-sync/status', allowedRoles: ADMIN_ONLY },
  { method: 'POST', pattern: '/tse-sync/trigger/:job', requestPath: '/tse-sync/trigger/deputados', allowedRoles: ADMIN_ONLY },
  { method: 'GET', pattern: '/tse-sync/status', requestPath: '/tse-sync/status', allowedRoles: ADMIN_ONLY },
  { method: 'POST', pattern: '/ibge-sync/trigger', requestPath: '/ibge-sync/trigger', allowedRoles: ADMIN_ONLY },
  { method: 'GET', pattern: '/ibge-sync/status', requestPath: '/ibge-sync/status', allowedRoles: ADMIN_ONLY },
]

const AUDITED_CONTROLLERS = [
  AdminController,
  AdminFlagsController,
  RegistrationRequestsController,
  CamaraSyncController,
  SenadoSyncController,
  TseSyncController,
  IbgeSyncController,
]

function normalizeRoute(basePath: string, methodPath: string): string {
  const combined = `/${basePath}/${methodPath}`.replace(/\/+/g, '/').replace(/\/$/, '')
  return combined || '/'
}

function discoverControllerRoutes(): string[] {
  const keys: string[] = []
  for (const Ctrl of AUDITED_CONTROLLERS) {
    const basePath = (Reflect.getMetadata(PATH_METADATA, Ctrl) as string) ?? ''
    const proto = Ctrl.prototype as unknown as Record<string, unknown>
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor') continue
      const handler = proto[name]
      if (typeof handler !== 'function') continue
      const reqMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
      if (reqMethod === undefined) continue
      const methodPath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? ''
      const verb = RequestMethod[reqMethod]
      keys.push(`${verb} ${normalizeRoute(basePath, methodPath)}`)
    }
  }
  return keys.sort()
}

describe('Role × Route Authorization Matrix (real JwtAuthGuard + RolesGuard)', () => {
  let app: INestApplication
  let baseUrl: string
  let jwtService: JwtService
  const roleTokens = new Map<UserType, string>()

  const proxyService = () =>
    new Proxy(
      {},
      {
        get: (_target, prop) => {
          if (
            typeof prop === 'symbol' ||
            prop === 'then' ||
            prop === 'onModuleInit' ||
            prop === 'onModuleDestroy' ||
            prop === 'onApplicationBootstrap' ||
            prop === 'onApplicationShutdown'
          ) {
            return undefined
          }
          return jest.fn().mockResolvedValue({ ok: true })
        },
      },
    )

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        }),
      ],
      controllers: AUDITED_CONTROLLERS,
      providers: [
        Reflector,
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key === 'JWT_SECRET') return TEST_JWT_SECRET
              throw new Error(key)
            },
            get: (_key: string, def?: unknown) => def,
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
                const role = where.id.replace('user-', '') as UserType
                if (!ALL_ROLES.includes(role)) return null
                return {
                  id: where.id,
                  email: `${role.toLowerCase()}@votz.app`,
                  type: role,
                  banned: false,
                }
              }),
            },
          },
        },
        { provide: AdminService, useValue: proxyService() },
        { provide: ModerationService, useValue: proxyService() },
        { provide: RegistrationRequestsService, useValue: proxyService() },
        { provide: CamaraSyncService, useValue: proxyService() },
        { provide: getQueueToken(CAMARA_SYNC_QUEUE), useValue: proxyService() },
        { provide: SenadoSyncService, useValue: proxyService() },
        { provide: getQueueToken(SENADO_SYNC_QUEUE), useValue: proxyService() },
        { provide: TseSyncService, useValue: proxyService() },
        { provide: getQueueToken(TSE_SYNC_QUEUE), useValue: proxyService() },
        { provide: IbgeSyncService, useValue: proxyService() },
        { provide: getQueueToken(IBGE_SYNC_QUEUE), useValue: proxyService() },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init()
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
    jwtService = moduleRef.get(JwtService)

    for (const role of ALL_ROLES) {
      const token = await jwtService.signAsync({
        sub: `user-${role}`,
        email: `${role.toLowerCase()}@votz.app`,
        type: role,
        typ: 'access',
      })
      roleTokens.set(role, token)
    }
  }, 30_000)

  afterAll(async () => {
    await app?.close()
  })

  it('covers 100% of routes in AdminController, AdminFlagsController, RegistrationRequestsController, and sync controllers', () => {
    const discovered = discoverControllerRoutes()
    const declared = ROUTE_MATRIX.map((r) => `${r.method} ${r.pattern}`).sort()

    expect(discovered).toEqual(declared)
  })

  it.each(ROUTE_MATRIX)(
    '$method $pattern enforces exact role permissions across ANON and all UserTypes',
    async ({ method, requestPath, allowedRoles, body }) => {
      const anonRes = await fetch(`${baseUrl}${requestPath}`, {
        method,
        headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      expect(anonRes.status).toBe(401)

      for (const role of ALL_ROLES) {
        const res = await fetch(`${baseUrl}${requestPath}`, {
          method,
          headers: {
            authorization: `Bearer ${roleTokens.get(role)}`,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        })

        if (allowedRoles.includes(role)) {
          expect([401, 403]).not.toContain(res.status)
        } else {
          expect(res.status).toBe(403)
        }
      }
    },
  )

  it('rejects mfa_setup_required token (401) on moderation routes even for ADMIN and MODERATOR', async () => {
    for (const role of [UserType.MODERATOR, UserType.ADMIN]) {
      const mfaSetupToken = await jwtService.signAsync({
        sub: `user-${role}`,
        type: 'mfa_setup_required',
      })

      for (const path of ['/admin/flags', '/registration-requests', '/admin/users']) {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { authorization: `Bearer ${mfaSetupToken}` },
        })
        expect(res.status).toBe(401)
      }
    }
  })
})
