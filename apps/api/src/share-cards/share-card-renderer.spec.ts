import * as zlib from 'node:zlib'
import { ShareCardFormat } from '@prisma/client'
import {
  formatDateBr,
  formatDateTimeBr,
  formatDurationPtBr,
  formatPercentPtBr,
  truncateWithEllipsis,
  VOTZ_BRAND_COLORS,
} from '../common/branding/votz-visual'
import { ShareCardRendererService } from './share-card-renderer.service'

interface DecodedPng {
  width: number
  height: number
  bpp: number
  pixels: Uint8Array
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePng(buffer: Buffer): DecodedPng {
  const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!buffer.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error('Invalid PNG signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG bitDepth=${bitDepth}, colorType=${colorType}`)
  }

  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks))
  const pixels = new Uint8Array(height * stride)

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    const filter = inflated[rowStart]
    const outRow = y * stride
    const prevRow = (y - 1) * stride

    for (let x = 0; x < stride; x++) {
      const raw = inflated[rowStart + 1 + x]
      const a = x >= bpp ? pixels[outRow + x - bpp] : 0
      const b = y > 0 ? pixels[prevRow + x] : 0
      const c = y > 0 && x >= bpp ? pixels[prevRow + x - bpp] : 0

      let val = raw
      if (filter === 1) val = (raw + a) & 0xff
      else if (filter === 2) val = (raw + b) & 0xff
      else if (filter === 3) val = (raw + ((a + b) >> 1)) & 0xff
      else if (filter === 4) val = (raw + paethPredictor(a, b, c)) & 0xff
      pixels[outRow + x] = val
    }
  }

  return { width, height, bpp, pixels }
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ]
}

function assertCleanHorizontalMargins(
  png: DecodedPng,
  marginCols = 40,
  bgHex: string = VOTZ_BRAND_COLORS.neutral,
): void {
  const [bgR, bgG, bgB] = hexToRgb(bgHex)
  const stride = png.width * png.bpp

  for (let y = 0; y < png.height; y++) {
    const rowOffset = y * stride
    for (let x = 0; x < marginCols; x++) {
      const idx = rowOffset + x * png.bpp
      if (
        png.pixels[idx] !== bgR ||
        png.pixels[idx + 1] !== bgG ||
        png.pixels[idx + 2] !== bgB
      ) {
        throw new Error(
          `Left margin pixel mismatch at (${x}, ${y}): got rgb(${png.pixels[idx]},${png.pixels[idx + 1]},${png.pixels[idx + 2]}) expected rgb(${bgR},${bgG},${bgB})`,
        )
      }
    }
    for (let x = png.width - marginCols; x < png.width; x++) {
      const idx = rowOffset + x * png.bpp
      if (
        png.pixels[idx] !== bgR ||
        png.pixels[idx + 1] !== bgG ||
        png.pixels[idx + 2] !== bgB
      ) {
        throw new Error(
          `Right margin pixel mismatch at (${x}, ${y}): got rgb(${png.pixels[idx]},${png.pixels[idx + 1]},${png.pixels[idx + 2]}) expected rgb(${bgR},${bgG},${bgB})`,
        )
      }
    }
  }
}

describe('ShareCardRendererService visual regression & Votz formatting (4C.2)', () => {
  const renderer = new ShareCardRendererService()

  it('V1: FEED and STORIES preserve 1080x1350 / 1080x1920 dimensions and keep outer 40px margins untouched', async () => {
    const scenarios = [
      {
        label: 'normal',
        politicianName: 'Marina Silva Exemplo',
        roleLabel: 'Vereadora · PT',
        territoryLabel: 'São Paulo / SP',
        received: 120,
        resolved: 68,
        medianResponseHours: 18.5,
        suppressed: false,
      },
      {
        label: 'long-and-5digits',
        politicianName: 'Maria Fernanda Albuquerque Cavalcanti de Vasconcelos Neto',
        roleLabel: 'Deputada Federal Coordenadora da Frente Parlamentar Municipal',
        territoryLabel: 'Região Metropolitana de São José dos Campos / SP',
        received: 99999,
        resolved: 54321,
        medianResponseHours: 141.6,
        suppressed: false,
      },
      {
        label: 'suppressed',
        politicianName: 'Carlos Eduardo Pereira Mendes',
        roleLabel: 'Vereador · PSB',
        territoryLabel: 'Belo Horizonte / MG',
        received: 3,
        resolved: 2,
        medianResponseHours: null,
        suppressed: true,
      },
    ]

    for (const s of scenarios) {
      const feedBuf = await renderer.renderPng({
        format: ShareCardFormat.FEED,
        politicianName: s.politicianName,
        roleLabel: s.roleLabel,
        territoryLabel: s.territoryLabel,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        received: s.received,
        resolved: s.resolved,
        medianResponseHours: s.medianResponseHours,
        suppressed: s.suppressed,
        publicUrl: 'https://votz.org.br/transparencia/pol-123456',
      })
      const feedPng = decodePng(feedBuf)
      expect(feedPng.width).toBe(1080)
      expect(feedPng.height).toBe(1350)
      assertCleanHorizontalMargins(feedPng, 40)

      const storiesBuf = await renderer.renderPng({
        format: ShareCardFormat.STORIES,
        politicianName: s.politicianName,
        roleLabel: s.roleLabel,
        territoryLabel: s.territoryLabel,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        received: s.received,
        resolved: s.resolved,
        medianResponseHours: s.medianResponseHours,
        suppressed: s.suppressed,
        publicUrl: 'https://votz.org.br/transparencia/pol-123456',
      })
      const storiesPng = decodePng(storiesBuf)
      expect(storiesPng.width).toBe(1080)
      expect(storiesPng.height).toBe(1920)
      assertCleanHorizontalMargins(storiesPng, 40)
    }
  })

  it('V3: formats dates in dd/mm/aaaa, decimals with comma, >48h in days, and truncates with ellipsis', () => {
    expect(formatDateBr('2026-10-01')).toBe('01/10/2026')
    expect(formatDateBr('2026-10-31')).toBe('31/10/2026')
    expect(formatDateTimeBr('2026-11-01T12:00:00.000Z')).toBe('01/11/2026 09:00')

    expect(formatDurationPtBr(18.5)).toBe('18,5 h')
    expect(formatDurationPtBr(14)).toBe('14 h')
    expect(formatDurationPtBr(141.6)).toBe('5,9 dias')
    expect(formatDurationPtBr(null)).toBe('—')

    expect(formatPercentPtBr(52.2)).toBe('52,2%')
    expect(formatPercentPtBr(80)).toBe('80%')
    expect(formatPercentPtBr(null)).toBe('—')

    expect(
      truncateWithEllipsis('Título muito longo   com espaços   extras além do limite permitido', 25),
    ).toBe('Título muito longo com...')
  })
})
