import { UsersService } from './users.service'

/** Só o que importa aqui: mudar cidade, estado, nascimento ou gênero apaga a cópia do cadastro da entrega de anúncios. */
describe('UsersService.updateProfile e a cópia do cadastro dos anúncios', () => {
  const repo = { findById: jest.fn(), updateProfile: jest.fn() }
  const cache = { invalidate: jest.fn().mockResolvedValue(undefined) }
  const service = () => new UsersService(repo as never, {} as never, { assertOwnStorageUrl: jest.fn() } as never, {} as never, { assertAvailable: jest.fn() } as never, cache as never)

  beforeEach(() => {
    jest.clearAllMocks()
    repo.findById.mockResolvedValue({ id: 'u1' })
    repo.updateProfile.mockResolvedValue({ id: 'u1' })
  })

  it.each([
    ['cidade', { city: 'Campinas' }],
    ['estado', { state: 'SP' }],
    ['data de nascimento', { birthDate: '1996-05-10' }],
    ['apagar a data de nascimento', { birthDate: null }],
    ['gênero', { gender: 'FEMALE' }],
  ])('mudar %s apaga a cópia', async (_label, dto) => {
    await service().updateProfile('u1', 'u1', dto as never)
    expect(cache.invalidate).toHaveBeenCalledWith('u1')
  })

  it('mudar só o nome não apaga', async () => {
    await service().updateProfile('u1', 'u1', { name: 'Ana' } as never)
    expect(cache.invalidate).not.toHaveBeenCalled()
  })

  it('se a gravação falhar, não apaga nada', async () => {
    repo.updateProfile.mockRejectedValue(new Error('banco'))
    await expect(service().updateProfile('u1', 'u1', { city: 'Campinas' } as never)).rejects.toThrow('banco')
    expect(cache.invalidate).not.toHaveBeenCalled()
  })

  it('sem a cópia (sem Redis), o perfil salva normal', async () => {
    const plain = new UsersService(repo as never, {} as never, { assertOwnStorageUrl: jest.fn() } as never, {} as never, { assertAvailable: jest.fn() } as never)
    await expect(plain.updateProfile('u1', 'u1', { city: 'Campinas' } as never)).resolves.toBeDefined()
  })
})
