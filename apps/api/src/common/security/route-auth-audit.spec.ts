jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/Votz'),
  verify: jest.fn(async () => ({ valid: false })),
}))
jest.mock('isomorphic-dompurify', () => ({
  __esModule: true,
  default: { sanitize: (v: string) => v },
}))

import * as fs from 'fs'
import * as path from 'path'
import 'reflect-metadata'
import { RequestMethod } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator'
import { ROLES_KEY } from '../../auth/decorators/roles.decorator'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { AppModule } from '../../app.module'

const EXPECTED_PUBLIC_ROUTES = new Set<string>([
  'GET /accountability/public/:code',
  'GET /alerts',
  'GET /alerts/:id',
  'GET /analytics/public/entities/:id',
  'GET /analytics/public/municipality',
  'GET /analytics/public/politicians/:id',
  'GET /api-publica/entidades',
  'GET /api-publica/entidades/:id',
  'GET /api-publica/minha-entidade/agregados',
  'GET /api-publica/minha-entidade/relatos',
  'GET /api-publica/relatos',
  'GET /api-publica/relatos/:id',
  'GET /api-publica/surtos',
  'GET /api-publica/tendencias',
  'GET /auth/google',
  'GET /auth/google/callback',
  'POST /auth/login',
  'POST /auth/mfa/enable/forced',
  'POST /auth/mfa/setup/forced',
  'POST /auth/mfa/verify',
  'POST /auth/refresh',
  'POST /auth/register',
  'POST /auth/verify-email',
  'GET /companies',
  'GET /companies/:id',
  'GET /companies/:id/reports',
  'GET /debates',
  'GET /debates/:id',
  'GET /debates/:id/messages',
  'GET /debates/:id/polls/active',
  'GET /debates/:id/questions',
  'GET /entities',
  'GET /entities/:id',
  'GET /entities/:id/reports',
  'GET /entities/cities',
  'GET /health',
  'GET /imprensa/entidades-ranking',
  'GET /imprensa/relatos-destaque',
  'GET /imprensa/resumo',
  'GET /imprensa/surtos-ativos',
  'GET /imprensa/tendencias',
  'GET /mandate/digest/unsubscribe',
  'POST /mandate/digest/unsubscribe',
  'GET /map/reports',
  'GET /org-memberships/invites/:token',
  'GET /parties',
  'GET /politicians',
  'GET /politicians/:id',
  'GET /politicians/:id/reports',
  'GET /politicians/cities',
  'GET /propostas',
  'GET /propostas/:id',
  'GET /reports',
  'GET /reports/:id',
  'GET /reports/:id/followers',
  'GET /reports/similar',
  'GET /reports/:reportId/comments',
  'GET /reports/:reportId/votes',
  'GET /share-cards/public/:slugOrId/image',
  'GET /share-cards/public/:slugOrId/meta',
  'GET /share-cards/public/:slugOrId/og',
  'POST /subscricoes/webhook',
  'GET /topics/trending',
  'GET /topics/search',
  'GET /topics/:slug',
  'GET /users/:id',
  'GET /users/:id/reports',
])

function findControllerFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) {
      results.push(...findControllerFiles(full))
    } else if (entry.endsWith('.controller.ts')) {
      results.push(full)
    }
  }
  return results
}

function normalizeRoute(controllerPath: string | string[], methodPath: string): string {
  const base = Array.isArray(controllerPath) ? controllerPath[0] ?? '' : controllerPath
  const combined = `/${base}/${methodPath}`.replace(/\/+/g, '/').replace(/\/$/, '')
  return combined || '/'
}

describe('Route authorization metadata audit (deny-by-default)', () => {
  it('registers JwtAuthGuard as a global APP_GUARD in AppModule', () => {
    const providers = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? []) as Array<{
      provide?: unknown
      useClass?: unknown
    }>
    const hasGlobalJwtGuard = providers.some(
      (p) => p?.provide === APP_GUARD && p?.useClass === JwtAuthGuard,
    )
    expect(hasGlobalJwtGuard).toBe(true)
  })

  it('keeps @Public() routes strictly matched to the fixed allowlist and rejects unguarded mutating routes', () => {
    const srcRoot = path.resolve(__dirname, '../..')
    const controllerFiles = findControllerFiles(srcRoot)
    const reflector = new Reflector()

    const discoveredPublicRoutes = new Set<string>()
    const routesWithoutPublicOrGuard: string[] = []

    for (const file of controllerFiles) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(file) as Record<string, unknown>
      for (const exported of Object.values(mod)) {
        if (typeof exported !== 'function') continue
        const controllerPath = Reflect.getMetadata(PATH_METADATA, exported) as string | string[] | undefined
        if (controllerPath === undefined) continue

        const proto = exported.prototype as Record<string, unknown>
        const classGuards = (Reflect.getMetadata(GUARDS_METADATA, exported) ?? []) as unknown[]
        const classRoles = (Reflect.getMetadata(ROLES_KEY, exported) ?? []) as unknown[]

        for (const key of Object.getOwnPropertyNames(proto)) {
          if (key === 'constructor') continue
          const handler = proto[key]
          if (typeof handler !== 'function') continue

          const methodIdx = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined
          if (methodIdx === undefined) continue

          const methodPath = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? ''
          const httpMethod = RequestMethod[methodIdx]
          const routeSignature = `${httpMethod} ${normalizeRoute(controllerPath, methodPath)}`

          const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, exported])
          if (isPublic) {
            discoveredPublicRoutes.add(routeSignature)
            continue
          }

          const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]
          const methodRoles = (Reflect.getMetadata(ROLES_KEY, handler) ?? []) as unknown[]
          const hasExplicitGuardOrRole =
            classGuards.length + methodGuards.length + classRoles.length + methodRoles.length > 0

          if (!hasExplicitGuardOrRole) {
            routesWithoutPublicOrGuard.push(routeSignature)
          }
        }
      }
    }

    const unexpectedPublic = [...discoveredPublicRoutes].filter((r) => !EXPECTED_PUBLIC_ROUTES.has(r))
    const missingPublic = [...EXPECTED_PUBLIC_ROUTES].filter((r) => !discoveredPublicRoutes.has(r))

    expect(unexpectedPublic).toEqual([])
    expect(missingPublic).toEqual([])
    expect(routesWithoutPublicOrGuard).toEqual([])
  })
})
