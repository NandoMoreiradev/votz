/**
 * Importa fotos oficiais dos candidatos TSE para o Cloudflare R2.
 *
 * Execução:
 *   npm run db:import-fotos
 *   npm run db:import-fotos -- --year=2026
 *
 * O que faz:
 *   - Busca políticos com tseId "TSE-*" sem avatarUrl
 *   - Deriva dinamicamente o ano eleitoral (2022, 2024, 2026, 2028...) pelo cargo e fim de mandato
 *   - Baixa os ZIPs de fotos do CDN do TSE por UF (e BR quando disponível)
 *   - Faz upload da foto para o R2 em avatars/ e atualiza avatarUrl no banco
 */

import { PrismaClient } from '@prisma/client'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import AdmZip from 'adm-zip'
import { deriveElectionYearFromTerm, getTseFotoZipUrl } from '@votz/shared-types'

const prisma = new PrismaClient()

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? ''
const ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT ?? ''
const ACCESS_KEY = process.env.CLOUDFLARE_R2_ACCESS_KEY ?? ''
const SECRET_KEY = process.env.CLOUDFLARE_R2_SECRET_KEY ?? ''
const PUBLIC_URL = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

function createS3Client(): S3Client {
  if (!BUCKET || !ENDPOINT || !ACCESS_KEY || !SECRET_KEY || ENDPOINT.includes('placeholder')) {
    throw new Error(
      'Credenciais reais do Cloudflare R2 (CLOUDFLARE_R2_BUCKET, ENDPOINT, ACCESS_KEY, SECRET_KEY, PUBLIC_URL) são necessárias no .env para upload de fotos.',
    )
  }
  return new S3Client({
    region: 'auto',
    endpoint: ENDPOINT,
    credentials: {
      accessKeyId: ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  })
}

async function downloadZip(url: string): Promise<Buffer | null> {
  const res = await fetch(url)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function uploadToR2(s3: S3Client, key: string, data: Buffer): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: data,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return PUBLIC_URL ? `${PUBLIC_URL}/${key}` : `${ENDPOINT}/${BUCKET}/${key}`
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function parseExplicitYear(argv: string[]): number | undefined {
  for (const arg of argv) {
    if (arg.startsWith('--year=')) {
      const n = Number(arg.split('=')[1])
      if (!Number.isNaN(n) && n >= 2018) return n
    }
  }
  return undefined
}

async function main() {
  const explicitYear = parseExplicitYear(process.argv.slice(2))
  console.log(`🖼️  Iniciando importação de fotos TSE${explicitYear ? ` (ano=${explicitYear})` : ''}...\n`)

  const s3 = createS3Client()

  const politicians = await prisma.politician.findMany({
    where: { tseId: { startsWith: 'TSE-' }, avatarUrl: null },
    select: { id: true, tseId: true, office: true, state: true, termStart: true, termEnd: true },
  })

  if (politicians.length === 0) {
    console.log('✅ Todos os políticos TSE já têm foto. Nada a fazer.')
    return
  }

  console.log(`  ${politicians.length} políticos TSE sem foto encontrados\n`)

  const byId = new Map(politicians.map((p) => [p.tseId!.replace('TSE-', ''), p]))
  const groups = new Map<string, Set<string>>()

  for (const p of politicians) {
    const ano = String(explicitYear ?? deriveElectionYearFromTerm(p.office, p.termStart, p.termEnd))
    const uf = p.state || 'BR'
    const key = `${ano}:${uf}`
    if (!groups.has(key)) groups.set(key, new Set())
    groups.get(key)!.add(p.tseId!.replace('TSE-', ''))
  }

  let uploaded = 0
  let errors = 0

  for (const [groupKey, sqSet] of groups) {
    const [ano, uf] = groupKey.split(':')
    const url = getTseFotoZipUrl(ano, uf)

    process.stdout.write(`  Baixando ${ano}/${uf}... `)

    const zipBuf = await downloadZip(url)
    if (!zipBuf) {
      console.log('não encontrado')
      continue
    }

    const zip = new AdmZip(zipBuf)
    const entries = zip.getEntries()
    console.log(`${entries.length} fotos`)

    for (const entry of entries) {
      if (entry.isDirectory) continue

      const filename = entry.name.toLowerCase()
      if (!filename.endsWith('.jpg') && !filename.endsWith('.jpeg')) continue

      const sq = filename.replace(/\.(jpg|jpeg)$/, '')
      if (!sqSet.has(sq)) continue

      const politician = byId.get(sq)
      if (!politician) continue

      try {
        const imgData = zip.readFile(entry)
        if (!imgData || imgData.length < 100) continue

        const r2Key = `avatars/tse-${sq}.jpg`
        const pubUrl = await uploadToR2(s3, r2Key, imgData)

        await prisma.politician.update({
          where: { id: politician.id },
          data: { avatarUrl: pubUrl },
        })

        uploaded++
        byId.delete(sq)
      } catch (err) {
        errors++
        console.log(`\n  ⚠ Erro ao processar ${sq}: ${(err as Error).message}`)
      }
    }

    process.stdout.write(`  ✓ ${uploaded} enviadas até agora\r`)
    await sleep(500)
  }

  const notFound = politicians.length - uploaded - errors

  console.log(`
✅ Importação de fotos concluída
   Enviadas ao R2:    ${uploaded}
   Sem foto no ZIP:   ${notFound}
   Erros:             ${errors}
  `)
}

main()
  .catch((err) => {
    console.error('\n❌ Erro:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
