import { Test } from '@nestjs/testing'
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common'
import { OrgPermission, OrgType } from '@prisma/client'

process.env.STRIPE_ENTITY_GESTAO_PRICE_ID = 'price_ent_gestao'

const stripeMock = {
  customers: { create: jest.fn() },
  checkout: { sessions: { create: jest.fn() } },
  billingPortal: { sessions: { create: jest.fn() } },
  webhooks: { constructEvent: jest.fn() },
}

jest.mock('stripe', () => jest.fn(() => stripeMock))

import { SubscricoesController } from './subscricoes.controller'
import { SubscricoesService } from './subscricoes.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrgPermissionGuard } from '../org-memberships/org-memberships.guard'
import { OrgMembershipsRepository } from '../org-memberships/org-memberships.repository'
import { PrismaService } from '../prisma/prisma.service'
import { ConfigService } from '@nestjs/config'

describe('SubscricoesController (H2 billing RBAC)', () => {
  let app: INestApplication
  let baseUrl: string
  let currentUser = { id: 'u1', email: 'owner@votz.app' }
  let repo: any
  let prisma: any

  beforeEach(async () => {
    jest.clearAllMocks()
    currentUser = { id: 'u1', email: 'owner@votz.app' }

    repo = {
      findMembership: jest.fn(),
    }
    prisma = {
      entity: { findUnique: jest.fn(), update: jest.fn() },
      politician: { findUnique: jest.fn(), update: jest.fn() },
      company: { findUnique: jest.fn(), update: jest.fn() },
    }
    const config: any = {
      getOrThrow: jest.fn((k: string) => {
        if (k === 'STRIPE_SECRET_KEY') return 'sk_test_123'
        if (k === 'WEB_URL') return 'http://localhost:5173'
        return ''
      }),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [SubscricoesController],
      providers: [
        SubscricoesService,
        OrgPermissionGuard,
        { provide: OrgMembershipsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = currentUser
          return true
        },
      })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterEach(async () => {
    await app.close()
  })

  it('returns 403 on checkout and portal for user from another organization (not a member)', async () => {
    repo.findMembership.mockResolvedValue(null)

    const checkoutRes = await fetch(`${baseUrl}/subscricoes/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-b', orgType: OrgType.ENTITY, plan: 'GESTAO' }),
    })
    expect(checkoutRes.status).toBe(403)

    const portalRes = await fetch(`${baseUrl}/subscricoes/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-b', orgType: OrgType.ENTITY }),
    })
    expect(portalRes.status).toBe(403)
  })

  it('returns 403 on checkout and portal for active member without MANAGE_BILLING', async () => {
    repo.findMembership.mockResolvedValue({
      status: 'ACTIVE',
      role: { permissions: [OrgPermission.RESPOND_REPORTS, OrgPermission.VIEW_ANALYTICS] },
    })

    const checkoutRes = await fetch(`${baseUrl}/subscricoes/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-a', orgType: OrgType.ENTITY, plan: 'GESTAO' }),
    })
    expect(checkoutRes.status).toBe(403)

    const portalRes = await fetch(`${baseUrl}/subscricoes/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-a', orgType: OrgType.ENTITY }),
    })
    expect(portalRes.status).toBe(403)
  })

  it('returns Stripe session URLs for member with MANAGE_BILLING and 404 for nonexistent org', async () => {
    repo.findMembership.mockResolvedValue({
      status: 'ACTIVE',
      role: { permissions: [OrgPermission.MANAGE_BILLING] },
    })

    prisma.entity.findUnique.mockResolvedValueOnce({ stripeCustomerId: null })
    stripeMock.customers.create.mockResolvedValueOnce({ id: 'cus_new' })
    stripeMock.checkout.sessions.create.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/ok' })

    const checkoutRes = await fetch(`${baseUrl}/subscricoes/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-a', orgType: OrgType.ENTITY, plan: 'GESTAO' }),
    })
    expect(checkoutRes.status).toBe(201)
    expect(await checkoutRes.json()).toEqual({ url: 'https://checkout.stripe.com/ok' })

    prisma.entity.findUnique.mockResolvedValueOnce({ stripeCustomerId: 'cus_new' })
    stripeMock.billingPortal.sessions.create.mockResolvedValueOnce({ url: 'https://billing.stripe.com/ok' })

    const portalRes = await fetch(`${baseUrl}/subscricoes/portal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'org-a', orgType: OrgType.ENTITY }),
    })
    expect(portalRes.status).toBe(201)
    expect(await portalRes.json()).toEqual({ url: 'https://billing.stripe.com/ok' })

    prisma.entity.findUnique.mockResolvedValueOnce(null)
    const missingOrgRes = await fetch(`${baseUrl}/subscricoes/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'missing-org', orgType: OrgType.ENTITY, plan: 'GESTAO' }),
    })
    expect(missingOrgRes.status).toBe(404)
  })
})
