import { ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { HandlesService, normalizeHandle } from './handles.service'

describe('HandlesService', () => {
  let prisma: any
  let service: HandlesService
  const none = () => ({ findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() })

  beforeEach(() => {
    prisma = { user: none(), entity: none(), politician: none(), company: none() }
    service = new HandlesService(prisma)
  })

  it('normaliza: tira o @ e usa minúsculas', () => {
    expect(normalizeHandle('  @@Prefeitura_SP ')).toBe('prefeitura_sp')
  })

  it('o nome é único entre cidadão, político, entidade e empresa', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' })
    await expect(service.assertAvailable('joao_mario')).rejects.toThrow(ConflictException)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.company.findFirst.mockResolvedValue({ id: 'c1' })
    await expect(service.assertAvailable('joao_mario')).rejects.toThrow(ConflictException)
  })

  it('a própria página pode manter o nome que já tem', async () => {
    await service.assertAvailable('maria', { kind: 'POLITICIAN', id: 'p1' })
    expect(prisma.politician.findFirst.mock.calls[0][0].where).toEqual({ username: 'maria', NOT: { id: 'p1' } })
    expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({ username: 'maria' })
  })

  it('recusa nomes reservados', async () => {
    await expect(service.assertAvailable('votz')).rejects.toThrow(ConflictException)
  })

  it('dois pedidos ao mesmo tempo: o banco barra o segundo e vira conflito', async () => {
    prisma.entity.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    )
    await expect(service.setForOrg('ENTITY', 'e1', '@Prefeitura')).rejects.toThrow(ConflictException)
  })

  it('resolve @nome para o dono do perfil', async () => {
    prisma.politician.findUnique.mockResolvedValue({ id: 'p1' })
    await expect(service.resolve('@Maria')).resolves.toEqual({ kind: 'POLITICIAN', id: 'p1' })
    prisma.politician.findUnique.mockResolvedValue(null)
    await expect(service.resolve('ninguem')).rejects.toThrow(NotFoundException)
  })
})
