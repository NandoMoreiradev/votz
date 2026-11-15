import { createCipheriv, randomBytes } from 'crypto'
import { decryptWithKey, hasVersionedCipherPrefix, parseHexKey } from './crypto.service'
import { migrateMfaSecrets } from './encrypt-mfa-secrets'

describe('migrateMfaSecrets', () => {
  const hexKey = '0123456789abcdef'.repeat(4)
  const key = parseHexKey(hexKey)

  function createLegacyCipher(plaintext: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
  }

  it('reports pending rows without mutating DB during dry-run', async () => {
    const legacy = createLegacyCipher('LEGACYSECRET')
    const update = jest.fn()
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-plain', mfaSecret: 'JBSWY3DPEHPK3PXP' },
          { id: 'u-legacy', mfaSecret: legacy },
          { id: 'u-v1', mfaSecret: `v1:${legacy}` },
        ]),
        update,
      },
    } as any

    const result = await migrateMfaSecrets({ prisma, key, apply: false })

    expect(result).toEqual({
      total: 3,
      alreadyVersioned: 1,
      encryptedPlaintext: 1,
      reencryptedLegacy: 1,
      updated: 0,
      apply: false,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('encrypts plaintext and legacy rows to v1 when apply is true and skips v1 rows', async () => {
    const legacy = createLegacyCipher('LEGACYSECRET')
    const update = jest.fn().mockResolvedValue({})
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u-plain', mfaSecret: 'JBSWY3DPEHPK3PXP' },
          { id: 'u-legacy', mfaSecret: legacy },
          { id: 'u-v1', mfaSecret: `v1:${legacy}` },
        ]),
        update,
      },
    } as any

    const result = await migrateMfaSecrets({ prisma, key, apply: true })

    expect(result).toEqual({
      total: 3,
      alreadyVersioned: 1,
      encryptedPlaintext: 1,
      reencryptedLegacy: 1,
      updated: 2,
      apply: true,
    })
    expect(update).toHaveBeenCalledTimes(2)

    const plainCall = update.mock.calls.find(([arg]: any[]) => arg.where.id === 'u-plain')[0]
    expect(hasVersionedCipherPrefix(plainCall.data.mfaSecret)).toBe(true)
    expect(decryptWithKey(plainCall.data.mfaSecret, key)).toBe('JBSWY3DPEHPK3PXP')

    const legacyCall = update.mock.calls.find(([arg]: any[]) => arg.where.id === 'u-legacy')[0]
    expect(hasVersionedCipherPrefix(legacyCall.data.mfaSecret)).toBe(true)
    expect(decryptWithKey(legacyCall.data.mfaSecret, key)).toBe('LEGACYSECRET')
  })
})
