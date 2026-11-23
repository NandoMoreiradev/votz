import { ForbiddenException, Injectable } from '@nestjs/common'
import { PRESS_PLAN_LIMITS, type PressPlan, type PressPlanLimits } from '@votz/shared-types'
import { PressCredentialsRepository } from './press-credentials.repository'

export interface PressAccess {
  plan: PressPlan
  limits: PressPlanLimits
  credentialId: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
}

/**
 * Quem pode usar as ferramentas de imprensa (CSV, radar) e com que plano.
 * Vale só para conta PRESS verificada e sem banimento. Conta promovida à mão pelo admin, sem pedido de
 * credencial, entra no plano gratuito.
 */
@Injectable()
export class PressAccessService {
  constructor(private readonly repo: PressCredentialsRepository) {}

  async require(userId: string): Promise<PressAccess> {
    const { user, credential } = await this.repo.findAccess(userId)
    if (!user || user.type !== 'PRESS' || !user.verified || user.banned) {
      throw new ForbiddenException('Ferramenta exclusiva para jornalistas com credencial de imprensa aprovada.')
    }
    const plan: PressPlan = credential?.plan === 'PRO' ? 'PRO' : 'GRATUITA'
    return {
      plan,
      limits: PRESS_PLAN_LIMITS[plan],
      credentialId: credential?.id ?? null,
      stripeCustomerId: credential?.stripeCustomerId ?? null,
      stripeSubscriptionId: credential?.stripeSubscriptionId ?? null,
    }
  }
}
