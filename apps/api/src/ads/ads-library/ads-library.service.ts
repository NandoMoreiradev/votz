import { Injectable } from '@nestjs/common'
import { AD_LIBRARY, adDestinationHost, adImpressionBand, adSpendBand, MILLICENTS_PER_CENT, type AdLibraryItem, type AdLibraryResponse } from '@votz/shared-types'
import { StorageService } from '../../storage/storage.service'
import { creativeMediaItems } from '../ad-creative-media'
import { dayAsDate, saoPauloDay } from '../ads-delivery/delivery-rules'
import { AdsLibraryRepository, type LibraryAdRecord } from './ads-library.repository'
import type { AdLibraryQueryDto } from './dto/ads-library.dto'

/**
 * Biblioteca pública de anúncios: todo anúncio rodando, ou que rodou nos últimos 12 meses, para qualquer pessoa ver
 * quem pagou. Mostra só faixas de gasto e de exibições, nunca o público escolhido, o lance nem o preço.
 */
@Injectable()
export class AdsLibraryService {
  constructor(
    private readonly repo: AdsLibraryRepository,
    private readonly storage: StorageService,
  ) {}

  async list(query: AdLibraryQueryDto, now = new Date()): Promise<AdLibraryResponse> {
    const limit = Math.min(query.limit ?? AD_LIBRARY.PAGE_SIZE, AD_LIBRARY.MAX_PAGE_SIZE)
    const page = query.page ?? 1
    const since = librarySince(now)

    // Pede um a mais para saber se há próxima página sem contar tudo.
    const rows = await this.repo.list(
      { now, since, q: query.q || undefined, company: query.company?.replace(/^@/, '') || undefined, activeOnly: query.status === 'active' },
      (page - 1) * limit,
      limit + 1,
    )
    const pageRows = rows.slice(0, limit)
    const totals = await this.repo.totals(pageRows.map((ad) => ad.id), since)
    const publicUrl = (key: string) => this.storage.getPublicUrl(key)

    return {
      data: pageRows.map((ad) => toLibraryItem(ad, totals.get(ad.id), now, publicUrl)),
      meta: { page, limit, hasMore: rows.length > limit },
    }
  }
}

/** Primeiro dia que ainda entra na biblioteca: 12 meses atrás, como data de calendário (fuso de São Paulo). */
export function librarySince(now: Date): Date {
  const since = new Date(now)
  since.setUTCMonth(since.getUTCMonth() - AD_LIBRARY.RETENTION_MONTHS)
  return dayAsDate(saoPauloDay(since))
}

const isLive = (status: string) => status !== 'PAUSED' && status !== 'ARCHIVED' && status !== 'DRAFT'

/** Igual à condição `runningNow` do repositório. */
function isRunning(ad: LibraryAdRecord, now: Date): boolean {
  const { adSet } = ad
  return (
    isLive(ad.status) &&
    isLive(adSet.status) &&
    adSet.campaign.status === 'ACTIVE' &&
    adSet.campaign.account.balanceCents > 0 &&
    adSet.startAt <= now &&
    (adSet.endAt === null || adSet.endAt > now)
  )
}

export function toLibraryItem(
  ad: LibraryAdRecord,
  total: { impressions: number; spendMillicents: number } | undefined,
  now: Date,
  publicUrl: (key: string) => string,
): AdLibraryItem {
  const { adSet } = ad
  const company = adSet.campaign.account.company
  const mediaItems = creativeMediaItems(ad.creative.media, publicUrl)
  return {
    adId: ad.id,
    advertiser: { id: company.id, name: company.tradeName, username: company.username, logoUrl: company.logoUrl, verified: company.verified },
    headline: ad.creative.headline,
    body: ad.creative.body,
    ctaLabel: ad.creative.ctaLabel,
    // Só site tem endereço para mostrar; chat da página e WhatsApp mostram só o tipo (nunca o número).
    destinationHost: ad.creative.destinationKind === 'URL' ? adDestinationHost(ad.creative.destinationUrl) : null,
    destinationKind: ad.creative.destinationKind,
    media: mediaItems[0] ?? null,
    mediaItems,
    active: isRunning(ad, now),
    startedOn: saoPauloDay(adSet.startAt),
    endsOn: adSet.endAt ? saoPauloDay(adSet.endAt) : null,
    states: adSet.states,
    cities: adSet.cities,
    spend: adSpendBand(Math.round((total?.spendMillicents ?? 0) / MILLICENTS_PER_CENT)),
    impressions: adImpressionBand(total?.impressions ?? 0),
  }
}
