import { Logger } from '@nestjs/common'
import { validateEnv } from './env.validation'

describe('validateEnv', () => {
  const validConfig = () => ({
    NODE_ENV: 'production',
    JWT_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CPF_ENCRYPTION_KEY: '0123456789abcdef'.repeat(4),
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('passes and returns config when all secrets meet requirements', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const config = validConfig()

    expect(validateEnv(config)).toBe(config)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('allows empty JWT_REFRESH_SECRET when JWT_SECRET and CPF_ENCRYPTION_KEY are valid', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const config = { ...validConfig(), JWT_REFRESH_SECRET: '' }

    expect(validateEnv(config)).toBe(config)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('throws in production when JWT_SECRET is too short', () => {
    const config = { ...validConfig(), JWT_SECRET: 'short-secret' }

    expect(() => validateEnv(config)).toThrow(/JWT_SECRET must be at least 32/)
  })

  it('throws in production when JWT_REFRESH_SECRET matches JWT_SECRET or is short', () => {
    const matching = { ...validConfig(), JWT_REFRESH_SECRET: 'a'.repeat(32) }
    expect(() => validateEnv(matching)).toThrow(/distinct from JWT_SECRET/)

    const tooShort = { ...validConfig(), JWT_REFRESH_SECRET: 'short' }
    expect(() => validateEnv(tooShort)).toThrow(/JWT_REFRESH_SECRET must be at least 32/)
  })

  it('throws in production when CPF_ENCRYPTION_KEY is not 64 hex chars', () => {
    const shortKey = { ...validConfig(), CPF_ENCRYPTION_KEY: 'deadbeef' }
    expect(() => validateEnv(shortKey)).toThrow(/64-character hexadecimal/)

    const nonHexKey = { ...validConfig(), CPF_ENCRYPTION_KEY: 'z'.repeat(64) }
    expect(() => validateEnv(nonHexKey)).toThrow(/64-character hexadecimal/)
  })

  it('logs a warning instead of throwing in non-production environments', () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const config = {
      NODE_ENV: 'development',
      JWT_SECRET: 'weak',
      JWT_REFRESH_SECRET: 'weak',
      CPF_ENCRYPTION_KEY: 'bad',
    }

    expect(validateEnv(config)).toBe(config)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toContain('JWT_SECRET')
    expect(warnSpy.mock.calls[0][0]).toContain('CPF_ENCRYPTION_KEY')
  })
})
