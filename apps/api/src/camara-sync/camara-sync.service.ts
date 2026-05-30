import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../prisma/prisma.service'

export const CAMARA_SYNC_QUEUE = 'camara-sync'
const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
const PAGE_SIZE = 100

// Legislatura 57: 01/02/2023 → 31/01/2027
const LEG_57_START = new Date('2023-02-01')
const LEG_57_END   = new Date('2027-01-31')

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

  async triggerSync(): Promise<{ message: string }> {
    await this.queue.add(
      'full-sync',
      {},
      {
        jobId: 'camara-full-sync',
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    )
    this.logger.log('Câmara sync job enqueued')
    return { message: 'Sync da Câmara dos Deputados iniciado.' }
  }

  async runSync(): Promise<SyncResult> {
    const startedAt = new Date()
    this.logger.log('Câmara sync started')

    const partiesCount = await this.syncParties()
    this.logger.log(`Parties synced: ${partiesCount}`)

    const { created, updated, skipped } = await this.syncDeputies()
    this.logger.log(`Deputies — created: ${created}, updated: ${updated}, skipped: ${skipped}`)

    const result: SyncResult = {
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

  // ── Parties ──────────────────────────────────────────────────────────────────

  private async syncParties(): Promise<number> {
    let page = 1
    let total = 0

    while (true) {
      const url = `${CAMARA_BASE}/partidos?itens=${PAGE_SIZE}&pagina=${page}&ordem=ASC&ordenarPor=sigla`
      const data = await this.fetchJson<CamaraPage<CamaraParty>>(url)

      for (const p of data.dados) {
        await this.prisma.party.upsert({
          where:  { abbreviation: p.sigla },
          update: { name: p.nome },
          create: {
            abbreviation: p.sigla,
            name:   p.nome,
            number: p.id,   // Câmara party ID — TSE electoral numbers are < 100, no conflict
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

  private async syncDeputies(): Promise<{ created: number; updated: number; skipped: number }> {
    let page = 1
    let created = 0
    let updated = 0
    let skipped = 0

    while (true) {
      const url = `${CAMARA_BASE}/deputados?itens=${PAGE_SIZE}&pagina=${page}&idLegislatura=57&ordem=ASC&ordenarPor=nome`
      const data = await this.fetchJson<CamaraPage<CamaraDeputado>>(url)

      for (const d of data.dados) {
        const result = await this.upsertDeputado(d)
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

  private async upsertDeputado(d: CamaraDeputado): Promise<'created' | 'updated' | 'skipped'> {
    const tseId = String(d.id)

    const party = await this.prisma.party.findFirst({
      where: { abbreviation: d.siglaPartido },
      select: { id: true },
    })

    if (!party) {
      this.logger.warn(`Skipping ${d.nome} — party "${d.siglaPartido}" not found`)
      return 'skipped'
    }

    const payload = {
      name:          d.nome,
      partyId:       party.id,
      office:        'Deputado Federal',
      state:         d.siglaUf,
      electoralZone: d.siglaUf,  // deputados concorrem pelo estado inteiro
      termStart:     LEG_57_START,
      termEnd:       LEG_57_END,
      avatarUrl:     d.urlFoto || null,
    }

    const existing = await this.prisma.politician.findUnique({
      where: { tseId },
      select: { id: true },
    })

    if (existing) {
      await this.prisma.politician.update({ where: { tseId }, data: payload })
      return 'updated'
    }

    await this.prisma.politician.create({ data: { ...payload, tseId, verified: false } })
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
