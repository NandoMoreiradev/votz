import { AdsVolumeService } from './ads-volume.service'
import { volumeAlerts } from './volume-rules'

const GB = 1024 ** 3

describe('volumeAlerts', () => {
  it('tabela pequena não gera aviso', () => {
    expect(volumeAlerts([{ table: 'ad_events', rows: 1_000_000, bytes: 1 * GB }])).toEqual([])
  })

  it('passou das linhas OU do tamanho: avisa e manda ver o documento de partição', () => {
    const byRows = volumeAlerts([{ table: 'ad_events', rows: 25_000_000, bytes: 2 * GB }])
    expect(byRows).toHaveLength(1)
    expect(byRows[0].message).toMatch(/25,0 milhões de linhas/)
    expect(byRows[0].message).toMatch(/particionar por mês/)
    expect(volumeAlerts([{ table: 'ad_events', rows: 1_000_000, bytes: 9 * GB }])).toHaveLength(1)
  })

  it('exibições não são "só particionar": o aviso diz que precisa de redesenho', () => {
    const [alert] = volumeAlerts([{ table: 'ad_impressions', rows: 30_000_000, bytes: 3 * GB }])
    expect(alert.message).toMatch(/redesenhar/)
  })

  it('tabela que não veio na medição é ignorada', () => {
    expect(volumeAlerts([])).toEqual([])
  })
})

describe('AdsVolumeService', () => {
  it('mede com uma consulta fixa e converte os números do banco', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ relname: 'ad_events', rows: BigInt(30_000_000), bytes: BigInt(2 * GB) }]) }
    const alerts = await new AdsVolumeService(prisma as never).check()
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ table: 'ad_events', rows: 30_000_000 })
  })

  it('falha na leitura não explode no agendamento', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('banco fora')) }
    await expect(new AdsVolumeService(prisma as never).scheduled()).resolves.toBeUndefined()
  })
})
