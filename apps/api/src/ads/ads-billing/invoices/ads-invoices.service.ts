import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import type { AdInvoice } from '@prisma/client'
import type { AdBillingMode, AdInvoiceView } from '@votz/shared-types'
import { AdvertiserNotifier } from '../advertiser-notifier'
import { saoPauloMonth } from '../billing-rules'
import { AdsInvoicesRepository } from './ads-invoices.repository'
import { LiveInvoiceIssuer, TestInvoiceIssuer, type InvoiceIssuer } from './invoice-issuer'

/** Depois de tantas tentativas com erro, a nota vira "com problema" e precisa de gente. */
const MAX_ATTEMPTS = 5
const BATCH = 20

export interface InvoicesRun {
  created: number
  issued: number
  waiting: number
  failed: number
}

/**
 * Notas fiscais de serviço. Uma por conta e por mês, com o valor do **gasto do mês** (soma do livro-caixa), emitida no
 * começo do mês seguinte. Recarga não gera nota: o dinheiro só vira serviço prestado quando as campanhas gastam. Se o
 * contador do Votz preferir emitir na recarga, a regra muda aqui (decisão do dono com o contador).
 * Sem provedor de NFS-e ligado, as notas ficam esperando sem perder nada.
 */
@Injectable()
export class AdsInvoicesService {
  private readonly logger = new Logger(AdsInvoicesService.name)

  constructor(
    private readonly repo: AdsInvoicesRepository,
    private readonly config: ConfigService,
    private readonly testIssuer: TestInvoiceIssuer,
    private readonly liveIssuer: LiveInvoiceIssuer,
    private readonly notifier: AdvertiserNotifier,
  ) {}

  /** Mesmo modo do faturamento: `ADS_BILLING_MODE` manda; sem ele, produção é real e o resto é teste. */
  private get mode(): AdBillingMode {
    const configured = this.config.get<string>('ADS_BILLING_MODE')
    if (configured === 'test' || configured === 'live') return configured
    return this.config.get<string>('NODE_ENV') === 'production' ? 'live' : 'test'
  }

  private issuer(): InvoiceIssuer {
    return this.mode === 'test' ? this.testIssuer : this.liveIssuer
  }

  async list(accountId: string): Promise<AdInvoiceView[]> {
    return (await this.repo.list(accountId, 12)).map(toView)
  }

  /** Todo dia de manhã: cria as notas do mês passado que faltam e tenta emitir as pendentes. Pode rodar em várias instâncias. */
  @Cron('0 5 * * *', { timeZone: 'America/Sao_Paulo' })
  async scheduled(): Promise<void> {
    try {
      await this.run()
    } catch (error) {
      this.logger.error(`Notas fiscais dos anúncios falharam: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async run(now = new Date()): Promise<InvoicesRun> {
    const created = await this.createForMonth(now)
    return { created, ...(await this.issuePending(now)) }
  }

  /** Cria a nota do mês passado de cada conta que gastou. Rodar de novo não duplica. */
  async createForMonth(now: Date): Promise<number> {
    const month = saoPauloMonth(now, 1)
    const spend = await this.repo.spendByAccount(month.startAt, month.endAt)
    if (!spend.length) return 0
    const takers = new Map((await this.repo.takersOf(spend.map((row) => row.adAccountId))).map((row) => [row.id, row.company]))
    return this.repo.createMissing(
      spend.flatMap((row) => {
        const taker = takers.get(row.adAccountId)
        if (!taker) return []
        return [
          {
            adAccountId: row.adAccountId,
            periodStart: new Date(`${month.start}T00:00:00.000Z`),
            periodEnd: new Date(`${month.end}T00:00:00.000Z`),
            amountCents: row.cents,
            takerName: taker.legalName,
            takerCnpj: taker.cnpj,
          },
        ]
      }),
    )
  }

  async issuePending(now: Date): Promise<Omit<InvoicesRun, 'created'>> {
    const result = { issued: 0, waiting: 0, failed: 0 }
    const issuer = this.issuer()
    for (const invoice of await this.repo.pending(BATCH)) {
      if (!issuer.isReady()) {
        result.waiting += 1
        continue
      }
      try {
        if (!(await this.repo.claim(invoice.id, invoice.attempts))) continue
        const issued = await issuer.issue({
          invoiceId: invoice.id,
          takerName: invoice.takerName,
          takerCnpj: invoice.takerCnpj,
          amountCents: invoice.amountCents,
          periodStart: invoice.periodStart.toISOString().slice(0, 10),
          periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
          description: 'Serviço de publicidade online no Votz',
        })
        await this.repo.markIssued(invoice.id, { provider: issuer.provider, externalId: issued.externalId, number: issued.number, pdfUrl: issued.pdfUrl ?? null, xmlUrl: issued.xmlUrl ?? null }, now)
        result.issued += 1
        await this.notifier.notify(invoice.adAccount.companyId, 'AD_INVOICE_ISSUED', {
          accountId: invoice.adAccountId,
          accountName: invoice.adAccount.name,
          periodStart: invoice.periodStart.toISOString().slice(0, 10),
          amountCents: invoice.amountCents,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const failed = invoice.attempts + 1 >= MAX_ATTEMPTS
        await this.repo.markError(invoice.id, message, failed)
        if (failed) result.failed += 1
        this.logger.warn(`Emissão da nota ${invoice.id} falhou (${invoice.attempts + 1}/${MAX_ATTEMPTS}): ${message}`)
      }
    }
    return result
  }
}

function toView(invoice: AdInvoice): AdInvoiceView {
  return {
    id: invoice.id,
    periodStart: invoice.periodStart.toISOString().slice(0, 10),
    periodEnd: invoice.periodEnd.toISOString().slice(0, 10),
    amountCents: invoice.amountCents,
    status: invoice.status,
    number: invoice.number,
    pdfUrl: invoice.pdfUrl,
    xmlUrl: invoice.xmlUrl,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
  }
}
