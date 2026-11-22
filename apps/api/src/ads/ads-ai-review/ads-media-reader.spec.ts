import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { resolveFfmpegPath } from '../../storage/video-poster'
import { AD_AUDIO_MAX_SECONDS, AD_MEDIA_MAX_SIDE, AD_VIDEO_FRAME_COUNT, AdMediaReader, audioArgs, frameArgs, imageForReading, videoFrameTimes } from './ads-media-reader'

describe('videoFrameTimes', () => {
  it('pega um quadro no meio de cada fatia igual, do começo ao fim', () => {
    expect(videoFrameTimes(60)).toEqual([5, 15, 25, 35, 45, 55])
    expect(videoFrameTimes(12)).toEqual([1, 3, 5, 7, 9, 11])
  })
  it('vídeo muito curto vira um quadro só; duração inválida, o primeiro quadro', () => {
    expect(videoFrameTimes(1.5)).toEqual([0.75])
    expect(videoFrameTimes(0)).toEqual([0])
    expect(videoFrameTimes(Number.NaN)).toEqual([0])
  })
  it('nunca passa do número de quadros combinado', () => {
    expect(videoFrameTimes(600)).toHaveLength(AD_VIDEO_FRAME_COUNT)
  })
})

describe('frameArgs', () => {
  it('tira um quadro no instante pedido, com o lado maior limitado', () => {
    const args = frameArgs('in.mp4', 'out.jpg', 3.5)
    expect(args[args.indexOf('-ss') + 1]).toBe('3.5')
    expect(args).toContain('-frames:v')
    expect(args.join(' ')).toContain(`min(${AD_MEDIA_MAX_SIDE},iw)`)
    expect(args[args.length - 1]).toBe('out.jpg')
  })
})

describe('audioArgs', () => {
  it('extrai só o som, em mp3 mono leve, com teto de duração', () => {
    const args = audioArgs('in.mp4', 'out.mp3')
    expect(args).toContain('-vn')
    expect(args.join(' ')).toContain('-map 0:a:0')
    expect(args.join(' ')).toContain('-ac 1')
    expect(args[args.indexOf('-t') + 1]).toBe(String(AD_AUDIO_MAX_SECONDS))
    expect(args[args.length - 1]).toBe('out.mp3')
  })
})

describe('imageForReading', () => {
  it('diminui foto grande (lado maior 1024), em JPEG, sem mudar a proporção', async () => {
    const big = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const out = await imageForReading(big)
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(1024)
    expect(meta.height).toBe(768)
  })
  it('não aumenta foto pequena', async () => {
    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#00ff00' } }).jpeg().toBuffer()
    const meta = await sharp(await imageForReading(small)).metadata()
    expect([meta.width, meta.height]).toEqual([400, 300])
  })
})

describe('AdMediaReader', () => {
  const storage = { getObjectBuffer: jest.fn() }
  const reader = new AdMediaReader(storage as never)
  beforeEach(() => jest.resetAllMocks())

  it('foto: lê a versão do feed e devolve uma imagem reduzida', async () => {
    storage.getObjectBuffer.mockResolvedValue(await sharp({ create: { width: 1440, height: 1800, channels: 3, background: '#123456' } }).jpeg().toBuffer())
    const reading = await reader.read({ kind: 'IMAGE', key: 'posts/a.jpg', feedKey: 'posts/a.feed.jpg', durationMs: null })
    expect(storage.getObjectBuffer).toHaveBeenCalledWith('posts/a.feed.jpg')
    expect(reading).toMatchObject({ kind: 'IMAGE', durationSeconds: null })
    expect(reading?.parts).toHaveLength(1)
    expect((await sharp(reading!.parts[0].data).metadata()).height).toBe(1024)
  })

  it('devolve null quando o arquivo não existe, não é imagem ou é GIF (nunca lança)', async () => {
    storage.getObjectBuffer.mockResolvedValueOnce(null)
    await expect(reader.read({ kind: 'IMAGE', key: 'x', feedKey: null, durationMs: null })).resolves.toBeNull()
    storage.getObjectBuffer.mockResolvedValueOnce(Buffer.from('isto não é uma imagem'))
    await expect(reader.read({ kind: 'IMAGE', key: 'x', feedKey: null, durationMs: null })).resolves.toBeNull()
    await expect(reader.read({ kind: 'GIF', key: 'x', feedKey: null, durationMs: null })).resolves.toBeNull()
    await expect(reader.read({ kind: 'IMAGE', key: null, feedKey: null, durationMs: null })).resolves.toBeNull()
  })

  describe('vídeo (ffmpeg de verdade)', () => {
    const ffmpeg = resolveFfmpegPath()
    const dir = mkdtempSync(join(tmpdir(), 'votz-ads-reader-spec-'))
    afterAll(() => rmSync(dir, { recursive: true, force: true }))
    const make = (name: string, seconds: number, withSound = false) => {
      const out = join(dir, name)
      const sound = withSound ? ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=' + seconds, '-c:a', 'aac'] : []
      execFileSync(
        ffmpeg,
        ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1080:rate=10', ...sound, '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', out],
        { stdio: 'ignore', timeout: 60_000, killSignal: 'SIGKILL' },
      )
      return readFileSync(out)
    }

    it('tira os quadros combinados, reduzidos e com a legenda de cada um', async () => {
      storage.getObjectBuffer.mockResolvedValue(make('seis.mp4', 6))
      const reading = await reader.read({ kind: 'VIDEO', key: 'posts/v.mp4', feedKey: null, durationMs: 6000 })
      expect(reading?.kind).toBe('VIDEO')
      expect(reading?.durationSeconds).toBeCloseTo(6, 0)
      expect(reading?.parts).toHaveLength(AD_VIDEO_FRAME_COUNT)
      expect(reading?.parts[0].label).toBe('Quadro 1 de 6 do vídeo, aos 1 s.')
      const meta = await sharp(reading!.parts[2].data).metadata()
      expect(meta.format).toBe('jpeg')
      expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(AD_MEDIA_MAX_SIDE)
    }, 60_000)

    it('vídeo sem faixa de som: não há áudio para ouvir', async () => {
      storage.getObjectBuffer.mockResolvedValue(make('mudo.mp4', 4))
      const reading = await reader.read({ kind: 'VIDEO', key: 'posts/v.mp4', feedKey: null, durationMs: 4000 })
      expect(reading).toMatchObject({ kind: 'VIDEO', hasAudioTrack: false, audio: null })
    }, 60_000)

    it('vídeo com som: extrai o áudio em mp3 leve e diz que tem faixa', async () => {
      storage.getObjectBuffer.mockResolvedValue(make('com-som.mp4', 6, true))
      const reading = await reader.read({ kind: 'VIDEO', key: 'posts/v.mp4', feedKey: null, durationMs: 6000 })
      expect(reading?.hasAudioTrack).toBe(true)
      expect(reading?.audio).toMatchObject({ mimeType: 'audio/mp3' })
      expect(reading?.audio?.seconds).toBe(6)
      // mp3 de verdade (cabeçalho ID3 ou sincronismo de quadro) e leve: seis segundos em mono a 48 kbps cabem em poucas dezenas de KB.
      const head = reading!.audio!.data
      expect(head.subarray(0, 3).toString() === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)).toBe(true)
      expect(head.length).toBeGreaterThan(1000)
      expect(head.length).toBeLessThan(100_000)
    }, 60_000)

    it('a foto não tem áudio', async () => {
      storage.getObjectBuffer.mockResolvedValue(await sharp({ create: { width: 800, height: 800, channels: 3, background: '#abcdef' } }).jpeg().toBuffer())
      const reading = await reader.read({ kind: 'IMAGE', key: 'posts/a.jpg', feedKey: 'posts/a.feed.jpg', durationMs: null })
      expect(reading).toMatchObject({ kind: 'IMAGE', hasAudioTrack: false, audio: null })
    })

    it('arquivo que não é vídeo devolve null', async () => {
      storage.getObjectBuffer.mockResolvedValue(Buffer.from('lixo que não é vídeo'))
      await expect(reader.read({ kind: 'VIDEO', key: 'posts/v.mp4', feedKey: null, durationMs: 6000 })).resolves.toBeNull()
    }, 60_000)
  })
})
