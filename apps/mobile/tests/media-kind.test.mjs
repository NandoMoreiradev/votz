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

test('teto de altura no feed: só estreita a moldura, nunca corta, e celular comum fica igual', async () => {
  const { FEED_MEDIA_MAX_HEIGHT, formatHeightRatio, frameMaxWidth } = await import('../src/lib/media-kind.ts')
  const size = (container, format) => {
    const ratio = formatHeightRatio(format)
    const width = Math.min(container, frameMaxWidth(FEED_MEDIA_MAX_HEIGHT, ratio))
    return { width, height: Math.round(width * ratio) }
  }
  // Conteúdo = largura da tela - 32 dp de margem: 360 → 328, 390 → 358, 412 → 380, 430 → 398, tablet 768 → 736.
  for (const container of [328, 358, 380, 398, 736]) {
    for (const format of ['SQUARE', 'PORTRAIT', 'LANDSCAPE']) {
      const { width, height } = size(container, format)
      assert.ok(height <= FEED_MEDIA_MAX_HEIGHT, `${format} em ${container}: altura ${height}`)
      assert.ok(Math.abs(height / width - formatHeightRatio(format)) < 0.005, 'proporção preservada')
    }
  }
  // Celulares comuns não mudam (retrato até 384 dp de largura cabe inteiro).
  assert.deepEqual(size(358, 'PORTRAIT'), { width: 358, height: 448 })
  assert.deepEqual(size(380, 'PORTRAIT'), { width: 380, height: 475 })
  // Telas largas passam a ter 384×480 (retrato) e 480×480 (quadrado), como no site.
  assert.deepEqual(size(736, 'PORTRAIT'), { width: 384, height: 480 })
  assert.deepEqual(size(736, 'SQUARE'), { width: 480, height: 480 })
  // Paisagem 16:9 nunca chega perto do teto.
  assert.deepEqual(size(398, 'LANDSCAPE'), { width: 398, height: 224 })
})
