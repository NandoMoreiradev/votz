import {
  AD_DESTINATION_KINDS_OPEN,
  adCtaLabelsFor,
  adDestinationKindsFor,
  buildWhatsAppUrl,
  normalizeBrazilianMobile,
  whatsappTextOrDefault,
  whatsappTextProblem,
  type AdDestinationKind,
  type AdObjective,
} from '@votz/shared-types'

/**
 * Endereço do chat da página da empresa no site. Quem clica no anúncio de mensagens cai aqui (a web e o celular abrem a
 * conversa por dentro do app; este endereço é o caminho de reserva e o que os apps antigos abrem).
 * Mesmo padrão do `clickUrlBase`: `APP_URL` da configuração, ou o site de produção.
 */
export function pageMessageUrl(appUrl: string | undefined | null, companyId: string): string {
  const base = (appUrl?.trim() || 'https://votz.org.br').replace(/\/+$/, '')
  return `${base}/conversas/pagina/COMPANY/${companyId}`
}

export interface DestinationInput {
  objective: AdObjective
  destinationKind?: AdDestinationKind
  destinationUrl?: string
  ctaLabel: string
  /** Só em WhatsApp. */
  whatsappPhone?: string | null
  whatsappText?: string | null
}

/** O número e a mensagem de um anúncio de WhatsApp, prontos para gravar, e o endereço `wa.me` montado a partir deles. */
export function whatsappDestination(input: { whatsappPhone?: string | null; whatsappText?: string | null }): { phone: string; text: string; url: string } | null {
  const phone = normalizeBrazilianMobile(input.whatsappPhone ?? '')
  if (!phone || whatsappTextProblem(input.whatsappText)) return null
  const text = whatsappTextOrDefault(input.whatsappText)
  return { phone, text, url: buildWhatsAppUrl(phone, text) }
}

/** O que o anunciante e a moderação veem do WhatsApp do anúncio; `null` nos outros destinos. */
export function whatsappOf(creative: { destinationKind: string; whatsappPhone?: string | null; whatsappText?: string | null }): { phone: string; text: string } | null {
  if (creative.destinationKind !== 'WHATSAPP' || !creative.whatsappPhone) return null
  return { phone: creative.whatsappPhone, text: whatsappTextOrDefault(creative.whatsappText) }
}

/**
 * Confere se objetivo, destino e botão combinam e diz qual destino vale. Devolve a mensagem para o anunciante (português
 * simples) quando algo não combina. Não olha o link: quem confere o link de um site é `staticLinkProblem`.
 */
export function destinationProblem(input: DestinationInput): string | null {
  const kind = input.destinationKind ?? 'URL'
  if (!AD_DESTINATION_KINDS_OPEN.includes(kind)) return 'Esse destino ainda não está disponível.'
  if (!adDestinationKindsFor(input.objective).includes(kind)) {
    return input.objective === 'MESSAGES'
      ? 'Para receber mensagens, o botão precisa levar ao chat da sua página no Votz.'
      : 'Esse objetivo leva as pessoas a um site. Para o botão abrir uma conversa, escolha o objetivo "Receber mensagens".'
  }
  if (kind === 'URL' && !input.destinationUrl?.trim()) return 'Informe o link do botão.'
  if (kind === 'WHATSAPP') {
    if (!normalizeBrazilianMobile(input.whatsappPhone ?? '')) return 'Informe o número de WhatsApp da empresa com DDD, por exemplo (11) 98765-4321.'
    const text = whatsappTextProblem(input.whatsappText)
    if (text) return text
  }
  if (!(adCtaLabelsFor(kind) as readonly string[]).includes(input.ctaLabel)) {
    return kind === 'PAGE_MESSAGE'
      ? 'Quando o botão abre o chat, o texto do botão precisa ser "Enviar mensagem".'
      : 'Esse texto de botão só vale quando o botão abre uma conversa. Escolha outro.'
  }
  return null
}
