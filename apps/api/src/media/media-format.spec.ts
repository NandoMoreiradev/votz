import {
  MEDIA_FORMATS,
  MEDIA_MIN_CROP_EDGE,
  baseCropSize,
  cropFromView,
  cropToPixels,
  defaultCrop,
  maxCropZoom,
  mediaVariantSizes,
  nearestMediaFormat,
  validateMediaCrop,
  viewFromCrop,
} from '@votz/shared-types'

describe('formatos de mídia (pacote compartilhado)', () => {
  it('os três formatos têm as proporções e tamanhos aprovados', () => {
    expect(MEDIA_FORMATS.SQUARE).toMatchObject({ ratio: 1, width: 1080, height: 1080, ratioLabel: '1:1' })
    expect(MEDIA_FORMATS.PORTRAIT).toMatchObject({ ratio: 0.8, width: 1080, height: 1350, ratioLabel: '4:5' })
    expect(MEDIA_FORMATS.LANDSCAPE).toMatchObject({ width: 1920, height: 1080, ratioLabel: '16:9' })
    for (const spec of Object.values(MEDIA_FORMATS)) expect(spec.width / spec.height).toBeCloseTo(spec.ratio, 5)
  })

  it('escolhe a moldura mais próxima da foto', () => {
    expect(nearestMediaFormat(1000, 1000)).toBe('SQUARE')
    expect(nearestMediaFormat(3024, 4032)).toBe('PORTRAIT') // celular em pé (3:4)
    expect(nearestMediaFormat(1080, 1920)).toBe('PORTRAIT') // 9:16 cai em 4:5
    // 4:3 fica exatamente no meio de 1:1 e 16:9; no empate vale o quadrado, que mostra a foto maior na tela.
    expect(nearestMediaFormat(4032, 3024)).toBe('SQUARE')
    expect(nearestMediaFormat(3000, 1900)).toBe('LANDSCAPE')
    expect(nearestMediaFormat(1920, 1080)).toBe('LANDSCAPE')
    expect(nearestMediaFormat(0, 100)).toBeNull()
    expect(nearestMediaFormat(null, 100)).toBeNull()
  })

  it('o recorte padrão é o maior possível, no centro, com a proporção exata', () => {
    // Foto deitada 4000x3000 em retrato 4:5: altura inteira, largura 2400, centralizada.
    const crop = defaultCrop(4000, 3000, 'PORTRAIT')
    expect(crop.h).toBeCloseTo(1)
    expect(crop.w * 4000).toBeCloseTo(2400)
    expect(crop.x).toBeCloseTo((4000 - 2400) / 2 / 4000)
    expect(validateMediaCrop(4000, 3000, 'PORTRAIT', crop)).toBeNull()
    // Foto em pé 3000x4000 em paisagem 16:9: largura inteira.
    const wide = defaultCrop(3000, 4000, 'LANDSCAPE')
    expect(wide.w).toBeCloseTo(1)
    expect((wide.w * 3000) / (wide.h * 4000)).toBeCloseTo(16 / 9)
  })

  it('zoom e arrasto nunca deixam a moldura sair da foto', () => {
    const crop = cropFromView(4000, 3000, 'SQUARE', { zoom: 2, centerX: 0.99, centerY: 0.01 })
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.w * 4000).toBeCloseTo(1500) // 3000 / 2
    expect(validateMediaCrop(4000, 3000, 'SQUARE', crop)).toBeNull()
  })

  it('o zoom máximo respeita o menor recorte aceito', () => {
    expect(maxCropZoom(4000, 3000, 'SQUARE')).toBe(5)
    // Foto pequena: zoom limitado para o recorte não ficar abaixo de MEDIA_MIN_CROP_EDGE.
    expect(maxCropZoom(400, 400, 'SQUARE')).toBeCloseTo(400 / MEDIA_MIN_CROP_EDGE)
    expect(maxCropZoom(150, 150, 'SQUARE')).toBe(1)
    const tooFar = cropFromView(400, 400, 'SQUARE', { zoom: 10, centerX: 0.5, centerY: 0.5 })
    expect(tooFar.w * 400).toBeCloseTo(MEDIA_MIN_CROP_EDGE)
  })

  it('vista → recorte → vista volta ao mesmo lugar', () => {
    const view = { zoom: 1.7, centerX: 0.4, centerY: 0.55 }
    const crop = cropFromView(3000, 2000, 'LANDSCAPE', view)
    const back = viewFromCrop(3000, 2000, 'LANDSCAPE', crop)
    expect(back.zoom).toBeCloseTo(view.zoom)
    expect(back.centerX).toBeCloseTo(view.centerX)
    expect(back.centerY).toBeCloseTo(view.centerY)
  })

  it('recusa recorte fora da foto, na proporção errada ou pequeno demais', () => {
    expect(validateMediaCrop(1000, 1000, 'SQUARE', { x: 0.5, y: 0, w: 0.6, h: 0.6 })).toMatch(/saiu da foto/)
    expect(validateMediaCrop(1000, 1000, 'SQUARE', { x: 0, y: 0, w: 1, h: 0.5 })).toMatch(/quadrado/)
    expect(validateMediaCrop(1000, 1000, 'SQUARE', { x: 0, y: 0, w: 0.1, h: 0.1 })).toMatch(/pequeno/)
    expect(validateMediaCrop(1000, 1000, 'SQUARE', { x: Number.NaN, y: 0, w: 1, h: 1 })).toMatch(/incompleto/)
  })

  it('recorte em pixels tem a proporção exata e não passa da borda', () => {
    const px = cropToPixels(1001, 777, 'PORTRAIT', { x: 0.3, y: 0, w: 0.62, h: 1 })
    expect(px.left + px.width).toBeLessThanOrEqual(1001)
    expect(px.top + px.height).toBeLessThanOrEqual(777)
    expect(px.width / px.height).toBeCloseTo(0.8, 2)
  })

  it('tamanho das versões: feed com 1080 de largura, cheia até 2048 e nunca menor que a do feed', () => {
    const big = mediaVariantSizes('PORTRAIT', 2400, 3000)
    expect(big.feed).toEqual({ width: 1080, height: 1350 })
    expect(big.full).toEqual({ width: 1638, height: 2048 })
    expect(big.thumb).toEqual({ width: 400, height: 500 })
    expect(big.video).toEqual({ width: 1080, height: 1350 })
    const small = mediaVariantSizes('LANDSCAPE', 640, 360)
    expect(small.full).toEqual({ width: 1080, height: 608 })
    expect(small.video).toEqual({ width: 640, height: 360 }) // vídeo nunca é ampliado
    expect(baseCropSize(640, 360, 'LANDSCAPE')).toEqual({ width: 640, height: 360 })
  })
})
