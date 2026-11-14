/**
 * Script Nível A de importação e atualização de dados públicos (Políticos + Partidos + Municípios).
 *
 * Execução:
 *   npm run db:import-public
 *   npm run db:import-public -- --general-year=2026 --municipal-year=2024
 *   npm run db:import-public -- --only=parties,geral
 *   npm run db:import-public -- --dry-run
 *
 * O que sincroniza:
 *   1. Partidos políticos (Câmara dos Deputados + auto-criação a partir do TSE se ausente)
 *   2. Deputados Federais em exercício (Câmara — descoberta dinâmica da legislatura ativa)
 *   3. Senadores Federais em exercício (Senado Federal — apenas titulares)
 *   4. Eleição Geral mais recente (padrão 2026 via TSE: Presidente, Governadores,
 *      Senadores eleitos, Deputados Federais eleitos, Deputados Estaduais/Distritais eleitos)
 *      com reconciliação anti-duplicidade de reeleitos e preservação de fotos/IDs oficiais
 *   5. Eleição Municipal mais recente (padrão 2024 via TSE: Prefeitos + Vereadores)
 *   6. Prefeituras Municipais (5.570 municípios brasileiros via IBGE)
 */

import { PrismaClient, EntityType, PoliticianStatus } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'
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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (tagName) => ['Parlamentar', 'Mandato'].includes(tagName),
})

const prisma = new PrismaClient()

const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1'
const PAGE_SIZE = 100

const ALL_STEPS = new Set(['parties', 'camara', 'senado', 'geral', 'municipal', 'municipios'])

// ── CLI Args ──────────────────────────────────────────────────────────────────

interface CliOptions {
  generalYear: number
  municipalYear: number
  steps: Set<string>
  dryRun: boolean
}

function parseCliArgs(argv: string[]): CliOptions {
  let generalYear = getLatestConcludedElectionYear('general')
  let municipalYear = getLatestConcludedElectionYear('municipal')
  let steps = new Set(ALL_STEPS)
  let dryRun = false

  for (const arg of argv) {
    if (arg.startsWith('--general-year=')) {
      const n = Number(arg.split('=')[1])
      if (!Number.isNaN(n) && n >= 2018) generalYear = n
    } else if (arg.startsWith('--municipal-year=')) {
      const n = Number(arg.split('=')[1])
      if (!Number.isNaN(n) && n >= 2020) municipalYear = n
    } else if (arg.startsWith('--only=')) {
      const list = arg
        .split('=')[1]
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => ALL_STEPS.has(s))
      if (list.length > 0) steps = new Set(list)
    } else if (arg === '--dry-run') {
      dryRun = true
    }
  }

  return { generalYear, municipalYear, steps, dryRun }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
      if (attempt < retries) await sleep(1000 * attempt)
    }
  }
  throw lastErr
}

function hasNext(links: Array<{ rel: string }>): boolean {
  return links.some((l) => l.rel === 'next')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function reconcileKey(state: string, office: string, name: string, city?: string | null): string {
  const cat = normalizeOfficeCategory(office)
  const normCity = city ? normalizePersonName(city) : ''
  return `${state.toUpperCase()}|${cat}|${normCity}|${normalizePersonName(name)}`
}

interface CachedParty {
  id: string
  abbreviation: string
  number: number
}

interface PoliticianRef {
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

async function loadPartyCaches() {
  const allParties = await prisma.party.findMany({
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

async function resolveOrCreateParty(
  rawSigla: string,
  byAbbrev: Map<string, CachedParty>,
  byNumber: Map<number, CachedParty>,
  dryRun: boolean,
  partyNumber?: number,
  partyName?: string,
): Promise<string | null> {
  const sigla = normalizePartyAbbreviation(rawSigla)
  if (!sigla) return null

  const foundByAbbr = byAbbrev.get(sigla.toUpperCase()) ?? byAbbrev.get(rawSigla.trim().toUpperCase())
  if (foundByAbbr) return foundByAbbr.id

  if (partyNumber && !Number.isNaN(partyNumber)) {
    const foundByNum = byNumber.get(partyNumber)
    if (foundByNum) return foundByNum.id

    if (dryRun) return `dry-party-${sigla}`

    const created = await prisma.party.upsert({
      where: { abbreviation: sigla },
      update: {},
      create: {
        abbreviation: sigla,
        name: partyName?.trim() || sigla,
        number: partyNumber,
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

async function loadPoliticianIndex() {
  const all = await prisma.politician.findMany({
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
  const byTseId = new Map<string, PoliticianRef>()
  const byReconcile = new Map<string, PoliticianRef>()
  for (const p of all) {
    if (p.tseId) byTseId.set(p.tseId, p)
    byReconcile.set(reconcileKey(p.state, p.office, p.name, p.city), p)
  }
  return { byTseId, byReconcile }
}

// ── 1. Partidos ───────────────────────────────────────────────────────────────

async function syncParties(dryRun: boolean): Promise<number> {
  console.log('\n📋 Sincronizando partidos...')
  let page = 1
  let total = 0

  while (true) {
    const { dados, links } = await fetchJson<any>(
      `${CAMARA_BASE}/partidos?itens=${PAGE_SIZE}&pagina=${page}&ordem=ASC&ordenarPor=sigla`,
    )

    for (const p of dados) {
      const sigla = normalizePartyAbbreviation(p.sigla)
      if (!dryRun) {
        await prisma.party.upsert({
          where: { abbreviation: sigla },
          update: { name: p.nome },
          create: { abbreviation: sigla, name: p.nome, number: p.id, active: true },
        })
      }
      total++
    }

    process.stdout.write(`  Partidos: ${total}\r`)
    if (!hasNext(links) || dados.length === 0) break
    page++
    await sleep(300)
  }

  console.log(`  ✓ ${total} partidos sincronizados`)
  return total
}

// ── 2. Deputados Federais (Legislatura dinâmica) ──────────────────────────────

async function resolveActiveLegislatura(): Promise<{ id: number; start: Date; end: Date }> {
  const data = await fetchJson<any>(`${CAMARA_BASE}/legislaturas?ordem=DESC&ordenarPor=id&itens=5`)
  const list: Array<{ id: number; dataInicio: string; dataFim: string }> = data?.dados ?? []
  const now = new Date()
  const active =
    list.find((l) => new Date(l.dataInicio) <= now && now <= new Date(l.dataFim)) ?? list[0]

  if (!active) {
    return {
      id: 57,
      start: new Date('2023-02-01T00:00:00.000Z'),
      end: new Date('2027-01-31T23:59:59.999Z'),
    }
  }
  return {
    id: active.id,
    start: new Date(`${active.dataInicio}T00:00:00.000Z`),
    end: new Date(`${active.dataFim}T23:59:59.999Z`),
  }
}

async function syncDeputados(dryRun: boolean): Promise<{ created: number; updated: number; skipped: number }> {
  const leg = await resolveActiveLegislatura()
  console.log(`\n🏛️  Sincronizando deputados federais (Câmara — Legislatura ${leg.id})...`)

  const { byAbbrev, byNumber } = await loadPartyCaches()
  const { byTseId, byReconcile } = await loadPoliticianIndex()

  let page = 1
  let created = 0
  let updated = 0
  let skipped = 0
  const now = new Date()

  while (true) {
    const { dados, links } = await fetchJson<any>(
      `${CAMARA_BASE}/deputados?itens=${PAGE_SIZE}&pagina=${page}&idLegislatura=${leg.id}&ordem=ASC&ordenarPor=nome`,
    )

    for (const d of dados) {
      const tseId = String(d.id)
      const partyId = await resolveOrCreateParty(d.siglaPartido, byAbbrev, byNumber, dryRun)
      if (!partyId) {
        skipped++
        continue
      }

      const key = reconcileKey(d.siglaUf, 'Deputado Federal', d.nome)
      const existing = byTseId.get(tseId) ?? byReconcile.get(key)

      if (existing) {
        const keepStart = existing.termStart <= now && existing.termEnd >= now && leg.start > now
        const nextAvatar = d.urlFoto || existing.avatarUrl || null
        if (!dryRun) {
          await prisma.politician.update({
            where: { id: existing.id },
            data: {
              tseId,
              name: d.nome,
              partyId,
              office: 'Deputado Federal',
              state: d.siglaUf,
              electoralZone: d.siglaUf,
              status: PoliticianStatus.ATIVO,
              termStart: keepStart ? existing.termStart : leg.start,
              termEnd: leg.end > existing.termEnd ? leg.end : existing.termEnd,
              ...(nextAvatar !== null && { avatarUrl: nextAvatar }),
            },
          })
        }
        updated++
      } else {
        if (!dryRun) {
          await prisma.politician.create({
            data: {
              tseId,
              name: d.nome,
              partyId,
              office: 'Deputado Federal',
              state: d.siglaUf,
              electoralZone: d.siglaUf,
              termStart: leg.start,
              termEnd: leg.end,
              avatarUrl: d.urlFoto || null,
              verified: false,
              status: PoliticianStatus.ATIVO,
            },
          })
        }
        created++
      }
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
    if (!hasNext(links) || dados.length === 0) break
    page++
    await sleep(400)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── 3. Senadores Federais ─────────────────────────────────────────────────────

async function syncSenadores(dryRun: boolean): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('\n🏛️  Sincronizando senadores federais em exercício (Senado Federal)...')

  const res = await fetch('https://legis.senado.leg.br/dadosabertos/senador/lista/atual', {
    headers: { Accept: 'application/xml' },
  })
  if (!res.ok) throw new Error(`Senado API ${res.status}`)

  const xml = await res.text()
  const parsed = xmlParser.parse(xml)

  const parlamentares: any[] =
    parsed?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ??
    parsed?.Parlamentares?.Parlamentar ??
    []

  const titulares = parlamentares.filter((p) => {
    const mandato = Array.isArray(p.Mandato) ? p.Mandato[0] : p.Mandato
    return mandato?.DescricaoParticipacao === 'Titular'
  })

  console.log(`  ${titulares.length} senadores titulares encontrados`)

  const { byAbbrev, byNumber } = await loadPartyCaches()
  const { byTseId, byReconcile } = await loadPoliticianIndex()

  let created = 0
  let updated = 0
  let skipped = 0

  for (const p of titulares) {
    const id = p.IdentificacaoParlamentar
    const tseId = `SEN-${id.CodigoParlamentar}`
    const partyId = await resolveOrCreateParty(id.SiglaPartidoParlamentar, byAbbrev, byNumber, dryRun)

    if (!partyId) {
      console.log(`\n  ⚠ Partido "${id.SiglaPartidoParlamentar}" não encontrado para ${id.NomeParlamentar}`)
      skipped++
      continue
    }

    const mandato = Array.isArray(p.Mandato) ? p.Mandato[0] : p.Mandato
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

    const existing =
      byTseId.get(tseId) ??
      byReconcile.get(reconcileKey(id.UfParlamentar, office, id.NomeParlamentar)) ??
      (id.NomeCompletoParlamentar
        ? byReconcile.get(reconcileKey(id.UfParlamentar, office, id.NomeCompletoParlamentar))
        : undefined)

    if (existing) {
      const nextAvatar = officialPhoto || existing.avatarUrl || null
      if (!dryRun) {
        await prisma.politician.update({
          where: { id: existing.id },
          data: {
            tseId,
            name: id.NomeParlamentar,
            partyId,
            office,
            state: id.UfParlamentar,
            electoralZone: id.UfParlamentar,
            status: PoliticianStatus.ATIVO,
            termStart: existing.termStart < termStart ? existing.termStart : termStart,
            termEnd: termEnd > existing.termEnd ? termEnd : existing.termEnd,
            ...(nextAvatar !== null && { avatarUrl: nextAvatar }),
          },
        })
      }
      updated++
    } else {
      if (!dryRun) {
        await prisma.politician.create({
          data: {
            tseId,
            name: id.NomeParlamentar,
            partyId,
            office,
            state: id.UfParlamentar,
            electoralZone: id.UfParlamentar,
            termStart,
            termEnd,
            avatarUrl: officialPhoto,
            verified: false,
            status: PoliticianStatus.ATIVO,
          },
        })
      }
      created++
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── 4 & 5. Importação TSE (Eleição Geral e Eleição Municipal) ────────────────

async function downloadAndFilterTSE(url: string, cargos: string[]): Promise<TseCandidateRow[]> {
  console.log(`  Baixando ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TSE CDN ${res.status} — ${url}`)

  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()))
  const entry = zip
    .getEntries()
    .find((e) => e.entryName.toUpperCase().includes('BRASIL') && e.entryName.endsWith('.csv'))
  if (!entry) throw new Error('BRASIL.csv not found in ZIP')

  const csv = zip.readFile(entry)!.toString('latin1')
  return filterTseElectedRows(csv, cargos)
}

async function syncTseBatch(
  electionYear: number,
  cargos: string[],
  label: string,
  dryRun: boolean,
): Promise<{ created: number; updated: number; reactivated: number; skipped: number }> {
  console.log(`\n🗳️  Sincronizando ${label} (TSE ${electionYear})...`)

  let rows: TseCandidateRow[]
  let effectiveYear = electionYear

  try {
    rows = await downloadAndFilterTSE(getTseConsultaCandUrl(electionYear), cargos)
  } catch (err) {
    if ((err as Error).message.includes('404')) {
      effectiveYear = electionYear - 4
      console.log(`  ⚠ Arquivo de ${electionYear} indisponível (404), tentando ${effectiveYear}...`)
      rows = await downloadAndFilterTSE(getTseConsultaCandUrl(effectiveYear), cargos)
    } else {
      throw err
    }
  }

  console.log(`  ${rows.length} candidatos eleitos encontrados em ${effectiveYear}`)

  const { byAbbrev, byNumber } = await loadPartyCaches()
  const { byTseId, byReconcile } = await loadPoliticianIndex()

  let created = 0
  let updated = 0
  let reactivated = 0
  let skipped = 0
  const now = new Date()

  for (const row of rows) {
    const partyId = await resolveOrCreateParty(
      row['SG_PARTIDO'],
      byAbbrev,
      byNumber,
      dryRun,
      Number(row['NR_PARTIDO']),
      row['NM_PARTIDO'],
    )
    if (!partyId) {
      console.log(`  ⚠ Partido "${row['SG_PARTIDO']}" ausente para ${row['NM_URNA_CANDIDATO']}`)
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
    const { termStart, termEnd } = getTermDatesForCargo(cargo, effectiveYear)

    const existing =
      byTseId.get(tseId) ??
      byReconcile.get(reconcileKey(state, office, displayName, city)) ??
      byReconcile.get(reconcileKey(state, office, fullName, city))

    if (existing) {
      const keepStart = existing.termStart <= now && existing.termEnd >= now && termStart > now
      const shouldUpdateTseId = !existing.tseId || existing.tseId.startsWith('TSE-')
      const wasEnded = existing.status === PoliticianStatus.ENCERRADO

      if (!dryRun) {
        const saved = await prisma.politician.update({
          where: { id: existing.id },
          data: {
            name: displayName,
            partyId,
            office,
            state,
            electoralZone,
            ...(city !== undefined && { city }),
            termStart: keepStart ? existing.termStart : termStart,
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
        if (saved.tseId) byTseId.set(saved.tseId, saved)
        byReconcile.set(reconcileKey(state, office, displayName, city), saved)
      }

      if (wasEnded) reactivated++
      else updated++
    } else {
      if (!dryRun) {
        const createdRecord = await prisma.politician.create({
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
        byReconcile.set(reconcileKey(state, office, displayName, city), createdRecord)
      }
      created++
    }

    if ((created + updated + reactivated) % 500 === 0) {
      process.stdout.write(
        `  Criados: ${created} | Atualizados: ${updated} | Reativados: ${reactivated} | Ignorados: ${skipped}\r`,
      )
    }
  }

  console.log(
    `  ✓ Criados: ${created} | Atualizados: ${updated} | Reativados: ${reactivated} | Ignorados: ${skipped}`,
  )
  return { created, updated, reactivated, skipped }
}

// ── 6. Municípios / Prefeituras (IBGE) ────────────────────────────────────────

async function syncMunicipios(dryRun: boolean): Promise<{ created: number; updated: number }> {
  console.log('\n🏙️  Sincronizando municípios brasileiros (IBGE)...')

  const municipios = await fetchJson<any[]>(`${IBGE_BASE}/localidades/municipios`)
  console.log(`  ${municipios.length} municípios encontrados`)

  let created = 0
  let updated = 0
  const BATCH = 100

  for (let i = 0; i < municipios.length; i += BATCH) {
    const batch = municipios.slice(i, i + BATCH)

    await Promise.all(
      batch.map(async (m) => {
        try {
          const state =
            m.microrregiao?.mesorregiao?.UF?.sigla ??
            m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ??
            ''

          if (!state) return

          const ibgeCode = String(m.id)
          const legalName = `Prefeitura Municipal de ${m.nome}`

          const existing = await prisma.entity.findUnique({
            where: { ibgeCode },
            select: { id: true },
          })

          if (existing) {
            if (!dryRun) {
              await prisma.entity.update({
                where: { ibgeCode },
                data: { legalName, city: m.nome, state },
              })
            }
            updated++
          } else {
            if (!dryRun) {
              await prisma.entity.create({
                data: {
                  legalName,
                  ibgeCode,
                  type: EntityType.CITY_HALL,
                  city: m.nome,
                  state,
                  verified: false,
                },
              })
            }
            created++
          }
        } catch (err) {
          console.log(`\n  ⚠ Erro ao processar ${m.nome} (${m.id}): ${(err as Error).message}`)
        }
      }),
    )

    const pct = Math.round(((i + BATCH) / municipios.length) * 100)
    process.stdout.write(`  Progresso: ${Math.min(pct, 100)}% (criados: ${created}, atualizados: ${updated})\r`)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated}`)
  return { created, updated }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseCliArgs(process.argv.slice(2))
  console.log('🚀 Iniciando importação/atualização de dados públicos...')
  console.log(
    `   Eleição Geral: ${opts.generalYear} | Eleição Municipal: ${opts.municipalYear} | ` +
      `Etapas: ${Array.from(opts.steps).join(', ')}${opts.dryRun ? ' | DRY-RUN' : ''}`,
  )
  const start = Date.now()

  try {
    if (opts.steps.has('parties')) await syncParties(opts.dryRun)
    if (opts.steps.has('camara')) await syncDeputados(opts.dryRun)
    if (opts.steps.has('senado')) await syncSenadores(opts.dryRun)
    if (opts.steps.has('geral')) {
      await syncTseBatch(
        opts.generalYear,
        [
          'PRESIDENTE',
          'GOVERNADOR',
          'GOVERNADOR DO DISTRITO FEDERAL',
          'SENADOR',
          'DEPUTADO FEDERAL',
          'DEPUTADO ESTADUAL',
          'DEPUTADO DISTRITAL',
        ],
        'Eleição Geral (Presidente, Governadores, Senadores, Dep. Federais e Estaduais/Distritais)',
        opts.dryRun,
      )
    }
    if (opts.steps.has('municipal')) {
      await syncTseBatch(
        opts.municipalYear,
        ['PREFEITO', 'VEREADOR'],
        'Eleição Municipal (Prefeitos e Vereadores)',
        opts.dryRun,
      )
    }
    if (opts.steps.has('municipios')) await syncMunicipios(opts.dryRun)

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`\n✅ Importação concluída em ${elapsed}s`)
  } catch (err) {
    console.error('\n❌ Erro durante importação:', err)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
