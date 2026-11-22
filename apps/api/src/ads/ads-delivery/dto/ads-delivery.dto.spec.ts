import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AD_ADJACENCY, adNeighborIds } from '@votz/shared-types'
import { NextAdQueryDto } from './ads-delivery.dto'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const errorsOf = async (plain: Record<string, unknown>) =>
  validate(plainToInstance(NextAdQueryDto, plain, { enableImplicitConversion: true }), { whitelist: true, forbidNonWhitelisted: true })

describe('pedido de anúncio: vizinhança do espaço', () => {
  it('aceita ids separados por vírgula e entrega como lista', async () => {
    const dto = plainToInstance(NextAdQueryDto, { surface: 'FEED_FOR_YOU', nearPostIds: `${uuid(1)}, ${uuid(2)}`, nearReportIds: uuid(3) }, { enableImplicitConversion: true })
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([])
    expect(dto.nearPostIds).toEqual([uuid(1), uuid(2)])
    expect(dto.nearReportIds).toEqual([uuid(3)])
  })

  it('segue valendo sem a vizinhança (clientes antigos)', async () => {
    expect(await errorsOf({ surface: 'FEED_FOR_YOU' })).toEqual([])
  })

  it('recusa id que não é UUID e lista grande demais', async () => {
    expect((await errorsOf({ surface: 'FEED_FOR_YOU', nearPostIds: `${uuid(1)},lixo` })).length).toBeGreaterThan(0)
    const many = Array.from({ length: AD_ADJACENCY.MAX_IDS + 1 }, (_, i) => uuid(i)).join(',')
    expect((await errorsOf({ surface: 'FEED_FOR_YOU', nearReportIds: many })).length).toBeGreaterThan(0)
    const max = Array.from({ length: AD_ADJACENCY.MAX_IDS }, (_, i) => uuid(i)).join(',')
    expect(await errorsOf({ surface: 'FEED_FOR_YOU', nearReportIds: max })).toEqual([])
  })
})

describe('adNeighborIds: itens em volta do espaço de anúncio', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}` }))

  it('pega até 3 antes e 3 depois do espaço (que fica entre items[position-1] e items[position])', () => {
    expect(adNeighborIds(items, 8)).toEqual(['i5', 'i6', 'i7', 'i8', 'i9', 'i10'])
  })

  it('no começo ou no fim da lista, só o que existe', () => {
    expect(adNeighborIds(items, 2)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4'])
    expect(adNeighborIds(items, 20)).toEqual(['i17', 'i18', 'i19'])
    expect(adNeighborIds([], 8)).toEqual([])
  })

  it('nunca passa do teto do pedido', () => {
    expect(adNeighborIds(items, 8).length).toBeLessThanOrEqual(AD_ADJACENCY.MAX_IDS)
  })
})
