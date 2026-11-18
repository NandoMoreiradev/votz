import { Prisma } from '@prisma/client'
import pino from 'pino'
import type { Options } from 'pino-http'

const PRISMA_ERROR_NAMES = new Set([
  'PrismaClientKnownRequestError',
  'PrismaClientValidationError',
  'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError',
])

interface PrismaErrorLike extends Error {
  type?: unknown
  code?: unknown
  errorCode?: unknown
  meta?: Record<string, unknown>
}

function isPrismaError(err: unknown): err is PrismaErrorLike {
  if (!err || typeof err !== 'object') return false
  if (
    err instanceof Prisma.PrismaClientKnownRequestError ||
    err instanceof Prisma.PrismaClientValidationError ||
    err instanceof Prisma.PrismaClientUnknownRequestError ||
    err instanceof Prisma.PrismaClientInitializationError
  ) {
    return true
  }
  const maybeErr = err as { name?: unknown; constructor?: { name?: unknown } }
  return (
    (typeof maybeErr.name === 'string' && PRISMA_ERROR_NAMES.has(maybeErr.name)) ||
    (typeof maybeErr.constructor?.name === 'string' &&
      PRISMA_ERROR_NAMES.has(maybeErr.constructor.name))
  )
}

function extractFirstLine(message: unknown): string {
  const rawMessage = typeof message === 'string' ? message : ''
  return rawMessage.trimStart().split(/\r?\n/, 1)[0]
}

function serializePrismaError(err: PrismaErrorLike) {
  const name = err.name || err.constructor?.name || 'Error'
  const rawMessage = typeof err.message === 'string' ? err.message : ''
  const firstLine = extractFirstLine(rawMessage)
  const type =
    (typeof err.type === 'string' && err.type !== 'Object' ? err.type : undefined) ||
    (err.constructor?.name && err.constructor.name !== 'Object' ? err.constructor.name : name)

  const serialized: Record<string, unknown> = {
    type,
    name,
    message: firstLine,
  }

  const code =
    typeof err.code === 'string' && err.code.length > 0
      ? err.code
      : typeof err.errorCode === 'string' && err.errorCode.length > 0
        ? err.errorCode
        : undefined
  if (code) {
    serialized.code = code
  }

  if (err.meta && typeof err.meta === 'object') {
    const safeMeta: Record<string, unknown> = {}
    if (err.meta.target !== undefined) safeMeta.target = err.meta.target
    if (err.meta.field_name !== undefined) safeMeta.field_name = err.meta.field_name
    if (Object.keys(safeMeta).length > 0) {
      serialized.meta = safeMeta
    }
  }

  const stack = typeof err.stack === 'string' ? err.stack : ''
  if (stack && (!rawMessage || (!stack.includes(rawMessage) && !rawMessage.includes('\n')))) {
    serialized.stack = stack
  }

  return serialized
}

export function createPinoHttpConfig(
  nodeEnv = process.env.NODE_ENV,
): Options {
  return {
    transport:
      nodeEnv !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-votz-chat-secret"]',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    hooks: {
      logMethod(inputArgs, method) {
        if (inputArgs.length === 1 && inputArgs[0] && typeof inputArgs[0] === 'object') {
          const arg0 = inputArgs[0] as { err?: unknown }
          if (isPrismaError(arg0)) {
            return method.apply(this, [{ err: arg0 }, extractFirstLine(arg0.message)])
          }
          if (isPrismaError(arg0.err)) {
            return method.apply(this, [arg0, extractFirstLine(arg0.err.message)])
          }
        }
        return method.apply(this, inputArgs)
      },
    },
    customErrorMessage(_req, _res, err) {
      return isPrismaError(err) ? extractFirstLine(err.message) : err.message
    },
    serializers: {
      err(err: Error) {
        if (isPrismaError(err)) {
          return serializePrismaError(err)
        }
        return pino.stdSerializers.err(err)
      },
      req(req: { method?: string; url?: string }) {
        const cleanUrl = typeof req.url === 'string' ? req.url.split('?')[0] : req.url
        return {
          method: req.method,
          url: cleanUrl,
        }
      },
      res(res: { statusCode?: number }) {
        return {
          statusCode: res.statusCode,
        }
      },
    },
  }
}
