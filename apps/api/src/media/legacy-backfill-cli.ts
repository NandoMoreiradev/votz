import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { LegacyMediaBackfill } from './legacy-backfill'

/**
 * Registra tamanho e moldura das fotos e vídeos das publicações antigas (sem recortar nada).
 *   npm run media:backfill --workspace=apps/api -- --dry-run
 *   npm run media:backfill --workspace=apps/api -- --limit=500
 * Pode rodar de novo quantas vezes quiser: publicações já registradas não são tocadas.
 */
function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  if (index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1]
  return undefined
}

async function main() {
  const limit = parseArg('limit') ? Number(parseArg('limit')) : undefined
  const dryRun = process.argv.includes('--dry-run')
  const prisma = new PrismaService()
  await prisma.$connect()
  try {
    const storage = new StorageService(new ConfigService(process.env))
    const summary = await new LegacyMediaBackfill(prisma, storage).run({ limit, dryRun })
    console.log(JSON.stringify({ ok: true, dryRun, ...summary }))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Erro ao registrar a mídia das publicações antigas:', error)
  process.exit(1)
})
