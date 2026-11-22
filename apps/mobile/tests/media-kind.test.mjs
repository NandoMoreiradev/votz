import { test } from 'node:test'
import assert from 'node:assert/strict'
import { carouselFormat, carouselFromMediaItems, carouselItems, DEFAULT_MEDIA_RATIO, formatHeightRatio, mediaRatio } from '../src/lib/media-kind.ts'

const item = (patch) => ({ id: 'a', kind: 'IMAGE', format: 'PORTRAIT', fit: 'cover', width: 1638, height: 2048, url: 'https://cdn/x.feed.jpeg', fullUrl: 'https://cdn/x.jpeg', thumbUrl: 'https://cdn/x.thumb.webp', posterUrl: null, status: 'READY', durationMs: null, ...patch })

test('com itens da API: moldura do formato, versão cheia para ampliar, PDF do relato no fim', () => {
  const list = carouselFromMediaItems(
    [item({}), item({ id: 'b', kind: 'VIDEO', status: 'PROCESSING', url: null, fullUrl: null })],
    ['https://cdn/x.feed.jpeg', 'https://cdn/doc.pdf'],
    5,
  )
  assert.deepEqual(list.map((entry) => entry.kind), ['image', 'video', 'pdf'])
  assert.equal(list[0].fit, 'cover')
  assert.equal(list[0].fullUrl, 'https://cdn/x.jpeg')
  assert.equal(list[1].processing, true)
  assert.equal(carouselFormat(list), 'PORTRAIT')
  assert.equal(formatHeightRatio('PORTRAIT'), 1.25)
})

test('item que falhou não aparece', () => {
  assert.equal(carouselFromMediaItems([item({ status: 'FAILED' })], [], 5).length, 0)
})

test('só links (resposta antiga): aparece inteiro e a moldura é a mais próxima do tamanho medido', () => {
  const list = carouselItems(['https://cdn/a.jpeg', 'https://cdn/b.mp4', 'javascript:alert(1)'], 5)
  assert.equal(list.length, 2)
  assert.equal(list[0].fit, 'contain')
  assert.equal(list[1].posterUrl, 'https://cdn/b.poster.jpg')
  assert.equal(carouselFormat(list), null)
  assert.equal(mediaRatio(1080, 1920), 1.25) // 9:16 → 4:5
  assert.equal(mediaRatio(1920, 1080), 0.5625) // 16:9
  assert.equal(mediaRatio(null, null), DEFAULT_MEDIA_RATIO)
})
