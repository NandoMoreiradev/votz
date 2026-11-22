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

  describe('chat Matrix URL in production', () => {
    const chatConfig = (url: string) => ({
      ...validConfig(),
      CHAT_TEXT_ENABLED: 'true',
      CHAT_TOKEN_ENCRYPTION_KEY: 'fedcba9876543210'.repeat(4),
      CHAT_MATRIX_JWT_SECRET: 'c'.repeat(32),
      CHAT_MATRIX_REGISTRATION_SECRET: 'd'.repeat(32),
      CHAT_MATRIX_SERVER_NAME: 'chat.votz.app',
      CHAT_MATRIX_URL: url,
    })

    it('accepts https and the Railway private network over http', () => {
      expect(() => validateEnv(chatConfig('https://matrix.example.com'))).not.toThrow()
      expect(() => validateEnv(chatConfig('http://synapse.railway.internal:8008'))).not.toThrow()
    })

    it('rejects any other http address', () => {
      expect(() => validateEnv(chatConfig('http://matrix.example.com:8008'))).toThrow(/CHAT_MATRIX_URL must use HTTPS/)
      expect(() => validateEnv(chatConfig('http://127.0.0.1:8008'))).toThrow(/CHAT_MATRIX_URL must use HTTPS/)
      expect(() => validateEnv(chatConfig('http://synapse.railway.internal.evil.com:8008'))).toThrow(/CHAT_MATRIX_URL must use HTTPS/)
      expect(() => validateEnv(chatConfig('http://evil.com/x.railway.internal:8008'))).toThrow(/CHAT_MATRIX_URL must use HTTPS/)
    })
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
