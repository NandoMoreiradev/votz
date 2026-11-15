import { PrismaClient } from '@prisma/client'
import {
  decryptWithKey,
  encryptWithKey,
  hasVersionedCipherPrefix,
  parseHexKey,
} from './crypto.service'

export interface EncryptMfaSecretsOptions {
  prisma: Pick<PrismaClient, 'user'>
  key: Buffer
  apply: boolean
}

export interface EncryptMfaSecretsResult {
  total: number
  alreadyVersioned: number
  encryptedPlaintext: number
  reencryptedLegacy: number
  updated: number
  apply: boolean
}

/**
 * Idempotent migration for User.mfaSecret:
 * - Rows already prefixed with `v1:` are skipped.
 * - Legacy 3-part `<iv>:<tag>:<data>` payloads are decrypted then re-encrypted with `v1:`.
 * - Plaintext Base32 secrets are encrypted with `v1:`.
 * Never logs any plaintext or encrypted secret material.
 */
export async function migrateMfaSecrets({
  prisma,
  key,
  apply,
}: EncryptMfaSecretsOptions): Promise<EncryptMfaSecretsResult> {
  const rows = await prisma.user.findMany({
    where: { mfaSecret: { not: null } },
    select: { id: true, mfaSecret: true },
  })

  let alreadyVersioned = 0
  let encryptedPlaintext = 0
  let reencryptedLegacy = 0
  let updated = 0

  for (const row of rows) {
    const stored = row.mfaSecret
    if (!stored) continue

    if (hasVersionedCipherPrefix(stored)) {
      alreadyVersioned++
      continue
    }

    let nextCiphertext: string
    if (stored.includes(':')) {
      const plaintext = decryptWithKey(stored, key)
      nextCiphertext = encryptWithKey(plaintext, key)
      reencryptedLegacy++
    } else {
      nextCiphertext = encryptWithKey(stored, key)
      encryptedPlaintext++
    }

    if (apply) {
      await prisma.user.update({
        where: { id: row.id },
        data: { mfaSecret: nextCiphertext },
      })
      updated++
    }
  }

  return {
    total: rows.length,
    alreadyVersioned,
    encryptedPlaintext,
    reencryptedLegacy,
    updated,
    apply,
  }
}

async function runCli(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const hexKey = process.env.CPF_ENCRYPTION_KEY ?? ''
  const key = parseHexKey(hexKey)
  const prisma = new PrismaClient()

  try {
    const result = await migrateMfaSecrets({ prisma, key, apply })
    const mode = result.apply ? 'APPLY' : 'DRY-RUN'
    // Intentional summary logging only: never log ids or secret contents.
    console.info(
      `[encrypt-mfa-secrets][${mode}] total=${result.total} already_v1=${result.alreadyVersioned} plaintext_pending=${result.encryptedPlaintext} legacy_pending=${result.reencryptedLegacy} updated=${result.updated}`,
    )
    if (!result.apply && result.encryptedPlaintext + result.reencryptedLegacy > 0) {
      console.info('[encrypt-mfa-secrets] Pass --apply to persist changes.')
    }
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  void runCli().catch((err: unknown) => {
    console.error('[encrypt-mfa-secrets] Failed:', err instanceof Error ? err.message : 'Unknown error')
    process.exit(1)
  })
}
