import * as net from 'net'

/**
 * Regras da página de destino do anúncio (plano de anúncios, seção 5.3). Puras, sem rede: o que o link não pode ser
 * e o que fazer com o resultado de uma conferência.
 */

export type LandingStatus = 'OK' | 'BAD_STATUS' | 'UNREACHABLE' | 'BLOCKED'
export type LandingProblem = 'REDIRECT_OFF_SITE' | 'TOO_MANY_REDIRECTS' | 'REDIRECT_TO_HTTP' | 'BLOCKED_DOMAIN' | 'PRIVATE_ADDRESS'

/** Encurtadores escondem o destino de verdade: o anunciante usa o endereço do próprio site. (WhatsApp e redes sociais podem.) */
export const URL_SHORTENERS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly', 'cutt.ly', 'rebrand.ly', 'shorturl.at', 'tiny.cc', 'rb.gy', 'lnkd.in', 'v.gd', 'bl.ink',
] as const

/** Política: órgãos públicos não anunciam no Votz (a plataforma cobra deles), então ninguém leva o cidadão a um site de governo. */
export const PUBLIC_BODY_SUFFIXES = ['.gov.br', '.leg.br', '.jus.br', '.mp.br', '.mil.br', '.def.br', '.tc.br'] as const

export const LANDING = {
  MAX_URL_LENGTH: 2048,
  MAX_REDIRECTS: 3,
  TIMEOUT_MS: 8_000,
  /** De quanto em quanto tempo um anúncio ativo é conferido de novo. */
  RECHECK_DAYS: 7,
  /** Falha na conferência semanal: confere de novo depois deste prazo antes de pausar (site fora do ar por pouco tempo). */
  RETRY_AFTER_HOURS: 6,
} as const

const normalizeHost = (host: string) => host.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')

/** Domínios bloqueados pelo Votz (lista do dono em `ADS_BLOCKED_DOMAINS`, separada por vírgula) mais a lista fixa. */
export function parseBlockedDomains(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => normalizeHost(entry.trim()))
    .filter(Boolean)
}

/** O host é o domínio bloqueado ou está dentro dele (ex.: loja.bit.ly). */
function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

/** Motivo (em português simples, para o anunciante) de o link não servir, ou `null` se passa. Não usa rede. */
export function staticLinkProblem(rawUrl: string, extraBlocked: readonly string[] = []): string | null {
  if (typeof rawUrl !== 'string' || rawUrl.length > LANDING.MAX_URL_LENGTH) return 'O link é grande demais.'
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return 'O link não é um endereço válido.'
  }
  if (url.protocol !== 'https:') return 'O link precisa começar com https://.'
  if (url.username || url.password) return 'O link não pode ter usuário e senha dentro.'
  if (url.port && url.port !== '443') return 'O link precisa usar a porta padrão do site (sem número depois do endereço).'

  const host = normalizeHost(url.hostname.replace(/^\[|\]$/g, ''))
  if (net.isIP(host)) return 'Use o endereço do seu site, não um número de IP.'
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return 'O link precisa ser de um site público.'
  }
  if (URL_SHORTENERS.some((shortener) => matchesDomain(host, shortener))) {
    return 'Links encurtados (como bit.ly) não valem. Use o endereço completo do seu site.'
  }
  if (PUBLIC_BODY_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return 'Anúncios não podem levar a sites de órgãos públicos.'
  }
  if (extraBlocked.some((domain) => matchesDomain(host, domain))) return 'Este endereço não pode ser usado em anúncios do Votz.'
  return null
}

/** O mesmo site, ignorando "www." e maiúsculas. Redirecionar para outro site é aviso para a moderação, não erro. */
export function sameSite(a: string, b: string): boolean {
  return normalizeHost(a) === normalizeHost(b)
}

export function hostOf(rawUrl: string): string | null {
  try {
    return normalizeHost(new URL(rawUrl).hostname)
  } catch {
    return null
  }
}

/** Resultado de uma resposta final: 2xx abre. O resto é página quebrada. */
export function statusFromHttp(httpStatus: number): LandingStatus {
  return httpStatus >= 200 && httpStatus < 300 ? 'OK' : 'BAD_STATUS'
}

export type LandingAction = 'NONE' | 'RETRY_LATER' | 'PAUSE'

/**
 * O que fazer com uma conferência de anúncio que está no ar.
 * - Página bloqueada (foi para domínio proibido, rede interna ou http): pausa na hora.
 * - Página que não abre: na primeira vez confere de novo mais tarde; se a conferência anterior também falhou, pausa.
 */
export function actionAfterCheck(current: LandingStatus, previous: LandingStatus | null): LandingAction {
  if (current === 'OK') return 'NONE'
  if (current === 'BLOCKED') return 'PAUSE'
  return previous && previous !== 'OK' ? 'PAUSE' : 'RETRY_LATER'
}
