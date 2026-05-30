import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { XMLParser } from 'fast-xml-parser'
import { PrismaService } from '../prisma/prisma.service'

export const SENADO_SYNC_QUEUE = 'senado-sync'
const SENADO_URL = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual'

// fast-xml-parser configurado para sempre retornar arrays nos elementos-chave
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (tagName) => ['Parlamentar', 'Mandato'].includes(tagName),
})

// ── Tipos da API do Senado ────────────────────────────────────────────────────

interface SenadoIdentificacao {
  CodigoParlamentar: number | string
  NomeParlamentar: string
  FormaTratamento: string        // "Senador" | "Senadora"
  SiglaPartidoParlamentar: string
  UfParlamentar: string
  UrlFotoParlamentar?: string
}

interface SenadoLegislatura {
  NumeroLegislatura?: number
  DataInicio: string             // YYYY-MM-DD
  DataFim: string
}

interface SenadoMandato {
  DescricaoParticipacao: string  // "Titular" | "1º Suplente" | "2º Suplente"
  PrimeiraLegislatura?: SenadoLegislatura
  SegundaLegislatura?: SenadoLegislatura
}

interface SenadoParlamentar {
  IdentificacaoParlamentar: SenadoIdentificacao
  Mandatos?: {
    Mandato: SenadoMandato[]
  }
}

export interface SyncResult {
  created: number
  updated: number
  skipped: number
  startedAt: Date
  finishedAt: Date
}

@Injectable()
export class SenadoSyncService {
  private readonly logger = new Logger(SenadoSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SENADO_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async triggerSync(): Promise<{ message: string }> {
    await this.queue.add(
      'full-sync',
      {},
      {
        jobId: 'senado-full-sync',
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    )
    this.logger.log('Senado sync job enqueued')
    return { message: 'Sync do Senado Federal iniciado.' }
  }

  async runSync(): Promise<SyncResult> {
    const startedAt = new Date()
    this.logger.log('Senado sync started')

    const parlamentares = await this.fetchSenadores()
    this.logger.log(`Fetched ${parlamentares.length} senators from API`)

    let created = 0
    let updated = 0
    let skipped = 0

    for (const p of parlamentares) {
      const result = await this.upsertSenador(p)
      if (result === 'created') created++
      else if (result === 'updated') updated++
      else skipped++
    }

    const result: SyncResult = {
      created,
      updated,
      skipped,
      startedAt,
      finishedAt: new Date(),
    }

    this.logger.log(
      `Senado sync finished — created: ${created}, updated: ${updated}, skipped: ${skipped} ` +
      `(${result.finishedAt.getTime() - startedAt.getTime()}ms)`,
    )

    return result
  }

  // ── Fetch & parse ─────────────────────────────────────────────────────────

  private async fetchSenadores(): Promise<SenadoParlamentar[]> {
    const res = await fetch(SENADO_URL, {
      headers: { Accept: 'application/xml' },
    })
    if (!res.ok) throw new Error(`Senado API ${res.status}`)

    const xml = await res.text()
    const parsed = xmlParser.parse(xml)

    // O envelope raiz pode variar — tenta os dois caminhos conhecidos
    const parlamentares: SenadoParlamentar[] =
      parsed?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ??
      parsed?.Parlamentares?.Parlamentar ??
      []

    // Filtra apenas titulares
    return parlamentares.filter((p) => {
      const mandatos: SenadoMandato[] = p.Mandatos?.Mandato ?? []
      return mandatos.some((m) => m.DescricaoParticipacao === 'Titular')
    })
  }

  // ── Upsert ────────────────────────────────────────────────────────────────

  private async upsertSenador(p: SenadoParlamentar): Promise<'created' | 'updated' | 'skipped'> {
    const id = p.IdentificacaoParlamentar
    const tseId = `SEN-${id.CodigoParlamentar}`

    const party = await this.prisma.party.findFirst({
      where: { abbreviation: id.SiglaPartidoParlamentar },
      select: { id: true },
    })

    if (!party) {
      this.logger.warn(`Skipping ${id.NomeParlamentar} — party "${id.SiglaPartidoParlamentar}" not found`)
      return 'skipped'
    }

    // Pega o mandato titular para extrair datas
    const mandatos: SenadoMandato[] = p.Mandatos?.Mandato ?? []
    const mandato = mandatos.find((m) => m.DescricaoParticipacao === 'Titular')

    // Início do mandato (1ª legislatura)
    const termStart = mandato?.PrimeiraLegislatura?.DataInicio
      ? new Date(mandato.PrimeiraLegislatura.DataInicio)
      : new Date('2023-02-01')

    // Fim do mandato completo (8 anos = 2 legislaturas)
    const termEnd = mandato?.SegundaLegislatura?.DataFim
      ? new Date(mandato.SegundaLegislatura.DataFim)
      : mandato?.PrimeiraLegislatura?.DataFim
        ? new Date(mandato.PrimeiraLegislatura.DataFim)
        : new Date('2031-01-31')

    // "Senador" ou "Senadora" a partir do FormaTratamento
    const office = id.FormaTratamento ?? 'Senador(a)'

    const payload = {
      name:          id.NomeParlamentar,
      partyId:       party.id,
      office,
      state:         id.UfParlamentar,
      electoralZone: id.UfParlamentar,  // senadores representam o estado inteiro
      termStart,
      termEnd,
      avatarUrl:     id.UrlFotoParlamentar ?? null,
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
}
