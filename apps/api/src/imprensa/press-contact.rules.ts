import { PRESS_CONTACT_LIMITS as L, type PressContactStatusView } from '@votz/shared-types'

/** Regras puras do pedido de contato da imprensa (sem banco), para testar sozinhas. */

export const DAY_MS = 86_400_000

export function expiresAtFrom(now: Date): Date {
  return new Date(now.getTime() + L.EXPIRES_DAYS * DAY_MS)
}

/** Pedido sem resposta depois do prazo vale como "venceu", sem precisar de tarefa agendada. */
export function contactStatusView(r: { status: string; expiresAt: Date }, now: Date): PressContactStatusView {
  if (r.status === 'PENDING' && r.expiresAt.getTime() <= now.getTime()) return 'EXPIRED'
  return r.status as PressContactStatusView
}

export function declineCooldownStart(now: Date): Date {
  return new Date(now.getTime() - L.DECLINE_COOLDOWN_DAYS * DAY_MS)
}

/** Recusar como "abusivo" também bloqueia o jornalista: quem denuncia não quer mais receber pedido dele. */
export function declineBlocks(reason: string, block: boolean | undefined): boolean {
  return reason === 'ABUSIVE' || block === true
}
