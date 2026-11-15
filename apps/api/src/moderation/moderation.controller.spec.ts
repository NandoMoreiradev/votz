import { Test } from '@nestjs/testing'
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common'
import { AdminFlagsController } from './moderation.controller'
import { ModerationService } from './moderation.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'

jest.mock('isomorphic-dompurify', () => ({
  sanitize: jest.fn((v: string) => v),
}))

describe('AdminFlagsController (ParseUUIDPipe)', () => {
  let app: INestApplication
  let baseUrl: string
  let service: { listFlags: jest.Mock; resolveFlag: jest.Mock }

  beforeEach(async () => {
    service = {
      listFlags: jest.fn(),
      resolveFlag: jest.fn().mockResolvedValue({ ok: true }),
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminFlagsController],
      providers: [{ provide: ModerationService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'mod-1', type: 'MODERATOR' }
          return true
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    baseUrl = await app.getUrl()
  })

  afterEach(async () => {
    await app.close()
  })

  it('rejects non-UUID flag id on PATCH /admin/flags/:id/resolve with 400', async () => {
    const res = await fetch(`${baseUrl}/admin/flags/nao-e-uuid/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DISMISS', note: 'Motivo valido para teste.' }),
    })

    expect(res.status).toBe(400)
    expect(service.resolveFlag).not.toHaveBeenCalled()

    const validId = '11111111-1111-4111-8111-111111111111'
    const okRes = await fetch(`${baseUrl}/admin/flags/${validId}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DISMISS', note: 'Motivo valido para teste.' }),
    })

    expect(okRes.status).toBe(200)
    expect(service.resolveFlag).toHaveBeenCalledWith(
      validId,
      { id: 'mod-1', type: 'MODERATOR' },
      { action: 'DISMISS', note: 'Motivo valido para teste.' },
    )
  })
})
