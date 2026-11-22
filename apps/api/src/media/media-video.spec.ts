import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { defaultCrop } from '@votz/shared-types'
import { resolveFfmpegPath } from '../storage/video-poster'
import { posterArgs, probeVideoBuffer, renderVideo, renderVideoArgs } from './media-video'

describe('argumentos do ffmpeg', () => {
  it('recorta, ajusta ao tamanho do formato, remove metadados e deixa o áudio opcional', () => {
    const args = renderVideoArgs('in.mp4', 'out.mp4', { left: 10, top: 20, width: 640, height: 640 }, { width: 640, height: 640 })
    expect(args).toContain('crop=640:640:10:20,scale=640:640:flags=lanczos,setsar=1')
    expect(args.join(' ')).toContain('-map_metadata -1')
    expect(args.join(' ')).toContain('-map 0:a:0?')
    expect(args.join(' ')).toContain('+faststart')
    expect(args[args.length - 1]).toBe('out.mp4')
  })

  it('a capa sai do primeiro quadro em vídeo curto', () => {
    expect(posterArgs('a', 'b', 900)).toContain('0')
    expect(posterArgs('a', 'b', 5000)[posterArgs('a', 'b', 5000).indexOf('-ss') + 1]).toBe('1')
  })
})

describe('renderVideo (ffmpeg de verdade)', () => {
  const ffmpeg = resolveFfmpegPath()
  const dir = mkdtempSync(join(tmpdir(), 'votz-media-spec-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const make = (name: string, args: string[]) => {
    const out = join(dir, name)
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out], { stdio: 'ignore', timeout: 60_000, killSignal: 'SIGKILL' })
    return readFileSync(out)
  }
  const lavfi = (size: string) => ['-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=10`]

  it('vídeo deitado vira quadrado, H.264, sem metadados, com capa', async () => {
    const original = make('land.mp4', [
      ...lavfi('1280x720'),
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
      '-metadata', 'title=dados-secretos',
    ])
    const probe = await probeVideoBuffer(original, 'mp4')
    expect(probe).toMatchObject({ width: 1280, height: 720 })

    const result = await renderVideo(original, 'mp4', 'SQUARE', defaultCrop(1280, 720, 'SQUARE'))
    expect(result.status).toBe('DONE')
    if (result.status !== 'DONE') return
    expect([result.width, result.height]).toEqual([720, 720])
    expect(result.video.includes(Buffer.from('dados-secretos'))).toBe(false)
    expect(result.poster).not.toBeNull()
    expect(result.durationMs).toBeGreaterThan(800)
  })

  it('vídeo de celular em pé (rotação marcada) é recortado no que a pessoa vê: retrato 4:5', async () => {
    make('wide.mp4', [...lavfi('1920x1080'), '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p'])
    const rotated = make('rot.mp4', ['-display_rotation:v', '90', '-i', join(dir, 'wide.mp4'), '-c', 'copy'])
    const probe = await probeVideoBuffer(rotated, 'mp4')
    expect(probe).toMatchObject({ width: 1080, height: 1920 })

    const result = await renderVideo(rotated, 'mp4', 'PORTRAIT', defaultCrop(1080, 1920, 'PORTRAIT'))
    expect(result.status).toBe('DONE')
    if (result.status === 'DONE') expect([result.width, result.height]).toEqual([1080, 1350])
  })

  it('arquivo que não é vídeo não lança erro', async () => {
    expect(await probeVideoBuffer(Buffer.from('nada'), 'mp4')).toBeNull()
    const result = await renderVideo(Buffer.from('nada'), 'mp4', 'SQUARE', { x: 0, y: 0, w: 1, h: 1 })
    expect(result.status).toBe('FAILED')
  })
})
