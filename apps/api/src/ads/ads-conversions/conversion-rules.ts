import { createHash, randomBytes } from 'crypto'
import { AD_ATTRIBUTION_WINDOW_DAYS, AD_CONVERSIONS, type AdConversionRejection } from '@votz/shared-types'

const DAY_MS = 86_400_000
const CLICK_TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${AD_CONVERSIONS.CLICK_TOKEN_LENGTH}}$`)

/**
 * Identificador do clique: 16 bytes sorteados (22 letras em base64url). Não é a exibição nem a pessoa; o anunciante
 * só consegue usá-lo para dizer "este clique virou compra", nunca para descobrir quem clicou.
 */
export function newClickToken(): string {
  return randomBytes(16).toString('base64url')
}

export function isValidClickToken(token: unknown): token is string {
  return typeof token === 'string' && CLICK_TOKEN_PATTERN.test(token)
}

/** Chave de conversões do anunciante: aparece inteira uma vez; no banco fica só o hash (SHA-256). */
export function newConversionKey(): { key: string; prefix: string; keyHash: string } {
  const key = AD_CONVERSIONS.KEY_PREFIX + randomBytes(32).toString('base64url')
  return { key, prefix: key.slice(0, 12), keyHash: hashConversionKey(key) }
}

export function hashConversionKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Endereço do botão do anúncio: `<base>/<id-do-clique>`. A base vem da configuração (`AD_CLICK_URL_BASE`); sem ela,
 * em desenvolvimento aponta para a API local e em produção para `<site>/c`.
 */
export function clickUrlBase(env: { AD_CLICK_URL_BASE?: string; APP_URL?: string; PORT?: string; NODE_ENV?: string }): string {
  const configured = env.AD_CLICK_URL_BASE?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (env.NODE_ENV === 'production') return `${(env.APP_URL?.trim() || 'https://votz.org.br').replace(/\/+$/, '')}/c`
  return `http://localhost:${env.PORT || 3000}/api/v1/ads/c`
}

/**
 * Para onde o clique vai: a página do anunciante com o `votz_click_id` no link. Mantém o que já havia no endereço
 * (parâmetros e âncora). Só `https`/`http`: qualquer outra coisa devolve `null` (nunca redireciona para `javascript:`).
 */
export function landingUrl(destinationUrl: string, token: string): string | null {
  let url: URL
  try {
    url = new URL(destinationUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.searchParams.set(AD_CONVERSIONS.CLICK_PARAM, token)
  return url.toString()
}

/**
 * A conversão vale se aconteceu até 7 dias depois do clique (contado da primeira abertura do link) e não está no
 * futuro. O relógio do anunciante pode errar alguns minutos para os dois lados.
 */
export function conversionProblem(occurredAt: Date, landedAt: Date, now: Date): AdConversionRejection | null {
  const skew = AD_CONVERSIONS.MAX_CLOCK_SKEW_MS
  if (occurredAt.getTime() > now.getTime() + skew) return 'IN_THE_FUTURE'
  if (occurredAt.getTime() < landedAt.getTime() - skew) return 'OUTSIDE_WINDOW'
  if (occurredAt.getTime() > landedAt.getTime() + AD_ATTRIBUTION_WINDOW_DAYS * DAY_MS) return 'OUTSIDE_WINDOW'
  return null
}

export interface MessageAttributionFacts {
  /** De quem é a exibição. */
  userId: string
  clickedAt: Date | null
  landedAt: Date | null
  objective: string
  destinationKind: string
  /** Empresa dona do anúncio. */
  companyId: string
}

export type MessageAttributionProblem = 'NOT_YOURS' | 'NOT_A_MESSAGE_AD' | 'OTHER_COMPANY' | 'NO_CLICK' | 'OUTSIDE_WINDOW'

/**
 * Uma mensagem para a página conta como "conversa iniciada pelo anúncio" quando: o anúncio é de mensagens e abre o chat
 * da página; a exibição é da mesma pessoa que escreveu; a página é a da empresa que anunciou; houve clique (o válido, que
 * o antifraude já carimbou, ou a abertura do link de reserva); e a mensagem veio até 7 dias depois do clique.
 */
export function messageAttributionProblem(facts: MessageAttributionFacts, who: { userId: string; companyId: string }, now: Date): MessageAttributionProblem | null {
  if (facts.userId !== who.userId) return 'NOT_YOURS'
  if (facts.objective !== 'MESSAGES' || facts.destinationKind !== 'PAGE_MESSAGE') return 'NOT_A_MESSAGE_AD'
  if (facts.companyId !== who.companyId) return 'OTHER_COMPANY'
  const clickedAt = facts.clickedAt ?? facts.landedAt
  if (!clickedAt) return 'NO_CLICK'
  const skew = AD_CONVERSIONS.MAX_CLOCK_SKEW_MS
  if (now.getTime() < clickedAt.getTime() - skew) return 'OUTSIDE_WINDOW'
  if (now.getTime() > clickedAt.getTime() + AD_ATTRIBUTION_WINDOW_DAYS * DAY_MS) return 'OUTSIDE_WINDOW'
  return null
}
