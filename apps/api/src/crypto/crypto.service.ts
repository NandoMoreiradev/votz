import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const CIPHER_VERSION = 'v1'
const AES_256_KEY_BYTES = 32
const GCM_IV_BYTES = 12
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/

/** Validates and decodes a 64-char hex AES-256 encryption key. */
export function parseHexKey(hexKey: string): Buffer {
  const trimmed = hexKey.trim()
  if (!HEX_64_REGEX.test(trimmed)) {
    throw new Error('Encryption key must be a 64-character hex string (32 bytes)')
  }
  const key = Buffer.from(trimmed, 'hex')
  if (key.length !== AES_256_KEY_BYTES) {
    throw new Error('Encryption key must decode to 32 bytes')
  }
  return key
}

/** Returns true when ciphertext already uses the versioned v1:iv:tag:data format. */
export function hasVersionedCipherPrefix(value: string): boolean {
  return value.startsWith(`${CIPHER_VERSION}:`) && value.split(':').length === 4
}

/** Encrypts plaintext using AES-256-GCM with the versioned v1:iv:tag:data format. */
export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(GCM_IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${CIPHER_VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts AES-256-GCM ciphertexts in either current versioned format
 * (`v1:<iv>:<tag>:<data>`) or legacy unversioned format (`<iv>:<tag>:<data>`).
 */
export function decryptWithKey(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':')
  let ivHex: string
  let tagHex: string
  let encHex: string

  if (parts.length === 4) {
    const [version, iv, tag, enc] = parts
    if (version !== CIPHER_VERSION) {
      throw new Error(`Unsupported cipher version: ${version}`)
    }
    ivHex = iv
    tagHex = tag
    encHex = enc
  } else if (parts.length === 3) {
    ;[ivHex, tagHex, encHex] = parts
  } else {
    throw new Error('Invalid ciphertext format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer

  constructor(private readonly config: ConfigService) {
    const hexKey = this.config.getOrThrow<string>('CPF_ENCRYPTION_KEY')
    this.key = parseHexKey(hexKey)
  }

  encrypt(plaintext: string): string {
    return encryptWithKey(plaintext, this.key)
  }

  decrypt(ciphertext: string): string {
    return decryptWithKey(ciphertext, this.key)
  }
}
