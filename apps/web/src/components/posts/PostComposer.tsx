import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import {
  At,
  ChartBar,
  Image as ImageIcon,
  PaperPlaneTilt,
  Plus,
  X,
} from '@phosphor-icons/react'
import { isAxiosError } from 'axios'
import {
  DEFAULT_MEDIA_FORMAT,
  MEDIA_FORMATS,
  POST_MEDIA_MAX_ITEMS,
  nearestMediaFormat,
  type MediaAssetKind,
  type MediaFormat,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import { useCreatePost, useUploadMediaAsset } from '../../hooks/usePosts'
import { discardPostMedia } from '../../lib/post-media-upload'
import { kindOfFile, measureLocal } from '../../lib/local-media'
import { CroppedMedia, INITIAL_VIEW, MediaCropEditor, cropOf, type CropView } from '../media/MediaCropEditor'
import { useTopicSearch } from '../../hooks/useTopics'
import { PostDto } from '../../types/api'
import { MentionPickerModal, SelectedMention } from './MentionPickerModal'

interface PostComposerProps {
  initialTopic?: string
  quotePost?: PostDto | null
  onClearQuote?: () => void
  onCreated?: (post: PostDto) => void
}

const Box = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  padding: 16px;
`

const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`

const Avatar = styled.div<{ $src?: string | null; $org?: boolean }>`
  width: 40px;
  height: 40px;
  border-radius: ${({ $org }) => ($org ? '10px' : '50%')};
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const MainCol = styled.div`
  flex: 1;
  min-width: 0;
  position: relative;
`

const IdentityTag = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 4px;
  b { color: ${({ theme }) => theme.colors.primaryText}; }
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 56px;
  border: none;
  background: transparent;
  resize: none;
  overflow: hidden;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 18px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  box-sizing: border-box;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`

const TopicSuggest = styled.div`
  position: absolute;
  left: 0;
  top: 100%;
  z-index: 30;
  min-width: 240px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  overflow: hidden;
`

const TopicOption = styled.button`
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};

  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  small {
    font-family: ${({ theme }) => theme.fonts.mono};
    color: ${({ theme }) => theme.colors.muted};
  }
`

const MediaPreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px;
  margin: 8px 0 10px;
`

const MediaThumb = styled.div<{ $ratio: string }>`
  position: relative;
  aspect-ratio: ${({ $ratio }) => $ratio};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.primary};
`

const ThumbButton = styled.button`
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.action}; outline-offset: -2px; }
`

const ThumbStatus = styled.span`
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 6px;
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => `${theme.colors.primary}99`};
  pointer-events: none;
`

const FormatHint = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

const RemoveBtn = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(13, 13, 13, 0.72);
  color: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`

const PollBuilder = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px;
  margin: 8px 0 10px;
  background: ${({ theme }) => theme.colors.surfaceHover};
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const PollInput = styled.input`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const Chip = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.primaryText};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 600;
  margin-bottom: 8px;

  button {
    border: none;
    background: transparent;
    cursor: pointer;
    padding: 0;
    color: inherit;
    display: inline-flex;
  }
`

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
  @media (max-width: 480px) { gap: 4px; }
`

const ToolBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  min-height: 36px;
  border: none;
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}10` : theme.colors.white)};
  color: ${({ theme }) => theme.colors.action};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.55; cursor: not-allowed; }
  @media (max-width: 480px) { font-size: 0; gap: 0; padding: 8px; }
`

const Spacer = styled.div`
  flex: 1;
`

const CharCt = styled.span<{ $warn?: boolean }>`
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: ${({ $warn, theme }) => ($warn ? theme.colors.action : theme.colors.muted)};
`

const PublishBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 700;
  cursor: pointer;

  &:disabled { opacity: 0.45; cursor: not-allowed; }
`

/** Arquivo escolhido para a publicação: prévia local enquanto envia; o recorte é aplicado pelo servidor ao publicar. */
interface ComposerMedia {
  key: string
  previewUrl: string
  kind: MediaAssetKind
  width: number
  height: number
  view: CropView
  status: 'uploading' | 'ready' | 'error'
  progress: number
  assetId?: string
}

function apiMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)?.message
    if (typeof message === 'string' && message.trim()) return message
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0]
  }
  return fallback
}

export function PostComposer({ initialTopic, quotePost, onClearQuote, onCreated }: PostComposerProps) {
  const { user, activeContext } = useAuthStore()
  const [content, setContent] = useState(initialTopic ? `#${initialTopic} ` : '')
  const [media, setMedia] = useState<ComposerMedia[]>([])
  const [format, setFormat] = useState<MediaFormat>(DEFAULT_MEDIA_FORMAT)
  const [editor, setEditor] = useState<{ open: boolean; start: number }>({ open: false, start: 0 })
  const [pollOpen, setPollOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollDuration, setPollDuration] = useState(24)
  const [mention, setMention] = useState<SelectedMention | null>(null)
  const [mentionModalOpen, setMentionModalOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const uploadMedia = useUploadMediaAsset()
  const createPost = useCreatePost()
  const mediaRef = useRef(media)
  mediaRef.current = media

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [content])
  // Ao sair da tela: libera as prévias locais e apaga no servidor o que foi enviado e não publicado.
  useEffect(() => () => {
    for (const item of mediaRef.current) {
      URL.revokeObjectURL(item.previewUrl)
      if (item.assetId) discardPostMedia(item.assetId)
    }
  }, [])

  // Autocomplete para #pauta com debounce de 300ms para evitar excesso de requisições
  const activeTagMatch = content.match(/(?:^|\s)#([\p{L}\p{N}_]{1,30})$/u)
  const activeTagQuery = activeTagMatch?.[1] ?? ''
  const [debouncedTagQuery, setDebouncedTagQuery] = useState('')
  useEffect(() => {
    if (!activeTagQuery) {
      setDebouncedTagQuery('')
      return
    }
    const timer = setTimeout(() => setDebouncedTagQuery(activeTagQuery), 300)
    return () => clearTimeout(timer)
  }, [activeTagQuery])
  const { data: topicSuggestions } = useTopicSearch(debouncedTagQuery, debouncedTagQuery.length >= 2)

  if (!user) {
    return (
      <Box>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#6B7280' }}>
          <Link to="/entrar" style={{ fontWeight: 700 }}>Entre na sua conta</Link> para publicar imagens, vídeos, enquetes ou #pautas no feed.
        </p>
      </Box>
    )
  }

  const displayName = activeContext?.name ?? user.name
  const displayAvatar = activeContext?.logoUrl ?? user.avatarUrl

  const patchMedia = (key: string, patch: Partial<ComposerMedia>) =>
    setMedia((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  async function handleFiles(files: FileList | null) {
    if (!files) return
    setErrorMsg(null)
    const remaining = POST_MEDIA_MAX_ITEMS - media.length
    const accepted = Array.from(files).filter((file) => kindOfFile(file))
    if (accepted.length < files.length) setErrorMsg('Use foto (JPEG, PNG, WebP), GIF ou vídeo (MP4, MOV).')
    const list = accepted.slice(0, remaining)
    if (!list.length) return

    const added: ComposerMedia[] = []
    for (const file of list) {
      const kind = kindOfFile(file)!
      const previewUrl = URL.createObjectURL(file)
      const size = await measureLocal(previewUrl, kind)
      added.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, previewUrl, kind, ...size, view: INITIAL_VIEW, status: 'uploading', progress: 0 })
    }
    const first = media.length === 0
    setMedia((prev) => [...prev, ...added])
    // O primeiro arquivo sugere o formato (o mais próximo do tamanho dele); a pessoa troca no editor.
    if (first) setFormat(nearestMediaFormat(added[0].width, added[0].height) ?? DEFAULT_MEDIA_FORMAT)
    setEditor({ open: true, start: media.length })

    await Promise.all(
      added.map(async (item, position) => {
        try {
          const asset = await uploadMedia.mutateAsync({ file: list[position], onProgress: (progress) => patchMedia(item.key, { progress }) })
          // O tamanho que vale é o do servidor (igual ao local na prática; o recorte é calculado sobre ele).
          patchMedia(item.key, { status: 'ready', assetId: asset.id, width: asset.width, height: asset.height, progress: 100 })
        } catch (error) {
          patchMedia(item.key, { status: 'error' })
          setErrorMsg(apiMessage(error, 'Não foi possível enviar um dos arquivos. Use foto até 10 MB ou vídeo MP4/MOV até 100 MB.'))
        }
      }),
    )
  }

  function removeMedia(key: string) {
    setMedia((prev) => {
      const item = prev.find((entry) => entry.key === key)
      if (item) {
        URL.revokeObjectURL(item.previewUrl)
        if (item.assetId) discardPostMedia(item.assetId)
      }
      return prev.filter((entry) => entry.key !== key)
    })
  }

  function insertTopicSuggestion(tag: string) {
    setContent((prev) => prev.replace(/(?:^|\s)#[\p{L}\p{N}_]{1,30}$/u, (m) => {
      const lead = m.startsWith(' ') ? ' ' : ''
      return `${lead}${tag} `
    }))
  }

  function handleSubmit() {
    setErrorMsg(null)
    const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean)
    if (pollOpen && validOptions.length < 2) {
      setErrorMsg('Preencha pelo menos 2 opções para a enquete.')
      return
    }

    if (media.some((item) => item.status === 'error')) {
      setErrorMsg('Um dos arquivos não foi enviado. Remova-o ou tente de novo.')
      return
    }

    createPost.mutate(
      {
        content: content.trim(),
        mediaAssets: media.length > 0
          ? media.map((item) => ({ id: item.assetId!, format, crop: cropOf(item, format) }))
          : undefined,
        mentionedReportId: mention?.type === 'report' ? mention.id : undefined,
        mentionedDebateId: mention?.type === 'debate' ? mention.id : undefined,
        mentionedPropostaId: mention?.type === 'proposta' ? mention.id : undefined,
        mentionedDebatePollId: mention?.type === 'debatePoll' ? mention.id : undefined,
        quotePostId: quotePost?.id,
        poll: pollOpen
          ? {
              question: pollQuestion.trim() || undefined,
              options: validOptions,
              durationHours: pollDuration,
            }
          : undefined,
      },
      {
        onSuccess: (created) => {
          setContent(initialTopic ? `#${initialTopic} ` : '')
          // Publicado: os arquivos agora são da publicação (não apagar no servidor), só libera as prévias locais.
          for (const item of media) URL.revokeObjectURL(item.previewUrl)
          setMedia([])
          setFormat(DEFAULT_MEDIA_FORMAT)
          setPollOpen(false)
          setPollQuestion('')
          setPollOptions(['', ''])
          setMention(null)
          onClearQuote?.()
          onCreated?.(created)
        },
        onError: (error) => {
          setErrorMsg(apiMessage(error, 'Não foi possível publicar. Verifique os campos e tente novamente.'))
        },
      },
    )
  }

  const uploading = media.some((item) => item.status === 'uploading')
  const canSubmit =
    !createPost.isPending &&
    !uploading &&
    (content.trim().length > 0 || media.length > 0 || pollOpen || !!mention || !!quotePost)
  const frame = MEDIA_FORMATS[format]

  return (
    <Box>
      <Row>
        <Avatar $src={displayAvatar} $org={activeContext?.type === 'ENTITY'}>
          {!displayAvatar && displayName.charAt(0).toUpperCase()}
        </Avatar>

        <MainCol>
          {activeContext && (
            <IdentityTag>
              Publicando como <b>{displayName}</b>
              {` (${activeContext.type === 'POLITICIAN' ? 'Mandato' : 'Entidade'})`}
            </IdentityTag>
          )}

          <Textarea
            ref={textareaRef}
            rows={2}
            aria-label="Texto da publicação"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={2000}
            placeholder="O que está acontecendo na sua cidade? Use #Pauta para mobilizar..."
          />

          {activeTagQuery.length >= 1 && topicSuggestions && topicSuggestions.length > 0 && (
            <TopicSuggest>
              {topicSuggestions.map((t) => (
                <TopicOption
                  key={t.id}
                  type="button"
                  onClick={() => insertTopicSuggestion(t.displayTag)}
                >
                  <span>{t.displayTag}</span>
                  <small>{t.postsCount + t.reportsCount} menções</small>
                </TopicOption>
              ))}
            </TopicSuggest>
          )}

          {mention && (
            <Chip>
              <span>Mencionando: {mention.label}</span>
              <button type="button" onClick={() => setMention(null)} aria-label="Remover menção">
                <X size={13} />
              </button>
            </Chip>
          )}

          {quotePost && (
            <Chip>
              <span>Citando: {quotePost.author.orgName ?? quotePost.author.name}</span>
              <button type="button" onClick={onClearQuote} aria-label="Remover citação">
                <X size={13} />
              </button>
            </Chip>
          )}

          {media.length > 0 && (
            <>
              <MediaPreviewGrid>
                {media.map((item, position) => (
                  <MediaThumb key={item.key} $ratio={`${frame.width} / ${frame.height}`}>
                    <CroppedMedia item={item} format={format} label={`Prévia ${position + 1}`} />
                    <ThumbButton type="button" aria-label={`Ajustar enquadramento do item ${position + 1}`} onClick={() => setEditor({ open: true, start: position })} />
                    {item.status !== 'ready' && (
                      <ThumbStatus role="status">
                        {item.status === 'error' ? 'Falhou' : `Enviando ${item.progress}%`}
                      </ThumbStatus>
                    )}
                    <RemoveBtn type="button" aria-label={`Remover item ${position + 1}`} onClick={() => removeMedia(item.key)}>
                      <X size={12} />
                    </RemoveBtn>
                  </MediaThumb>
                ))}
              </MediaPreviewGrid>
              <FormatHint type="button" onClick={() => setEditor({ open: true, start: 0 })}>
                Formato: <b>{frame.label} ({frame.ratioLabel})</b> · Ajustar
              </FormatHint>
            </>
          )}

          <MediaCropEditor
            open={editor.open}
            items={media}
            format={format}
            startIndex={editor.start}
            onFormatChange={setFormat}
            onViewChange={(key, view) => patchMedia(key, { view })}
            onClose={() => setEditor((prev) => ({ ...prev, open: false }))}
          />

          {pollOpen && (
            <PollBuilder>
              <PollInput
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Pergunta da enquete (opcional se já estiver no texto)"
                maxLength={280}
              />
              {pollOptions.map((opt, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6 }}>
                  <PollInput
                    style={{ flex: 1 }}
                    value={opt}
                    onChange={(e) =>
                      setPollOptions((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder={`Opção ${idx + 1}`}
                    maxLength={100}
                  />
                  {pollOptions.length > 2 && (
                    <ToolBtn
                      type="button"
                      onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X size={12} />
                    </ToolBtn>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {pollOptions.length < 4 && (
                  <ToolBtn type="button" onClick={() => setPollOptions((prev) => [...prev, ''])}>
                    <Plus size={12} /> Adicionar opção
                  </ToolBtn>
                )}
                <select
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid #E5E5E5',
                    fontSize: '0.75rem',
                  }}
                >
                  <option value={24}>Duração: 24 horas</option>
                  <option value={72}>Duração: 3 dias</option>
                  <option value={168}>Duração: 7 dias</option>
                </select>
              </div>
            </PollBuilder>
          )}

          {errorMsg && (
            <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: '#E63946' }}>{errorMsg}</p>
          )}

          <Actions>
            <ToolBtn
              type="button"
              aria-label="Adicionar foto ou vídeo"
              title="Adicionar foto ou vídeo"
              disabled={media.length >= POST_MEDIA_MAX_ITEMS}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={15} />
              {uploading ? 'Enviando...' : 'Foto / Vídeo'}
            </ToolBtn>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { void handleFiles(e.target.files); e.target.value = '' }}
            />

            <ToolBtn type="button" aria-label="Adicionar ou remover enquete" title="Enquete" aria-pressed={pollOpen} $active={pollOpen} onClick={() => setPollOpen((v) => !v)}>
              <ChartBar size={15} /> Enquete
            </ToolBtn>

            <ToolBtn type="button" aria-label="Mencionar conteúdo" title="Mencionar conteúdo" onClick={() => setMentionModalOpen(true)}>
              <At size={15} /> Mencionar
            </ToolBtn>

            <Spacer />

            {content.length > 0 && <CharCt $warn={content.length > 1800}>{content.length}/2000</CharCt>}

            <PublishBtn type="button" disabled={!canSubmit} onClick={handleSubmit}>
              <PaperPlaneTilt size={15} weight="fill" />
              {createPost.isPending ? 'Publicando...' : 'Publicar'}
            </PublishBtn>
          </Actions>
        </MainCol>
      </Row>

      <MentionPickerModal
        isOpen={mentionModalOpen}
        onClose={() => setMentionModalOpen(false)}
        onSelect={setMention}
      />
    </Box>
  )
}
