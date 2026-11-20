import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { Camera, ImageSquare, X } from '@phosphor-icons/react'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'

/** Medidas pedidas ao cidadão. A tela mostra o recorte central, igual ao que o público vai ver. */
export const IMAGE_SPECS = {
  cover: { label: 'capa', width: 1500, height: 500, ratio: 3, maxMb: 5 },
  photo: { label: 'foto', width: 400, height: 400, ratio: 1, maxMb: 5 },
} as const
export type ImageKind = keyof typeof IMAGE_SPECS

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(13, 13, 13, 0.55);
  display: grid;
  place-items: center;
  padding: 16px;
`
const Card = styled.div`
  width: 100%;
  max-width: 520px;
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.white};
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`
const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  h2 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 18px;
    color: ${({ theme }) => theme.colors.text};
  }
`
const CloseBtn = styled.button`
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
`
const Specs = styled.ul`
  margin: 0;
  padding: 12px 14px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-radius: 8px;
  background: ${({ theme }) => theme.colors.neutral};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  b { font-family: ${({ theme }) => theme.fonts.mono}; font-weight: 600; }
`
const Frame = styled.div<{ $kind: ImageKind; $round: boolean; $src: string | null }>`
  position: relative;
  width: ${({ $kind }) => ($kind === 'cover' ? '100%' : '160px')};
  aspect-ratio: ${({ $kind }) => IMAGE_SPECS[$kind].ratio} / 1;
  align-self: ${({ $kind }) => ($kind === 'cover' ? 'stretch' : 'center')};
  border-radius: ${({ $kind, $round }) => ($kind === 'cover' ? '8px' : $round ? '50%' : '12px')};
  overflow: hidden;
  display: grid;
  place-items: center;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  background: ${({ $src, theme }) => ($src ? `${theme.colors.primary} url("${$src}") center/cover no-repeat` : theme.colors.neutral)};
`
const Note = styled.p<{ $warn?: boolean }>`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${({ $warn, theme }) => ($warn ? theme.colors.action : theme.colors.muted)};
`
const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
`
const Btn = styled.button<{ $primary?: boolean }>`
  min-height: 40px;
  padding: 0 18px;
  border-radius: 9999px;
  border: 1px solid ${({ $primary, theme }) => ($primary ? theme.colors.action : theme.colors.border)};
  background: ${({ $primary, theme }) => ($primary ? theme.colors.action : theme.colors.white)};
  color: ${({ $primary, theme }) => ($primary ? theme.colors.white : theme.colors.text)};
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: default; }
`

interface DialogProps {
  kind: ImageKind
  /** Nome que aparece no título: "foto de perfil", "logomarca"... */
  title: string
  currentUrl: string | null
  /** Rota de envio da imagem (ex.: /storage/upload/cover). */
  uploadPath: string
  round?: boolean
  onSave: (url: string) => Promise<unknown>
  onClose: () => void
}

export function ProfileImageDialog({ kind, title, currentUrl, uploadPath, round = true, onSave, onClose }: DialogProps) {
  const spec = IMAGE_SPECS[kind]
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    const probe = new Image()
    probe.onload = () => setSize({ w: probe.naturalWidth, h: probe.naturalHeight })
    probe.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData()
      form.append('file', file as File)
      const { data } = await api.post<{ url: string }>(uploadPath, form)
      await onSave(data.url)
    },
    onSuccess: onClose,
    onError: () => setError('Não foi possível salvar agora. Confira a conexão e tente de novo.'),
  })

  function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (!next) return
    setError(null)
    setSize(null)
    if (!ACCEPTED.includes(next.type)) { setError('Use uma imagem JPG, PNG ou WebP.'); return }
    if (next.size > spec.maxMb * 1024 * 1024) { setError(`A imagem passa de ${spec.maxMb} MB. Escolha uma menor.`); return }
    setFile(next)
  }

  const small = size && size.w < spec.width * 0.4
  const shown = preview ?? currentUrl

  return (
    <Overlay onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <Card role="dialog" aria-modal="true" aria-label={`Alterar ${title}`}>
        <Head>
          <h2>Alterar {title}</h2>
          <CloseBtn type="button" aria-label="Fechar" onClick={onClose}><X size={18} /></CloseBtn>
        </Head>

        <Specs>
          <li>Tamanho ideal: <b>{spec.width} × {spec.height} px</b> ({kind === 'cover' ? 'proporção 3:1, bem larga' : 'quadrada, 1:1'})</li>
          <li>Formatos: <b>JPG, PNG ou WebP</b> · até <b>{spec.maxMb} MB</b></li>
          <li>{kind === 'cover' ? 'Mostramos o centro da imagem. Deixe o que importa no meio.' : round ? 'Aparece em círculo. Deixe o rosto ou a marca no centro.' : 'Aparece em quadrado com cantos arredondados. Deixe a marca no centro.'}</li>
        </Specs>

        <Frame $kind={kind} $round={round} $src={shown}>
          {!shown && <ImageSquare size={36} aria-hidden="true" />}
        </Frame>

        {size && <Note>Imagem escolhida: {size.w} × {size.h} px.</Note>}
        {small && <Note $warn>Essa imagem é pequena e pode ficar borrada. O ideal é {spec.width} × {spec.height} px.</Note>}
        {error && <Note $warn role="alert">{error}</Note>}

        <input ref={inputRef} type="file" accept={ACCEPTED.join(',')} hidden onChange={pick} />
        <Actions>
          <Btn type="button" onClick={onClose} disabled={save.isPending}>Cancelar</Btn>
          <Btn type="button" onClick={() => inputRef.current?.click()} disabled={save.isPending}>
            {file ? 'Escolher outra' : 'Escolher imagem'}
          </Btn>
          <Btn type="button" $primary disabled={!file || save.isPending} onClick={() => { setError(null); save.mutate() }}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Btn>
        </Actions>
      </Card>
    </Overlay>
  )
}

/** Botões fixos no canto da capa, só para quem é dono do perfil. */
const CoverActions = styled.div`
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  gap: 8px;
`
export const CoverEditBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 9999px;
  background: rgba(13, 13, 13, 0.55);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(4px);
  &:hover { background: rgba(13, 13, 13, 0.75); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`
export function CoverEditButton({ onClick, onPhoto }: { onClick: () => void; onPhoto?: () => void }) {
  return (
    <CoverActions>
      {onPhoto && (
        <CoverEditBtn type="button" onClick={onPhoto}>
          <Camera size={16} aria-hidden="true" /> Alterar foto
        </CoverEditBtn>
      )}
      <CoverEditBtn type="button" onClick={onClick}>
        <ImageSquare size={16} aria-hidden="true" /> Alterar capa
      </CoverEditBtn>
    </CoverActions>
  )
}

type OrgKind = 'users' | 'politicians' | 'entities' | 'companies'
const PHOTO_FIELD: Record<OrgKind, string> = { users: 'avatarUrl', politicians: 'avatarUrl', entities: 'logoUrl', companies: 'logoUrl' }
const PHOTO_UPLOAD: Record<OrgKind, string> = {
  users: '/storage/upload/avatar',
  politicians: '/storage/upload/avatar',
  entities: '/storage/upload/entity-logo',
  companies: '/storage/upload/entity-logo',
}
export const COVER_UPLOAD = '/storage/upload/cover'

/** Salva foto ou capa no perfil e atualiza a tela sem recarregar. */
export function useSaveProfileImage(kind: OrgKind, id: string, queryKey: QueryKey) {
  const qc = useQueryClient()
  return async (image: ImageKind, url: string) => {
    const field = image === 'cover' ? 'coverUrl' : PHOTO_FIELD[kind]
    await api.patch(`/${kind}/${id}`, { [field]: url })
    qc.setQueryData(queryKey, (old: unknown) => (old && typeof old === 'object' ? { ...old, [field]: url } : old))
    if (kind === 'users' && field === 'avatarUrl') {
      const current = useAuthStore.getState().user
      if (current?.id === id) useAuthStore.getState().setUser({ ...current, avatarUrl: url })
    }
  }
}
export const photoUploadPath = (kind: OrgKind) => PHOTO_UPLOAD[kind]
