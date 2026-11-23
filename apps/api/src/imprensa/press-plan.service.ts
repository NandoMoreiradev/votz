import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PRESS_PLANS, type PressPlan, type PressPlanInfo } from '@votz/shared-types'
import { SUPPORT_EMAIL } from '../common/legal.constants'
import { SubscricoesService } from '../subscricoes/subscricoes.service'
import { PressAccessService } from './press-access.service'
import { PressCredentialsRepository } from './press-credentials.repository'

@Injectable()
export class PressPlanService {
  constructor(
    private readonly access: PressAccessService,
    private readonly repo: PressCredentialsRepository,
    private readonly billing: SubscricoesService,
  ) {}

  /** O plano de quem está logado, o que ele libera e se dá para assinar pelo site. */
  async getInfo(userId: string): Promise<PressPlanInfo> {
    const a = await this.access.require(userId)
    return {
      plan: a.plan,
      limits: a.limits,
      checkoutAvailable: !!SubscricoesService.pressProPriceId(),
      hasSubscription: !!a.stripeSubscriptionId,
      supportEmail: SUPPORT_EMAIL,
    }
  }

  async checkout(userId: string, email: string) {
    await this.access.require(userId)
    return this.billing.criarCheckoutImprensa(userId, email)
  }

  async portal(userId: string) {
    await this.access.require(userId)
    return this.billing.criarPortalImprensa(userId)
  }

  /** Troca manual do plano pela equipe (piloto com redações antes de cobrar), com motivo e auditoria. */
  async setPlanByStaff(credentialId: string, plan: string, actorId: string, reason?: string) {
    if (!(PRESS_PLANS as readonly string[]).includes(plan)) throw new BadRequestException('Plano inválido.')
    const note = reason?.trim() ?? ''
    if (note.length < 10 || note.length > 500) throw new BadRequestException('Informe um motivo entre 10 e 500 caracteres.')

    const credential = await this.repo.findForPlan(credentialId)
    if (!credential) throw new NotFoundException('Credencial não encontrada.')
    if (credential.status !== 'APPROVED') throw new ConflictException('Só credencial aprovada tem plano.')
    if (credential.plan === plan) throw new ConflictException('A credencial já está nesse plano.')

    const ok = await this.repo.setPlan(credentialId, credential.userId, plan as PressPlan, actorId, `${credential.plan} → ${plan}: ${note}`)
    if (!ok) throw new ConflictException('Só credencial aprovada tem plano.')
    return { id: credentialId, plan }
  }
}
