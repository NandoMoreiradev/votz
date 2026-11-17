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
import { useAuthStore } from '../../store/auth.store'
import { useCreatePost, useUploadPostMedia } from '../../hooks/usePosts'
import { useTopicSearch } from '../../hooks/useTopics'
import { PostDto } from '../../types/api'
import { MentionPickerModal, SelectedMention } from './MentionPickerModal'

interface PostComposerProps {
  initialTopic?: string
  quotePost?: PostDto | null
  onClearQuote?: () => void
}

const Box = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px 18px;
  margin-bottom: 16px;
`

const Row = styled.div`
  display: flex;
  gap: 12px;
  align-items: flex-start;
`

const Avatar = styled.div<{ $src?: string | null }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
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
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 6px;
  b { color: ${({ theme }) => theme.colors.primary}; }
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 76px;
  border: none;
  background: transparent;
  resize: vertical;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
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

const MediaThumb = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};

  img, video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
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
  background: ${({ theme }) => `${theme.colors.primary}10`};
  color: ${({ theme }) => theme.colors.primary};
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
`

const ToolBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}10` : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.55; cursor: not-allowed; }
`

const Spacer = styled.div`
  flex: 1;
`

const CharCt = styled.span<{ $warn?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ $warn, theme }) => ($warn ? theme.colors.action : theme.colors.muted)};
`

const PublishBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: 700;
  cursor: pointer;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

export function PostComposer({ initialTopic, quotePost, onClearQuote }: PostComposerProps) {
  const { user, activeContext } = useAuthStore()
  const [content, setContent] = useState(initialTopic ? `#${initialTopic} ` : '')
  const [media, setMedia] = useState<Array<{ url: string; isVideo: boolean }>>([])
  const [pollOpen, setPollOpen] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollDuration, setPollDuration] = useState(24)
  const [mention, setMention] = useState<SelectedMention | null>(null)
  const [mentionModalOpen, setMentionModalOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadMedia = useUploadPostMedia()
  const createPost = useCreatePost()

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

  async function handleFiles(files: FileList | null) {
    if (!files) return
    setErrorMsg(null)
    const remaining = 4 - media.length
    const list = Array.from(files).slice(0, remaining)
    for (const file of list) {
      try {
        const res = await uploadMedia.mutateAsync(file)
        setMedia((prev) => [...prev, { url: res.url, isVideo: file.type.startsWith('video/') }])
      } catch {
        setErrorMsg('Falha no upload de uma mídia (use imagem até 10MB ou vídeo MP4/MOV até 100MB).')
      }
    }
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

    createPost.mutate(
      {
        content: content.trim(),
        media: media.length > 0 ? media.map((m) => m.url) : undefined,
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
        onSuccess: () => {
          setContent(initialTopic ? `#${initialTopic} ` : '')
          setMedia([])
          setPollOpen(false)
          setPollQuestion('')
          setPollOptions(['', ''])
          setMention(null)
          onClearQuote?.()
        },
        onError: () => {
          setErrorMsg('Não foi possível publicar. Verifique os campos e tente novamente.')
        },
      },
    )
  }

  const canSubmit =
    !createPost.isPending &&
    !uploadMedia.isPending &&
    (content.trim().length > 0 || media.length > 0 || pollOpen || !!mention || !!quotePost)

  return (
    <Box>
      <Row>
        <Avatar $src={displayAvatar}>
          {!displayAvatar && displayName.charAt(0).toUpperCase()}
        </Avatar>

        <MainCol>
          <IdentityTag>
            Publicando como <b>{displayName}</b>
            {activeContext ? ` (${activeContext.type === 'POLITICIAN' ? 'Mandato' : 'Entidade'})` : ''}
          </IdentityTag>

          <Textarea
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
            <MediaPreviewGrid>
              {media.map((m) => (
                <MediaThumb key={m.url}>
                  {m.isVideo ? <video src={m.url} muted /> : <img src={m.url} alt="Prévia" />}
                  <RemoveBtn
                    type="button"
                    onClick={() => setMedia((prev) => prev.filter((item) => item.url !== m.url))}
                  >
                    <X size={12} />
                  </RemoveBtn>
                </MediaThumb>
              ))}
            </MediaPreviewGrid>
          )}

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
              disabled={uploadMedia.isPending || media.length >= 4}
              onClick={() => fileRef.current?.click()}
            >
              <ImageIcon size={15} />
              {uploadMedia.isPending ? 'Enviando...' : 'Foto / Vídeo'}
            </ToolBtn>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleFiles(e.target.files)}
            />

            <ToolBtn type="button" $active={pollOpen} onClick={() => setPollOpen((v) => !v)}>
              <ChartBar size={15} /> Enquete
            </ToolBtn>

            <ToolBtn type="button" onClick={() => setMentionModalOpen(true)}>
              <At size={15} /> Mencionar
            </ToolBtn>

            <Spacer />

            <CharCt $warn={content.length > 1800}>{content.length}/2000</CharCt>

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
