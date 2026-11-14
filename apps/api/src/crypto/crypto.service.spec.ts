import { CryptoService } from './crypto.service'

describe('CryptoService', () => {
  const hexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  let service: CryptoService

  beforeEach(() => {
    const config: any = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'CPF_ENCRYPTION_KEY') return hexKey
        throw new Error(`Missing ${key}`)
      }),
    }
    service = new CryptoService(config)
  })

  it('encrypts and decrypts CPF round-trip using AES-256-GCM', () => {
    const plain = '12345678909'
    const cipher1 = service.encrypt(plain)
    const cipher2 = service.encrypt(plain)

    expect(cipher1).not.toBe(plain)
    expect(cipher1.split(':')).toHaveLength(3)
    expect(cipher1).not.toBe(cipher2)
    expect(service.decrypt(cipher1)).toBe(plain)
    expect(service.decrypt(cipher2)).toBe(plain)
  })

  it('throws when ciphertext is tampered', () => {
    const cipher = service.encrypt('12345678909')
    const parts = cipher.split(':')
    parts[2] = 'ff'.repeat(parts[2].length / 2)
    expect(() => service.decrypt(parts.join(':'))).toThrow()
  })
})
