import { AD_EDIT_COPY, MEDIA_FORMATS, type AdView } from '@votz/shared-types'
import styled from 'styled-components'
import { adsErrorMessage, useUpdateAdMedia } from '../../hooks/useAds'
import { CroppedMedia } from '../media/MediaCropEditor'
import { AdMedia, adMediaItems } from './AdMedia'
import { AdMediaPicker, useAdMediaFiles } from './AdMediaPicker'
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

/**
 * Troca ou tira as fotos ou o vídeo do anúncio. Mesmas regras do passo a passo (carrossel de até 5 fotos ou um vídeo
 * sozinho, largura mínima da parte mostrada, vídeo até 60 s, sem GIF). Aprovado ou em revisão volta para a revisão ao
 * salvar; os arquivos antigos somem.
 */
export function AdMediaEditForm({ ad, companyId, accountId, onDone }: { ad: AdView; companyId: string; accountId: string; onDone: () => void }) {
  const update = useUpdateAdMedia(companyId, accountId)
  const picker = useAdMediaFiles(companyId)
  const { files, first, format } = picker
  const current = adMediaItems(ad.creative)
  const warning = ad.reviewStatus === 'APPROVED' ? AD_EDIT_COPY.REVIEW_AGAIN : ad.reviewStatus === 'PENDING' ? AD_EDIT_COPY.REVIEW_PENDING : null

  function save() {
    if (!picker.ready) return
    update.mutate({ adId: ad.id, mediaItems: picker.inputs() }, { onSuccess: () => { picker.markSaved(); onDone() } })
  }

  return (
    <div style={{ marginTop: 12 }} role="group" aria-label="Trocar fotos ou vídeo">
      <Field>
        {current.length > 0 && files.length === 0 && <><Label as="p">Atual</Label><AdMedia items={current} maxWidth={260} /></>}
        {current.length === 0 && files.length === 0 && <Hint>Este anúncio é só texto.</Hint>}
        <AdMediaPicker picker={picker} label={files.length ? 'Novas fotos ou vídeo' : 'Fotos ou vídeo'} addFirstLabel={current.length ? 'Trocar fotos ou vídeo' : 'Adicionar fotos ou vídeo'} />
        {first && (
          <MediaFrame $ratio={`${MEDIA_FORMATS[format].width} / ${MEDIA_FORMATS[format].height}`}>
            <CroppedMedia item={first} format={format} label="Prévia da foto ou do vídeo novo" />
          </MediaFrame>
        )}
      </Field>

      {warning && <Hint style={{ color: 'inherit', fontWeight: 600 }}>{warning}</Hint>}
      {picker.problem && <ErrorMsg role="alert">{picker.problem}</ErrorMsg>}
      {update.isError && <ErrorMsg role="alert">{adsErrorMessage(update.error)}</ErrorMsg>}
      <Row style={{ marginTop: 10 }}>
        <PrimaryButton type="button" disabled={update.isPending || !picker.ready || !!picker.problem} onClick={save}>
          {update.isPending ? 'Salvando…' : 'Salvar fotos ou vídeo'}
        </PrimaryButton>
        {current.length > 0 && files.length === 0 && (
          <SecondaryButton type="button" disabled={update.isPending} onClick={() => update.mutate({ adId: ad.id, mediaItems: [] }, { onSuccess: onDone })}>Tirar as fotos ou o vídeo</SecondaryButton>
        )}
        <SecondaryButton type="button" onClick={onDone}>Cancelar</SecondaryButton>
      </Row>
    </div>
  )
}
