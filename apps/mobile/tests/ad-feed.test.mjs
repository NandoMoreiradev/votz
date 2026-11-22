import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAdSlot, withAdSlots } from '../src/lib/ad-feed.ts'

const posts = (count) => Array.from({ length: count }, (_, index) => ({ id: `p${index + 1}` }))

test('um espaço de anúncio depois de cada 8 itens, com id estável', () => {
  const list = withAdSlots(posts(17), 8, true)
  const slots = list.filter(isAdSlot)
  assert.deepEqual(slots.map((slot) => slot.id), ['__ad__8', '__ad__16'])
  assert.deepEqual(slots.map((slot) => slot.adSlot), [8, 16])
  assert.equal(list.length, 19)
  // o espaço vem logo depois do 8º item
  assert.equal(list[8].id, '__ad__8')
  assert.equal(list[7].id, 'p8')
})

test('carregar mais uma página não muda os espaços que já existiam', () => {
  const before = withAdSlots(posts(10), 8, true).filter(isAdSlot).map((slot) => slot.id)
  const after = withAdSlots(posts(25), 8, true).filter(isAdSlot).map((slot) => slot.id)
  assert.deepEqual(after.slice(0, before.length), before)
})

test('sem login (ou menos de 8 itens), nenhum espaço', () => {
  assert.equal(withAdSlots(posts(20), 8, false).filter(isAdSlot).length, 0)
  assert.equal(withAdSlots(posts(7), 8, true).filter(isAdSlot).length, 0)
  assert.equal(withAdSlots(posts(20), 0, true).filter(isAdSlot).length, 0)
})

test('cada espaço leva os itens em volta (3 antes e 3 depois) para o pedido do anúncio', () => {
  // mesma regra do adNeighborIds do shared-types, aqui só para provar que a lista passa os vizinhos certos
  const around = (items, position) => items.slice(Math.max(0, position - 3), position + 3).map((item) => item.id)
  const slot = withAdSlots(posts(20), 8, true, around).find(isAdSlot)
  assert.deepEqual(slot.near, ['p6', 'p7', 'p8', 'p9', 'p10', 'p11'])
  // sem a função, o espaço existe e vai sem vizinhos (o servidor não restringe nada)
  assert.deepEqual(withAdSlots(posts(20), 8, true).find(isAdSlot).near, [])
})

test('isAdSlot só aceita o espaço', () => {
  assert.equal(isAdSlot({ id: 'p1' }), false)
  assert.equal(isAdSlot(null), false)
  assert.equal(isAdSlot({ id: '__ad__8', adSlot: 8, near: [] }), true)
})
