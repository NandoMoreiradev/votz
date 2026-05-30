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
 *   4. Prefeituras Municipais — todos os 5.570 municípios brasileiros (IBGE)
 */

import { PrismaClient, EntityType } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'

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

      const party = await prisma.party.findFirst({
        where: { abbreviation: d.siglaPartido },
        select: { id: true },
      })

      if (!party) {
        skipped++
        continue
      }

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

// ── 4. Senadores Federais ─────────────────────────────────────────────────────

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
    const mandatos: any[] = p.Mandatos?.Mandato ?? []
    return mandatos.some((m: any) => m.DescricaoParticipacao === 'Titular')
  })

  console.log(`  ${titulares.length} senadores titulares encontrados`)

  let created = 0
  let updated = 0
  let skipped = 0

  for (const p of titulares) {
    const id = p.IdentificacaoParlamentar
    const tseId = `SEN-${id.CodigoParlamentar}`

    const party = await prisma.party.findFirst({
      where: { abbreviation: id.SiglaPartidoParlamentar },
      select: { id: true },
    })

    if (!party) {
      console.log(`\n  ⚠ Partido "${id.SiglaPartidoParlamentar}" não encontrado para ${id.NomeParlamentar}`)
      skipped++
      continue
    }

    const mandatos: any[] = p.Mandatos?.Mandato ?? []
    const mandato = mandatos.find((m: any) => m.DescricaoParticipacao === 'Titular')

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
      avatarUrl:     id.UrlFotoParlamentar ?? null,
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
