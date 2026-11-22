import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { dayAsDate } from '../ads-delivery/delivery-rules'

export interface ConversionRecord {
  impressionId: string
  adId: string
  adSetId: string
  accountId: string
  keyId: string
  eventName: string
  valueCents: number
  occurredAt: Date
  dedupeKey: string
  /** Dia (fuso de São Paulo) em que a conversão aconteceu: de onde sai a contagem do relatório. */
  day: string
}

const KEY_VIEW = { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true } as const

/** Só tabelas de anúncio. Nada da pessoa: a ligação clique → pessoa existe, mas nunca sai daqui para o anunciante. */
@Injectable()
export class AdsConversionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Clique ───────────────────────────────────────────────────────────────────────────────────

  findImpressionByToken(clickToken: string) {
    return this.prisma.adImpression.findUnique({
      where: { clickToken },
      select: {
        id: true,
        adId: true,
        landedAt: true,
        ad: { select: { adSetId: true, creative: { select: { destinationUrl: true } }, adSet: { select: { campaign: { select: { accountId: true } } } } } },
      },
    })
  }

  /** Marca a primeira abertura do link. Só a primeira conta: é daí que sai a janela de atribuição. */
  async markLanded(impressionId: string, at: Date): Promise<Date> {
    await this.prisma.adImpression.updateMany({ where: { id: impressionId, landedAt: null }, data: { landedAt: at } })
    const row = await this.prisma.adImpression.findUniqueOrThrow({ where: { id: impressionId }, select: { landedAt: true } })
    return row.landedAt ?? at
  }

  // ── Conversões ───────────────────────────────────────────────────────────────────────────────

  findKeyByHash(keyHash: string) {
    return this.prisma.adConversionKey.findUnique({ where: { keyHash }, select: { id: true, accountId: true, revokedAt: true, lastUsedAt: true } })
  }

  /** Anota o uso da chave no máximo uma vez por minuto (não escrever no banco a cada chamada). */
  touchKey(id: string, now: Date) {
    return this.prisma.adConversionKey.updateMany({
      where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(now.getTime() - 60_000) } }] },
      data: { lastUsedAt: now },
    })
  }

  conversionExists(accountId: string, dedupeKey: string) {
    return this.prisma.adConversion.findUnique({ where: { accountId_dedupeKey: { accountId, dedupeKey } }, select: { id: true } }).then(Boolean)
  }

  countForImpression(impressionId: string) {
    return this.prisma.adConversion.count({ where: { impressionId } })
  }

  /**
   * Grava a conversão e soma no dia, juntas. Devolve `false` se o `dedupeKey` já existia na conta (mesmo com dois
   * envios ao mesmo tempo: o banco tem índice único).
   */
  async record(data: ConversionRecord): Promise<boolean> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adConversion.create({
          data: {
            impressionId: data.impressionId,
            adId: data.adId,
            accountId: data.accountId,
            keyId: data.keyId,
            eventName: data.eventName,
            valueCents: data.valueCents,
            occurredAt: data.occurredAt,
            dedupeKey: data.dedupeKey,
          },
        })
        const day = dayAsDate(data.day)
        await tx.adDailyStat.upsert({
          where: { adId_day: { adId: data.adId, day } },
          create: { adId: data.adId, adSetId: data.adSetId, day, conversions: 1, conversionValueCents: BigInt(data.valueCents) },
          update: { conversions: { increment: 1 }, conversionValueCents: { increment: BigInt(data.valueCents) } },
        })
      })
      return true
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
      throw error
    }
  }

  // ── Chaves ───────────────────────────────────────────────────────────────────────────────────

  findAccount(accountId: string) {
    return this.prisma.adAccount.findUnique({ where: { id: accountId }, select: { id: true, companyId: true } })
  }

  listKeys(accountId: string) {
    return this.prisma.adConversionKey.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, select: KEY_VIEW })
  }

  countActiveKeys(accountId: string) {
    return this.prisma.adConversionKey.count({ where: { accountId, revokedAt: null } })
  }

  createKey(data: { accountId: string; name: string; prefix: string; keyHash: string; createdById: string }) {
    return this.prisma.adConversionKey.create({ data, select: KEY_VIEW })
  }

  findKey(id: string) {
    return this.prisma.adConversionKey.findUnique({ where: { id }, select: { id: true, accountId: true, revokedAt: true } })
  }

  /** Revoga uma vez só: se outra pessoa já revogou, devolve `false`. */
  async revokeKey(id: string, at: Date): Promise<boolean> {
    const result = await this.prisma.adConversionKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at } })
    return result.count === 1
  }
}
