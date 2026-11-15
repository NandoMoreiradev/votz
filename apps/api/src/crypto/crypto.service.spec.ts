import { ConfigService } from '@nestjs/config'
import { createCipheriv, randomBytes } from 'crypto'
import {
  CryptoService,
  decryptWithKey,
  encryptWithKey,
  hasVersionedCipherPrefix,
  parseHexKey,
} from './crypto.service'

describe('CryptoService', () => {
  const hexKey = '0123456789abcdef'.repeat(4)
  const configMock = {
    getOrThrow: jest.fn().mockReturnValue(hexKey),
  } as unknown as ConfigService

  it('encrypts with v1 prefix and decrypts round-trip', () => {
    const service = new CryptoService(configMock)
    const encrypted = service.encrypt('12345678900')

    expect(hasVersionedCipherPrefix(encrypted)).toBe(true)
    expect(encrypted.split(':')).toHaveLength(4)
    expect(encrypted.startsWith('v1:')).toBe(true)
    expect(service.decrypt(encrypted)).toBe('12345678900')
  })

  it('decrypts legacy 3-part unversioned ciphertext for backward compatibility', () => {
    const service = new CryptoService(configMock)
    const key = parseHexKey(hexKey)
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update('LEGACY-MFA-SECRET', 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const legacyCiphertext = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`

    expect(hasVersionedCipherPrefix(legacyCiphertext)).toBe(false)
    expect(service.decrypt(legacyCiphertext)).toBe('LEGACY-MFA-SECRET')
  })

  it('rejects tampered ciphertext', () => {
    const service = new CryptoService(configMock)
    const encrypted = service.encrypt('sensitive-secret')
    const parts = encrypted.split(':')
    parts[3] = 'ff' + parts[3].slice(2)

    expect(() => service.decrypt(parts.join(':'))).toThrow()
  })

  it('rejects unsupported cipher versions and malformed payloads', () => {
    const key = parseHexKey(hexKey)
    const v1 = encryptWithKey('abc', key)
    const v2 = v1.replace(/^v1:/, 'v2:')

    expect(() => decryptWithKey(v2, key)).toThrow(/Unsupported cipher version: v2/)
    expect(() => decryptWithKey('not-a-ciphertext', key)).toThrow(/Invalid ciphertext format/)
  })

  it('validates 64-char hex encryption key length', () => {
    expect(() => parseHexKey('abcd')).toThrow(/64-character hex/)
  })
})
