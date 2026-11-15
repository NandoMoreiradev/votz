import { createHmac, timingSafeEqual } from 'crypto'

export function signWebhookPayload(
  secret: string,
  timestampSec: number,
  rawBody: string,
): string {
  const signed = createHmac('sha256', secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest('hex')
  return `t=${timestampSec},v1=${signed}`
}

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  rawBody: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!signatureHeader || !secret) return false
  const parts = new Map<string, string>()
  for (const segment of signatureHeader.split(',')) {
    const idx = segment.indexOf('=')
    if (idx <= 0) continue
    parts.set(segment.slice(0, idx).trim(), segment.slice(idx + 1).trim())
  }

  const tsRaw = parts.get('t')
  const v1 = parts.get('v1')
  if (!tsRaw || !v1) return false

  const ts = Number(tsRaw)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSeconds) {
    return false
  }

  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex')

  const a = Buffer.from(v1, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
