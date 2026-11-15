import Redis from 'ioredis'
import { PrismaService } from '../prisma/prisma.service'
import { addDaysDateString, toSaoPauloDateString } from './analytics.constants'
import { AnalyticsRollupService } from './analytics.rollup'

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const direct = process.argv.find((a) => a.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const idx = process.argv.indexOf(`--${name}`)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return undefined
}

async function main() {
  const today = toSaoPauloDateString(new Date())
  const from = parseArg('from') ?? addDaysDateString(today, -90)
  const to = parseArg('to') ?? today

  const prisma = new PrismaService()
  await prisma.$connect()

  const redisUrl = process.env.REDIS_URL
  const redis = redisUrl
    ? new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        commandTimeout: 1000,
      })
    : undefined
  redis?.on('error', () => {
    // Cache permanece fail-open durante backfill CLI
  })

  try {
    const rollup = new AnalyticsRollupService(prisma, redis)
    const summary = await rollup.backfillRange(from, to)
    console.log(JSON.stringify({ ok: true, from, to, ...summary }))
  } finally {
    await prisma.$disconnect()
    if (redis) {
      try {
        await redis.quit()
      } catch {
        redis.disconnect()
      }
    }
  }
}

main().catch((err) => {
  console.error('Erro no backfill de analytics:', err)
  process.exit(1)
})
