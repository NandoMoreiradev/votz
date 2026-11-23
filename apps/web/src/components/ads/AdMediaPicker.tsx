import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import {
  AD_MEDIA_RULES,
  DEFAULT_MEDIA_FORMAT,
  MEDIA_FORMATS,
  adMediaProblem,
  nearestMediaFormat,
  type MediaCrop,
  type MediaFormat,
} from '@votz/shared-types'
import { adsErrorMessage, useUploadAdMedia } from '../../hooks/useAds'
import { discardPostMedia } from '../../lib/post-media-upload'
import { kindOfFile, measureLocal } from '../../lib/local-media'
import { INITIAL_VIEW, MediaCropEditor, cropOf, type CropEditorItem, type CropView } from '../media/MediaCropEditor'
import { ErrorMsg, Hint, Label, Row, SecondaryButton } from './ads-ui'

/** Foto ou vídeo escolhido para o anúncio: prévia local enquanto envia; o recorte é aplicado pelo servidor ao salvar. */
export interface AdFile extends CropEditorItem {
  status: 'uploading' | 'ready'
  progress: number
  assetId?: string
}

/** O que a API recebe de cada foto ou vídeo do anúncio. */
export interface AdMediaInput {
  id: string
  format: MediaFormat
  crop?: MediaCrop
}

/**
 * Fotos do carrossel (até `AD_MEDIA_RULES.MAX_ITEMS`) ou um vídeo sozinho, com envio, ordem, enquadramento e as mesmas
 * regras da API (largura mínima da parte mostrada, vídeo até 60 s, sem GIF). Serve ao passo a passo e à troca da mídia.
 * Ao sair sem salvar, apaga no servidor o que foi enviado e libera as prévias locais.
 */
export function useAdMediaFiles(companyId: string) {
  const upload = useUploadAdMedia(companyId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<AdFile[]>([])
  const [format, setFormat] = useState<MediaFormat>(DEFAULT_MEDIA_FORMAT)
  const [editorOpen, setEditorOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filesRef = useRef(files)
  filesRef.current = files
  const saved = useRef(false)
  useEffect(
    () => () => {
      for (const current of filesRef.current) {
        URL.revokeObjectURL(current.previewUrl)
        if (current.assetId && !saved.current) discardPostMedia(current.assetId)
      }
    },
    [],
  )

  /** A largura que vale é a da parte que aparece depois do enquadramento (a API confere de novo). */
  const problem = files.reduce<string | null>(
    (found, item) => found ?? (item.status === 'ready' ? adMediaProblem({ kind: item.kind, width: Math.round((cropOf(item, format)?.w ?? 1) * item.width), scope: 'crop' }) : null),
    null,
  )

  function drop(key: string) {
    const target = filesRef.current.find((item) => item.key === key)
    if (!target) return
    URL.revokeObjectURL(target.previewUrl)
    if (target.assetId) discardPostMedia(target.assetId)
    setFiles((prev) => prev.filter((item) => item.key !== key))
  }

  /** Tira tudo o que foi escolhido (descarta o que já foi enviado). */
  function clear() {
    for (const item of filesRef.current) {
      URL.revokeObjectURL(item.previewUrl)
      if (item.assetId) discardPostMedia(item.assetId)
    }
    setFiles([])
    setEditorOpen(false)
  }

  /** Muda a ordem no carrossel. */
  function move(key: string, delta: -1 | 1) {
    setFiles((prev) => {
      const from = prev.findIndex((item) => item.key === key)
      const to = from + delta
      if (from < 0 || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  /** Confere, envia e põe no carrossel os arquivos escolhidos, um por vez. */
  async function add(list: FileList | null) {
    const chosen = Array.from(list ?? [])
    if (fileInput.current) fileInput.current.value = ''
    if (!chosen.length) return
    setError(null)
    for (const item of chosen) {
      const current = filesRef.current
      const kind = kindOfFile(item)
      if (!kind || kind === 'GIF') {
        setError(kind === 'GIF' ? 'GIF ainda não vale em anúncio. Use uma foto ou um vídeo.' : 'Use uma foto (JPEG, PNG ou WebP) ou um vídeo (MP4 ou MOV).')
        return
      }
      if (kind === 'VIDEO' && (current.length > 0 || chosen.length > 1)) {
        setError('O vídeo vale sozinho. Para um carrossel, use só fotos.')
        return
      }
      if (kind === 'IMAGE' && current.some((existing) => existing.kind === 'VIDEO')) {
        setError('Este anúncio já tem um vídeo, que vale sozinho. Remova o vídeo para usar fotos.')
        return
      }
      if (current.length >= AD_MEDIA_RULES.MAX_ITEMS) {
        setError(`O carrossel aceita até ${AD_MEDIA_RULES.MAX_ITEMS} fotos.`)
        return
      }
      const previewUrl = URL.createObjectURL(item)
      const size = await measureLocal(previewUrl, kind)
      const tooSmall = adMediaProblem({ kind, width: size.width, scope: 'file' })
      if (tooSmall) {
        URL.revokeObjectURL(previewUrl)
        setError(tooSmall)
        return
      }
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const entry: AdFile = { key, previewUrl, kind, ...size, view: INITIAL_VIEW, status: 'uploading', progress: 0 }
      // O próximo arquivo da mesma escolha enxerga este já na lista, mesmo antes de a tela redesenhar.
      filesRef.current = [...filesRef.current, entry]
      setFiles(filesRef.current)
      // A moldura é uma só para todas as fotos: vale a da primeira que entra.
      if (current.length === 0) setFormat(nearestMediaFormat(size.width, size.height) ?? DEFAULT_MEDIA_FORMAT)
      setEditorOpen(true)
      try {
        const asset = await upload.mutateAsync({
          file: item,
          onProgress: (progress) => setFiles((prev) => prev.map((existing) => (existing.key === key ? { ...existing, progress } : existing))),
        })
        // O tamanho que vale é o do servidor; é sobre ele que o recorte é calculado.
        setFiles((prev) => prev.map((existing) => (existing.key === key ? { ...existing, status: 'ready', progress: 100, assetId: asset.id, width: asset.width, height: asset.height } : existing)))
      } catch (uploadError) {
        URL.revokeObjectURL(previewUrl)
        filesRef.current = filesRef.current.filter((existing) => existing.key !== key)
        setFiles(filesRef.current)
        setEditorOpen(false)
        setError(adsErrorMessage(uploadError))
        return
      }
    }
  }

  return {
    files,
    first: files[0] as AdFile | undefined,
    format,
    setFormat,
    editorOpen,
    setEditorOpen,
    error,
    problem,
    uploading: files.some((item) => item.status === 'uploading'),
    hasVideo: files.some((item) => item.kind === 'VIDEO'),
    ready: files.length > 0 && files.every((item) => item.status === 'ready'),
    fileInput,
    add,
    drop,
    move,
    clear,
    setView: (key: string, view: CropView) => setFiles((prev) => prev.map((item) => (item.key === key ? { ...item, view } : item))),
    /** Depois de salvar de verdade: os arquivos enviados agora pertencem ao anúncio e não devem ser descartados ao sair. */
    markSaved: () => {
      saved.current = true
    },
    /** As fotos prontas, na ordem e com o enquadramento, no formato que a API recebe. */
    inputs: (): AdMediaInput[] => files.filter((item) => item.assetId).map((item) => ({ id: item.assetId as string, format, crop: cropOf(item, format) })),
  }
}

export type AdMediaFiles = ReturnType<typeof useAdMediaFiles>

const Thumbs = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
`

const Thumb = styled.div`
  width: 92px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  background: ${({ theme }) => theme.colors.white};
`

const ThumbImage = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
`

const ThumbBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 2px 4px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  button {
    min-width: 24px;
    min-height: 24px;
    border: 0;
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    cursor: pointer;
  }
  button:disabled { opacity: 0.3; cursor: default; }
`

/**
 * Parte de tela do seletor: botão para escolher, miniaturas com ordem e remover, formato e regras. O enquadramento abre num
 * painel (`MediaCropEditor`) que também fica aqui.
 */
export function AdMediaPicker({ picker, label = 'Fotos ou vídeo (opcional)', addFirstLabel = 'Escolher fotos ou vídeo' }: { picker: AdMediaFiles; label?: string; addFirstLabel?: string }) {
  const { files, format, uploading, hasVideo } = picker
  return (
    <>
      <MediaCropEditor
        open={picker.editorOpen && files.length > 0}
        items={files}
        format={format}
        onFormatChange={picker.setFormat}
        onViewChange={picker.setView}
        onClose={() => picker.setEditorOpen(false)}
      />
      <Label as="p">{label}</Label>
      <input
        ref={picker.fileInput}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        onChange={(event) => void picker.add(event.target.files)}
      />
      <Row style={{ marginTop: 8 }}>
        {!hasVideo && files.length < AD_MEDIA_RULES.MAX_ITEMS && (
          <SecondaryButton type="button" onClick={() => picker.fileInput.current?.click()}>
            {files.length ? 'Adicionar mais uma foto' : addFirstLabel}
          </SecondaryButton>
        )}
        {files.length > 0 && <SecondaryButton type="button" onClick={() => picker.setEditorOpen(true)}>Ajustar enquadramento</SecondaryButton>}
        {files.length > 0 && <SecondaryButton type="button" onClick={picker.clear}>Descartar escolha</SecondaryButton>}
      </Row>
      {files.length > 0 && (
        <>
          <Hint style={{ marginTop: 6 }}>
            Formato: <b>{MEDIA_FORMATS[format].label} ({MEDIA_FORMATS[format].ratioLabel})</b>, o mesmo para todas as fotos
            {files.length > 1 ? ` · carrossel com ${files.length} fotos` : ''}
            {uploading ? ' · enviando…' : ''}
          </Hint>
          <Thumbs aria-label="Fotos do carrossel, na ordem">
            {files.map((item, index) => (
              <Thumb key={item.key}>
                <ThumbImage src={item.previewUrl} alt={`${item.kind === 'VIDEO' ? 'Vídeo' : 'Foto'} ${index + 1}`} />
                <ThumbBar>
                  <button type="button" aria-label="Mover para antes" disabled={index === 0} onClick={() => picker.move(item.key, -1)}>◀</button>
                  <span>{item.status === 'uploading' ? `${item.progress}%` : index + 1}</span>
                  <button type="button" aria-label="Mover para depois" disabled={index === files.length - 1} onClick={() => picker.move(item.key, 1)}>▶</button>
                  <button type="button" aria-label={item.kind === 'VIDEO' ? 'Remover o vídeo' : `Remover a foto ${index + 1}`} onClick={() => picker.drop(item.key)}>✕</button>
                </ThumbBar>
              </Thumb>
            ))}
          </Thumbs>
        </>
      )}
      {picker.error && <ErrorMsg role="alert">{picker.error}</ErrorMsg>}
      <Hint style={{ marginTop: 6 }}>
        Até {AD_MEDIA_RULES.MAX_ITEMS} fotos no carrossel, ou um vídeo sozinho. Largura de pelo menos {AD_MEDIA_RULES.MIN_WIDTH} px e vídeo de até {AD_MEDIA_RULES.MAX_VIDEO_SECONDS} segundos.
        Quadrado (1:1) e retrato (4:5) ocupam mais espaço no celular. Escreva no texto o que o vídeo diz, para quem assiste sem som. Anúncio com foto ou vídeo sempre passa por uma pessoa da revisão.
      </Hint>
    </>
  )
}
