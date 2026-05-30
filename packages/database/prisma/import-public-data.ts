/**
 * Script de importação inicial de dados públicos.
 *
 * Execução:
 *   npm run db:import --workspace=packages/database
 *
 * O que importa:
 *   1. Partidos políticos (Câmara dos Deputados)
 *   2. Deputados Federais — Legislatura 57 (2023–2027)
 *   3. Senadores Federais — lista atual (Senado Federal)
 *   4. Presidente + Governadores — eleições 2022 (TSE)
 *   5. Deputados Estaduais — eleições 2022 (TSE)
 *   6. Prefeitos + Vereadores — eleições 2024 (TSE, ~60 MB, download único)
 *   7. Prefeituras Municipais — todos os 5.570 municípios brasileiros (IBGE)
 */

import { PrismaClient, EntityType } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'
import AdmZip from 'adm-zip'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  isArray: (tagName) => ['Parlamentar', 'Mandato'].includes(tagName),
})

const prisma = new PrismaClient()

const CAMARA_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
const IBGE_BASE   = 'https://servicodados.ibge.gov.br/api/v1'
const PAGE_SIZE   = 100
const LEG_57_START = new Date('2023-02-01')
const LEG_57_END   = new Date('2027-01-31')

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.json() as Promise<T>
}

function hasNext(links: Array<{ rel: string }>): boolean {
  return links.some((l) => l.rel === 'next')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── 1. Partidos ───────────────────────────────────────────────────────────────

async function syncParties(): Promise<number> {
  console.log('\n📋 Sincronizando partidos...')
  let page = 1
  let total = 0

  while (true) {
    const { dados, links } = await fetchJson<any>(
      `${CAMARA_BASE}/partidos?itens=${PAGE_SIZE}&pagina=${page}&ordem=ASC&ordenarPor=sigla`,
    )

    for (const p of dados) {
      await prisma.party.upsert({
        where:  { abbreviation: p.sigla },
        update: { name: p.nome },
        create: { abbreviation: p.sigla, name: p.nome, number: p.id, active: true },
      })
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

// ── 2. Deputados Federais ─────────────────────────────────────────────────────

async function syncDeputados(): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('\n🏛️  Sincronizando deputados federais (Legislatura 57)...')

  const allParties = await prisma.party.findMany({ select: { id: true, abbreviation: true } })
  const partyMap   = new Map(allParties.map(p => [p.abbreviation, p.id]))

  let page = 1
  let created = 0
  let updated = 0
  let skipped = 0

  while (true) {
    const { dados, links } = await fetchJson<any>(
      `${CAMARA_BASE}/deputados?itens=${PAGE_SIZE}&pagina=${page}&idLegislatura=57&ordem=ASC&ordenarPor=nome`,
    )

    for (const d of dados) {
      const tseId = String(d.id)

      const partyId = partyMap.get(d.siglaPartido)
      if (!partyId) { skipped++; continue }
      const party = { id: partyId }

      const payload = {
        name:          d.nome,
        partyId:       party.id,
        office:        'Deputado Federal',
        state:         d.siglaUf,
        electoralZone: d.siglaUf,
        termStart:     LEG_57_START,
        termEnd:       LEG_57_END,
        avatarUrl:     d.urlFoto || null,
      }

      const existing = await prisma.politician.findUnique({
        where: { tseId },
        select: { id: true },
      })

      if (existing) {
        await prisma.politician.update({ where: { tseId }, data: payload })
        updated++
      } else {
        await prisma.politician.create({ data: { ...payload, tseId, verified: false } })
        created++
      }
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
    if (!hasNext(links) || dados.length === 0) break
    page++
    await sleep(500)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── 3. Municípios / Prefeituras ───────────────────────────────────────────────

async function syncMunicipios(): Promise<{ created: number; updated: number }> {
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
          // Alguns municípios (ex: Fernando de Noronha) têm microrregiao null
          const state = m.microrregiao?.mesorregiao?.UF?.sigla
            ?? m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla
            ?? ''

          if (!state) {
            console.log(`\n  ⚠ ${m.nome} (${m.id}): UF não identificada — ignorado`)
            return
          }

          const ibgeCode  = String(m.id)
          const legalName = `Prefeitura Municipal de ${m.nome}`

          const existing = await prisma.entity.findUnique({
            where: { ibgeCode },
            select: { id: true },
          })

          if (existing) {
            await prisma.entity.update({
              where: { ibgeCode },
              data: { legalName, city: m.nome, state },
            })
            updated++
          } else {
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

// ── 4. Presidente + Governadores (TSE 2022) ───────────────────────────────────

const TSE_2022_URL    = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip'
const TERM_2022_START = new Date('2023-01-01')
const TERM_2022_END   = new Date('2026-12-31')
const ELEITO_VALUES   = new Set(['ELEITO', 'ELEITO POR QP', 'ELEITO POR MÉDIA'])

const OFFICE_LABEL: Record<string, string> = {
  'PRESIDENTE':                     'Presidente da República',
  'GOVERNADOR':                     'Governador',
  'GOVERNADOR DO DISTRITO FEDERAL': 'Governador',
}

async function downloadAndFilterTSE(url: string, cargos: string[]): Promise<Record<string, string>[]> {
  console.log(`  Baixando ${url}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TSE CDN ${res.status}`)

  const zip = new AdmZip(Buffer.from(await res.arrayBuffer()))
  const entry = zip.getEntries().find((e) =>
    e.entryName.toUpperCase().includes('BRASIL') && e.entryName.endsWith('.csv'),
  )
  if (!entry) throw new Error('BRASIL.csv not found in ZIP')

  const csv = zip.readFile(entry)!.toString('latin1')
  const lines = csv.split('\n')
  const headers = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''))

  const cargoIdx = headers.indexOf('DS_CARGO')
  const sitIdx   = headers.indexOf('DS_SIT_TOT_TURNO')
  const targetSet = new Set(cargos)
  const results: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cols = line.split(';').map((c) => c.trim().replace(/^"|"$/g, ''))
    if (cols.length < headers.length - 2) continue
    if (!targetSet.has(cols[cargoIdx])) continue
    if (!ELEITO_VALUES.has(cols[sitIdx])) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? '' })
    results.push(row)
  }

  return results
}

async function syncPresidenteGovernadores(): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('\n🇧🇷  Sincronizando Presidente + Governadores (TSE 2022)...')

  const rows = await downloadAndFilterTSE(TSE_2022_URL, [
    'PRESIDENTE', 'GOVERNADOR', 'GOVERNADOR DO DISTRITO FEDERAL',
  ])

  console.log(`  ${rows.length} candidatos eleitos encontrados`)

  const allParties = await prisma.party.findMany({ select: { id: true, abbreviation: true } })
  const partyMap   = new Map(allParties.map(p => [p.abbreviation, p.id]))

  let created = 0, updated = 0, skipped = 0

  for (const row of rows) {
    const tseId      = `TSE-${row['SQ_CANDIDATO']}`
    const partySigla = row['SG_PARTIDO']
    const uf         = row['SG_UF']

    const party = { id: partyMap.get(partySigla) }

    if (!party.id) {
      console.log(`  ⚠ Partido "${partySigla}" não encontrado para ${row['NM_URNA_CANDIDATO']}`)
      skipped++
      continue
    }

    const cargo = row['DS_CARGO']
    const payload = {
      name:          row['NM_URNA_CANDIDATO'] || row['NM_CANDIDATO'],
      partyId:       party.id,
      office:        OFFICE_LABEL[cargo] ?? cargo,
      state:         uf === 'BR' ? '' : uf,
      electoralZone: uf === 'BR' ? 'Nacional' : uf,
      termStart:     TERM_2022_START,
      termEnd:       TERM_2022_END,
      avatarUrl:     null as string | null,
    }

    const existing = await prisma.politician.findUnique({
      where: { tseId }, select: { id: true },
    })

    if (existing) {
      await prisma.politician.update({ where: { tseId }, data: payload })
      updated++
    } else {
      await prisma.politician.create({ data: { ...payload, tseId, verified: false } })
      created++
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── 5. Deputados Estaduais (TSE 2022) ────────────────────────────────────────

const DEP_ESTADUAL_OFFICE: Record<string, string> = {
  'DEPUTADO ESTADUAL':  'Deputado Estadual',
  'DEPUTADO DISTRITAL': 'Deputado Distrital',
}

async function syncDepEstaduais(): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('\n🏛️  Sincronizando Deputados Estaduais (TSE 2022)...')

  const rows = await downloadAndFilterTSE(TSE_2022_URL, [
    'DEPUTADO ESTADUAL',
    'DEPUTADO DISTRITAL',
  ])

  console.log(`  ${rows.length} deputados estaduais eleitos encontrados`)

  const allParties = await prisma.party.findMany({ select: { id: true, abbreviation: true } })
  const partyMap   = new Map(allParties.map(p => [p.abbreviation, p.id]))

  let created = 0, updated = 0, skipped = 0

  for (const row of rows) {
    const tseId = `TSE-${row['SQ_CANDIDATO']}`
    const uf    = row['SG_UF']

    const partyId = partyMap.get(row['SG_PARTIDO'])
    if (!partyId) { skipped++; continue }

    const cargo   = row['DS_CARGO']
    const payload = {
      name:          row['NM_URNA_CANDIDATO'] || row['NM_CANDIDATO'],
      partyId,
      office:        DEP_ESTADUAL_OFFICE[cargo] ?? cargo,
      state:         uf,
      electoralZone: uf,
      termStart:     TERM_2022_START,
      termEnd:       TERM_2022_END,
      avatarUrl:     null as string | null,
    }

    const existing = await prisma.politician.findUnique({
      where: { tseId }, select: { id: true },
    })

    if (existing) {
      await prisma.politician.update({ where: { tseId }, data: payload })
      updated++
    } else {
      await prisma.politician.create({ data: { ...payload, tseId, verified: false } })
      created++
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── 6. Prefeitos + Vereadores (TSE 2024) — download único ────────────────────

const TSE_2024_URL    = 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip'
const TERM_2024_START = new Date('2025-01-01')
const TERM_2024_END   = new Date('2028-12-31')
const MUNICIPAL_CARGOS = new Set(['PREFEITO', 'VEREADOR'])
const OFFICE_MUNICIPAL: Record<string, string> = { PREFEITO: 'Prefeito', VEREADOR: 'Vereador' }

async function syncMunicipal2024(): Promise<{ processed: number; skipped: number }> {
  console.log('\n🏙️  Sincronizando Prefeitos + Vereadores (TSE 2024)')
  console.log('  Baixando arquivo ~60 MB — pode levar alguns minutos...')

  // Download único: filtra PREFEITO + VEREADOR na mesma passagem
  const rows = await downloadAndFilterTSE(TSE_2024_URL, ['PREFEITO', 'VEREADOR'])

  const prefeitos = rows.filter(r => r['DS_CARGO'] === 'PREFEITO').length
  const vereadores = rows.filter(r => r['DS_CARGO'] === 'VEREADOR').length
  console.log(`  ${prefeitos} prefeitos + ${vereadores} vereadores eleitos`)

  // Cache de partidos em memória — evita 65k queries individuais ao banco
  const allParties = await prisma.party.findMany({ select: { id: true, abbreviation: true } })
  const partyMap = new Map(allParties.map(p => [p.abbreviation, p.id]))
  console.log(`  ${partyMap.size} partidos carregados em cache`)

  let processed = 0, skipped = 0

  for (const row of rows) {
    const tseId   = `TSE-${row['SQ_CANDIDATO']}`
    const uf      = row['SG_UF']
    const cargo   = row['DS_CARGO']
    const city    = MUNICIPAL_CARGOS.has(cargo) ? (row['NM_UE'] || undefined) : undefined
    const partyId = partyMap.get(row['SG_PARTIDO'])

    if (!partyId) { skipped++; continue }

    const payload = {
      name:          row['NM_URNA_CANDIDATO'] || row['NM_CANDIDATO'],
      partyId,
      office:        OFFICE_MUNICIPAL[cargo] ?? cargo,
      state:         uf,
      electoralZone: city ?? uf,
      city,
      termStart:     TERM_2024_START,
      termEnd:       TERM_2024_END,
      avatarUrl:     null as string | null,
    }

    await prisma.politician.upsert({
      where:  { tseId },
      update: payload,
      create: { ...payload, tseId, verified: false },
    })

    processed++
    if (processed % 1000 === 0) {
      process.stdout.write(`  Processados: ${processed} | Ignorados: ${skipped}\r`)
    }
  }

  console.log(`  ✓ Processados: ${processed} | Ignorados: ${skipped}`)
  return { processed, skipped }
}

// ── 7. Senadores Federais ─────────────────────────────────────────────────────

async function syncSenadores(): Promise<{ created: number; updated: number; skipped: number }> {
  console.log('\n🏛️  Sincronizando senadores federais (Senado Federal)...')

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

  // Apenas titulares
  const titulares = parlamentares.filter((p) => {
    const mandato = Array.isArray(p.Mandato) ? p.Mandato[0] : p.Mandato
    return mandato?.DescricaoParticipacao === 'Titular'
  })

  console.log(`  ${titulares.length} senadores titulares encontrados`)

  // Senado usa siglas legadas que diferem das registradas pela Câmara
  const SENADO_SIGLA_MAP: Record<string, string> = {
    'PODEMOS': 'PODE',
    'PATRI':   'PATRIOTA',
  }

  const allParties = await prisma.party.findMany({ select: { id: true, abbreviation: true } })
  const partyMap   = new Map(allParties.map(p => [p.abbreviation, p.id]))

  let created = 0
  let updated = 0
  let skipped = 0

  for (const p of titulares) {
    const id = p.IdentificacaoParlamentar
    const tseId = `SEN-${id.CodigoParlamentar}`

    const sigla = SENADO_SIGLA_MAP[id.SiglaPartidoParlamentar] ?? id.SiglaPartidoParlamentar
    const partyId = partyMap.get(sigla)
    const party = partyId ? { id: partyId } : null

    if (!party) {
      console.log(`\n  ⚠ Partido "${id.SiglaPartidoParlamentar}" não encontrado para ${id.NomeParlamentar}`)
      skipped++
      continue
    }

    const mandato = Array.isArray(p.Mandato) ? p.Mandato[0] : p.Mandato

    const termStart = mandato?.PrimeiraLegislatura?.DataInicio
      ? new Date(mandato.PrimeiraLegislatura.DataInicio)
      : new Date('2023-02-01')

    const termEnd = mandato?.SegundaLegislatura?.DataFim
      ? new Date(mandato.SegundaLegislatura.DataFim)
      : mandato?.PrimeiraLegislatura?.DataFim
        ? new Date(mandato.PrimeiraLegislatura.DataFim)
        : new Date('2031-01-31')

    const payload = {
      name:          id.NomeParlamentar,
      partyId:       party.id,
      office:        id.FormaTratamento ?? 'Senador(a)',
      state:         id.UfParlamentar,
      electoralZone: id.UfParlamentar,
      termStart,
      termEnd,
      avatarUrl:     `https://www.senado.leg.br/senadores/img/fotos-oficiais/senador${id.CodigoParlamentar}.jpg`,
    }

    const existing = await prisma.politician.findUnique({
      where: { tseId },
      select: { id: true },
    })

    if (existing) {
      await prisma.politician.update({ where: { tseId }, data: payload })
      updated++
    } else {
      await prisma.politician.create({ data: { ...payload, tseId, verified: false } })
      created++
    }

    process.stdout.write(`  Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}\r`)
  }

  console.log(`  ✓ Criados: ${created} | Atualizados: ${updated} | Ignorados: ${skipped}`)
  return { created, updated, skipped }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Iniciando importação de dados públicos...')
  const start = Date.now()

  try {
    await syncParties()
    await syncDeputados()
    await syncSenadores()
    await syncPresidenteGovernadores()
    await syncDepEstaduais()
    await syncMunicipal2024()
    await syncMunicipios()

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
