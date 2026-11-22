import sharp from 'sharp'
import { defaultCrop } from '@votz/shared-types'
import { gifSize, prepareImageSource, renderImageVariants } from './media-image'

/** Foto com a metade esquerda vermelha e a direita azul (para conferir se o recorte pegou o lado certo). */
async function halves(width: number, height: number) {
  const left = await sharp({ create: { width: width / 2, height, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toBuffer()
  return sharp({ create: { width, height, channels: 3, background: { r: 20, g: 20, b: 220 } } })
    .composite([{ input: left, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer()
}

async function centerPixel(image: Buffer) {
  const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true })
  const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels
  return { r: data[offset], g: data[offset + 1], b: data[offset + 2] }
}

describe('prepareImageSource', () => {
  it('gira pela câmera, tira EXIF/GPS e limita a 4096 px', async () => {
    const original = await sharp({ create: { width: 6000, height: 3000, channels: 3, background: { r: 90, g: 90, b: 90 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Copyright: 'dados-da-camera' } })
      .toBuffer()
    const source = await prepareImageSource(original)
    expect(source.mimeType).toBe('image/jpeg')
    // 6000x3000 marcada "girar 90°" aparece em pé: 3000x6000, reduzida para 2048x4096.
    expect([source.width, source.height]).toEqual([2048, 4096])
    const meta = await sharp(source.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
    expect(source.data.includes(Buffer.from('dados-da-camera'))).toBe(false)
  })

  it('mantém a transparência em WebP e recusa o que não é foto', async () => {
    const png = await sharp({ create: { width: 300, height: 300, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.4 } } }).png().toBuffer()
    expect((await prepareImageSource(png)).mimeType).toBe('image/webp')
    await expect(prepareImageSource(Buffer.from('não sou uma foto'))).rejects.toThrow()
  })
})

describe('renderImageVariants', () => {
  it('gera cheia, feed e miniatura no tamanho exato de cada formato', async () => {
    const source = await halves(4000, 3000)
    const portrait = await renderImageVariants(source, 'PORTRAIT', defaultCrop(4000, 3000, 'PORTRAIT'))
    expect([portrait.full.width, portrait.full.height]).toEqual([1638, 2048])
    expect([portrait.feed.width, portrait.feed.height]).toEqual([1080, 1350])
    expect([portrait.thumb.width, portrait.thumb.height]).toEqual([400, 500])
    expect((await sharp(portrait.thumb.data).metadata()).format).toBe('webp')

    const landscape = await renderImageVariants(source, 'LANDSCAPE', defaultCrop(4000, 3000, 'LANDSCAPE'))
    expect([landscape.feed.width, landscape.feed.height]).toEqual([1080, 608])
    const square = await renderImageVariants(source, 'SQUARE', defaultCrop(4000, 3000, 'SQUARE'))
    expect([square.feed.width, square.feed.height]).toEqual([1080, 1080])
  })

  it('o enquadramento escolhido decide o que aparece (lado direito = azul)', async () => {
    const source = await halves(4000, 2000)
    // Quadrado de 2000x2000 encostado na direita: só a metade azul.
    const right = await renderImageVariants(source, 'SQUARE', { x: 0.5, y: 0, w: 0.5, h: 1 })
    const pixel = await centerPixel(right.feed.data)
    expect(pixel.b).toBeGreaterThan(150)
    expect(pixel.r).toBeLessThan(80)
    const left = await renderImageVariants(source, 'SQUARE', { x: 0, y: 0, w: 0.5, h: 1 })
    expect((await centerPixel(left.feed.data)).r).toBeGreaterThan(150)
  })

  it('foto pequena é ampliada só até o tamanho do feed (publicação comum aceita)', async () => {
    const small = await sharp({ create: { width: 500, height: 500, channels: 3, background: { r: 10, g: 200, b: 10 } } }).jpeg().toBuffer()
    const result = await renderImageVariants(small, 'SQUARE', defaultCrop(500, 500, 'SQUARE'))
    expect([result.feed.width, result.full.width]).toEqual([1080, 1080])
  })
})

describe('gifSize', () => {
  it('lê o tamanho do GIF e devolve null para lixo', async () => {
    const gif = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 1, g: 1, b: 1 } } }).gif().toBuffer()
    expect(await gifSize(gif)).toEqual({ width: 320, height: 240 })
    expect(await gifSize(Buffer.from('xx'))).toBeNull()
  })
})
