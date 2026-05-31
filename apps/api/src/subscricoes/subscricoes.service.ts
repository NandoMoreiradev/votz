import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'
import { PrismaService } from '../prisma/prisma.service'
import { OrgType } from '@prisma/client'

// Mapa de plano → Price ID do Stripe (configurado no dashboard Stripe)
const PRICE_IDS: Record<string, string | undefined> = {
  // Entidades
  'ENTITY:GESTAO':      process.env.STRIPE_ENTITY_GESTAO_PRICE_ID,
  'ENTITY:PRO':         process.env.STRIPE_ENTITY_PRO_PRICE_ID,
  'ENTITY:ENTERPRISE':  process.env.STRIPE_ENTITY_ENTERPRISE_PRICE_ID,
  // Políticos
  'POLITICIAN:MANDATOMETRO_PRO': process.env.STRIPE_POLITICIAN_PRO_PRICE_ID,
  'POLITICIAN:CAMPANHA':         process.env.STRIPE_POLITICIAN_CAMPANHA_PRICE_ID,
  // Empresas
  'COMPANY:STARTER':    process.env.STRIPE_COMPANY_STARTER_PRICE_ID,
  'COMPANY:BUSINESS':   process.env.STRIPE_COMPANY_BUSINESS_PRICE_ID,
  'COMPANY:ENTERPRISE': process.env.STRIPE_COMPANY_ENTERPRISE_PRICE_ID,
}

@Injectable()
export class SubscricoesService {
  private stripe: Stripe

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'), {
      apiVersion: '2025-04-30.basil',
    })
  }

  async criarCheckout(orgId: string, orgType: OrgType, plan: string, userEmail: string) {
    const key = `${orgType}:${plan}`
    const priceId = PRICE_IDS[key]
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
    const stripeCustomerId = await this.getStripeCustomerId(orgId, orgType)
    if (!stripeCustomerId) throw new NotFoundException('Nenhuma assinatura ativa encontrada')

    const webUrl = this.config.getOrThrow('WEB_URL')
    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${webUrl}/planos`,
    })

    return { url: session.url }
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const secret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET')
    let event: Stripe.Event

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, secret)
    } catch {
      throw new BadRequestException('Webhook signature inválida')
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.metadata?.orgId) {
          await this.ativarPlano(
            session.metadata.orgId,
            session.metadata.orgType as OrgType,
            session.metadata.plan,
            session.subscription as string,
          )
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const { orgId, orgType, plan } = sub.metadata
        if (orgId && orgType && plan && sub.status === 'active') {
          await this.ativarPlano(orgId, orgType as OrgType, plan, sub.id)
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const { orgId, orgType } = sub.metadata
        if (orgId && orgType) {
          await this.rebaixarParaBasico(orgId, orgType as OrgType)
        }
        break
      }

      case 'invoice.payment_failed': {
        // Logado para acompanhamento — não rebaixa imediatamente
        const invoice = event.data.object as Stripe.Invoice
        console.warn(`Pagamento falhou para customer ${invoice.customer}`)
        break
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async getOrCreateCustomer(orgId: string, orgType: OrgType, email: string): Promise<string> {
    const existing = await this.getStripeCustomerId(orgId, orgType)
    if (existing) return existing

    const customer = await this.stripe.customers.create({
      email,
      metadata: { orgId, orgType },
    })

    await this.salvarStripeCustomerId(orgId, orgType, customer.id)
    return customer.id
  }

  private async getStripeCustomerId(orgId: string, orgType: OrgType): Promise<string | null> {
    if (orgType === OrgType.ENTITY) {
      const e = await this.prisma.entity.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
      return e?.stripeCustomerId ?? null
    }
    if (orgType === OrgType.POLITICIAN) {
      const p = await this.prisma.politician.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
      return p?.stripeCustomerId ?? null
    }
    if (orgType === OrgType.COMPANY) {
      const c = await this.prisma.company.findUnique({ where: { id: orgId }, select: { stripeCustomerId: true } })
      return c?.stripeCustomerId ?? null
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
