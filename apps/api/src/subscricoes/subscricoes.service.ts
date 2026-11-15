import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'
import { OrgType } from '@prisma/client'

// Mapa de plano → Price ID do Stripe (configurado no dashboard Stripe)
/**
 * Mapeamento dos planos do catálogo para Stripe Price IDs configurados via variáveis de ambiente.
 * Nota: o catálogo (@votz/shared-types `PLAN_PRICES`) é a fonte de verdade para exibição de preços
 * por faixa e limites; na Stripe cada Price ID configurado no painel controla a cobrança recorrente.
 */
function getStripePriceId(orgType: OrgType, plan: string): string | undefined {
  const key = `${orgType}:${plan}`
  const priceIds: Record<string, string | undefined> = {
    // Entidades
    'ENTITY:GESTAO': process.env.STRIPE_ENTITY_GESTAO_PRICE_ID,
    'ENTITY:INTEGRACAO': process.env.STRIPE_ENTITY_INTEGRACAO_PRICE_ID,
    // Políticos
    'POLITICIAN:MANDATO': process.env.STRIPE_POLITICIAN_MANDATO_PRICE_ID,
    'POLITICIAN:MANDATO_PRO': process.env.STRIPE_POLITICIAN_MANDATO_PRO_PRICE_ID,
    // Empresas (fase 2 — mantidos intactos)
    'COMPANY:STARTER': process.env.STRIPE_COMPANY_STARTER_PRICE_ID,
    'COMPANY:BUSINESS': process.env.STRIPE_COMPANY_BUSINESS_PRICE_ID,
    'COMPANY:ENTERPRISE': process.env.STRIPE_COMPANY_ENTERPRISE_PRICE_ID,
  }
  return priceIds[key]
}

@Injectable()
export class SubscricoesService {
  private readonly logger = new Logger(SubscricoesService.name)
  private stripe: InstanceType<typeof Stripe>

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'))
  }

  async criarCheckout(orgId: string, orgType: OrgType, plan: string, userEmail: string) {
    const priceId = getStripePriceId(orgType, plan)
    if (!priceId) throw new BadRequestException(`Plano ${plan} não disponível para ${orgType}`)

    const stripeCustomerId = await this.getOrCreateCustomer(orgId, orgType, userEmail)

    const webUrl = this.config.getOrThrow('WEB_URL')

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webUrl}/pagamento/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${webUrl}/planos`,
      metadata: { orgId, orgType, plan },
      subscription_data: { metadata: { orgId, orgType, plan } },
    })

    return { url: session.url }
  }

  async criarPortal(orgId: string, orgType: OrgType) {
    const org = await this.findOrgBilling(orgId, orgType)
    if (!org) throw new NotFoundException('Organização não encontrada')
    if (!org.stripeCustomerId) throw new NotFoundException('Nenhuma assinatura ativa encontrada')

    const webUrl = this.config.getOrThrow('WEB_URL')
    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${webUrl}/planos`,
    })

    return { url: session.url }
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const secret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret)
    } catch {
      throw new BadRequestException('Webhook signature inválida')
    }

    if (event.id) {
      const alreadyProcessed = await this.prisma.stripeEvent.findUnique({
        where: { id: event.id },
        select: { id: true },
      })
      if (alreadyProcessed) {
        return { received: true, duplicate: true }
      }
      try {
        await this.prisma.stripeEvent.create({
          data: { id: event.id, type: String(event.type ?? 'unknown') },
        })
      } catch (err: any) {
        if (err?.code === 'P2002') {
          return { received: true, duplicate: true }
        }
        throw err
      }
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object
          const metadata = session.metadata ?? {}
          if (metadata.orgId) {
            if (session.mode === 'subscription') {
              await this.ativarPlano(
                metadata.orgId,
                metadata.orgType as OrgType,
                metadata.plan,
                session.subscription as string,
              )
            } else if (session.mode === 'payment') {
              await this.ativarPlano(
                metadata.orgId,
                metadata.orgType as OrgType,
                metadata.plan,
                session.payment_intent as string,
              )
            }
          }
          break
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object
          const { orgId, orgType, plan } = sub.metadata ?? {}
          if (orgId && orgType && plan && sub.status === 'active') {
            await this.ativarPlano(orgId, orgType as OrgType, plan, sub.id)
          }
          break
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object
          const { orgId, orgType } = sub.metadata ?? {}
          if (orgId && orgType) {
            await this.rebaixarParaBasico(orgId, orgType as OrgType)
          }
          break
        }

        case 'invoice.payment_failed': {
          this.logger.warn(`Pagamento falhou no webhook Stripe (evento ${event.id ?? 'sem-id'})`)
          break
        }
      }
    } catch (err) {
      if (event.id) {
        await this.prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined)
      }
      throw err
    }

    return { received: true }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getOrCreateCustomer(orgId: string, orgType: OrgType, email: string): Promise<string> {
    const org = await this.findOrgBilling(orgId, orgType)
    if (!org) throw new NotFoundException('Organização não encontrada')
    if (org.stripeCustomerId) return org.stripeCustomerId

    const customer = await this.stripe.customers.create({
      email,
      metadata: { orgId, orgType },
    })

    await this.salvarStripeCustomerId(orgId, orgType, customer.id)
    return customer.id
  }

  private async findOrgBilling(
    orgId: string,
    orgType: OrgType,
  ): Promise<{ stripeCustomerId: string | null } | null> {
    if (orgType === OrgType.ENTITY) {
      return this.prisma.entity.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
    }
    if (orgType === OrgType.POLITICIAN) {
      return this.prisma.politician.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
    }
    if (orgType === OrgType.COMPANY) {
      return this.prisma.company.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
    }
    return null
  }

  private async salvarStripeCustomerId(orgId: string, orgType: OrgType, customerId: string) {
    if (orgType === OrgType.ENTITY)
      await this.prisma.entity.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } })
    else if (orgType === OrgType.POLITICIAN)
      await this.prisma.politician.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } })
    else if (orgType === OrgType.COMPANY)
      await this.prisma.company.update({ where: { id: orgId }, data: { stripeCustomerId: customerId } })
  }

  private async ativarPlano(orgId: string, orgType: OrgType, plan: string, subscriptionId: string) {
    if (orgType === OrgType.ENTITY)
      await this.prisma.entity.update({ where: { id: orgId }, data: { plan: plan as any, stripeSubscriptionId: subscriptionId } })
    else if (orgType === OrgType.POLITICIAN)
      await this.prisma.politician.update({ where: { id: orgId }, data: { plan: plan as any, stripeSubscriptionId: subscriptionId } })
    else if (orgType === OrgType.COMPANY)
      await this.prisma.company.update({ where: { id: orgId }, data: { plan: plan as any, stripeSubscriptionId: subscriptionId } })
  }

  private async rebaixarParaBasico(orgId: string, orgType: OrgType) {
    if (orgType === OrgType.ENTITY)
      await this.prisma.entity.update({ where: { id: orgId }, data: { plan: 'BASICO', stripeSubscriptionId: null } })
    else if (orgType === OrgType.POLITICIAN)
      await this.prisma.politician.update({ where: { id: orgId }, data: { plan: 'BASICO', stripeSubscriptionId: null } })
    else if (orgType === OrgType.COMPANY)
      await this.prisma.company.update({ where: { id: orgId }, data: { plan: 'STARTER', stripeSubscriptionId: null } })
  }
}
