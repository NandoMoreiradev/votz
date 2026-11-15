import {
  BadRequestException,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { UserType } from '@prisma/client'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'

describe('AdminController (A0 setUserType RBAC & DTO validation)', () => {
  let app: INestApplication
  let baseUrl: string
  let adminService: any

  beforeAll(async () => {
    adminService = {
      stats: jest.fn(),
      listUsers: jest.fn(),
      banUser: jest.fn(),
      setUserType: jest.fn(async (id: string, type: string, actorId: string, reason: string) => {
        if (!reason || reason.trim().length < 10) {
          throw new BadRequestException('short reason')
        }
        if (['ENTITY', 'POLITICIAN', 'COMPANY'].includes(type)) {
          throw new BadRequestException('org role forbidden here')
        }
        return { id, type, actorId }
      }),
      listReports: jest.fn(),
      deleteReport: jest.fn(),
      listEntities: jest.fn(),
      verifyEntity: jest.fn(),
      setEntityPlan: jest.fn(),
      listPoliticians: jest.fn(),
      verifyPolitician: jest.fn(),
      setPoliticianPlan: jest.fn(),
      setCompanyPlan: jest.fn(),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        Reflector,
        RolesGuard,
        { provide: AdminService, useValue: adminService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(ctx: ExecutionContext) {
          const req = ctx.switchToHttp().getRequest()
          const raw = req.headers['x-test-user']
          if (!raw || typeof raw !== 'string') throw new UnauthorizedException()
          req.user = JSON.parse(raw)
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

  it('forbids MODERATOR from calling PATCH /admin/users/:id/type (403)', async () => {
    const res = await fetch(`${baseUrl}/admin/users/u-1/type`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user': JSON.stringify({ id: 'mod-1', type: UserType.MODERATOR }),
      },
      body: JSON.stringify({
        type: UserType.ADMIN,
        reason: 'Tentativa de promoção indevida por moderador.',
      }),
    })

    expect(res.status).toBe(403)
    expect(adminService.setUserType).not.toHaveBeenCalled()
  })

  it('rejects missing or short reason with 400 and allows ADMIN with valid reason (200)', async () => {
    const shortRes = await fetch(`${baseUrl}/admin/users/u-1/type`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user': JSON.stringify({ id: 'adm-1', type: UserType.ADMIN }),
      },
      body: JSON.stringify({ type: UserType.MODERATOR, reason: 'curto' }),
    })
    expect(shortRes.status).toBe(400)
    expect(adminService.setUserType).not.toHaveBeenCalled()

    const okRes = await fetch(`${baseUrl}/admin/users/u-1/type`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-test-user': JSON.stringify({ id: 'adm-1', type: UserType.ADMIN }),
      },
      body: JSON.stringify({
        type: UserType.MODERATOR,
        reason: 'Promovido para equipe de moderação regional.',
      }),
    })
    expect(okRes.status).toBe(200)
    expect(adminService.setUserType).toHaveBeenCalledWith(
      'u-1',
      UserType.MODERATOR,
      'adm-1',
      'Promovido para equipe de moderação regional.',
    )
  })
})
