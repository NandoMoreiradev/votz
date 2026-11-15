import * as http from 'node:http'
import { Writable } from 'node:stream'
import { Prisma } from '@prisma/client'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { createPinoHttpConfig } from './pino-config'

describe('createPinoHttpConfig (log redaction)', () => {
  it('never leaks Set-Cookie secrets, auth/cookie headers, or OAuth query params in HTTP logs', async () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString('utf8'))
        callback()
      },
    })

    const cfg = createPinoHttpConfig('production')
    const logger = pino({ redact: cfg.redact }, stream)
    const httpLogger = pinoHttp({
      ...cfg,
      logger,
    } as any)

    const server = http.createServer((req, res) => {
      httpLogger(req, res)
      res.setHeader('Set-Cookie', 'votz_refresh_token=SEGREDO; HttpOnly; Path=/')
      res.statusCode = 200
      res.end('ok')
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as { port: number }

    try {
      await fetch(`http://127.0.0.1:${address.port}/auth/google/callback?code=ABC&state=XYZ`, {
        headers: {
          Authorization: 'Bearer SECRET_BEARER',
          Cookie: 'votz_refresh_token=COOKIE_SECRET',
        },
      })
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    const rawLog = chunks.join('\n')
    expect(rawLog.length).toBeGreaterThan(0)
    expect(rawLog).not.toContain('SEGREDO')
    expect(rawLog).not.toContain('ABC')
    expect(rawLog).not.toContain('XYZ')
    expect(rawLog).not.toContain('SECRET_BEARER')
    expect(rawLog).not.toContain('COOKIE_SECRET')

    const parsed = JSON.parse(chunks[0])
    expect(parsed.req).toEqual({
      method: 'GET',
      url: '/auth/google/callback',
    })
    expect(parsed.res).toEqual({
      statusCode: 200,
    })
  })

  it('redacts sensitive headers with [REDACTED] when logged explicitly', () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString('utf8'))
        callback()
      },
    })

    const cfg = createPinoHttpConfig('production')
    const logger = pino({ redact: cfg.redact }, stream)
    logger.info({
      req: { headers: { authorization: 'Bearer TOP_SECRET', cookie: 'votz_refresh_token=SEGREDO' } },
      res: { headers: { 'set-cookie': ['votz_refresh_token=SEGREDO'] } },
    })

    const parsed = JSON.parse(chunks[0])
    expect(parsed.req.headers.authorization).toBe('[REDACTED]')
    expect(parsed.req.headers.cookie).toBe('[REDACTED]')
    expect(parsed.res.headers['set-cookie']).toBe('[REDACTED]')
  })

  it('strips PrismaClientValidationError query args (SEGREDO_NO_LOG, senha-hash-x) and stack from logs', async () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString('utf8'))
        callback()
      },
    })

    const cfg = createPinoHttpConfig('production')
    const logger = pino({ redact: cfg.redact, serializers: cfg.serializers, hooks: cfg.hooks }, stream)
    const httpLogger = pinoHttp({ ...cfg, logger } as any)

    const validationErr = new Prisma.PrismaClientValidationError(
      '\nInvalid `prisma.user.create()` invocation:\n{\n  data: {\n    email: "SEGREDO_NO_LOG",\n    password: "senha-hash-x"\n  }\n}\n\nArgument `cpf` is missing.',
      { clientVersion: '5.22.0' },
    )

    // 1) Direct structured error log
    logger.error({ err: validationErr }, 'db write failed')

    // 2) pino-http auto error logging with status 500
    const server = http.createServer((req, res) => {
      httpLogger(req, res)
      res.statusCode = 500
      res.err = validationErr
      res.end('Internal Server Error')
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as { port: number }
    try {
      const httpRes = await fetch(`http://127.0.0.1:${address.port}/auth/register`)
      expect(httpRes.status).toBe(500)
      await expect(httpRes.text()).resolves.toBe('Internal Server Error')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const fullLog = chunks.join('\n')
    expect(fullLog).not.toContain('SEGREDO_NO_LOG')
    expect(fullLog).not.toContain('senha-hash-x')
    expect(fullLog).not.toContain('Argument `cpf`')

    for (const line of chunks) {
      const parsed = JSON.parse(line)
      expect(parsed.err).toEqual({
        type: 'PrismaClientValidationError',
        name: 'PrismaClientValidationError',
        message: 'Invalid `prisma.user.create()` invocation:',
      })
      expect(parsed.err.stack).toBeUndefined()
    }
  })

  it('logs only safe fields for Known/Unknown/Initialization Prisma errors and preserves standard errors', () => {
    const chunks: string[] = []
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString('utf8'))
        callback()
      },
    })

    const cfg = createPinoHttpConfig('production')
    const logger = pino({ redact: cfg.redact, serializers: cfg.serializers, hooks: cfg.hooks }, stream)

    const knownErr = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed\nSEGREDO_NO_LOG\nsenha-hash-x',
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target: ['email'], field_name: 'users_email_key', queryPayload: 'SEGREDO_NO_LOG' },
      },
    )
    const unknownErr = new Prisma.PrismaClientUnknownRequestError(
      'Unknown failure\nSEGREDO_NO_LOG',
      { clientVersion: '5.22.0' },
    )
    const initErr = new Prisma.PrismaClientInitializationError(
      'Init failure\nsenha-hash-x',
      '5.22.0',
      'P1001',
    )
    const regularErr = new Error('Unexpected timeout')

    logger.error({ err: knownErr })
    logger.error({ err: unknownErr })
    logger.error({ err: initErr })
    logger.error({ err: regularErr })

    const rawLog = chunks.join('\n')
    expect(rawLog).not.toContain('SEGREDO_NO_LOG')
    expect(rawLog).not.toContain('senha-hash-x')

    const parsedKnown = JSON.parse(chunks[0])
    expect(parsedKnown.err).toEqual({
      type: 'PrismaClientKnownRequestError',
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['email'], field_name: 'users_email_key' },
      message: 'Unique constraint failed',
    })

    const parsedUnknown = JSON.parse(chunks[1])
    expect(parsedUnknown.err).toEqual({
      type: 'PrismaClientUnknownRequestError',
      name: 'PrismaClientUnknownRequestError',
      message: 'Unknown failure',
    })

    const parsedInit = JSON.parse(chunks[2])
    expect(parsedInit.err).toEqual({
      type: 'PrismaClientInitializationError',
      name: 'PrismaClientInitializationError',
      code: 'P1001',
      message: 'Init failure',
    })

    const parsedRegular = JSON.parse(chunks[3])
    expect(parsedRegular.err.message).toBe('Unexpected timeout')
    expect(parsedRegular.err.stack).toContain('Error: Unexpected timeout')
  })
})
