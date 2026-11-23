import { Injectable, Logger } from '@nestjs/common'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import sharp from 'sharp'
import { StorageService } from '../../storage/storage.service'
import { resolveFfmpegPath } from '../../storage/video-poster'
import { probe, runFfmpeg } from '../../storage/video-normalize'
import type { MediaAssetView } from '../../media/media-items'

/** Um quadro (ou a foto) pronto para a IA olhar. */
export interface AdMediaPart {
  mimeType: 'image/jpeg'
  data: Buffer
  /** Texto que acompanha a imagem para o modelo saber o que está vendo ("foto do anúncio", "quadro 3 de 6, aos 12 s"). */
  label: string
}

/** A faixa de som do vídeo, pronta para a IA ouvir. */
export interface AdAudioPart {
  mimeType: 'audio/mp3'
  data: Buffer
  /** Quantos segundos de som seguem no arquivo (o vídeo todo, até o teto). */
  seconds: number
}

export interface AdMediaReading {
  kind: 'IMAGE' | 'VIDEO'
  parts: AdMediaPart[]
  /** Duração do vídeo em segundos (nulo na foto). */
  durationSeconds: number | null
  /** O vídeo tem faixa de som? (falso na foto.) */
  hasAudioTrack: boolean
  /** O som do vídeo, quando tem faixa e deu para extrair. Nulo na foto, em vídeo sem som e se a extração falhou. */
  audio: AdAudioPart | null
}

/** Lado maior da imagem que vai para a IA: o bastante para ler texto na arte, pouco para custar barato. */
export const AD_MEDIA_MAX_SIDE = 1024
/** Quantos quadros do vídeo a IA olha. */
export const AD_VIDEO_FRAME_COUNT = 6
const FRAME_TIMEOUT_MS = 60_000
const AUDIO_TIMEOUT_MS = 120_000
/** Anúncio de vídeo tem até 60 s; o teto dá folga e impede um arquivo anormal de virar um áudio enorme. */
export const AD_AUDIO_MAX_SECONDS = 75
/** O som vai em mono, 16 kHz, 48 kbps: o bastante para entender fala, e ~0,4 MB por minuto. */
const AUDIO_BITRATE = '48k'
/** Vídeo de anúncio tem até 60 s a 5 Mbps (~40 MB). Acima disso o arquivo não é um anúncio normal: fica para a pessoa. */
const MAX_VIDEO_BYTES = 80 * 1024 * 1024

/** Instantes (em segundos) dos quadros: um no meio de cada fatia igual do vídeo, para pegar começo, meio e fim. */
export function videoFrameTimes(durationSeconds: number, count = AD_VIDEO_FRAME_COUNT): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [0]
  const frames = durationSeconds < 2 ? 1 : count
  return Array.from({ length: frames }, (_, index) => Math.round(((index + 0.5) / frames) * durationSeconds * 100) / 100)
}

/** Argumentos do ffmpeg para tirar um quadro em JPEG, com o lado maior limitado. */
export function frameArgs(inputPath: string, outputPath: string, seconds: number): string[] {
  const scale = `scale='if(gt(iw,ih),min(${AD_MEDIA_MAX_SIDE},iw),-2)':'if(gt(iw,ih),-2,min(${AD_MEDIA_MAX_SIDE},ih))'`
  return ['-hide_banner', '-y', '-ss', String(seconds), '-i', inputPath, '-frames:v', '1', '-vf', scale, '-q:v', '4', outputPath]
}

/** Argumentos do ffmpeg para extrair só o som, em mp3 mono leve, com teto de duração. */
export function audioArgs(inputPath: string, outputPath: string): string[] {
  return ['-hide_banner', '-y', '-i', inputPath, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-b:a', AUDIO_BITRATE, '-t', String(AD_AUDIO_MAX_SECONDS), outputPath]
}

/** Foto em JPEG com o lado maior limitado (a foto do anúncio já vem em 1080 px: aqui só diminui). */
export async function imageForReading(input: Buffer): Promise<Buffer> {
  return sharp(input, { failOn: 'error', limitInputPixels: 80_000_000 })
    .rotate()
    .resize({ width: AD_MEDIA_MAX_SIDE, height: AD_MEDIA_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
}

/**
 * Entrega à IA o que a pessoa vai ver no anúncio: a foto, ou alguns quadros do vídeo. Os arquivos são os já
 * preparados (públicos); nada do original do anunciante. Devolve `null` quando não deu para ler: quem chama deixa
 * o anúncio para a pessoa, nunca aprova às cegas.
 */
@Injectable()
export class AdMediaReader {
  private readonly logger = new Logger(AdMediaReader.name)

  constructor(private readonly storage: StorageService) {}

  /**
   * Lê todas as mídias do anúncio. Carrossel de fotos: a IA recebe todas, cada uma com o número dela, e lê o texto escrito em
   * qualquer uma. Basta uma não ser lida para o resultado ser "não deu para ler" (nunca se aprova olhando só parte). Vídeo vale
   * sozinho.
   */
  async readAll(medias: readonly Pick<MediaAssetView, 'kind' | 'key' | 'feedKey' | 'durationMs'>[]): Promise<AdMediaReading | null> {
    if (medias.length <= 1) return medias.length ? this.read(medias[0]) : null
    if (medias.some((media) => media.kind !== 'IMAGE')) return null
    const readings: AdMediaReading[] = []
    for (const media of medias) {
      const reading = await this.read(media)
      if (!reading) return null
      readings.push(reading)
    }
    const parts = readings.flatMap((reading, index) => reading.parts.map((part) => ({ ...part, label: `Foto ${index + 1} de ${readings.length} do anúncio.` })))
    return { kind: 'IMAGE', parts, durationSeconds: null, hasAudioTrack: false, audio: null }
  }

  async read(media: Pick<MediaAssetView, 'kind' | 'key' | 'feedKey' | 'durationMs'>): Promise<AdMediaReading | null> {
    try {
      if (media.kind === 'IMAGE') return await this.readImage(media)
      if (media.kind === 'VIDEO') return await this.readVideo(media)
      return null // GIF não vale em anúncio.
    } catch (error) {
      this.logger.warn(`Não consegui ler a mídia do anúncio para a IA: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  }

  private async readImage(media: Pick<MediaAssetView, 'key' | 'feedKey'>): Promise<AdMediaReading | null> {
    const key = media.feedKey ?? media.key
    if (!key) return null
    const file = await this.storage.getObjectBuffer(key)
    if (!file) return null
    const data = await imageForReading(file)
    return { kind: 'IMAGE', parts: [{ mimeType: 'image/jpeg', data, label: 'Foto do anúncio.' }], durationSeconds: null, hasAudioTrack: false, audio: null }
  }

  private async extractAudio(binary: string, inPath: string, dir: string, durationSeconds: number): Promise<AdAudioPart | null> {
    const outPath = join(dir, 'audio.mp3')
    const run = await runFfmpeg(binary, audioArgs(inPath, outPath), AUDIO_TIMEOUT_MS, 'tail')
    if (!run.ok) {
      this.logger.warn(`Não consegui extrair o som do vídeo do anúncio: ${run.stderr.trim().split('\n').slice(-2).join(' | ')}`)
      return null
    }
    const data = await readFile(outPath).catch(() => null)
    if (!data?.length) return null
    return { mimeType: 'audio/mp3', data, seconds: Math.min(AD_AUDIO_MAX_SECONDS, Math.round(durationSeconds)) }
  }

  private async readVideo(media: Pick<MediaAssetView, 'key' | 'durationMs'>): Promise<AdMediaReading | null> {
    if (!media.key) return null
    const file = await this.storage.getObjectBuffer(media.key)
    if (!file || file.length > MAX_VIDEO_BYTES) return null

    const binary = resolveFfmpegPath()
    const dir = await mkdtemp(join(tmpdir(), 'votz-adframes-'))
    try {
      const inPath = join(dir, 'in.mp4')
      await writeFile(inPath, file)
      const info = await probe(binary, inPath)
      const durationSeconds = (info?.durationMs ?? media.durationMs ?? 0) / 1000
      const times = videoFrameTimes(durationSeconds)

      const parts: AdMediaPart[] = []
      for (const [index, at] of times.entries()) {
        const outPath = join(dir, `frame-${index}.jpg`)
        const run = await runFfmpeg(binary, frameArgs(inPath, outPath, at), FRAME_TIMEOUT_MS, 'tail')
        if (!run.ok) continue
        const data = await readFile(outPath).catch(() => null)
        if (data?.length) parts.push({ mimeType: 'image/jpeg', data, label: `Quadro ${index + 1} de ${times.length} do vídeo, aos ${Math.round(at)} s.` })
      }
      // Sem pelo menos metade dos quadros, a leitura não vale: melhor dizer que não deu.
      if (parts.length < Math.ceil(times.length / 2)) return null

      // O som: só se o vídeo tem faixa de áudio. Falhar aqui não derruba a leitura dos quadros (o parecer avisa que não deu para ouvir).
      const hasAudioTrack = info?.hasAudio ?? false
      const audio = hasAudioTrack ? await this.extractAudio(binary, inPath, dir, durationSeconds) : null
      return { kind: 'VIDEO', parts, durationSeconds: durationSeconds || null, hasAudioTrack, audio }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
