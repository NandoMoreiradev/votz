/**
 * Sinais que ajudam o moderador a decidir um pedido de credencial de imprensa.
 * São pistas, nunca decisão automática: um jornalista independente pode usar e-mail comum.
 */

// Provedores de e-mail aberto a qualquer pessoa. Não prova nada contra o pedido, só avisa o moderador.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com',
  'bol.com.br', 'terra.com.br', 'ig.com.br', 'zipmail.com.br', 'aol.com',
])

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).trim().toLowerCase()
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** "noticias.gazeta.com.br" e "gazeta.com.br" são do mesmo dono. */
export function domainsRelated(a: string, b: string): boolean {
  if (!a || !b) return false
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

export interface PressSignals {
  emailDomain: string
  emailIsFreeProvider: boolean
  websiteHost: string
  emailMatchesWebsite: boolean
  emailConfirmed: boolean
  accountAgeDays: number
}

export function pressSignals(input: {
  newsroomEmail: string
  website: string
  emailConfirmedAt: Date | null
  userCreatedAt: Date
  now?: Date
}): PressSignals {
  const domain = emailDomain(input.newsroomEmail)
  const host = hostOf(input.website)
  const now = (input.now ?? new Date()).getTime()
  return {
    emailDomain: domain,
    emailIsFreeProvider: FREE_EMAIL_DOMAINS.has(domain),
    websiteHost: host,
    emailMatchesWebsite: domainsRelated(domain, host),
    emailConfirmed: input.emailConfirmedAt !== null,
    accountAgeDays: Math.max(0, Math.floor((now - input.userCreatedAt.getTime()) / 86_400_000)),
  }
}
