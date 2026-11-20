import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generateVideoPoster, isVideoKey, posterKeyFor, resolveFfmpegPath } from './video-poster'

describe('video-poster (regras puras)', () => {
  it('a capa fica ao lado do vídeo, com o mesmo nome base', () => {
    expect(posterKeyFor('reports/abc-123.mp4')).toBe('reports/abc-123.poster.jpg')
    expect(posterKeyFor('posts/abc.MOV')).toBe('posts/abc.poster.jpg')
    expect(posterKeyFor('comments/x.webm')).toBe('comments/x.poster.jpg')
  })

  it('só vídeos têm capa (imagem, PDF e a própria capa não)', () => {
    for (const key of ['reports/a.jpeg', 'reports/a.png', 'reports/a.pdf', 'reports/a.poster.jpg', 'chat/blob.bin', 'reports/a.mp4.txt']) {
      expect(posterKeyFor(key)).toBeNull()
      expect(isVideoKey(key)).toBe(false)
    }
  })

  it('escolhe o ffmpeg: variável de ambiente, depois o binário do pacote, depois o PATH', () => {
    expect(resolveFfmpegPath({ FFMPEG_PATH: ' /usr/bin/ffmpeg ' } as NodeJS.ProcessEnv)).toBe('/usr/bin/ffmpeg')
    const fromPackage = resolveFfmpegPath({} as NodeJS.ProcessEnv)
    expect(typeof fromPackage).toBe('string')
    expect(fromPackage.length).toBeGreaterThan(0)
  })
})

describe('generateVideoPoster (ffmpeg de verdade)', () => {
  const ffmpeg = resolveFfmpegPath()
  const probe = spawnSync(ffmpeg, ['-version'], { windowsHide: true })
  const available = !probe.error && probe.status === 0
  const dir = mkdtempSync(join(tmpdir(), 'votz-poster-spec-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  function makeVideo(name: string, seconds: number, size: string): Buffer {
    const file = join(dir, name)
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=duration=${seconds}:size=${size}:rate=10`, '-pix_fmt', 'yuv420p', file], { windowsHide: true })
    if (result.status !== 0) throw new Error(`não gerou vídeo de teste: ${result.stderr?.toString()}`)
    return readFileSync(file)
  }
  const jpegSize = (jpeg: Buffer) => {
    // Lê largura e altura do primeiro marcador SOF do JPEG.
    for (let i = 2; i < jpeg.length - 9; ) {
      if (jpeg[i] !== 0xff) { i++; continue }
      const marker = jpeg[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) }
      i += 2 + jpeg.readUInt16BE(i + 2)
    }
    return null
  }

  const run = available ? it : it.skip

  run('extrai um JPEG reduzido para 960 px de largura de um vídeo grande', async () => {
    const poster = await generateVideoPoster(makeVideo('grande.mp4', 3, '1920x1080'), 'mp4')
    expect(poster).not.toBeNull()
    expect(poster![0]).toBe(0xff)
    expect(poster![1]).toBe(0xd8)
    expect(jpegSize(poster!)).toEqual({ width: 960, height: 540 })
  }, 30_000)

  run('não amplia vídeo pequeno e mantém vídeo em pé inteiro', async () => {
    const poster = await generateVideoPoster(makeVideo('pe.mp4', 2, '360x640'), 'mp4')
    expect(jpegSize(poster!)).toEqual({ width: 360, height: 640 })
  }, 30_000)

  run('vídeo mais curto que 1 segundo ainda gera capa (usa o primeiro quadro)', async () => {
    const poster = await generateVideoPoster(makeVideo('curto.mp4', 0.3, '320x240'), 'mp4')
    expect(poster).not.toBeNull()
    expect(jpegSize(poster!)).toEqual({ width: 320, height: 240 })
  }, 30_000)

  run('arquivo que não é vídeo devolve null e avisa o motivo, sem lançar erro', async () => {
    const reasons: string[] = []
    const poster = await generateVideoPoster(Buffer.from('isto não é um vídeo'), 'mp4', { onFailure: (reason) => reasons.push(reason) })
    expect(poster).toBeNull()
    expect(reasons).toHaveLength(1)
    expect(reasons[0].length).toBeGreaterThan(0)
  }, 30_000)

  it('ffmpeg inexistente devolve null em vez de derrubar o envio', async () => {
    const reasons: string[] = []
    const poster = await generateVideoPoster(Buffer.from('qualquer'), 'mp4', { ffmpegPath: join(dir, 'nao-existe'), onFailure: (reason) => reasons.push(reason) })
    expect(poster).toBeNull()
    expect(reasons).toHaveLength(1)
  })

  it('extensão estranha não vira caminho ou argumento perigoso', async () => {
    const poster = await generateVideoPoster(Buffer.from('x'), '../../etc/passwd', { ffmpegPath: join(dir, 'nao-existe') })
    expect(poster).toBeNull()
  })
})
