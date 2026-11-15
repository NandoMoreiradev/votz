import { BadRequestException } from '@nestjs/common'
import * as dns from 'dns/promises'
import * as https from 'https'
import * as net from 'net'

export type DnsLookupFn = (
  hostname: string,
) => Promise<Array<{ address: string; family: 4 | 6 }>>

export const defaultDnsLookup: DnsLookupFn = async (hostname: string) => {
  const entries = await dns.lookup(hostname, { all: true })
  return entries.map((e) => ({
    address: e.address,
    family: e.family === 6 ? 6 : 4,
  }))
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
  'ip6-localhost',
  'ip6-loopback',
])

function ipv4ToUint32(ip: string): number {
  const parts = ip.split('.').map(Number)
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  )
}

function inCidr4(ipUint: number, base: string, maskBits: number): boolean {
  const baseUint = ipv4ToUint32(base)
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0
  return (ipUint & mask) === (baseUint & mask)
}

function extractMappedIpv4FromIpv6(normalized: string): string | null {
  const lower = normalized.toLowerCase()
  const dotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (dotted && net.isIPv4(dotted[1])) {
    return dotted[1]
  }
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (hex) {
    const hi = parseInt(hex[1], 16)
    const lo = parseInt(hex[2], 16)
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
  }
  return null
}

function expandIpv6(ip: string): number[] | null {
  const zoneIdx = ip.indexOf('%')
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip
  const [leftRaw, rightRaw] = clean.split('::')
  if (clean.split('::').length > 2) return null

  const parseSide = (side: string) =>
    side ? side.split(':').filter((s) => s.length > 0).map((g) => parseInt(g, 16)) : []

  const left = parseSide(leftRaw ?? '')
  const right = rightRaw !== undefined ? parseSide(rightRaw) : []
  if ([...left, ...right].some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null

  if (rightRaw !== undefined) {
    const fill = 8 - left.length - right.length
    if (fill < 0) return null
    return [...left, ...new Array<number>(fill).fill(0), ...right]
  }
  return left.length === 8 ? left : null
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().replace(/^\[|\]$/g, '')
  const zoneClean = ip.split('%')[0]

  if (net.isIPv4(zoneClean)) {
    const n = ipv4ToUint32(zoneClean)
    return (
      inCidr4(n, '0.0.0.0', 8) || // This network
      inCidr4(n, '10.0.0.0', 8) || // RFC 1918
      inCidr4(n, '100.64.0.0', 10) || // CGNAT / Tailscale
      inCidr4(n, '127.0.0.0', 8) || // Loopback
      inCidr4(n, '169.254.0.0', 16) || // Link-local / cloud metadata (169.254.169.254)
      inCidr4(n, '172.16.0.0', 12) || // RFC 1918
      inCidr4(n, '192.0.0.0', 24) || // IETF protocol assignments
      inCidr4(n, '192.0.2.0', 24) || // TEST-NET-1
      inCidr4(n, '192.168.0.0', 16) || // RFC 1918
      inCidr4(n, '198.18.0.0', 15) || // Benchmarking
      inCidr4(n, '198.51.100.0', 24) || // TEST-NET-2
      inCidr4(n, '203.0.113.0', 24) || // TEST-NET-3
      inCidr4(n, '224.0.0.0', 4) || // Multicast
      inCidr4(n, '240.0.0.0', 4) // Reserved / broadcast
    )
  }

  if (net.isIPv6(zoneClean)) {
    const mapped = extractMappedIpv4FromIpv6(zoneClean)
    if (mapped) return isPrivateOrReservedIp(mapped)

    const groups = expandIpv6(zoneClean)
    if (!groups) return true
    const isZero = groups.every((g) => g === 0)
    const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1
    if (isZero || isLoopback) return true

    // IPv4-mapped binary form ::ffff:0:0/96
    if (
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0xffff
    ) {
      const hi = groups[6]
      const lo = groups[7]
      const v4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`
      return isPrivateOrReservedIp(v4)
    }

    const first = groups[0]
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 Unique Local Address
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 Link-Local
    if ((first & 0xff00) === 0xff00) return true // ff00::/8 Multicast
    if (first === 0x0100 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0) return true // discard
    return false
  }

  return true
}

export async function validateWebhookUrl(
  rawUrl: string,
  lookupFn: DnsLookupFn = defaultDnsLookup,
): Promise<{ url: URL; pinnedIp: string; family: 4 | 6 }> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new BadRequestException('URL de webhook inválida')
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhooks exigem protocolo HTTPS')
  }
  if (parsed.username || parsed.password) {
    throw new BadRequestException('URLs com credenciais embutidas não são permitidas')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (!hostname) {
    throw new BadRequestException('Host de webhook inválido')
  }
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new BadRequestException('Destino de rede interna ou loopback bloqueado')
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new BadRequestException('IP privado, loopback ou reservado bloqueado')
    }
    return { url: parsed, pinnedIp: hostname, family: net.isIPv6(hostname) ? 6 : 4 }
  }

  let resolved: Array<{ address: string; family: 4 | 6 }>
  try {
    resolved = await lookupFn(hostname)
  } catch {
    throw new BadRequestException('Não foi possível resolver DNS da URL informada')
  }

  if (!resolved || resolved.length === 0) {
    throw new BadRequestException('Host sem registros DNS válidos')
  }

  for (const entry of resolved) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw new BadRequestException('Host resolve para IP privado ou reservado (SSRF bloqueado)')
    }
  }

  return {
    url: parsed,
    pinnedIp: resolved[0].address,
    family: resolved[0].family,
  }
}

export interface SafeHttpPostOptions {
  timeoutMs?: number
  maxPayloadBytes?: number
  maxResponseBytes?: number
  lookupFn?: DnsLookupFn
  transport?: typeof https
}

export async function safeWebhookPost(
  rawUrl: string,
  headers: Record<string, string>,
  rawBody: string,
  options: SafeHttpPostOptions = {},
): Promise<{ statusCode: number; responseExcerpt: string }> {
  const timeoutMs = options.timeoutMs ?? 5_000
  const maxPayloadBytes = options.maxPayloadBytes ?? 256 * 1024
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024
  const lookupFn = options.lookupFn ?? defaultDnsLookup
  const transport = options.transport ?? https

  const bodyBuf = Buffer.from(rawBody, 'utf8')
  if (bodyBuf.byteLength > maxPayloadBytes) {
    throw new Error(`Webhook payload exceeds limit (${maxPayloadBytes} bytes)`)
  }

  const { url, pinnedIp, family } = await validateWebhookUrl(rawUrl, lookupFn)
  const port = url.port ? Number(url.port) : 443

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: 'https:',
        hostname: url.hostname,
        servername: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          ...headers,
          Host: url.host,
          'Content-Length': String(bodyBuf.byteLength),
        },
        timeout: timeoutMs,
        lookup: ((
          _host: string,
          optsOrCb: unknown,
          maybeCb?: (err: NodeJS.ErrnoException | null, address: string | Array<{ address: string; family: number }>, family?: number) => void,
        ) => {
          const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb
          const opts = typeof optsOrCb === 'object' && optsOrCb !== null ? (optsOrCb as { all?: boolean }) : {}
          if (!cb) return
          if (opts.all) {
            cb(null, [{ address: pinnedIp, family }])
          } else {
            cb(null, pinnedIp, family)
          }
        }) as unknown as https.RequestOptions['lookup'],
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) {
          res.resume()
          reject(new Error(`Redirect blocked (HTTP ${status})`))
          return
        }

        const chunks: Buffer[] = []
        let bytesRead = 0
        res.on('data', (chunk: Buffer) => {
          bytesRead += chunk.length
          if (bytesRead <= maxResponseBytes) {
            chunks.push(chunk)
          } else {
            res.destroy()
          }
        })
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8').slice(0, 500)
          resolve({ statusCode: status, responseExcerpt: text })
        })
        res.on('error', (err) => reject(err))
      },
    )

    req.on('timeout', () => {
      req.destroy(new Error(`Webhook request timed out after ${timeoutMs}ms`))
    })
    req.on('error', (err) => reject(err))
    req.write(bodyBuf)
    req.end()
  })
}
