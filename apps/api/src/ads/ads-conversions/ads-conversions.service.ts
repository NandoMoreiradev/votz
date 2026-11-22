import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as DOMPurify from 'isomorphic-dompurify'
import {
  AD_CONVERSIONS,
  type AdConversionEvent,
  type AdConversionKeyCreated,
  type AdConversionKeyView,
  type AdConversionOutcome,
  type AdConversionsResult,
} from '@votz/shared-types'
import { saoPauloDay } from '../ads-delivery/delivery-rules'
import { AdsConversionsRepository } from './ads-conversions.repository'
import { conversionProblem, hashConversionKey, isValidClickToken, landingUrl, newConversionKey } from './conversion-rules'

const clean = (text: string) => DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).replace(/\s+/g, ' ').trim()

export interface ConversionKeyIdentity {
  id: string
  accountId: string
}

/**
 * Medir conversão sem rastrear a pessoa (plano, seção 6.4). O botão do anúncio abre `votz.app/c/<id>`, que leva ao
 * anunciante com o `votz_click_id` no link. Quando a compra acontece, o anunciante manda a conversão para o Votz com
 * esse identificador e a chave dele. O Votz nunca diz ao anunciante quem clicou, e nada da pessoa vai na conversão.
 */
@Injectable()
export class AdsConversionsService {
  private readonly logger = new Logger(AdsConversionsService.name)

  constructor(private readonly repo: AdsConversionsRepository) {}

  // ── O clique ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Endereço para onde `/c/<id>` leva. `null` se o identificador não existe (o controlador manda para o site).
   * A primeira abertura fica registrada; as seguintes não mudam nada.
   */
  async resolveClick(token: string, now = new Date()): Promise<string | null> {
    if (!isValidClickToken(token)) return null
    const impression = await this.repo.findImpressionByToken(token)
    if (!impression) return null
    const target = landingUrl(impression.ad.creative.destinationUrl, token)
    if (!target) return null
    if (!impression.landedAt) {
      try {
        await this.repo.markLanded(impression.id, now)
      } catch (error) {
        // O clique do cidadão nunca falha por causa da medição.
        this.logger.warn(`Não consegui registrar a abertura do clique: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return target
  }

  // ── A API de conversões ──────────────────────────────────────────────────────────────────────

  /** Confere a chave do anunciante. Chave que não existe ou foi revogada: `null`. */
  async authenticate(rawKey: string, now = new Date()): Promise<ConversionKeyIdentity | null> {
    if (!rawKey.startsWith(AD_CONVERSIONS.KEY_PREFIX) || rawKey.length > 200) return null
    const key = await this.repo.findKeyByHash(hashConversionKey(rawKey))
    if (!key || key.revokedAt) return null
    await this.repo.touchKey(key.id, now).catch(() => undefined)
    return { id: key.id, accountId: key.accountId }
  }

  /**
   * Recebe as conversões. Cada uma volta com o resultado (aceita, repetida ou recusada com o motivo), para o
   * anunciante saber o que corrigir. Um clique de outra conta responde igual a um clique que não existe.
   */
  async ingest(key: ConversionKeyIdentity, events: AdConversionEvent[], now = new Date()): Promise<AdConversionsResult> {
    const results: AdConversionOutcome[] = []
    for (const event of events) results.push(await this.ingestOne(key, event, now))
    return {
      accepted: results.filter((item) => item.status === 'ACCEPTED').length,
      duplicates: results.filter((item) => item.status === 'DUPLICATE').length,
      rejected: results.filter((item) => item.status === 'REJECTED').length,
      results,
    }
  }

  private async ingestOne(key: ConversionKeyIdentity, event: AdConversionEvent, now: Date): Promise<AdConversionOutcome> {
    const { dedupeKey } = event
    const reject = (reason: Extract<AdConversionOutcome, { status: 'REJECTED' }>['reason']): AdConversionOutcome => ({ dedupeKey, status: 'REJECTED', reason })

    if (!isValidClickToken(event.clickId)) return reject('UNKNOWN_CLICK')
    const impression = await this.repo.findImpressionByToken(event.clickId)
    // Clique de outra conta, que não existe ou que nunca foi aberto: mesma resposta, para não dar pista.
    if (!impression || impression.ad.adSet.campaign.accountId !== key.accountId || !impression.landedAt) return reject('UNKNOWN_CLICK')

    // Repetir uma conversão já recebida é normal (reenvio): responde "repetida" antes de qualquer outra conferência.
    if (await this.repo.conversionExists(key.accountId, dedupeKey)) return { dedupeKey, status: 'DUPLICATE' }

    const occurredAt = new Date(event.occurredAt)
    const problem = conversionProblem(occurredAt, impression.landedAt, now)
    if (problem) return reject(problem)

    if ((await this.repo.countForImpression(impression.id)) >= AD_CONVERSIONS.MAX_PER_CLICK) return reject('TOO_MANY_FOR_CLICK')

    const recorded = await this.repo.record({
      impressionId: impression.id,
      adId: impression.adId,
      adSetId: impression.ad.adSetId,
      accountId: key.accountId,
      keyId: key.id,
      eventName: event.eventName,
      valueCents: event.valueCents ?? 0,
      occurredAt,
      dedupeKey,
      day: saoPauloDay(occurredAt),
    })
    return recorded ? { dedupeKey, status: 'ACCEPTED' } : { dedupeKey, status: 'DUPLICATE' }
  }

  // ── Chaves, no Estúdio ───────────────────────────────────────────────────────────────────────

  async listKeys(companyId: string, accountId: string): Promise<AdConversionKeyView[]> {
    await this.requireAccount(companyId, accountId)
    return (await this.repo.listKeys(accountId)).map(toView)
  }

  /** Cria a chave. O texto inteiro aparece só nesta resposta; depois só o começo (`prefix`). */
  async createKey(companyId: string, accountId: string, userId: string, name: string): Promise<AdConversionKeyCreated> {
    await this.requireAccount(companyId, accountId)
    if ((await this.repo.countActiveKeys(accountId)) >= AD_CONVERSIONS.MAX_ACTIVE_KEYS) {
      throw new ConflictException(`Esta conta já tem ${AD_CONVERSIONS.MAX_ACTIVE_KEYS} chaves ativas. Revogue uma que não usa mais.`)
    }
    const generated = newConversionKey()
    const created = await this.repo.createKey({ accountId, name: clean(name), prefix: generated.prefix, keyHash: generated.keyHash, createdById: userId })
    return { ...toView(created), key: generated.key }
  }

  async revokeKey(companyId: string, accountId: string, keyId: string, now = new Date()): Promise<{ revoked: true }> {
    await this.requireAccount(companyId, accountId)
    const key = await this.repo.findKey(keyId)
    if (!key || key.accountId !== accountId) throw new NotFoundException('Chave não encontrada.')
    if (!(await this.repo.revokeKey(keyId, now))) throw new ConflictException('Esta chave já foi revogada.')
    return { revoked: true }
  }

  private async requireAccount(companyId: string, accountId: string) {
    const account = await this.repo.findAccount(accountId)
    if (!account || account.companyId !== companyId) throw new NotFoundException('Conta de anúncios não encontrada.')
  }
}

function toView(key: { id: string; name: string; prefix: string; createdAt: Date; lastUsedAt: Date | null; revokedAt: Date | null }): AdConversionKeyView {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }
}
