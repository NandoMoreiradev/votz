import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PoliticianStatus } from '@prisma/client'
import AdmZip from 'adm-zip'
import {
  TseCandidateRow,
  TSE_OFFICE_LABEL,
  TSE_MUNICIPAL_CARGOS,
  filterTseElectedRows,
  getLatestConcludedElectionYear,
  getTermDatesForCargo,
  getTseConsultaCandUrl,
  normalizeOfficeCategory,
  normalizePartyAbbreviation,
  normalizePersonName,
} from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'

export const TSE_SYNC_QUEUE = 'tse-sync'

export type TseJobName =
  | 'geral'
  | 'municipal'
  | 'presidente-governadores'
  | 'prefeitos-dep-estaduais'

export interface TseSyncResult {
  electionYear: number
  created: number
  updated: number
  reactivated: number
  skipped: number
  startedAt: Date
  finishedAt: Date
}

interface CachedParty {
  id: string
  abbreviation: string
  number: number
}

interface ExistingPoliticianRef {
  id: string
  tseId: string | null
  name: string
  office: string
  state: string
  city: string | null
  status: PoliticianStatus
  termStart: Date
  termEnd: Date
  avatarUrl: string | null
}

@Injectable()
export class TseSyncService {
  private readonly logger = new Logger(TseSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TSE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  // ── Trigger ───────────────────────────────────────────────────────────────

  async triggerSync(jobName: TseJobName, year?: number): Promise<{ message: string }> {
    await this.queue.add(
      jobName,
      { year },
      {
        jobId: `tse-${jobName}${year ? `-${year}` : ''}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    )
    this.logger.log(`TSE sync job enqueued: ${jobName}${year ? ` (year=${year})` : ''}`)
    return { message: `Sync TSE iniciado: ${jobName}${year ? ` (${year})` : ''}` }
  }

  // ── Job handlers (chamados pelo processor) ────────────────────────────────

  /**
   * Sincroniza TODOS os cargos eleitos na última eleição geral (Presidente, Governadores,
   * Senadores, Deputados Federais, Deputados Estaduais e Distritais).
   */
  async syncEleicaoGeral(explicitYear?: number): Promise<TseSyncResult> {
    const startedAt = new Date()
    const targetYear = explicitYear ?? getLatestConcludedElectionYear('general')
    const cargos = [
      'PRESIDENTE',
      'GOVERNADOR',
      'GOVERNADOR DO DISTRITO FEDERAL',
      'SENADOR',
      'DEPUTADO FEDERAL',
      'DEPUTADO ESTADUAL',
      'DEPUTADO DISTRITAL',
    ]

    const { year, rows } = await this.downloadWithFallback(targetYear, cargos, !explicitYear)
    const stats = await this.upsertRows(rows, year)

    return { electionYear: year, ...stats, startedAt, finishedAt: new Date() }
  }

  /**
   * Sincroniza Prefeitos e Vereadores da última eleição municipal.
   */
  async syncEleicaoMunicipal(explicitYear?: number): Promise<TseSyncResult> {
    const startedAt = new Date()
    const targetYear = explicitYear ?? getLatestConcludedElectionYear('municipal')
    const cargos = ['PREFEITO', 'VEREADOR']

    const { year, rows } = await this.downloadWithFallback(targetYear, cargos, !explicitYear)
    const stats = await this.upsertRows(rows, year)

    return { electionYear: year, ...stats, startedAt, finishedAt: new Date() }
  }

  /**
   * Mantido por compatibilidade — sincroniza Presidente + Governadores da eleição geral mais recente.
   */
  async syncPresidenteGovernadores(explicitYear?: number): Promise<TseSyncResult> {
    const startedAt = new Date()
    const targetYear = explicitYear ?? getLatestConcludedElectionYear('general')
    const cargos = ['PRESIDENTE', 'GOVERNADOR', 'GOVERNADOR DO DISTRITO FEDERAL']

    const { year, rows } = await this.downloadWithFallback(targetYear, cargos, !explicitYear)
    const stats = await this.upsertRows(rows, year)

    return { electionYear: year, ...stats, startedAt, finishedAt: new Date() }
  }

  /**
   * Mantido por compatibilidade — sincroniza Deputados Estaduais/Distritais (eleição geral mais recente)
   * + Prefeitos e Vereadores (eleição municipal mais recente).
   */
  async syncPrefeitosDepEstaduais(explicitYear?: number): Promise<TseSyncResult> {
    const startedAt = new Date()
    const generalYear = explicitYear ?? getLatestConcludedElectionYear('general')
    const municipalYear = getLatestConcludedElectionYear('municipal')

    const gen = await this.downloadWithFallback(
      generalYear,
      ['DEPUTADO ESTADUAL', 'DEPUTADO DISTRITAL'],
      !explicitYear,
    )
    const statsGen = await this.upsertRows(gen.rows, gen.year)

    const mun = await this.downloadWithFallback(municipalYear, ['PREFEITO', 'VEREADOR'], true)
    const statsMun = await this.upsertRows(mun.rows, mun.year)

    return {
      electionYear: gen.year,
      created: statsGen.created + statsMun.created,
      updated: statsGen.updated + statsMun.updated,
      reactivated: statsGen.reactivated + statsMun.reactivated,
      skipped: statsGen.skipped + statsMun.skipped,
      startedAt,
      finishedAt: new Date(),
    }
  }

  // ── Download + parse ──────────────────────────────────────────────────────

  private async downloadWithFallback(
    year: number,
    cargos: string[],
    allowFallback: boolean,
  ): Promise<{ year: number; rows: TseCandidateRow[] }> {
    try {
      const rows = await this.downloadAndFilter(getTseConsultaCandUrl(year), cargos)
      return { year, rows }
    } catch (err) {
      if (allowFallback && (err as Error).message.includes('404')) {
        const fallbackYear = year - 4
        this.logger.warn(
          `TSE ZIP for ${year} returned 404 — falling back to ${fallbackYear}`,
        )
        const rows = await this.downloadAndFilter(getTseConsultaCandUrl(fallbackYear), cargos)
        return { year: fallbackYear, rows }
      }
      throw err
    }
  }

  private async downloadAndFilter(url: string, cargos: string[]): Promise<TseCandidateRow[]> {
    this.logger.log(`Downloading ${url} (${cargos.join(', ')})...`)

    const response = await fetch(url)
    if (!response.ok) throw new Error(`TSE CDN ${response.status} — ${url}`)

    const arrayBuffer = await response.arrayBuffer()
    const zip = new AdmZip(Buffer.from(arrayBuffer))

    const entry = zip.getEntries().find(
      (e) => e.entryName.toUpperCase().includes('BRASIL') && e.entryName.endsWith('.csv'),
    )
    if (!entry) throw new Error(`BRASIL.csv not found in ${url}`)

    const csv = zip.readFile(entry)!.toString('latin1')
    const results = filterTseElectedRows(csv, cargos)
    this.logger.log(`  → ${results.length} elected candidates found for ${cargos.join(', ')}`)
    return results
  }

  // ── Upsert & Reconciliation ───────────────────────────────────────────────

  private async loadPartyCaches() {
    const allParties = await this.prisma.party.findMany({
      select: { id: true, abbreviation: true, number: true },
    })
    const byAbbrev = new Map<string, CachedParty>()
    const byNumber = new Map<number, CachedParty>()
    for (const p of allParties) {
      byAbbrev.set(p.abbreviation.toUpperCase(), p)
      byNumber.set(p.number, p)
    }
    return { byAbbrev, byNumber }
  }

  private async resolvePartyId(
    row: TseCandidateRow,
    byAbbrev: Map<string, CachedParty>,
    byNumber: Map<number, CachedParty>,
  ): Promise<string | null> {
    const rawSigla = (row['SG_PARTIDO'] ?? '').trim()
    if (!rawSigla) return null

    const normalized = normalizePartyAbbreviation(rawSigla)
    const foundByAbbr = byAbbrev.get(normalized.toUpperCase()) ?? byAbbrev.get(rawSigla.toUpperCase())
    if (foundByAbbr) return foundByAbbr.id

    const num = Number(row['NR_PARTIDO'])
    if (!Number.isNaN(num) && num > 0) {
      const foundByNum = byNumber.get(num)
      if (foundByNum) return foundByNum.id

      const created = await this.prisma.party.upsert({
        where: { abbreviation: normalized },
        update: {},
        create: {
          abbreviation: normalized,
          name: (row['NM_PARTIDO'] ?? normalized).trim() || normalized,
          number: num,
          active: true,
        },
        select: { id: true, abbreviation: true, number: true },
      })
      byAbbrev.set(created.abbreviation.toUpperCase(), created)
      byNumber.set(created.number, created)
      return created.id
    }

    return null
  }

  private buildReconcileKey(
    state: string,
    office: string,
    name: string,
    city?: string | null,
  ): string {
    const cat = normalizeOfficeCategory(office)
    const normCity = city ? normalizePersonName(city) : ''
    return `${state.toUpperCase()}|${cat}|${normCity}|${normalizePersonName(name)}`
  }

  private async upsertRows(
    rows: TseCandidateRow[],
    electionYear: number,
  ): Promise<{ created: number; updated: number; reactivated: number; skipped: number }> {
    const { byAbbrev, byNumber } = await this.loadPartyCaches()

    const existingAll = await this.prisma.politician.findMany({
      select: {
        id: true,
        tseId: true,
        name: true,
        office: true,
        state: true,
        city: true,
        status: true,
        termStart: true,
        termEnd: true,
        avatarUrl: true,
      },
    })

    const byTseId = new Map<string, ExistingPoliticianRef>()
    const byReconcileKey = new Map<string, ExistingPoliticianRef>()

    for (const p of existingAll) {
      if (p.tseId) byTseId.set(p.tseId, p)
      const key = this.buildReconcileKey(p.state, p.office, p.name, p.city)
      byReconcileKey.set(key, p)
    }

    let created = 0
    let updated = 0
    let reactivated = 0
    let skipped = 0
    const now = new Date()

    for (const row of rows) {
      const partyId = await this.resolvePartyId(row, byAbbrev, byNumber)
      if (!partyId) {
        this.logger.warn(`Skipping ${row['NM_URNA_CANDIDATO']} — party "${row['SG_PARTIDO']}" missing`)
        skipped++
        continue
      }

      const tseId = `TSE-${row['SQ_CANDIDATO']}`
      const cargo = (row['DS_CARGO'] ?? '').trim().toUpperCase()
      const uf = (row['SG_UF'] ?? '').trim()
      const state = uf === 'BR' ? '' : uf
      const isMunicipal = TSE_MUNICIPAL_CARGOS.has(cargo)
      const city = isMunicipal && row['NM_UE'] ? row['NM_UE'].trim() : undefined
      const office = TSE_OFFICE_LABEL[cargo] ?? row['DS_CARGO']
      const displayName = (row['NM_URNA_CANDIDATO'] || row['NM_CANDIDATO'] || '').trim()
      const fullName = (row['NM_CANDIDATO'] || displayName).trim()
      const electoralZone = isMunicipal ? (row['NM_UE'] ?? state) : state === '' ? 'Nacional' : state
      const { termStart, termEnd } = getTermDatesForCargo(cargo, electionYear)

      const existing =
        byTseId.get(tseId) ??
        byReconcileKey.get(this.buildReconcileKey(state, office, displayName, city)) ??
        byReconcileKey.get(this.buildReconcileKey(state, office, fullName, city))

      if (existing) {
        // Preserva o termStart atual caso o político esteja no meio de um mandato vigente
        const keepCurrentStart =
          existing.termStart <= now && existing.termEnd >= now && termStart > now
        // Preserva IDs oficiais da Câmara (numérico) ou Senado (SEN-...)
        const shouldUpdateTseId = !existing.tseId || existing.tseId.startsWith('TSE-')
        const wasEnded = existing.status === PoliticianStatus.ENCERRADO

        const updatedRecord = await this.prisma.politician.update({
          where: { id: existing.id },
          data: {
            name: displayName,
            partyId,
            office,
            state,
            electoralZone,
            ...(city !== undefined && { city }),
            termStart: keepCurrentStart ? existing.termStart : termStart,
            termEnd: termEnd > existing.termEnd ? termEnd : existing.termEnd,
            status: PoliticianStatus.ATIVO,
            ...(shouldUpdateTseId && { tseId }),
          },
          select: {
            id: true,
            tseId: true,
            name: true,
            office: true,
            state: true,
            city: true,
            status: true,
            termStart: true,
            termEnd: true,
            avatarUrl: true,
          },
        })

        if (updatedRecord.tseId) byTseId.set(updatedRecord.tseId, updatedRecord)
        byReconcileKey.set(
          this.buildReconcileKey(state, office, displayName, city),
          updatedRecord,
        )

        if (wasEnded) reactivated++
        else updated++
      } else {
        const createdRecord = await this.prisma.politician.create({
          data: {
            tseId,
            name: displayName,
            partyId,
            office,
            state,
            electoralZone,
            ...(city !== undefined && { city }),
            termStart,
            termEnd,
            avatarUrl: null,
            verified: false,
            status: PoliticianStatus.ATIVO,
          },
          select: {
            id: true,
            tseId: true,
            name: true,
            office: true,
            state: true,
            city: true,
            status: true,
            termStart: true,
            termEnd: true,
            avatarUrl: true,
          },
        })

        byTseId.set(tseId, createdRecord)
        byReconcileKey.set(
          this.buildReconcileKey(state, office, displayName, city),
          createdRecord,
        )
        created++
      }
    }

    return { created, updated, reactivated, skipped }
  }
}
