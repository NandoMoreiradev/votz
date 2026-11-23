import { PrismaService } from '../../prisma/prisma.service'
import { AdsExperimentsRepository } from './ads-experiments.repository'
import { AdsExperimentsService } from './ads-experiments.service'
import { formatExperimentReport } from './experiment-report'

/**
 * Relatório de um experimento da entrega de anúncios.
 *
 *   npm run ads:experiment-report --workspace=apps/api -- --key=exploracao-15 --days=14 [--control=controle] [--json]
 */
function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const direct = process.argv.find((arg) => arg.startsWith(prefix))
  if (direct) return direct.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index !== -1 ? process.argv[index + 1] : undefined
}

async function main() {
  const key = parseArg('key')
  if (!key) {
    console.error('Diga qual experimento: --key=nome-do-experimento [--days=14] [--control=braco] [--json]')
    process.exit(1)
  }
  const days = Number(parseArg('days') ?? 14)
  const prisma = new PrismaService()
  await prisma.$connect()
  try {
    const report = await new AdsExperimentsService(new AdsExperimentsRepository(prisma)).report(key, Number.isFinite(days) && days > 0 ? days : 14, parseArg('control'))
    console.log(process.argv.includes('--json') ? JSON.stringify(report, null, 2) : formatExperimentReport(report))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Erro no relatório do experimento:', error)
  process.exit(1)
})
