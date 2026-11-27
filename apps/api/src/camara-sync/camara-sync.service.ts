import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { HOUR_MS, windowedJobId } from '../common/queue/job-window'
import { PoliticianStatus } from '@prisma/client'
import {
  normalizeOfficeCategory,
  normalizePartyAbbreviation,
  normalizePersonName,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'

export const CAMARA_SYNC_QUEUE = 'camara-sync'
const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
const PAGE_SIZE = 100

// Fallback para Legislatura 57 caso a consulta de legislaturas falhe
const FALLBACK_LEG_ID = 57
const FALLBACK_LEG_START = new Date('2023-02-01T00:00:00.000Z')
const FALLBACK_LEG_END = new Date('2027-01-31T23:59:59.999Z')

interface CamaraLegislatura {
  id: number
  dataInicio: string
  dataFim: string
}

interface CamaraParty {
  id: number
  sigla: string
  nome: string
}

interface CamaraDeputado {
  id: number
  nome: string
  siglaPartido: string
  siglaUf: string
  urlFoto: string
}

interface CamaraPage<T> {
  dados: T[]
  links: Array<{ rel: string; href: string }>
}

export interface SyncResult {
  legislaturaId: number
  parties: number
  created: number
  updated: number
  skipped: number
  startedAt: Date
  finishedAt: Date
}

@Injectable()
export class CamaraSyncService {
  private readonly logger = new Logger(CamaraSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CAMARA_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async triggerSync(legislaturaId?: number): Promise<{ message: string }> {
    await this.queue.add(
      'full-sync',
      { legislaturaId },
      {
        jobId: windowedJobId(`camara-full-sync${legislaturaId ? `-${legislaturaId}` : ''}`, HOUR_MS),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    )
    this.logger.log(`Câmara sync job enqueued${legislaturaId ? ` (legislatura=${legislaturaId})` : ''}`)
    return { message: 'Sync da Câmara dos Deputados iniciado.' }
  }

  async runSync(explicitLegislaturaId?: number): Promise<SyncResult> {
    const startedAt = new Date()
    this.logger.log('Câmara sync started')

    const partiesCount = await this.syncParties()
    this.logger.log(`Parties synced: ${partiesCount}`)

    const leg = await this.resolveLegislatura(explicitLegislaturaId)
    this.logger.log(
      `Resolving Câmara deputies for Legislatura ${leg.id} (${leg.termStart.toISOString().slice(0, 10)} → ${leg.termEnd.toISOString().slice(0, 10)})`,
    )

    const { created, updated, skipped } = await this.syncDeputies(leg)
    this.logger.log(`Deputies — created: ${created}, updated: ${updated}, skipped: ${skipped}`)

    const result: SyncResult = {
      legislaturaId: leg.id,
      parties: partiesCount,
      created,
      updated,
      skipped,
      startedAt,
      finishedAt: new Date(),
    }

    this.logger.log(`Câmara sync finished in ${result.finishedAt.getTime() - startedAt.getTime()}ms`)
    return result
  }

  // ── Legislatura ativa ───────────────────────────────────────────────────────

  private async resolveLegislatura(
    explicitId?: number,
  ): Promise<{ id: number; termStart: Date; termEnd: Date }> {
    try {
      const data = await this.fetchJson<CamaraPage<CamaraLegislatura>>(
        `${CAMARA_BASE}/legislaturas?ordem=DESC&ordenarPor=id&itens=5`,
      )
      const list = data.dados ?? []
      if (list.length > 0) {
        const now = new Date()
        const picked = explicitId
          ? list.find((l) => l.id === explicitId)
          : list.find((l) => new Date(l.dataInicio) <= now && now <= new Date(l.dataFim)) ??
            list[0]

        if (picked) {
          return {
            id: picked.id,
            termStart: new Date(`${picked.dataInicio}T00:00:00.000Z`),
            termEnd: new Date(`${picked.dataFim}T23:59:59.999Z`),
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to query Câmara legislatures, using fallback: ${(err as Error).message}`)
    }

    return {
      id: explicitId ?? FALLBACK_LEG_ID,
      termStart: FALLBACK_LEG_START,
      termEnd: FALLBACK_LEG_END,
    }
  }

  // ── Parties ──────────────────────────────────────────────────────────────────

  private async syncParties(): Promise<number> {
    let page = 1
    let total = 0

    while (true) {
      const url = `${CAMARA_BASE}/partidos?itens=${PAGE_SIZE}&pagina=${page}&ordem=ASC&ordenarPor=sigla`
      const data = await this.fetchJson<CamaraPage<CamaraParty>>(url)

      for (const p of data.dados) {
        const sigla = normalizePartyAbbreviation(p.sigla)
        await this.prisma.party.upsert({
          where: { abbreviation: sigla },
          update: { name: p.nome },
          create: {
            abbreviation: sigla,
            name: p.nome,
            number: p.id,
            active: true,
          },
        })
        total++
      }

      if (!this.hasNextPage(data.links) || data.dados.length === 0) break
      page++
      await this.sleep(300)
    }

    return total
  }

  // ── Deputies ─────────────────────────────────────────────────────────────────

  private async syncDeputies(leg: {
    id: number
    termStart: Date
    termEnd: Date
  }): Promise<{ created: number; updated: number; skipped: number }> {
    const allParties = await this.prisma.party.findMany({
      select: { id: true, abbreviation: true },
    })
    const partyMap = new Map(allParties.map((p) => [p.abbreviation.toUpperCase(), p.id]))

    // Carrega deputados federais existentes para reconciliação com pré-cadastros do TSE
    const existingFed = await this.prisma.politician.findMany({
      where: { office: { contains: 'Deputado Federal', mode: 'insensitive' } },
      select: {
        id: true,
        tseId: true,
        name: true,
        state: true,
        office: true,
        termStart: true,
        termEnd: true,
        avatarUrl: true,
      },
    })

    const byTseId = new Map(existingFed.filter((p) => p.tseId).map((p) => [p.tseId!, p]))
    const byReconcile = new Map(
      existingFed.map((p) => [
        `${p.state.toUpperCase()}|${normalizeOfficeCategory(p.office)}|${normalizePersonName(p.name)}`,
        p,
      ]),
    )

    let page = 1
    let created = 0
    let updated = 0
    let skipped = 0

    while (true) {
      const url = `${CAMARA_BASE}/deputados?itens=${PAGE_SIZE}&pagina=${page}&idLegislatura=${leg.id}&ordem=ASC&ordenarPor=nome`
      const data = await this.fetchJson<CamaraPage<CamaraDeputado>>(url)

      for (const d of data.dados) {
        const result = await this.upsertDeputado(d, leg, partyMap, byTseId, byReconcile)
        if (result === 'created') created++
        else if (result === 'updated') updated++
        else skipped++
      }

      if (!this.hasNextPage(data.links) || data.dados.length === 0) break
      page++
      await this.sleep(500)
    }

    return { created, updated, skipped }
  }

  private async upsertDeputado(
    d: CamaraDeputado,
    leg: { id: number; termStart: Date; termEnd: Date },
    partyMap: Map<string, string>,
    byTseId: Map<string, { id: string; tseId: string | null; termStart: Date; termEnd: Date; avatarUrl: string | null }>,
    byReconcile: Map<string, { id: string; tseId: string | null; termStart: Date; termEnd: Date; avatarUrl: string | null }>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const tseId = String(d.id)
    const sigla = normalizePartyAbbreviation(d.siglaPartido)
    const partyId = partyMap.get(sigla.toUpperCase()) ?? partyMap.get(d.siglaPartido.toUpperCase())

    if (!partyId) {
      this.logger.warn(`Skipping ${d.nome} — party "${d.siglaPartido}" not found`)
      return 'skipped'
    }

    const reconcileKey = `${d.siglaUf.toUpperCase()}|DEPUTADO FEDERAL|${normalizePersonName(d.nome)}`
    const existing = byTseId.get(tseId) ?? byReconcile.get(reconcileKey)

    const basePayload = {
      name: d.nome,
      partyId,
      office: 'Deputado Federal',
      state: d.siglaUf,
      electoralZone: d.siglaUf,
      status: PoliticianStatus.ATIVO,
    }

    if (existing) {
      const now = new Date()
      const keepStart =
        existing.termStart <= now && existing.termEnd >= now && leg.termStart > now
      const nextAvatar = d.urlFoto || existing.avatarUrl || null

      const saved = await this.prisma.politician.update({
        where: { id: existing.id },
        data: {
          ...basePayload,
          tseId, // promove registro pré-cadastrado pelo TSE (TSE-...) para o ID oficial da Câmara
          termStart: keepStart ? existing.termStart : leg.termStart,
          termEnd: leg.termEnd > existing.termEnd ? leg.termEnd : existing.termEnd,
          ...(nextAvatar !== null && { avatarUrl: nextAvatar }),
        },
        select: { id: true, tseId: true, termStart: true, termEnd: true, avatarUrl: true },
      })
      byTseId.set(tseId, saved)
      byReconcile.set(reconcileKey, saved)
      return 'updated'
    }

    const createdRecord = await this.prisma.politician.create({
      data: {
        ...basePayload,
        tseId,
        termStart: leg.termStart,
        termEnd: leg.termEnd,
        avatarUrl: d.urlFoto || null,
        verified: false,
      },
      select: { id: true, tseId: true, termStart: true, termEnd: true, avatarUrl: true },
    })
    byTseId.set(tseId, createdRecord)
    byReconcile.set(reconcileKey, createdRecord)
    return 'created'
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Câmara API ${res.status} — ${url}`)
    return res.json() as Promise<T>
  }

  private hasNextPage(links: Array<{ rel: string }>): boolean {
    return links.some((l) => l.rel === 'next')
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
