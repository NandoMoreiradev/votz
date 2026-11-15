import * as http from 'node:http'
import { Writable } from 'node:stream'
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
})
