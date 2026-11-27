import { EventEmitter } from 'node:events'
import { BullModule } from '@nestjs/bullmq'
import type { DynamicModule } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import type { Worker } from 'bullmq'

/**
 * Liga/desliga o trabalho de fundo (tarefas agendadas e filas BullMQ) deste processo.
 *
 * - `RUN_JOBS` ausente, vazio ou qualquer valor que não seja "falso": liga (comportamento de sempre,
 *   uma instância só faz tudo).
 * - `RUN_JOBS=false` (ou 0, no, off, nao): o processo só atende pedidos e tempo real. Continua podendo
 *   COLOCAR trabalho nas filas (quem produz é a API), mas não processa nada e não roda @Cron/@Interval.
 *
 * Com isso dá para ter várias instâncias do site e uma instância "worker" separada (RUN_JOBS=true)
 * que faz o trabalho de fundo, sem que cada instância do site repita os agendamentos.
 */
const OFF_VALUES = new Set(['false', '0', 'no', 'off', 'nao', 'não'])

export function jobsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env.RUN_JOBS?.trim().toLowerCase()
  if (!raw) return true
  return !OFF_VALUES.has(raw)
}

/**
 * Lugar do Worker do BullMQ quando os jobs estão desligados: aceita os mesmos usos que o
 * `@nestjs/bullmq` faz (`on` dos @OnWorkerEvent e `close`), mas não abre conexão no Redis
 * e não busca nenhum job.
 */
export class IdleWorker extends EventEmitter {
  readonly name: string

  constructor(name: string) {
    super()
    this.name = name
  }

  isRunning(): boolean {
    return false
  }

  async run(): Promise<void> {}
  async pause(): Promise<void> {}
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
}

/** Módulo de agendamento (@Cron/@Interval): só entra quando os jobs estão ligados. */
export function scheduleModuleImports(env: NodeJS.ProcessEnv = process.env): DynamicModule[] {
  return jobsEnabled(env) ? [ScheduleModule.forRoot()] : []
}

/**
 * Chamar uma vez, antes de criar o app: com jobs desligados, os @Processor passam a receber um
 * worker inativo. Devolve se os jobs estão ligados, para o log de partida.
 */
export function configureJobsMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const enabled = jobsEnabled(env)
  if (!enabled) {
    BullModule.workerClass = IdleWorker as unknown as typeof Worker
  }
  return enabled
}
