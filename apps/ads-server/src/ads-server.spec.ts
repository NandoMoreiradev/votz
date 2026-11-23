import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AdsAuthGuard } from './ads-auth.guard'

// Variáveis da prova: valem só dentro deste teste (o que já existe no ambiente é respeitado, mas Redis fica de fora).
process.env.JWT_SECRET = 'segredo-de-teste-do-servidor-de-anuncios'
process.env.CLOUDFLARE_R2_BUCKET ??= 'bucket-teste'
process.env.CLOUDFLARE_R2_ENDPOINT ??= 'https://r2.teste.local'
process.env.REDIS_URL = ''

const SECRET = process.env.JWT_SECRET
const jwt = new JwtService({})
const guard = () => new AdsAuthGuard({ getOrThrow: () => SECRET } as never, jwt)
const context = (authorization?: string) => {
  const request: { headers: { authorization?: string }; user?: { id: string } } = { headers: { authorization } }
  return { request, ctx: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext }
}
const sign = (payload: Record<string, unknown>, options: { secret?: string; expiresIn?: string } = {}) =>
  jwt.signAsync(payload, { secret: options.secret ?? SECRET, expiresIn: options.expiresIn ?? '15m', algorithm: 'HS256' })

describe('AdsAuthGuard', () => {
  it('aceita um token de acesso válido e põe só o id da pessoa no pedido', async () => {
    const { request, ctx } = context(`Bearer ${await sign({ sub: 'u1', typ: 'access', email: 'a@b.c' })}`)
    await expect(guard().canActivate(ctx)).resolves.toBe(true)
    expect(request.user).toEqual({ id: 'u1' })
  })

  it.each([
    ['sem cabeçalho', undefined],
    ['sem "Bearer"', 'Token abc'],
    ['token vazio', 'Bearer '],
    ['lixo', 'Bearer isto-nao-e-um-jwt'],
  ])('recusa: %s', async (_label, header) => {
    await expect(guard().canActivate(context(header).ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('recusa token assinado com outro segredo, vencido e de outro tipo (refresh)', async () => {
    await expect(guard().canActivate(context(`Bearer ${await sign({ sub: 'u1', typ: 'access' }, { secret: 'outro' })}`).ctx)).rejects.toThrow(UnauthorizedException)
    await expect(guard().canActivate(context(`Bearer ${await sign({ sub: 'u1', typ: 'access' }, { expiresIn: '-10s' })}`).ctx)).rejects.toThrow(UnauthorizedException)
    await expect(guard().canActivate(context(`Bearer ${await sign({ sub: 'u1', typ: 'refresh' })}`).ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('recusa token sem a pessoa (sem "sub")', async () => {
    await expect(guard().canActivate(context(`Bearer ${await sign({ typ: 'access' })}`).ctx)).rejects.toThrow(UnauthorizedException)
  })

  it('recusa token sem assinatura (alg none)', async () => {
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"u1","typ":"access"}').toString('base64url')}.`
    await expect(guard().canActivate(context(`Bearer ${none}`).ctx)).rejects.toThrow(UnauthorizedException)
  })
})

describe('AdsServerModule', () => {
  it('monta todas as dependências (a injeção fecha sem a API inteira)', async () => {
    const { AdsServerModule } = await import('./ads-server.module')
    const { PrismaService } = await import('../../api/src/prisma/prisma.service')
    const { AdsDeliveryService } = await import('../../api/src/ads/ads-delivery/ads-delivery.service')
    const module = await Test.createTestingModule({ imports: [AdsServerModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile()
    expect(module.get(AdsDeliveryService)).toBeInstanceOf(AdsDeliveryService)
    // O fechamento do gasto roda só na API: o servidor de anúncios não tem agendador.
    const { ScheduleModule } = await import('@nestjs/schedule')
    expect(() => module.get(ScheduleModule, { strict: false })).toThrow()
    await module.close()
  })
})
