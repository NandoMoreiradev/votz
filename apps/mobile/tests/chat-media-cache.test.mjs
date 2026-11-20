import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMediaCache } from '../src/lib/chat-media-cache.ts'

const MB = 1024 * 1024
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const bytes = (size, fill = 1) => new Uint8Array(size).fill(fill)

/** "Disco" em memória com as mesmas operações do adaptador do aplicativo. */
function memoryStore() {
  const files = new Map()
  const calls = []
  return {
    files,
    calls,
    store: {
      read: async (name) => files.get(name) ?? null,
      write: async (name, data) => { calls.push(['write', name]); files.set(name, data) },
      remove: async (name) => { calls.push(['remove', name]); files.delete(name) },
      removeAll: async () => { calls.push(['removeAll']); files.clear() },
    },
  }
}
function clock() {
  let t = 1000
  return () => (t += 10)
}

test('o arquivo guardado volta igual e conta no espaço usado', async () => {
  const { store } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  assert.equal(await cache.get(id(1)), null)
  await cache.put(id(1), bytes(2 * MB, 7))
  const back = await cache.get(id(1))
  assert.equal(back.byteLength, 2 * MB)
  assert.equal(back[100], 7)
  assert.equal(await cache.usage(), 2 * MB)
})

test('quando enche, sai o que está há mais tempo sem uso, e abrir um arquivo o "renova"', async () => {
  const { store, files } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  await cache.put(id(1), bytes(4 * MB))
  await cache.put(id(2), bytes(4 * MB))
  await cache.get(id(1)) // o 1 foi usado por último: o 2 vira o mais antigo
  await cache.put(id(3), bytes(4 * MB))

  assert.ok(await cache.get(id(1)))
  assert.equal(await cache.get(id(2)), null, 'o menos usado saiu')
  assert.ok(await cache.get(id(3)))
  assert.equal(files.has(`${id(2)}.bin`), false, 'o arquivo dele foi apagado do disco')
  assert.equal(await cache.usage(), 8 * MB)
})

test('arquivo maior que o limite inteiro não entra e não apaga nada à toa', async () => {
  const { store } = memoryStore()
  const cache = createMediaCache(store, 5 * MB, clock())
  await cache.put(id(1), bytes(2 * MB))
  await cache.put(id(2), bytes(6 * MB))
  assert.ok(await cache.get(id(1)))
  assert.equal(await cache.get(id(2)), null)
})

test('guardar o mesmo arquivo de novo troca o conteúdo sem contar duas vezes', async () => {
  const { store } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  await cache.put(id(1), bytes(3 * MB, 1))
  await cache.put(id(1), bytes(1 * MB, 9))
  assert.equal(await cache.usage(), 1 * MB)
  assert.equal((await cache.get(id(1)))[0], 9)
})

test('várias gravações ao mesmo tempo não perdem entradas do índice', async () => {
  const { store } = memoryStore()
  const cache = createMediaCache(store, 100 * MB, clock())
  await Promise.all([1, 2, 3, 4, 5, 6].map((n) => cache.put(id(n), bytes(1000, n))))
  for (const n of [1, 2, 3, 4, 5, 6]) assert.equal((await cache.get(id(n)))[0], n, `arquivo ${n}`)
  assert.equal(await cache.usage(), 6000)
})

test('índice estragado recomeça vazio, sem derrubar nada', async () => {
  const { store, files } = memoryStore()
  files.set('index.json', new TextEncoder().encode('{isso não é json'))
  const cache = createMediaCache(store, 10 * MB, clock())
  assert.equal(await cache.usage(), 0)
  assert.equal(await cache.get(id(1)), null)
  await cache.put(id(1), bytes(100))
  assert.ok(await cache.get(id(1)))
})

test('índice com lixo é limpo: só entram ids válidos e números de verdade', async () => {
  const { store, files } = memoryStore()
  files.set('index.json', new TextEncoder().encode(JSON.stringify({
    [id(1)]: { size: 10, lastUsedAt: 1 },
    '../../etc/passwd': { size: 99, lastUsedAt: 1 },
    [id(2)]: { size: 'muito', lastUsedAt: 1 },
    [id(3)]: null,
  })))
  const cache = createMediaCache(store, 10 * MB, clock())
  assert.equal(await cache.usage(), 10)
})

test('arquivo que sumiu do disco: devolve null e o índice se corrige', async () => {
  const { store, files } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  await cache.put(id(1), bytes(5 * MB))
  files.delete(`${id(1)}.bin`)
  assert.equal(await cache.get(id(1)), null)
  assert.equal(await cache.usage(), 0)
})

test('id que não é de anexo nunca vira nome de arquivo', async () => {
  const { store, calls } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  for (const bad of ['../segredo', 'a/b', '', 'x'.repeat(40), `${id(1)}/../../x`]) {
    await cache.put(bad, bytes(10))
    assert.equal(await cache.get(bad), null)
    await cache.remove(bad)
  }
  assert.equal(calls.filter(([, name]) => name !== 'index.json').length, 0, 'nenhum arquivo foi tocado')
})

test('descartar um arquivo e liberar tudo', async () => {
  const { store, files } = memoryStore()
  const cache = createMediaCache(store, 10 * MB, clock())
  await cache.put(id(1), bytes(1000))
  await cache.put(id(2), bytes(1000))
  await cache.remove(id(1))
  assert.equal(await cache.get(id(1)), null)
  assert.ok(await cache.get(id(2)))
  await cache.clear()
  assert.equal(files.size, 0)
  assert.equal(await cache.usage(), 0)
  assert.equal(await cache.get(id(2)), null)
})

test('erro de disco ao guardar não derruba quem chamou', async () => {
  const { store } = memoryStore()
  const broken = { ...store, write: async () => { throw new Error('disco cheio') } }
  const cache = createMediaCache(broken, 10 * MB, clock())
  await assert.doesNotReject(cache.put(id(1), bytes(100)))
  assert.equal(await cache.get(id(1)), null)
})
