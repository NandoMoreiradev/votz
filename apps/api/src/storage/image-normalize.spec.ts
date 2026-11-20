import sharp from 'sharp'
import {
  normalizeImage,
  REPORT_IMAGE_MAX_EDGE,
  THUMB_MAX_EDGE,
  thumbKeyFor,
} from './image-normalize'

const blank = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({
    create: {
      width,
      height,
      channels,
      background: channels === 4 ? { r: 200, g: 30, b: 30, alpha: 0.5 } : { r: 120, g: 130, b: 140 },
    },
  })

describe('normalizeImage', () => {
  it('reduz a foto grande, mantém JPEG e gera miniatura pequena em WebP', async () => {
    const original = await blank(4000, 3000).jpeg({ quality: 95 }).toBuffer()
    const result = await normalizeImage(original, 'image/jpeg')

    expect(result).not.toBeNull()
    expect(result!.mimeType).toBe('image/jpeg')
    expect(Math.max(result!.width, result!.height)).toBe(REPORT_IMAGE_MAX_EDGE)
    expect(result!.width).toBe(2048)
    expect(result!.height).toBe(1536)
    expect(result!.data.length).toBeLessThan(original.length)

    const thumb = await sharp(result!.thumb).metadata()
    expect(thumb.format).toBe('webp')
    expect(Math.max(thumb.width!, thumb.height!)).toBe(THUMB_MAX_EDGE)
  })

  it('nunca amplia foto pequena', async () => {
    const small = await blank(300, 200).jpeg().toBuffer()
    const result = await normalizeImage(small, 'image/jpeg')
    expect(result!.width).toBe(300)
    expect(result!.height).toBe(200)
    expect((await sharp(result!.thumb).metadata()).width).toBe(300)
  })

  it('aplica a rotação da câmera e remove os metadados (EXIF, GPS)', async () => {
    const rotated = await blank(3000, 1500).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    expect((await sharp(rotated).metadata()).orientation).toBe(6)

    const result = await normalizeImage(rotated, 'image/jpeg')
    // 3000x1500 marcada como "girar 90°" aparece em pé: 1500x3000, reduzida para 1024x2048.
    expect(result!.width).toBe(1024)
    expect(result!.height).toBe(2048)
    const meta = await sharp(result!.data).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.orientation).toBeUndefined()

    // Texto escondido nos metadados da câmera também não passa para o arquivo guardado.
    const tagged = await blank(800, 600)
      .jpeg()
      .withExif({ IFD0: { Copyright: 'dados-da-camera' } })
      .toBuffer()
    expect(tagged.includes(Buffer.from('dados-da-camera'))).toBe(true)
    const cleaned = await normalizeImage(tagged, 'image/jpeg')
    expect(cleaned!.data.includes(Buffer.from('dados-da-camera'))).toBe(false)
    expect(cleaned!.thumb.includes(Buffer.from('dados-da-camera'))).toBe(false)
  })

  it('PNG com transparência continua PNG; PNG sem transparência vira JPEG', async () => {
    const withAlpha = await blank(500, 500, 4).png().toBuffer()
    const kept = await normalizeImage(withAlpha, 'image/png')
    expect(kept!.mimeType).toBe('image/png')
    expect((await sharp(kept!.data).metadata()).hasAlpha).toBe(true)

    const opaque = await blank(500, 500).png().toBuffer()
    const converted = await normalizeImage(opaque, 'image/png')
    expect(converted!.mimeType).toBe('image/jpeg')
  })

  it('deixa GIF e WebP animado como vieram', async () => {
    const gif = await blank(50, 50).gif().toBuffer()
    expect(await normalizeImage(gif, 'image/gif')).toBeNull()

    const frames = await sharp(
      Buffer.concat([Buffer.alloc(50 * 100 * 3, 10), Buffer.alloc(50 * 100 * 3, 200)]),
      { raw: { width: 50, height: 200, channels: 3, pageHeight: 100 } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer()
    expect((await sharp(frames, { animated: true }).metadata()).pages).toBe(2)
    expect(await normalizeImage(frames, 'image/webp')).toBeNull()
  })

  it('arquivo ilegível não derruba o envio: devolve null e avisa o motivo', async () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 7)])
    const onFailure = jest.fn()
    expect(await normalizeImage(broken, 'image/jpeg', { onFailure })).toBeNull()
    expect(onFailure).toHaveBeenCalledTimes(1)
  })
})

describe('thumbKeyFor', () => {
  it('só imagens têm miniatura, ao lado do arquivo', () => {
    expect(thumbKeyFor('reports/abc.jpeg')).toBe('reports/abc.thumb.webp')
    expect(thumbKeyFor('reports/abc.png')).toBe('reports/abc.thumb.webp')
    expect(thumbKeyFor('reports/abc.webp')).toBe('reports/abc.thumb.webp')
    expect(thumbKeyFor('reports/abc.mp4')).toBeNull()
    expect(thumbKeyFor('reports/abc.pdf')).toBeNull()
    expect(thumbKeyFor('reports/abc.gif')).toBeNull()
    expect(thumbKeyFor('reports/abc.thumb.webp')).toBeNull()
  })
})
