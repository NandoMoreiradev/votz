import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { EntityType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

export const IBGE_SYNC_QUEUE = 'ibge-sync'
const IBGE_MUNICIPIOS_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const BATCH_SIZE = 100

interface IbgeMunicipio {
  id: number
  nome: string
  microrregiao: {
    mesorregiao: {
      UF: {
        sigla: string
      }
    }
  }
}

export interface IbgeSyncResult {
  created: number
  updated: number
  startedAt: Date
  finishedAt: Date
}

@Injectable()
export class IbgeSyncService {
  private readonly logger = new Logger(IbgeSyncService.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(IBGE_SYNC_QUEUE) private readonly queue: Queue,
  ) {}

  async triggerSync(): Promise<{ message: string }> {
    await this.queue.add(
      'full-sync',
      {},
      {
        jobId: 'ibge-full-sync',
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 5,
        removeOnFail: 5,
      },
    )
    this.logger.log('IBGE sync job enqueued')
    return { message: 'Sync de municípios do IBGE iniciado.' }
  }

  async runSync(): Promise<IbgeSyncResult> {
    const startedAt = new Date()
    this.logger.log('IBGE sync started')

    const municipios = await this.fetchMunicipios()
    this.logger.log(`Fetched ${municipios.length} municipalities from IBGE`)

    const { created, updated } = await this.upsertMunicipios(municipios)

    const result: IbgeSyncResult = {
      created,
      updated,
      startedAt,
      finishedAt: new Date(),
    }

    this.logger.log(
      `IBGE sync finished — created: ${created}, updated: ${updated} ` +
      `(${result.finishedAt.getTime() - startedAt.getTime()}ms)`,
    )

    return result
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  private async fetchMunicipios(): Promise<IbgeMunicipio[]> {
    const res = await fetch(IBGE_MUNICIPIOS_URL, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`IBGE API ${res.status}`)
    return res.json() as Promise<IbgeMunicipio[]>
  }

  // ── Upsert ────────────────────────────────────────────────────────────────

  private async upsertMunicipios(
    municipios: IbgeMunicipio[],
  ): Promise<{ created: number; updated: number }> {
    let created = 0
    let updated = 0

    // Process in batches to avoid overwhelming the DB connection
    for (let i = 0; i < municipios.length; i += BATCH_SIZE) {
      const batch = municipios.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (m) => {
          const ibgeCode = String(m.id)
          const state = m.microrregiao.mesorregiao.UF.sigla
          const legalName = `Prefeitura Municipal de ${m.nome}`

          const existing = await this.prisma.entity.findUnique({
            where: { ibgeCode },
            select: { id: true },
          })

          if (existing) {
            await this.prisma.entity.update({
              where: { ibgeCode },
              data: { legalName, city: m.nome, state },
            })
            updated++
          } else {
            await this.prisma.entity.create({
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
        }),
      )

      this.logger.debug(
        `Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(municipios.length / BATCH_SIZE)} done`,
      )
    }

    return { created, updated }
  }
}
