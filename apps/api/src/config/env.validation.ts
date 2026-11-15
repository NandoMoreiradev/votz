import { Logger } from '@nestjs/common'

const logger = new Logger('EnvValidation')
const MIN_SECRET_LENGTH = 32
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/

function readString(config: Record<string, unknown>, key: string): string {
  const value = config[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Validates critical cryptographic and JWT environment variables at boot.
 * Throws on invalid/weak values in production; logs warnings in non-production.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const issues: string[] = []

  const jwtSecret = readString(config, 'JWT_SECRET')
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    issues.push(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`)
  }

  const jwtRefreshSecret = readString(config, 'JWT_REFRESH_SECRET')
  if (jwtRefreshSecret.length > 0) {
    if (jwtRefreshSecret.length < MIN_SECRET_LENGTH) {
      issues.push(`JWT_REFRESH_SECRET must be at least ${MIN_SECRET_LENGTH} characters when set`)
    }
    if (jwtSecret.length > 0 && jwtRefreshSecret === jwtSecret) {
      issues.push('JWT_REFRESH_SECRET must be distinct from JWT_SECRET')
    }
  }

  const cpfEncryptionKey = readString(config, 'CPF_ENCRYPTION_KEY')
  if (!HEX_64_REGEX.test(cpfEncryptionKey)) {
    issues.push('CPF_ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes)')
  }

  if (issues.length > 0) {
    const summary = `Environment security configuration issues: ${issues.join('; ')}`
    const nodeEnv = readString(config, 'NODE_ENV').toLowerCase()
    if (nodeEnv === 'production') {
      throw new Error(summary)
    }
    logger.warn(summary)
  }

  return config
}
