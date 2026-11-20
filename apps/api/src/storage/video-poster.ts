import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegStatic from 'ffmpeg-static'

/** A capa de um vídeo `reports/abc.mp4` fica ao lado dele, em `reports/abc.poster.jpg`. */
export const POSTER_SUFFIX = '.poster.jpg'
const VIDEO_KEY = /\.(mp4|mov|m4v|webm)$/i
const POSTER_WIDTH = 960
const POSTER_TIMEOUT_MS = 30_000

export function isVideoKey(key: string): boolean {
  return VIDEO_KEY.test(key)
}

/** Chave da capa de um vídeo, ou null quando a chave não é de vídeo. */
export function posterKeyFor(videoKey: string): string | null {
  return isVideoKey(videoKey) ? videoKey.replace(VIDEO_KEY, POSTER_SUFFIX) : null
}

/** FFMPEG_PATH (ex.: ffmpeg do sistema) > binário do pacote ffmpeg-static > "ffmpeg" no PATH. */
export function resolveFfmpegPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.FFMPEG_PATH?.trim() || ffmpegStatic || 'ffmpeg'
}

function runFfmpeg(binary: string, args: string[]): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    let settled = false
    const done = (ok: boolean) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ ok, stderr }) } }
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => { child.kill('SIGKILL'); stderr += ' (tempo esgotado)'; done(false) }, POSTER_TIMEOUT_MS)
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000) })
    child.on('error', (error) => { stderr += ` ${error.message}`; done(false) })
    child.on('close', (code) => done(code === 0))
  })
}

const isJpeg = (buffer: Buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff

/**
 * Extrai um quadro do vídeo (1 s de início; se o vídeo for mais curto, o primeiro quadro) como JPEG de até
 * 960 px de largura. O ffmpeg já corrige a rotação dos vídeos gravados em pé. Devolve null se não der:
 * a capa é um extra e nunca pode impedir o envio do vídeo.
 */
export async function generateVideoPoster(
  video: Buffer,
  extension: string,
  options: { ffmpegPath?: string; onFailure?: (reason: string) => void } = {},
): Promise<Buffer | null> {
  const binary = options.ffmpegPath ?? resolveFfmpegPath()
  const safeExtension = /^[a-z0-9]{2,4}$/i.test(extension) ? extension : 'mp4'
  const dir = await mkdtemp(join(tmpdir(), 'votz-poster-'))
  try {
    const input = join(dir, `input.${safeExtension}`)
    const output = join(dir, 'poster.jpg')
    await writeFile(input, video)
    let lastError = ''
    for (const seek of ['1', '0']) {
      const result = await runFfmpeg(binary, [
        '-hide_banner', '-loglevel', 'error', '-y', '-ss', seek, '-i', input,
        '-frames:v', '1', '-vf', `scale='min(${POSTER_WIDTH},iw)':-2`, '-q:v', '4', output,
      ])
      lastError = result.stderr
      const image = await readFile(output).catch(() => null)
      if (result.ok && image && isJpeg(image)) return image
      await rm(output, { force: true })
    }
    options.onFailure?.(lastError.trim() || 'ffmpeg não gerou imagem')
    return null
  } catch (error) {
    options.onFailure?.(error instanceof Error ? error.message : String(error))
    return null
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
