import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { HOUR_MS, windowedJobId } from '../common/queue/job-window'
import { PoliticianStatus } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'
import {
  normalizePartyAbbreviation,
  normalizePersonName,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'

export const SENADO_SYNC_QUEUE = 'senado-sync'
const SENADO_URL = 'https://legis.senado.leg.br/dadosabertos/senador/lista/atual'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (tagName) => ['Parlamentar', 'Mandato'].includes(tagName),
})

interface SenadoIdentificacao {
  CodigoParlamentar: number | string
  NomeParlamentar: string
  NomeCompletoParlamentar?: string
  FormaTratamento: string
  SiglaPartidoParlamentar: string
  UfParlamentar: string
  UrlFotoParlamentar?: string
}

interface SenadoLegislatura {
  NumeroLegislatura?: number
  DataInicio: string
  DataFim: string
}

interface SenadoMandato {
  DescricaoParticipacao: string
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
        jobId: windowedJobId('senado-full-sync', HOUR_MS),
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

    const allParties = await this.prisma.party.findMany({
      select: { id: true, abbreviation: true },
    })
    const partyMap = new Map(allParties.map((p) => [p.abbreviation.toUpperCase(), p.id]))

    const existingSen = await this.prisma.politician.findMany({
      where: { office: { contains: 'Senador', mode: 'insensitive' } },
      select: { id: true, tseId: true, name: true, state: true, termStart: true, termEnd: true, avatarUrl: true },
    })
    const byTseId = new Map(existingSen.filter((p) => p.tseId).map((p) => [p.tseId!, p]))
    const byReconcile = new Map(
      existingSen.map((p) => [`${p.state.toUpperCase()}|${normalizePersonName(p.name)}`, p]),
    )

    let created = 0
    let updated = 0
    let skipped = 0

    for (const p of parlamentares) {
      const result = await this.upsertSenador(p, partyMap, byTseId, byReconcile)
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

  private async fetchSenadores(): Promise<SenadoParlamentar[]> {
    const res = await fetch(SENADO_URL, {
      headers: { Accept: 'application/xml' },
    })
    if (!res.ok) throw new Error(`Senado API ${res.status}`)

    const xml = await res.text()
    const parsed = xmlParser.parse(xml)

    const parlamentares: SenadoParlamentar[] =
      parsed?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ??
      parsed?.Parlamentares?.Parlamentar ??
      []

    return parlamentares.filter((p) => {
      const mandatos: SenadoMandato[] = p.Mandatos?.Mandato ?? []
      return mandatos.some((m) => m.DescricaoParticipacao === 'Titular')
    })
  }

  private async upsertSenador(
    p: SenadoParlamentar,
    partyMap: Map<string, string>,
    byTseId: Map<string, { id: string; tseId: string | null; termStart: Date; termEnd: Date; avatarUrl: string | null }>,
    byReconcile: Map<string, { id: string; tseId: string | null; termStart: Date; termEnd: Date; avatarUrl: string | null }>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const id = p.IdentificacaoParlamentar
    const tseId = `SEN-${id.CodigoParlamentar}`

    const sigla = normalizePartyAbbreviation(id.SiglaPartidoParlamentar)
    const partyId =
      partyMap.get(sigla.toUpperCase()) ?? partyMap.get(id.SiglaPartidoParlamentar.toUpperCase())

    if (!partyId) {
      this.logger.warn(
        `Skipping ${id.NomeParlamentar} — party "${id.SiglaPartidoParlamentar}" not found`,
      )
      return 'skipped'
    }

    const mandatos: SenadoMandato[] = p.Mandatos?.Mandato ?? []
    const mandato = mandatos.find((m) => m.DescricaoParticipacao === 'Titular')

    const termStart = mandato?.PrimeiraLegislatura?.DataInicio
      ? new Date(`${mandato.PrimeiraLegislatura.DataInicio}T00:00:00.000Z`)
      : new Date('2023-02-01T00:00:00.000Z')

    const termEnd = mandato?.SegundaLegislatura?.DataFim
      ? new Date(`${mandato.SegundaLegislatura.DataFim}T23:59:59.999Z`)
      : mandato?.PrimeiraLegislatura?.DataFim
        ? new Date(`${mandato.PrimeiraLegislatura.DataFim}T23:59:59.999Z`)
        : new Date('2031-01-31T23:59:59.999Z')

    const office = id.FormaTratamento ?? 'Senador(a)'
    const officialPhoto =
      id.UrlFotoParlamentar ??
      `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${id.CodigoParlamentar}.jpg`

    const reconcileKeyParl = `${id.UfParlamentar.toUpperCase()}|${normalizePersonName(id.NomeParlamentar)}`
    const reconcileKeyFull = id.NomeCompletoParlamentar
      ? `${id.UfParlamentar.toUpperCase()}|${normalizePersonName(id.NomeCompletoParlamentar)}`
      : reconcileKeyParl

    const existing =
      byTseId.get(tseId) ?? byReconcile.get(reconcileKeyParl) ?? byReconcile.get(reconcileKeyFull)

    const payload = {
      name: id.NomeParlamentar,
      partyId,
      office,
      state: id.UfParlamentar,
      electoralZone: id.UfParlamentar,
      status: PoliticianStatus.ATIVO,
    }

    if (existing) {
      const nextAvatar = officialPhoto || existing.avatarUrl || null
      const saved = await this.prisma.politician.update({
        where: { id: existing.id },
        data: {
          ...payload,
          tseId,
          termStart: existing.termStart < termStart ? existing.termStart : termStart,
          termEnd: termEnd > existing.termEnd ? termEnd : existing.termEnd,
          ...(nextAvatar !== null && { avatarUrl: nextAvatar }),
        },
        select: { id: true, tseId: true, termStart: true, termEnd: true, avatarUrl: true },
      })
      byTseId.set(tseId, saved)
      byReconcile.set(reconcileKeyParl, saved)
      return 'updated'
    }

    const createdRecord = await this.prisma.politician.create({
      data: {
        ...payload,
        tseId,
        termStart,
        termEnd,
        avatarUrl: officialPhoto,
        verified: false,
      },
      select: { id: true, tseId: true, termStart: true, termEnd: true, avatarUrl: true },
    })
    byTseId.set(tseId, createdRecord)
    byReconcile.set(reconcileKeyParl, createdRecord)
    return 'created'
  }
}
