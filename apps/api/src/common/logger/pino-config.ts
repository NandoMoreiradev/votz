import type { Options } from 'pino-http'

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
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
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
