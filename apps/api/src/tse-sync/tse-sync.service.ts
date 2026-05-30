import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import AdmZip from 'adm-zip'
import { PrismaService } from '../prisma/prisma.service'

export const TSE_SYNC_QUEUE = 'tse-sync'

const TSE_2022_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'
const TSE_2024_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip'

// Mandatos 2022 (federal + estaduais): posse em jan/2023
const TERM_2022_START = new Date('2023-01-01')
const TERM_2022_END   = new Date('2026-12-31')

// Mandatos 2024 (municipais): posse em jan/2025
const TERM_2024_START = new Date('2025-01-01')
const TERM_2024_END   = new Date('2028-12-31')

// TSE SIT_TOT_TURNO que indicam candidato eleito
const ELEITO = new Set(['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'])

// Mapeamento DS_CARGO → nome do cargo para exibição
const OFFICE_LABEL: Record<string, string> = {
  'PRESIDENTE':                     'Presidente da República',
  'VICE-PRESIDENTE':                'Vice-Presidente da República',
  'GOVERNADOR':                     'Governador',
  'GOVERNADOR DO DISTRITO FEDERAL': 'Governador',
  'VICE-GOVERNADOR':                'Vice-Governador',
  'DEPUTADO ESTADUAL':              'Deputado Estadual',
  'DEPUTADO DISTRITAL':             'Deputado Distrital',
  'PREFEITO':                       'Prefeito',
  'VICE-PREFEITO':                  'Vice-Prefeito',
  'VEREADOR':                       'Vereador',
}

// Cargos de nível municipal (usam NM_UE como cidade)
const MUNICIPAL_CARGOS = new Set(['PREFEITO', 'VICE-PREFEITO', 'VEREADOR'])

export interface TseSyncResult {
  created: number
  updated: number
  skipped: number
  startedAt: Date
  finishedAt: Date
}

type TseRow = Record<string, string>

@Injectable()
export class TseSyncService {
  private readonly logger = new Logger(TseSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TSE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  // ── Trigger ───────────────────────────────────────────────────────────────

  async triggerSync(jobName: 'presidente-governadores' | 'prefeitos-dep-estaduais'): Promise<{ message: string }> {
    await this.queue.add(jobName, {}, {
      jobId: `tse-${jobName}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 5,
      removeOnFail: 5,
    })
    this.logger.log(`TSE sync job enqueued: ${jobName}`)
    return { message: `Sync TSE iniciado: ${jobName}` }
  }

  // ── Job handlers (chamados pelo processor) ────────────────────────────────

  async syncPresidenteGovernadores(): Promise<TseSyncResult> {
    const startedAt = new Date()
    this.logger.log('Syncing Presidente + Governadores from 2022 TSE data...')

    const rows = await this.downloadAndFilter(TSE_2022_URL, [
      'PRESIDENTE',
      'GOVERNADOR',
      'GOVERNADOR DO DISTRITO FEDERAL',
    ])

    const result = await this.upsertRows(rows, TERM_2022_START, TERM_2022_END)
    return { ...result, startedAt, finishedAt: new Date() }
  }

  async syncPrefeitosDepEstaduais(): Promise<TseSyncResult> {
    const startedAt = new Date()

    // Deputados Estaduais: eleições 2022
    this.logger.log('Syncing Deputados Estaduais from 2022 TSE data...')
    const rows2022 = await this.downloadAndFilter(TSE_2022_URL, [
      'DEPUTADO ESTADUAL',
      'DEPUTADO DISTRITAL',
    ])
    const result2022 = await this.upsertRows(rows2022, TERM_2022_START, TERM_2022_END)

    // Prefeitos + Vereadores: eleições 2024 — download único do arquivo ~60 MB
    this.logger.log('Syncing Prefeitos + Vereadores from 2024 TSE data (single download)...')
    const rows2024 = await this.downloadAndFilter(TSE_2024_URL, ['PREFEITO', 'VEREADOR'])
    const result2024 = await this.upsertRows(rows2024, TERM_2024_START, TERM_2024_END)

    return {
      created:    result2022.created + result2024.created,
      updated:    result2022.updated + result2024.updated,
      skipped:    result2022.skipped + result2024.skipped,
      startedAt,
      finishedAt: new Date(),
    }
  }

  // ── Download + parse ──────────────────────────────────────────────────────

  private async downloadAndFilter(url: string, cargos: string[]): Promise<TseRow[]> {
    this.logger.log(`Downloading ${url} (${cargos.join(', ')})...`)

    const response = await fetch(url)
    if (!response.ok) throw new Error(`TSE CDN ${response.status} — ${url}`)

    const arrayBuffer = await response.arrayBuffer()
    const zip = new AdmZip(Buffer.from(arrayBuffer))

    // O ZIP contém um arquivo BRASIL consolidado com todos os candidatos
    const entry = zip.getEntries().find((e) =>
      e.entryName.toUpperCase().includes('BRASIL') && e.entryName.endsWith('.csv'),
    )
    if (!entry) throw new Error(`BRASIL.csv not found in ${url}`)

    // ISO-8859-1 → Node.js string via latin1 (mesmo mapeamento de code points)
    const csv = zip.readFile(entry)!.toString('latin1')
    return this.filterCSV(csv, cargos)
  }

  private filterCSV(csv: string, cargos: string[]): TseRow[] {
    const lines = csv.split('\n')
    const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''))

    const cargoIdx = headers.indexOf('DS_CARGO')
    const sitIdx   = headers.indexOf('DS_SIT_TOT_TURNO')
    const turnoIdx = headers.indexOf('NR_TURNO')
    const targetSet = new Set(cargos)
    const results: TseRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      const cols = line.split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < headers.length - 2) continue  // linhas muito curtas são lixo

      if (!targetSet.has(cols[cargoIdx])) continue
      if (!ELEITO.has(cols[sitIdx])) continue

      // DS_SIT_TOT_TURNO === 'ELEITO' só aparece no turno final — sem duplicatas
      const row: TseRow = {}
      headers.forEach((h, idx) => { row[h] = cols[idx] ?? '' })
      results.push(row)
    }

    this.logger.log(`  → ${results.length} elected candidates found for ${cargos.join(', ')}`)
    return results
  }

  // ── Upsert ────────────────────────────────────────────────────────────────

  private async upsertRows(
    rows: TseRow[],
    termStart: Date,
    termEnd: Date,
  ): Promise<{ created: number; updated: number; skipped: number }> {
    // Cache de partidos — evita N queries individuais ao banco
    const allParties = await this.prisma.party.findMany({ select: { id: true, abbreviation: true } })
    const partyMap   = new Map(allParties.map((p) => [p.abbreviation, p.id]))

    let created = 0
    let updated = 0
    let skipped = 0

    for (const row of rows) {
      const result = await this.upsertRow(row, termStart, termEnd, partyMap)
      if (result === 'created') created++
      else if (result === 'updated') updated++
      else skipped++
    }

    return { created, updated, skipped }
  }

  private async upsertRow(
    row: TseRow,
    termStart: Date,
    termEnd: Date,
    partyMap: Map<string, string>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const tseId   = `TSE-${row['SQ_CANDIDATO']}`
    const partyId = partyMap.get(row['SG_PARTIDO'])

    if (!partyId) {
      this.logger.warn(`Skipping ${row['NM_URNA_CANDIDATO']} — party "${row['SG_PARTIDO']}" not found`)
      return 'skipped'
    }

    const cargo      = row['DS_CARGO']
    const uf         = row['SG_UF']
    const isMunicipal = MUNICIPAL_CARGOS.has(cargo)
    const city        = isMunicipal && row['NM_UE'] ? row['NM_UE'] : undefined

    const payload = {
      name:          row['NM_URNA_CANDIDATO'] || row['NM_CANDIDATO'],
      partyId,
      office:        OFFICE_LABEL[cargo] ?? cargo,
      state:         uf === 'BR' ? '' : uf,
      electoralZone: isMunicipal ? (row['NM_UE'] ?? uf) : (uf === 'BR' ? 'Nacional' : uf),
      termStart,
      termEnd,
      avatarUrl:     null,
      ...(city !== undefined && { city }),
    }

    await this.prisma.politician.upsert({
      where:  { tseId },
      update: payload,
      create: { ...payload, tseId, verified: false },
    })

    return 'created'  // upsert não distingue create/update — estatística simplificada
  }
}
