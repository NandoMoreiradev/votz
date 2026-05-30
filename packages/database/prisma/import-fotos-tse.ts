/**
 * Importa fotos oficiais dos candidatos TSE para o Cloudflare R2.
 *
 * Execução:
 *   npm run db:import-fotos --workspace=packages/database
 *
 * O que faz:
 *   - Baixa os ZIPs de fotos do CDN do TSE por UF e ano eleitoral
 *   - Faz match pelo SQ_CANDIDATO (tseId sem prefixo "TSE-")
 *   - Faz upload da foto para o R2 na pasta avatars/
 *   - Atualiza o campo avatarUrl do político no banco
 *
 * Cobertura:
 *   - Eleição 2022: Governadores + Deputados Estaduais/Distritais
 *   - Eleição 2024: Prefeitos + Vereadores
 *
 * Senadores e Deputados Federais já têm avatarUrl preenchido pelo import principal.
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import AdmZip from 'adm-zip'

const prisma = new PrismaClient()

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
  },
})

const BUCKET     = process.env.CLOUDFLARE_R2_BUCKET!
const PUBLIC_URL = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/$/, '')
const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO',
  'MA','MG','MS','MT','PA','PB','PE','PI','PR',
  'RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function zipUrl(ano: string, uf: string) {
  return `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes${ano}/fotos/foto_cand${ano}_${uf}_div.zip`
}

async function downloadZip(url: string): Promise<Buffer | null> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadToR2(key: string, data: Buffer): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: data,
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }))
  return `${PUBLIC_URL}/${key}`
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🖼️  Iniciando importação de fotos TSE...\n')

  // Buscar apenas políticos TSE sem foto
  const politicians = await prisma.politician.findMany({
    where: { tseId: { startsWith: 'TSE-' }, avatarUrl: null },
    select: { id: true, tseId: true, state: true, termStart: true },
  })

  if (politicians.length === 0) {
    console.log('✅ Todos os políticos TSE já têm foto. Nada a fazer.')
    return
  }

  console.log(`  ${politicians.length} políticos TSE sem foto encontrados\n`)

  // Mapear SQ_CANDIDATO → político
  const byId = new Map(politicians.map(p => [p.tseId!.replace('TSE-', ''), p]))

  // Agrupar por (ano, UF)
  const groups = new Map<string, Set<string>>()

  for (const p of politicians) {
    const ano = p.termStart >= new Date('2025-01-01') ? '2024' : '2022'
    const uf  = p.state || 'BR'
    if (uf === 'BR') continue // presidente — sem ZIP por UF
    const key = `${ano}:${uf}`
    if (!groups.has(key)) groups.set(key, new Set())
    groups.get(key)!.add(p.tseId!.replace('TSE-', ''))
  }

  let uploaded = 0
  let notFound = 0
  let errors   = 0

  for (const [groupKey, sqSet] of groups) {
    const [ano, uf] = groupKey.split(':')
    const url = zipUrl(ano, uf)

    process.stdout.write(`  Baixando ${ano}/${uf}... `)

    const zipBuf = await downloadZip(url)
    if (!zipBuf) {
      console.log(`não encontrado`)
      continue
    }

    const zip = new AdmZip(zipBuf)
    const entries = zip.getEntries()
    console.log(`${entries.length} fotos`)

    for (const entry of entries) {
      if (entry.isDirectory) continue

      // Nome do arquivo: {SQ_CANDIDATO}.jpg  (pode ter path dentro do zip)
      const filename = entry.name.toLowerCase()
      if (!filename.endsWith('.jpg') && !filename.endsWith('.jpeg')) continue

      const sq = filename.replace(/\.(jpg|jpeg)$/, '')
      if (!sqSet.has(sq)) continue

      const politician = byId.get(sq)
      if (!politician) continue

      try {
        const imgData = zip.readFile(entry)
        if (!imgData || imgData.length < 100) continue

        const r2Key  = `avatars/tse-${sq}.jpg`
        const pubUrl = await uploadToR2(r2Key, imgData)

        await prisma.politician.update({
          where: { id: politician.id },
          data: { avatarUrl: pubUrl },
        })

        uploaded++
        byId.delete(sq) // evitar re-upload se aparecer em outro ZIP
      } catch (err) {
        errors++
        console.log(`\n  ⚠ Erro ao processar ${sq}: ${(err as Error).message}`)
      }
    }

    process.stdout.write(`  ✓ ${uploaded} enviadas até agora\r`)
    await sleep(500) // respeitar CDN
  }

  // Presidente (sem ZIP por UF — sem foto via este método)
  const semFoto = politicians.filter(p => p.state === '' || p.state === 'BR').length
  if (semFoto > 0) {
    console.log(`\n  ℹ ${semFoto} políticos nacionais (Presidente) sem cobertura de foto TSE`)
  }

  notFound = politicians.length - uploaded - errors

  console.log(`
✅ Importação de fotos concluída
   Enviadas ao R2:    ${uploaded}
   Sem foto no ZIP:   ${notFound}
   Erros:             ${errors}
  `)
}

main()
  .catch(err => { console.error('\n❌ Erro:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
