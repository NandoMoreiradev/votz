import { useRef, useState } from 'react'
import styled from 'styled-components'
import { Image as ImageIcon, ShieldCheck, X } from '@phosphor-icons/react'
import { ADVOCACY_PROMISE_DAYS } from '@votz/shared-types'
import { useAdvocateReport, useUploadPostMedia } from '../../hooks/usePosts'
import { apiErrorMessage } from '../../lib/api-error'

interface AdvocateConfirmModalProps {
  isOpen: boolean
  reportId: string
  reportTitle: string
  actorType: 'POLITICIAN' | 'ENTITY'
  actorId: string
  onClose: () => void
  onSuccess?: (result: { advocated: boolean; postId?: string }) => void
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 950;
  background: rgba(13, 13, 13, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`

const Card = styled.div`
  width: min(520px, 100%);
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: 24px;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.lg};
    color: ${({ theme }) => theme.colors.text};
    display: flex;
    align-items: center;
    gap: 8px;
  }
`

const ReportRef = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 16px;
`

const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  margin-bottom: 12px;

  input {
    width: 16px;
    height: 16px;
    accent-color: ${({ theme }) => theme.colors.primary};
  }
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 96px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  resize: vertical;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const MediaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
`

const MediaChip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.neutral};
  font-size: ${({ theme }) => theme.fontSizes.xs};

  button {
    border: none;
    background: transparent;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.muted};
    padding: 0;
  }
`

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`

const Btn = styled.button<{ $primary?: boolean }>`
  padding: 9px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $primary, theme }) => ($primary ? theme.colors.primary : theme.colors.border)};
  background: ${({ $primary, theme }) => ($primary ? theme.colors.primary : theme.colors.white)};
  color: ${({ $primary, theme }) => ($primary ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const PromiseField = styled.label`
  display: block;
  margin-bottom: 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};

  select {
    display: block;
    width: 100%;
    margin-top: 6px;
    padding: 9px 12px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    background: ${({ theme }) => theme.colors.white};
    color: ${({ theme }) => theme.colors.text};
    font-size: ${({ theme }) => theme.fontSizes.sm};
  }

  small {
    display: block;
    margin-top: 4px;
    font-weight: ${({ theme }) => theme.fontWeights.regular};
    color: ${({ theme }) => theme.colors.muted};
  }
`

const ErrorText = styled.p`
  margin: 8px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.action};
`

export function AdvocateConfirmModal({
  isOpen,
  reportId,
  reportTitle,
  actorType,
  actorId,
  onClose,
  onSuccess,
}: AdvocateConfirmModalProps) {
  const [publishToFeed, setPublishToFeed] = useState(true)
  const [postContent, setPostContent] = useState(
    `Avocação oficial: assumi o acompanhamento deste relato para cobrar providências. #Fiscalizacao`,
  )
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [promisedInDays, setPromisedInDays] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadMedia = useUploadPostMedia()
  const advocate = useAdvocateReport()

  if (!isOpen) return null

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || mediaUrls.length >= 4) return
    const uploaded = await uploadMedia.mutateAsync(file)
    setMediaUrls((prev) => [...prev, uploaded.url])
  }

  function handleConfirm() {
    advocate.mutate(
      {
        actorType,
        actorId,
        reportId,
        publishToFeed,
        promisedInDays: promisedInDays ? Number(promisedInDays) : undefined,
        postContent: publishToFeed ? postContent.trim() : undefined,
        media: publishToFeed && mediaUrls.length > 0 ? mediaUrls : undefined,
      },
      {
        onSuccess: (res) => {
          onSuccess?.(res)
          onClose()
        },
      },
    )
  }

  return (
    <Overlay onClick={onClose} role="dialog" aria-modal="true" aria-label="Avocar relato">
      <Card onClick={(e) => e.stopPropagation()}>
        <Header>
          <h3>
            <ShieldCheck size={20} weight="duotone" />
            Avocar relato
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </Header>

        <ReportRef>{reportTitle}</ReportRef>

        <PromiseField>
          Prazo para a solução (opcional)
          <select value={promisedInDays} onChange={(e) => setPromisedInDays(e.target.value)}>
            <option value="">Sem prazo definido</option>
            {ADVOCACY_PROMISE_DAYS.map((d) => (
              <option key={d} value={d}>
                Até {d} dias
              </option>
            ))}
          </select>
          <small>O prazo aparece para todos. Se vencer sem solução, você e quem fez o relato recebem um aviso.</small>
        </PromiseField>

        <CheckRow>
          <input
            type="checkbox"
            checked={publishToFeed}
            onChange={(e) => setPublishToFeed(e.target.checked)}
          />
          Publicar esta avocação no feed público
        </CheckRow>

        {publishToFeed && (
          <>
            <Textarea
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              maxLength={1000}
              placeholder="Escreva seu posicionamento ou compromisso (aceita #pautas)..."
            />
            <MediaRow>
              <Btn
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadMedia.isPending || mediaUrls.length >= 4}
                style={{ padding: '6px 10px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <ImageIcon size={14} />
                {uploadMedia.isPending ? 'Enviando...' : 'Anexar foto/vídeo'}
              </Btn>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              {mediaUrls.map((url, idx) => (
                <MediaChip key={url}>
                  <span>Mídia {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                  >
                    ✕
                  </button>
                </MediaChip>
              ))}
            </MediaRow>
          </>
        )}

        {advocate.isError && (
          <ErrorText>{apiErrorMessage(advocate.error, 'Não foi possível concluir a avocação. Tente novamente.')}</ErrorText>
        )}

        <Footer>
          <Btn type="button" onClick={onClose} disabled={advocate.isPending}>
            Cancelar
          </Btn>
          <Btn
            type="button"
            $primary
            onClick={handleConfirm}
            disabled={advocate.isPending || uploadMedia.isPending}
          >
            {advocate.isPending ? 'Confirmando...' : 'Confirmar avocação'}
          </Btn>
        </Footer>
      </Card>
    </Overlay>
  )
}
