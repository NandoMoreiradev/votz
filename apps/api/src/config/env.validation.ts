import { Logger } from '@nestjs/common'
import { isPrivateNetworkMatrixUrl } from './matrix-url'

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
  if (readString(config, 'CHAT_TEXT_ENABLED') === 'true') {
    if (!HEX_64_REGEX.test(readString(config, 'CHAT_TOKEN_ENCRYPTION_KEY'))) issues.push('CHAT_TOKEN_ENCRYPTION_KEY must be a distinct 64-character hex key')
    if ([readString(config, 'CPF_ENCRYPTION_KEY'), readString(config, 'JWT_SECRET')].includes(readString(config, 'CHAT_TOKEN_ENCRYPTION_KEY'))) issues.push('CHAT_TOKEN_ENCRYPTION_KEY must be independent of other application secrets')
    if (readString(config, 'CHAT_MATRIX_JWT_SECRET').length < MIN_SECRET_LENGTH) issues.push('CHAT_MATRIX_JWT_SECRET must be at least 32 characters')
    if (readString(config, 'CHAT_MATRIX_REGISTRATION_SECRET').length < MIN_SECRET_LENGTH) issues.push('CHAT_MATRIX_REGISTRATION_SECRET must be at least 32 characters')
    if (readString(config, 'CHAT_MATRIX_JWT_SECRET') === readString(config, 'JWT_SECRET')) issues.push('Matrix login secret must be independent of the Votz access token secret')
    if (!readString(config, 'CHAT_MATRIX_SERVER_NAME')) issues.push('CHAT_MATRIX_SERVER_NAME is required')
    const matrixUrl = readString(config, 'CHAT_MATRIX_URL')
    if (readString(config, 'NODE_ENV') === 'production' && !matrixUrl.startsWith('https://') && !isPrivateNetworkMatrixUrl(matrixUrl)) issues.push('CHAT_MATRIX_URL must use HTTPS in production (or a http://*.railway.internal private network address)')
  }

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

  if (readString(config, 'OFFICIAL_SURVEYS_ENABLED') === 'true') {
    const surveyNullifierKey = readString(config, 'SURVEY_NULLIFIER_KEY')
    if (!HEX_64_REGEX.test(surveyNullifierKey)) {
      issues.push('SURVEY_NULLIFIER_KEY must be a 64-character hexadecimal string (32 bytes) when OFFICIAL_SURVEYS_ENABLED=true')
    } else if ([cpfEncryptionKey, jwtSecret].includes(surveyNullifierKey)) {
      issues.push('SURVEY_NULLIFIER_KEY must be independent of CPF_ENCRYPTION_KEY and JWT_SECRET')
    }
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
