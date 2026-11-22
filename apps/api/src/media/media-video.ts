import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { cropToPixels, mediaVariantSizes, type MediaCrop, type MediaFormat } from '@votz/shared-types'
import { resolveFfmpegPath } from '../storage/video-poster'
import { displaySize, probe, runFfmpeg } from '../storage/video-normalize'

const RENDER_TIMEOUT_MS = 15 * 60_000
const POSTER_TIMEOUT_MS = 60_000
const SAFE_EXT = /^[a-z0-9]{2,4}$/i

export interface VideoProbe {
  /** Como a pessoa vê (vídeo gravado em pé já aparece em pé). */
  width: number
  height: number
  durationMs: number | null
}

async function withTempDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'votz-media-'))
  try {
    return await work(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Lê largura, altura e duração do vídeo. Null quando o arquivo não é um vídeo legível. */
export async function probeVideoBuffer(input: Buffer, extension: string, ffmpegPath?: string): Promise<VideoProbe | null> {
  const binary = ffmpegPath || resolveFfmpegPath()
  const ext = SAFE_EXT.test(extension) ? extension.toLowerCase() : 'mp4'
  return withTempDir(async (dir) => {
    const path = join(dir, `in.${ext}`)
    await writeFile(path, input)
    const info = await probe(binary, path)
    if (!info) return null
    return { ...displaySize(info), durationMs: info.durationMs }
  })
}

/**
 * Argumentos do ffmpeg para recortar e converter: recorte em pixels da imagem como a pessoa vê (o ffmpeg
 * aplica a rotação do celular antes dos filtros), tamanho exato do formato, H.264 + AAC, sem metadados
 * (some a localização), pronto para tocar enquanto baixa.
 */
export function renderVideoArgs(
  inputPath: string,
  outputPath: string,
  region: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number },
): string[] {
  const filter = `crop=${region.width}:${region.height}:${region.left}:${region.top},scale=${size.width}:${size.height}:flags=lanczos,setsar=1`
  return [
    '-hide_banner', '-y',
    '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-vf', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-maxrate', '5000k', '-bufsize', '10000k',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ]
}

/** Capa: quadro em ~1 s (ou o primeiro, em vídeo curto), no tamanho do vídeo, JPEG. */
export function posterArgs(inputPath: string, outputPath: string, durationMs: number | null): string[] {
  const at = durationMs !== null && durationMs < 2000 ? '0' : '1'
  return ['-hide_banner', '-y', '-ss', at, '-i', inputPath, '-frames:v', '1', '-q:v', '3', outputPath]
}

export type VideoRender =
  | { status: 'DONE'; video: Buffer; poster: Buffer | null; width: number; height: number; durationMs: number | null }
  | { status: 'FAILED'; reason: string }

/**
 * Recorta e converte o vídeo no formato escolhido. Nunca lança erro: devolve FAILED com o motivo.
 * O recorte é aplicado sobre o tamanho lido do próprio arquivo (o mesmo que o envio conferiu).
 */
export async function renderVideo(
  input: Buffer,
  extension: string,
  format: MediaFormat,
  crop: MediaCrop,
  options: { ffmpegPath?: string } = {},
): Promise<VideoRender> {
  const binary = options.ffmpegPath || resolveFfmpegPath()
  const ext = SAFE_EXT.test(extension) ? extension.toLowerCase() : 'mp4'
  try {
    return await withTempDir(async (dir) => {
      const inPath = join(dir, `in.${ext}`)
      const outPath = join(dir, 'out.mp4')
      const posterPath = join(dir, 'poster.jpg')
      await writeFile(inPath, input)

      const info = await probe(binary, inPath)
      if (!info) return { status: 'FAILED' as const, reason: 'o arquivo não é um vídeo legível' }
      const shown = displaySize(info)
      const region = cropToPixels(shown.width, shown.height, format, crop)
      const size = mediaVariantSizes(format, region.width, region.height).video

      const run = await runFfmpeg(binary, renderVideoArgs(inPath, outPath, region, size), RENDER_TIMEOUT_MS, 'tail')
      if (!run.ok) return { status: 'FAILED' as const, reason: run.stderr.trim().split('\n').slice(-3).join(' | ') || 'ffmpeg falhou' }

      const video = await readFile(outPath)
      const result = await probe(binary, outPath)
      if (!result) return { status: 'FAILED' as const, reason: 'o vídeo convertido não pôde ser lido' }

      // A capa é um extra: sem ela, os apps mostram o primeiro quadro.
      const posterRun = await runFfmpeg(binary, posterArgs(outPath, posterPath, result.durationMs), POSTER_TIMEOUT_MS, 'tail')
      const poster = posterRun.ok ? await readFile(posterPath).catch(() => null) : null
      const out = displaySize(result)
      return { status: 'DONE' as const, video, poster, width: out.width, height: out.height, durationMs: result.durationMs ?? info.durationMs }
    })
  } catch (error) {
    return { status: 'FAILED', reason: error instanceof Error ? error.message : String(error) }
  }
}
