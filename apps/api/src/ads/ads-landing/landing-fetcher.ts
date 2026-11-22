import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as https from 'https'
import { validateWebhookUrl } from '../../webhooks/ssrf-guard'
import { LANDING, hostOf, parseBlockedDomains, sameSite, staticLinkProblem, statusFromHttp, type LandingProblem, type LandingStatus } from './landing-rules'

export interface LandingFetchResult {
  status: LandingStatus
  httpStatus: number | null
  /** Site em que o link terminou, depois dos redirecionamentos. */
  finalHost: string | null
  redirects: number
  problems: LandingProblem[]
}

/** Quem abre a página. Separado para o teste não precisar de rede. */
export abstract class LandingFetcher {
  abstract fetch(url: string): Promise<LandingFetchResult>
}

interface Hop {
  httpStatus: number
  location: string | null
}

/**
 * Abre a página de destino como um visitante (só o cabeçalho da resposta, nunca o conteúdo). Protegido contra SSRF:
 * cada endereço do caminho (inclusive os redirecionamentos) é resolvido e conferido, e a conexão usa o IP já conferido,
 * então o anunciante não consegue fazer o Votz bater em rede interna, metadados de nuvem ou domínio proibido.
 */
@Injectable()
export class SafeLandingFetcher extends LandingFetcher {
  constructor(private readonly config: ConfigService) {
    super()
  }

  async fetch(startUrl: string): Promise<LandingFetchResult> {
    const blocked = parseBlockedDomains(this.config.get<string>('ADS_BLOCKED_DOMAINS'))
    const startHost = hostOf(startUrl)
    let current = startUrl
    let redirects = 0

    for (;;) {
      // Cada endereço do caminho passa pelas mesmas regras do cadastro do anúncio. Um salto para http é problema à parte.
      if (redirects > 0 && /^http:\/\//i.test(current)) return result('BLOCKED', null, hostOf(current), redirects, ['REDIRECT_TO_HTTP'])
      if (staticLinkProblem(current, blocked)) return result('BLOCKED', null, hostOf(current), redirects, ['BLOCKED_DOMAIN'])

      let hop: Hop
      try {
        hop = await this.requestOnce(current)
      } catch (error) {
        const kind = (error as { votzKind?: 'BLOCKED' | 'UNREACHABLE' }).votzKind
        if (kind === 'BLOCKED') return result('BLOCKED', null, hostOf(current), redirects, ['PRIVATE_ADDRESS'])
        return result('UNREACHABLE', null, hostOf(current), redirects, [])
      }

      if (hop.httpStatus >= 300 && hop.httpStatus < 400 && hop.location) {
        if (redirects >= LANDING.MAX_REDIRECTS) return result('BAD_STATUS', hop.httpStatus, hostOf(current), redirects, ['TOO_MANY_REDIRECTS'])
        try {
          current = new URL(hop.location, current).toString()
        } catch {
          return result('BAD_STATUS', hop.httpStatus, hostOf(current), redirects, [])
        }
        redirects += 1
        continue
      }

      const finalHost = hostOf(current)
      const status = statusFromHttp(hop.httpStatus)
      const problems: LandingProblem[] = status === 'OK' && startHost && finalHost && !sameSite(startHost, finalHost) ? ['REDIRECT_OFF_SITE'] : []
      return result(status, hop.httpStatus, finalHost, redirects, problems)
    }
  }

  /** Uma requisição só, sem seguir redirecionamento. Lê o cabeçalho e fecha a conexão. */
  private async requestOnce(rawUrl: string): Promise<Hop> {
    let target: Awaited<ReturnType<typeof validateWebhookUrl>>
    try {
      target = await validateWebhookUrl(rawUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      // Sem DNS: o site não existe ou está fora do ar. O resto (rede interna, IP privado) é bloqueio.
      const kind = /DNS/i.test(message) ? 'UNREACHABLE' : 'BLOCKED'
      throw Object.assign(new Error(message), { votzKind: kind })
    }
    const { url, pinnedIp, family } = target

    return new Promise<Hop>((resolve, reject) => {
      const req = https.request(
        {
          protocol: 'https:',
          hostname: url.hostname,
          servername: url.hostname,
          port: 443,
          path: `${url.pathname}${url.search}`,
          method: 'GET',
          headers: {
            Host: url.host,
            'User-Agent': 'VotzAdsCheck/1.0 (verificacao da pagina de destino de anuncios)',
            Accept: 'text/html,*/*;q=0.5',
          },
          timeout: LANDING.TIMEOUT_MS,
          lookup: ((_host: string, optsOrCb: unknown, maybeCb?: (...args: unknown[]) => void) => {
            const cb = (typeof optsOrCb === 'function' ? optsOrCb : maybeCb) as ((...args: unknown[]) => void) | undefined
            const opts = typeof optsOrCb === 'object' && optsOrCb !== null ? (optsOrCb as { all?: boolean }) : {}
            if (!cb) return
            if (opts.all) cb(null, [{ address: pinnedIp, family }])
            else cb(null, pinnedIp, family)
          }) as unknown as https.RequestOptions['lookup'],
        },
        (res) => {
          const location = typeof res.headers.location === 'string' ? res.headers.location : null
          const httpStatus = res.statusCode ?? 0
          // Só o cabeçalho interessa: fecha sem baixar a página.
          res.destroy()
          resolve({ httpStatus, location })
        },
      )
      req.on('timeout', () => req.destroy(new Error('A página demorou demais para responder.')))
      req.on('error', (error) => reject(error))
      req.end()
    })
  }
}

function result(status: LandingStatus, httpStatus: number | null, finalHost: string | null, redirects: number, problems: LandingProblem[]): LandingFetchResult {
  return { status, httpStatus, finalHost, redirects, problems }
}
