import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  displaySize,
  needsTranscode,
  normalizeVideo,
  parseVideoInfo,
  shouldReplace,
  transcodeArgs,
  type VideoInfo,
} from './video-normalize'
import { resolveFfmpegPath } from './video-poster'

jest.setTimeout(120_000)

const info = (over: Partial<VideoInfo> = {}): VideoInfo => ({
  codec: 'h264',
  width: 1920,
  height: 1080,
  rotation: 0,
  durationMs: 3000,
  bitrateKbps: 4000,
  hasAudio: true,
  ...over,
})

// Saídas reais do `ffmpeg -i` (gyan.dev 6.1.1).
const UHD_OUTPUT = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'uhd.mp4':
  Metadata:
    title           : dados-secretos
  Duration: 00:00:03.00, start: 0.000000, bitrate: 34433 kb/s
  Stream #0:0[0x1](und): Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p(progressive), 3840x2160 [SAR 1:1 DAR 16:9], 34352 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)`
const ROTATED_OUTPUT = `  Duration: 00:00:03.00, start: 0.000000, bitrate: 13594 kb/s
  Stream #0:0[0x1](und): Video: h264 (Constrained Baseline) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080 [SAR 1:1 DAR 16:9], 13591 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Side data:
      displaymatrix: rotation of 90.00 degrees`
const HEVC_OUTPUT = `  Duration: 00:00:12.50, start: 0.000000, bitrate: 9000 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p10le(tv, bt2020nc/bt2020/arib-std-b67), 1920x1080, 8900 kb/s, 30 fps
    Side data:
      displaymatrix: rotation of -90.00 degrees`

describe('parseVideoInfo', () => {
  it('lê codec, tamanho, duração, bitrate e áudio', () => {
    expect(parseVideoInfo(UHD_OUTPUT)).toEqual({
      codec: 'h264',
      width: 3840,
      height: 2160,
      rotation: 0,
      durationMs: 3000,
      bitrateKbps: 34433,
      hasAudio: true,
    })
  })

  it('lê a rotação do celular, inclusive negativa, e a duração com fração', () => {
    expect(parseVideoInfo(ROTATED_OUTPUT)).toMatchObject({ rotation: 90, hasAudio: false })
    expect(parseVideoInfo(HEVC_OUTPUT)).toMatchObject({ codec: 'hevc', rotation: 270, durationMs: 12500 })
  })

  it('não confunde o código hexadecimal do codec (0x31637661) com tamanho', () => {
    const parsed = parseVideoInfo(UHD_OUTPUT)!
    expect([parsed.width, parsed.height]).toEqual([3840, 2160])
  })

  it('devolve null quando não há vídeo', () => {
    expect(parseVideoInfo('Stream #0:0: Audio: mp3, 44100 Hz')).toBeNull()
    expect(parseVideoInfo('')).toBeNull()
  })

  it('displaySize troca largura e altura quando a imagem aparece em pé', () => {
    expect(displaySize(info({ rotation: 90 }))).toEqual({ width: 1080, height: 1920 })
    expect(displaySize(info({ rotation: 270 }))).toEqual({ width: 1080, height: 1920 })
    expect(displaySize(info({ rotation: 180 }))).toEqual({ width: 1920, height: 1080 })
  })
})

describe('regras de conversão', () => {
  it('pula só o que já é H.264, até 1080p e com bitrate baixo', () => {
    expect(needsTranscode(info())).toBe(false)
    expect(needsTranscode(info({ width: 1080, height: 1920 }))).toBe(false)
    expect(needsTranscode(info({ bitrateKbps: 13_000 }))).toBe(true)
    expect(needsTranscode(info({ width: 3840, height: 2160 }))).toBe(true)
    expect(needsTranscode(info({ codec: 'hevc' }))).toBe(true)
    expect(needsTranscode(info({ bitrateKbps: null }))).toBe(true)
    expect(needsTranscode(null)).toBe(true)
  })

  it('H.264 só é trocado se o ganho for de pelo menos 10%; HEVC é trocado por compatibilidade', () => {
    expect(shouldReplace(info(), 1000, 800)).toBe(true)
    expect(shouldReplace(info(), 1000, 950)).toBe(false)
    expect(shouldReplace(info({ codec: 'hevc' }), 1000, 1100)).toBe(true)
    expect(shouldReplace(info({ codec: 'hevc' }), 1000, 1500)).toBe(false)
    expect(shouldReplace(info(), 1000, 0)).toBe(false)
  })

  it('o comando limita o lado menor a 1080, remove metadados e deixa o áudio opcional', () => {
    const args = transcodeArgs('in.mov', 'out.mp4')
    const vf = args[args.indexOf('-vf') + 1]
    expect(vf).toContain('min(1080,iw)')
    expect(vf).toContain('min(1080,ih)')
    expect(args).toEqual(expect.arrayContaining(['-map_metadata', '-1', '-c:v', 'libx264', '-c:a', 'aac']))
    expect(args).toContain('0:a:0?')
    expect(args).toContain('+faststart')
    expect(args.slice(-1)[0]).toBe('out.mp4')
  })
})

describe('normalizeVideo (ffmpeg de verdade)', () => {
  const ffmpeg = resolveFfmpegPath()
  const dir = mkdtempSync(join(tmpdir(), 'votz-video-spec-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const make = (name: string, args: string[]) => {
    const out = join(dir, name)
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out], {
      stdio: 'ignore',
      timeout: 60_000,
      killSignal: 'SIGKILL',
    })
    return readFileSync(out)
  }
  // A origem do teste é infinita: o corte de 1 s (`-t`) fica de propósito nas opções de SAÍDA, depois de
  // todas as entradas. Colocado entre duas entradas, ele valeria só para a segunda e o ffmpeg nunca terminaria.
  const lavfi = (size: string, rate: number) => ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=${rate}`]

  it('4K com áudio e metadados vira 1080p H.264, bem menor e sem os metadados', async () => {
    const original = make('uhd.mp4', [
      ...lavfi('3840x2160', 10),
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-t', '1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '30M', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-metadata', 'title=dados-secretos',
    ])
    expect(original.includes(Buffer.from('dados-secretos'))).toBe(true)

    const result = await normalizeVideo(original, 'mp4')
    expect(result.status).toBe('DONE')
    if (result.status !== 'DONE') return
    expect([result.width, result.height]).toEqual([1920, 1080])
    expect(result.data.byteLength).toBeLessThan(original.byteLength / 3)
    expect(result.data.includes(Buffer.from('dados-secretos'))).toBe(false)
    expect(result.durationMs).toBeGreaterThan(900)
    expect(result.durationMs).toBeLessThan(1300)
  })

  it('vídeo de celular em pé (gravado deitado com rotação) fica em pé, 1080x1920, sem a marcação', async () => {
    make('land.mp4', [...lavfi('1920x1080', 10), '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '12M', '-pix_fmt', 'yuv420p'])
    const rotated = make('rot.mp4', ['-display_rotation:v', '90', '-i', join(dir, 'land.mp4'), '-c', 'copy'])

    const result = await normalizeVideo(rotated, 'mp4')
    expect(result.status).toBe('DONE')
    if (result.status !== 'DONE') return
    expect([result.width, result.height]).toEqual([1080, 1920])

    // O resultado já está em pé de verdade: lido de novo, não pede mais conversão nem rotação.
    const again = await normalizeVideo(result.data, 'mp4')
    expect(again.status).toBe('SKIPPED')
    if (again.status === 'SKIPPED') expect([again.width, again.height]).toEqual([1080, 1920])
  })

  it('vídeo leve que já está bom não é refeito', async () => {
    const small = make('small.mp4', [...lavfi('1280x720', 10), '-t', '1', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '1M', '-pix_fmt', 'yuv420p'])
    const result = await normalizeVideo(small, 'mp4')
    expect(result).toMatchObject({ status: 'SKIPPED', width: 1280, height: 720 })
  })

  it('arquivo que não é vídeo não lança erro: devolve FAILED com o motivo', async () => {
    const result = await normalizeVideo(Buffer.alloc(2048, 7), 'mp4')
    expect(result.status).toBe('FAILED')
    if (result.status === 'FAILED') expect(result.reason.length).toBeGreaterThan(0)
  })

  it('extensão estranha não vira caminho perigoso', async () => {
    const result = await normalizeVideo(Buffer.alloc(64), '../../etc/x')
    expect(result.status).toBe('FAILED')
  })
})
