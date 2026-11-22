import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import {
  AD_EDIT_COPY,
  AD_MEDIA_RULES,
  DEFAULT_MEDIA_FORMAT,
  MEDIA_FORMATS,
  adMediaProblem,
  nearestMediaFormat,
  type AdView,
  type MediaFormat,
} from '@votz/shared-types'
import { adsErrorMessage, useUpdateAdMedia, useUploadAdMedia } from '../../hooks/useAds'
import { discardPostMedia } from '../../lib/post-media-upload'
import { kindOfFile, measureLocal } from '../../lib/local-media'
import { CroppedMedia, INITIAL_VIEW, MediaCropEditor, cropOf, type CropEditorItem, type CropView } from '../media/MediaCropEditor'
import { AdMedia } from './AdMedia'
import { ErrorMsg, Field, Hint, Label, PrimaryButton, Row, SecondaryButton } from './ads-ui'

const MediaFrame = styled.div<{ $ratio: string }>`
  position: relative;
  aspect-ratio: ${({ $ratio }) => $ratio};
  width: 100%;
  max-width: 260px;
  margin-top: 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.primary};
`

const FrameStatus = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 6px;
  text-align: center;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => `${theme.colors.primary}99`};
`

/** Foto ou vídeo escolhido para trocar: prévia local enquanto envia; o recorte é aplicado pelo servidor ao salvar. */
interface NewFile extends CropEditorItem {
  status: 'uploading' | 'ready'
  progress: number
  assetId?: string
}

/**
 * Troca ou tira a foto ou o vídeo do anúncio. Mesmas regras do passo a passo (largura mínima da parte mostrada, vídeo até
 * 60 s, sem GIF). Aprovado ou em revisão volta para a revisão ao salvar; o arquivo antigo some.
 */
export function AdMediaEditForm({ ad, companyId, accountId, onDone }: { ad: AdView; companyId: string; accountId: string; onDone: () => void }) {
  const update = useUpdateAdMedia(companyId, accountId)
  const upload = useUploadAdMedia(companyId)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<NewFile | null>(null)
  const [format, setFormat] = useState<MediaFormat>(DEFAULT_MEDIA_FORMAT)
  const [editorOpen, setEditorOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ao sair sem salvar, apaga no servidor o que foi enviado e libera a prévia local.
  const fileRef = useRef(file)
  fileRef.current = file
  const saved = useRef(false)
  useEffect(() => () => {
    const current = fileRef.current
    if (!current) return
    URL.revokeObjectURL(current.previewUrl)
    if (current.assetId && !saved.current) discardPostMedia(current.assetId)
  }, [])

  const hasMedia = !!ad.creative.media
  const warning = ad.reviewStatus === 'APPROVED' ? AD_EDIT_COPY.REVIEW_AGAIN : ad.reviewStatus === 'PENDING' ? AD_EDIT_COPY.REVIEW_PENDING : null
  const mediaProblem = file?.status === 'ready'
    ? adMediaProblem({ kind: file.kind, width: Math.round((cropOf(file, format)?.w ?? 1) * file.width), scope: 'crop' })
    : null

  function dropFile() {
    if (!file) return
    URL.revokeObjectURL(file.previewUrl)
    if (file.assetId) discardPostMedia(file.assetId)
    setFile(null)
  }

  async function chooseFile(files: FileList | null) {
    const chosen = files?.[0]
    if (fileInput.current) fileInput.current.value = ''
    if (!chosen) return
    setError(null)
    const kind = kindOfFile(chosen)
    if (!kind || kind === 'GIF') {
      setError(kind === 'GIF' ? 'GIF ainda não vale em anúncio. Use uma foto ou um vídeo.' : 'Use uma foto (JPEG, PNG ou WebP) ou um vídeo (MP4 ou MOV).')
      return
    }
    const previewUrl = URL.createObjectURL(chosen)
    const size = await measureLocal(previewUrl, kind)
    const tooSmall = adMediaProblem({ kind, width: size.width, scope: 'file' })
    if (tooSmall) {
      URL.revokeObjectURL(previewUrl)
      setError(tooSmall)
      return
    }
    dropFile()
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setFile({ key, previewUrl, kind, ...size, view: INITIAL_VIEW, status: 'uploading', progress: 0 })
    setFormat(nearestMediaFormat(size.width, size.height) ?? DEFAULT_MEDIA_FORMAT)
    setEditorOpen(true)
    try {
      const asset = await upload.mutateAsync({
        file: chosen,
        onProgress: (progress) => setFile((prev) => (prev?.key === key ? { ...prev, progress } : prev)),
      })
      // O tamanho que vale é o do servidor; é sobre ele que o recorte é calculado.
      setFile((prev) => (prev?.key === key ? { ...prev, status: 'ready', progress: 100, assetId: asset.id, width: asset.width, height: asset.height } : prev))
    } catch (uploadError) {
      URL.revokeObjectURL(previewUrl)
      setFile((prev) => (prev?.key === key ? null : prev))
      setEditorOpen(false)
      setError(adsErrorMessage(uploadError))
    }
  }

  function save() {
    if (!file?.assetId) return
    update.mutate(
      { adId: ad.id, media: { id: file.assetId, format, crop: cropOf(file, format) } },
      { onSuccess: () => { saved.current = true; onDone() } },
    )
  }

  function removeMedia() {
    update.mutate({ adId: ad.id, media: null }, { onSuccess: onDone })
  }

  return (
    <div style={{ marginTop: 12 }} role="group" aria-label="Trocar foto ou vídeo">
      <MediaCropEditor
        open={editorOpen && !!file}
        items={file ? [file] : []}
        format={format}
        onFormatChange={setFormat}
        onViewChange={(key, view: CropView) => setFile((prev) => (prev?.key === key ? { ...prev, view } : prev))}
        onClose={() => setEditorOpen(false)}
      />

      <Field>
        <Label as="p">Foto ou vídeo</Label>
        {hasMedia && !file && <><Hint>Atual:</Hint><AdMedia media={ad.creative.media} maxWidth={260} /></>}
        {!hasMedia && !file && <Hint>Este anúncio é só texto.</Hint>}
        <input
          ref={fileInput}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
          onChange={(event) => void chooseFile(event.target.files)}
        />
        <Row style={{ marginTop: 8 }}>
          <SecondaryButton type="button" onClick={() => fileInput.current?.click()}>{file ? 'Escolher outro arquivo' : hasMedia ? 'Trocar foto ou vídeo' : 'Adicionar foto ou vídeo'}</SecondaryButton>
          {file && <SecondaryButton type="button" onClick={() => setEditorOpen(true)}>Ajustar enquadramento</SecondaryButton>}
          {file && <SecondaryButton type="button" onClick={dropFile}>Descartar escolha</SecondaryButton>}
        </Row>
        {file && (
          <>
            <Hint style={{ marginTop: 6 }}>
              Novo arquivo, formato: <b>{MEDIA_FORMATS[format].label} ({MEDIA_FORMATS[format].ratioLabel})</b>
              {file.status === 'uploading' ? ` · enviando ${file.progress}%` : ''}
            </Hint>
            <MediaFrame $ratio={`${MEDIA_FORMATS[format].width} / ${MEDIA_FORMATS[format].height}`}>
              <CroppedMedia item={file} format={format} label="Prévia da foto ou do vídeo novo" />
              {file.status === 'uploading' && <FrameStatus role="status">Enviando {file.progress}%</FrameStatus>}
            </MediaFrame>
          </>
        )}
        <Hint style={{ marginTop: 6 }}>
          Largura de pelo menos {AD_MEDIA_RULES.MIN_WIDTH} px e vídeo de até {AD_MEDIA_RULES.MAX_VIDEO_SECONDS} segundos. Anúncio com foto ou vídeo sempre passa por uma pessoa da revisão.
        </Hint>
      </Field>

      {warning && <Hint style={{ color: 'inherit', fontWeight: 600 }}>{warning}</Hint>}
      {error && <ErrorMsg role="alert">{error}</ErrorMsg>}
      {mediaProblem && <ErrorMsg role="alert">{mediaProblem}</ErrorMsg>}
      {update.isError && <ErrorMsg role="alert">{adsErrorMessage(update.error)}</ErrorMsg>}
      <Row style={{ marginTop: 10 }}>
        <PrimaryButton type="button" disabled={update.isPending || file?.status !== 'ready' || !!mediaProblem} onClick={save}>
          {update.isPending ? 'Salvando…' : 'Salvar foto ou vídeo'}
        </PrimaryButton>
        {hasMedia && !file && (
          <SecondaryButton type="button" disabled={update.isPending} onClick={removeMedia}>Tirar a foto ou o vídeo</SecondaryButton>
        )}
        <SecondaryButton type="button" onClick={onDone}>Cancelar</SecondaryButton>
      </Row>
    </div>
  )
}
