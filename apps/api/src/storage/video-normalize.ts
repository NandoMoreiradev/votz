import { spawn } from 'child_process'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { resolveFfmpegPath } from './video-poster'

/** "1080p": o lado menor do vídeo guardado não passa disso (em pé ou deitado). */
export const VIDEO_MAX_SHORT_EDGE = 1080
/** Vídeo H.264 de até 1080p com bitrate abaixo disso já está bom: não vale gastar CPU para recomprimir. */
export const VIDEO_SKIP_MAX_KBPS = 6000
/** O resultado só substitui o original se for pelo menos isso menor (quando o original já era H.264). */
export const VIDEO_MIN_SAVING = 0.1
const TRANSCODE_TIMEOUT_MS = 10 * 60_000
const PROBE_TIMEOUT_MS = 30_000

export interface VideoInfo {
  codec: string
  width: number
  height: number
  /** Graus que o celular marcou no arquivo (0, 90, 180 ou 270). Em 90/270 a imagem aparece em pé. */
  rotation: number
  durationMs: number | null
  /** Bitrate total do arquivo, em kb/s. */
  bitrateKbps: number | null
  hasAudio: boolean
}

/** Lê o que o ffmpeg imprime ao abrir um arquivo (`ffmpeg -i`). Devolve null se não achar um vídeo. */
export function parseVideoInfo(stderr: string): VideoInfo | null {
  const video = stderr.match(/Stream #\d+:\d+[^\n]*?: Video: ([^\s,(]+)[^\n]*?\b(\d{2,5})x(\d{2,5})\b/)
  if (!video) return null
  const duration = stderr.match(/Duration: (\d+):(\d{2}):(\d{2})(?:\.(\d+))?/)
  const bitrate = stderr.match(/Duration:[^\n]*?bitrate: (\d+) kb\/s/)
  const rotation = stderr.match(/displaymatrix: rotation of (-?\d+(?:\.\d+)?) degrees/)
  const normalized = rotation ? ((Math.round(Number(rotation[1])) % 360) + 360) % 360 : 0
  return {
    codec: video[1].toLowerCase(),
    width: Number(video[2]),
    height: Number(video[3]),
    rotation: normalized,
    durationMs: duration
      ? Math.round(
          (Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3])) * 1000 +
            (duration[4] ? Number(`0.${duration[4]}`) * 1000 : 0),
        )
      : null,
    bitrateKbps: bitrate ? Number(bitrate[1]) : null,
    hasAudio: /Stream #\d+:\d+[^\n]*?: Audio:/.test(stderr),
  }
}

/** Largura e altura como a pessoa vê (celular em pé grava deitado com marcação de rotação). */
export function displaySize(info: Pick<VideoInfo, 'width' | 'height' | 'rotation'>) {
  return info.rotation === 90 || info.rotation === 270
    ? { width: info.height, height: info.width }
    : { width: info.width, height: info.height }
}

/** Sem dados do vídeo (ffmpeg não leu), converte por garantia. */
export function needsTranscode(info: VideoInfo | null): boolean {
  if (!info) return true
  const shortEdge = Math.min(info.width, info.height)
  const light = info.bitrateKbps !== null && info.bitrateKbps <= VIDEO_SKIP_MAX_KBPS
  return !(info.codec === 'h264' && shortEdge <= VIDEO_MAX_SHORT_EDGE && light)
}

/**
 * Vídeo que não era H.264 (ex.: HEVC do iPhone) é trocado mesmo sem ganho grande, porque H.264 toca em
 * qualquer navegador. Os demais só se o resultado ficar pelo menos VIDEO_MIN_SAVING menor.
 */
export function shouldReplace(info: VideoInfo | null, originalBytes: number, convertedBytes: number): boolean {
  if (convertedBytes <= 0) return false
  if (info && info.codec !== 'h264') return convertedBytes <= originalBytes * 1.2
  return convertedBytes <= originalBytes * (1 - VIDEO_MIN_SAVING)
}

/** Argumentos do ffmpeg: H.264 + AAC, lado menor até 1080, sem metadados, pronto para tocar enquanto baixa. */
export function transcodeArgs(inputPath: string, outputPath: string): string[] {
  const scale =
    `scale=w='if(gt(iw,ih),-2,min(${VIDEO_MAX_SHORT_EDGE},iw))':` +
    `h='if(gt(iw,ih),min(${VIDEO_MAX_SHORT_EDGE},ih),-2)'`
  return [
    '-hide_banner', '-y',
    '-i', inputPath,
    '-map', '0:v:0', '-map', '0:a:0?',
    '-map_metadata', '-1', '-map_chapters', '-1',
    '-vf', scale,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25',
    '-maxrate', '5000k', '-bufsize', '10000k',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-movflags', '+faststart',
    outputPath,
  ]
}

function runFfmpeg(
  binary: string,
  args: string[],
  timeoutMs: number,
  keep: 'head' | 'tail',
): Promise<{ ok: boolean; stderr: string }> {
  const LIMIT = 12_000
  return new Promise((resolve) => {
    let stderr = ''
    let settled = false
    const done = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ok, stderr })
    }
    const child = spawn(binary, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      stderr += ' (tempo esgotado)'
      done(false)
    }, timeoutMs)
    child.stderr.on('data', (chunk: Buffer) => {
      const next = stderr + chunk.toString()
      stderr = keep === 'head' ? next.slice(0, LIMIT) : next.slice(-LIMIT)
    })
    child.on('error', (error) => {
      stderr += ` ${error.message}`
      done(false)
    })
    child.on('close', (code) => done(code === 0))
  })
}

/** `ffmpeg -i arquivo` sem saída sempre "falha", mas o cabeçalho com os dados do vídeo vem no começo da mensagem. */
async function probe(binary: string, path: string): Promise<VideoInfo | null> {
  const { stderr } = await runFfmpeg(binary, ['-hide_banner', '-i', path], PROBE_TIMEOUT_MS, 'head')
  return parseVideoInfo(stderr)
}

export type VideoNormalization =
  | {
      status: 'DONE'
      data: Buffer
      width: number
      height: number
      durationMs: number | null
    }
  | { status: 'SKIPPED'; reason: string; width?: number; height?: number; durationMs?: number | null }
  | { status: 'FAILED'; reason: string }

/**
 * Converte o vídeo para H.264 + AAC com lado menor de até 1080 px, sem os metadados do celular (inclui a
 * localização). Não mexe no que já está bom nem troca por algo que não compensa. Nunca lança erro: quando
 * não dá, o chamador mantém o original.
 */
export async function normalizeVideo(
  input: Buffer,
  extension: string,
  options: { ffmpegPath?: string } = {},
): Promise<VideoNormalization> {
  const binary = options.ffmpegPath || resolveFfmpegPath()
  const safeExt = /^[a-z0-9]{2,4}$/i.test(extension) ? extension.toLowerCase() : 'mp4'
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), 'votz-video-'))
    const inPath = join(dir, `in.${safeExt}`)
    const outPath = join(dir, 'out.mp4')
    await writeFile(inPath, input)

    const info = await probe(binary, inPath)
    if (info && !needsTranscode(info)) {
      const shown = displaySize(info)
      return { status: 'SKIPPED', reason: 'já está bom', ...shown, durationMs: info.durationMs }
    }

    const run = await runFfmpeg(binary, transcodeArgs(inPath, outPath), TRANSCODE_TIMEOUT_MS, 'tail')
    if (!run.ok) return { status: 'FAILED', reason: run.stderr.trim().split('\n').slice(-3).join(' | ') || 'ffmpeg falhou' }

    const data = await readFile(outPath)
    const result = await probe(binary, outPath)
    if (!result) return { status: 'FAILED', reason: 'o vídeo convertido não pôde ser lido' }
    const shown = displaySize(result)
    if (!shouldReplace(info, input.byteLength, data.byteLength)) {
      return {
        status: 'SKIPPED',
        reason: 'a conversão não compensou',
        ...(info ? displaySize(info) : shown),
        durationMs: info?.durationMs ?? result.durationMs,
      }
    }
    return { status: 'DONE', data, ...shown, durationMs: result.durationMs }
  } catch (error) {
    return { status: 'FAILED', reason: error instanceof Error ? error.message : String(error) }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
