import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { RegisterDto } from '../../auth/dto/register.dto'
import { UpdateProfileDto } from '../../users/dto/update-profile.dto'
import { birthDateProblem } from './birth-date.validator'

const today = new Date('2026-11-21T12:00:00Z')

describe('data de nascimento', () => {
  it('aceita quem tem 18 anos ou mais e recusa o resto com mensagem simples', () => {
    expect(birthDateProblem('2008-11-21', today)).toBeNull()
    expect(birthDateProblem('2008-11-22', today)).toMatch(/18 anos/)
    expect(birthDateProblem('1990-02-30', today)).toMatch(/inválida/)
    expect(birthDateProblem('17/05/1990', today)).toMatch(/AAAA-MM-DD/)
    expect(birthDateProblem('1850-01-01', today)).toMatch(/Confira/)
    expect(birthDateProblem(19900517, today)).toMatch(/inválida/)
  })
})

describe('DTOs com data de nascimento e gênero (opcionais)', () => {
  const register = (patch: Record<string, unknown>) =>
    plainToInstance(RegisterDto, {
      name: 'Ana Teste',
      email: 'ana@votz.test',
      password: 'Senha@1234',
      phone: '+5579999999999',
      zipCode: '49000000',
      streetNumber: '10',
      acceptedTermsVersion: 'x',
      acceptedPrivacyVersion: 'y',
      confirmAge18: true,
      ...patch,
    })
  const fields = async (dto: object) => (await validate(dto)).map((error) => error.property)

  it('cadastro sem os campos continua valendo', async () => {
    expect(await fields(register({}))).toEqual([])
  })

  it('cadastro com data e gênero válidos passa; menor de idade e gênero fora da lista não', async () => {
    expect(await fields(register({ birthDate: '1990-05-17', gender: 'FEMALE' }))).toEqual([])
    expect(await fields(register({ birthDate: '2015-01-01' }))).toEqual(['birthDate'])
    expect(await fields(register({ gender: 'NAO_EXISTE' }))).toEqual(['gender'])
  })

  it('perfil aceita null para apagar e recusa valor inválido', async () => {
    expect(await fields(plainToInstance(UpdateProfileDto, { birthDate: null, gender: null }))).toEqual([])
    expect(await fields(plainToInstance(UpdateProfileDto, { birthDate: '1985-12-01', gender: 'UNDISCLOSED' }))).toEqual([])
    expect(await fields(plainToInstance(UpdateProfileDto, { birthDate: 'ontem' }))).toEqual(['birthDate'])
  })
})
