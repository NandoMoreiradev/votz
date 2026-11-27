import { BullModule } from '@nestjs/bullmq'
import { Worker } from 'bullmq'
import { IdleWorker, configureJobsMode, jobsEnabled, scheduleModuleImports } from './jobs-mode'

describe('jobs-mode', () => {
  afterEach(() => {
    BullModule.workerClass = Worker
  })

  describe('jobsEnabled', () => {
    it.each([undefined, '', '  ', 'true', '1', 'yes', 'qualquer-coisa'])('liga quando RUN_JOBS = %p', (value) => {
      expect(jobsEnabled({ RUN_JOBS: value })).toBe(true)
    })

    it.each(['false', 'FALSE', ' False ', '0', 'no', 'off', 'nao', 'não'])('desliga quando RUN_JOBS = %p', (value) => {
      expect(jobsEnabled({ RUN_JOBS: value })).toBe(false)
    })
  })

  describe('scheduleModuleImports', () => {
    it('traz o módulo de agendamento quando os jobs estão ligados', () => {
      expect(scheduleModuleImports({})).toHaveLength(1)
    })

    it('não traz nada quando os jobs estão desligados', () => {
      expect(scheduleModuleImports({ RUN_JOBS: 'false' })).toEqual([])
    })
  })

  describe('configureJobsMode', () => {
    it('com jobs ligados deixa o Worker de verdade', () => {
      expect(configureJobsMode({})).toBe(true)
      // @ts-expect-error campo estático privado do @nestjs/bullmq, só lido aqui para conferir
      expect(BullModule._workerClass).toBe(Worker)
    })

    it('com jobs desligados troca o Worker por um inativo', () => {
      expect(configureJobsMode({ RUN_JOBS: 'false' })).toBe(false)
      // @ts-expect-error campo estático privado do @nestjs/bullmq, só lido aqui para conferir
      expect(BullModule._workerClass).toBe(IdleWorker)
    })
  })

  describe('IdleWorker', () => {
    it('aceita eventos e fechamento sem abrir conexão', async () => {
      const worker = new IdleWorker('fila-x')
      const onFailed = jest.fn()
      worker.on('failed', onFailed)

      expect(worker.name).toBe('fila-x')
      expect(worker.isRunning()).toBe(false)
      await expect(worker.close()).resolves.toBeUndefined()
      await expect(worker.pause()).resolves.toBeUndefined()
      expect(onFailed).not.toHaveBeenCalled()
    })
  })
})
