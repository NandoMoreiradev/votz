import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowBendUpLeft,
  ArrowLeft,
  CaretDown,
  Copy as CopyIcon,
  DotsThreeVertical,
  MagnifyingGlass,
  ShieldCheck,
} from '@phosphor-icons/react'
import {
  formatFileSize,
  mediaKindFromMime,
  mediaKindLabel,
  type ChatMediaQuality,
} from '@votz/chat-core'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  conversationFontSize,
} from '@votz/shared-types'
import { useConversationSettings } from '../../hooks/useConversations'
import type { OrgType } from '../../hooks/useOrgMemberships'
import {
  downloadPageMediaBlob,
  pageErrorMessage,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useReplyAsStaff,
  useReplyPageMedia,
  useRespondPageConversation,
  useSendPageMedia,
  useSendPageMessage,
  useSetConversationStatus,
  useStaffConversation,
  useStaffFollowers,
  useStartAsStaff,
  type PageAttachmentView,
  type PageMediaUploadInput,
  type PageMessageView,
} from '../../hooks/usePageInbox'
import { prepareChatImage, readVideoPreview, type PreparedMedia } from '../../lib/chat-media-prepare'
import {
  ChatAvatar,
  ChatBanner,
  ChatBox,
  ChatBubble,
  ChatBubbleMenuButton,
  ChatButton,
  ChatComposerBar,
  ChatDayChip,
  ChatEmptyHint,
  ChatHeader,
  ChatHeaderIdentity,
  ChatHeaderMenuWrap,
  ChatHeaderStatus,
  ChatHistory,
  ChatIconButton,
  ChatMediaBox,
  ChatMenuBackdrop,
  ChatMenuPanel,
  ChatMetaRow,
  ChatNote,
  ChatQuote,
  ChatSearchBar,
  ChatStatus,
  formatChatDayDivider,
  formatChatTime,
} from '../conversations/ChatUi'
import { Composer as SimpleComposer, ErrorLine, NOTICE_TEXT, Notice } from './PageInboxUi'

/**
 * Telas de conversa com páginas dentro da caixa unificada (/conversas).
 * Usam exatamente a mesma casca visual, bolhas e barra de envio (texto, mídia, câmera, HD e áudio)
 * das conversas pessoais (`ChatPane`), mudando apenas as rotas de API (`page-inbox`).
 */

export const ORG_PATH: Record<OrgType, string> = { POLITICIAN: 'politico', ENTITY: 'entidade', COMPANY: 'empresa' }

const ActionBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`
const PillButton = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 0 16px;
  border-radius: 18px;
  border: 1px solid ${({ theme, $primary }) => ($primary ? theme.colors.action : theme.colors.border)};
  background: ${({ theme, $primary }) => ($primary ? theme.colors.action : theme.colors.white)};
  color: ${({ theme, $primary }) => ($primary ? theme.colors.white : theme.colors.text)};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
`
const TextButton = styled.button`
  flex-shrink: 0;
  border: 0;
  background: transparent;
  padding: 8px 12px;
  border-radius: 20px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Muted = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 14px;
`
const StartBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`
const StartFoot = styled.div`
  flex-shrink: 0;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  form {
    margin-top: 0;
  }
`
const SearchInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 24px;
  background: ${({ theme }) => theme.colors.white};
  font-size: 15px;
`
const PersonButton = styled.button`
  display: block;
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  span {
    display: block;
    font-size: 13px;
    color: ${({ theme }) => theme.colors.muted};
  }
  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover ?? theme.colors.neutral};
  }
`

function PageAttachmentMedia({
  attachment,
  mediaPath,
  auto,
}: {
  attachment: PageAttachmentView
  mediaPath: string
  auto: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')
  const urlRef = useRef<string | null>(null)
  const autoLoad = auto && (attachment.kind === 'image' || attachment.kind === 'audio')

  async function load(triggerDownload = false) {
    if (loading) return
    if (urlRef.current) {
      if (triggerDownload) {
        const a = document.createElement('a')
        a.href = urlRef.current
        a.download = attachment.name
        a.click()
      }
      return
    }
    setLoading(true)
    setFailed('')
    try {
      const blob = await downloadPageMediaBlob(`${mediaPath}/${attachment.id}`)
      const objectUrl = URL.createObjectURL(blob)
      urlRef.current = objectUrl
      setUrl(objectUrl)
      if (triggerDownload) {
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = attachment.name
        a.click()
      }
    } catch {
      setFailed('Não foi possível abrir este arquivo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoLoad) void load(false)
    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [attachment.id])

  return (
    <ChatMediaBox>
      {url && attachment.kind === 'image' && <img src={url} alt={attachment.name} />}
      {url && attachment.kind === 'video' && (
        <video controls src={url} poster={attachment.thumbnail ?? undefined} />
      )}
      {url && attachment.kind === 'audio' && <audio controls src={url} />}
      {!url && attachment.thumbnail && (attachment.kind === 'image' || attachment.kind === 'video') && (
        <img
          src={attachment.thumbnail}
          alt=""
          aria-hidden="true"
          style={{
            width: 'min(100%, 280px)',
            aspectRatio: attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined,
          }}
        />
      )}
      {(!url || attachment.kind === 'file') && (
        <ChatButton
          $secondary
          type="button"
          disabled={loading}
          onClick={() => {
            void load(attachment.kind === 'file')
          }}
        >
          {loading
            ? 'Baixando…'
            : `${attachment.kind === 'file' ? 'Baixar' : 'Abrir'} ${mediaKindLabel(attachment.kind).toLowerCase()} (${attachment.name} · ${formatFileSize(attachment.sizeBytes)})`}
        </ChatButton>
      )}
      {failed && <small role="alert">{failed}</small>}
    </ChatMediaBox>
  )
}

async function prepareUploadPayload(
  file: File,
  quality: ChatMediaQuality,
  extras: { caption?: string; replyToId?: string; signal: AbortSignal; onProgress: (p: number) => void },
): Promise<PageMediaUploadInput> {
  const kind = mediaKindFromMime(file.type)
  const prepared: PreparedMedia =
    kind === 'image'
      ? await prepareChatImage(file, quality)
      : {
          bytes: new Uint8Array(await file.arrayBuffer()),
          mimeType: file.type || 'application/octet-stream',
          name: file.name,
          ...(kind === 'video' ? await readVideoPreview(file) : {}),
        }
  const buffer = new Uint8Array(prepared.bytes.byteLength)
  buffer.set(prepared.bytes)
  return {
    file: new Blob([buffer.buffer], { type: prepared.mimeType }),
    fileName: prepared.name,
    caption: extras.caption,
    replyToId: extras.replyToId,
    width: prepared.width,
    height: prepared.height,
    durationMs: prepared.durationMs,
    thumbnail: prepared.thumbnail,
    signal: extras.signal,
    onProgress: extras.onProgress,
  }
}

interface PageThreadShellProps {
  title: string
  subtitle?: string
  avatarUrl?: string | null
  ownSide: 'CITIZEN' | 'STAFF'
  banner: string
  emptyText: string
  messages: PageMessageView[]
  mediaBasePath: string
  loading: boolean
  error?: string
  canWrite: boolean
  busy: boolean
  placeholder: string
  onSendText: (text: string, replyToId?: string) => Promise<unknown>
  onSendMedia: (payload: PageMediaUploadInput) => Promise<unknown>
  menuItems?: ReactNode
  topBanner?: ReactNode
  footer?: ReactNode
  historyFooter?: ReactNode
}

/** Casca visual idêntica ao `ChatPane`, compartilhada por cidadão e equipe da página. */
function PageThreadShell({
  title,
  subtitle,
  avatarUrl,
  ownSide,
  banner,
  emptyText,
  messages,
  mediaBasePath,
  loading,
  error,
  canWrite,
  busy,
  placeholder,
  onSendText,
  onSendMedia,
  menuItems,
  topBanner,
  footer,
  historyFooter,
}: PageThreadShellProps) {
  const settingsQuery = useConversationSettings()
  const chatSettings = settingsQuery.data ?? DEFAULT_CONVERSATION_SETTINGS
  const bubbleFontSize = conversationFontSize(chatSettings.fontScale)
  const autoMedia =
    chatSettings.mediaAutoDownload === 'ALWAYS' ||
    (chatSettings.mediaAutoDownload === 'WIFI_ONLY' &&
      (navigator as { connection?: { type?: string } }).connection?.type !== 'cellular')

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; excerpt: string } | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [headerMenu, setHeaderMenu] = useState(false)
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null)
  const [localError, setLocalError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [qualityOverride, setQualityOverride] = useState<ChatMediaQuality | null>(null)
  const quality: ChatMediaQuality = qualityOverride ?? (chatSettings.mediaUploadQuality === 'HIGH' ? 'high' : 'normal')
  const uploadAbort = useRef<AbortController | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!headerMenu && !menuMessageId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setHeaderMenu(false)
      setMenuMessageId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [headerMenu, menuMessageId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return messages
    return messages.filter((m) =>
      `${m.text} ${m.attachment?.name ?? ''} ${m.staffName ?? ''}`.toLowerCase().includes(q),
    )
  }, [messages, search])

  const decorated = useMemo(() => {
    let prevDay = ''
    let prevAuthor = ''
    return filtered.map((m) => {
      const day = formatChatDayDivider(m.createdAt)
      const own = m.from === ownSide
      const author = own ? 'self' : (m.staffName ?? 'peer')
      const first = day.key !== prevDay || author !== prevAuthor
      const divider = day.key !== prevDay ? day.label : null
      prevDay = day.key
      prevAuthor = author
      return { message: m, own, first, divider }
    })
  }, [filtered, ownSide])

  async function submitText() {
    const value = draft.trim()
    if (!value || !canWrite) return
    const replying = replyTo
    setDraft('')
    setReplyTo(null)
    setLocalError('')
    try {
      await onSendText(value, replying?.id)
    } catch (err) {
      setDraft((c) => c || value)
      setReplyTo((c) => c ?? replying)
      setLocalError(pageErrorMessage(err))
    }
  }

  async function sendFile(file: File, chosenQuality: ChatMediaQuality) {
    if (!canWrite || busy || uploadProgress !== null) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setUploadProgress(0)
    setLocalError('')
    const caption = draft.trim() || undefined
    const replying = replyTo
    try {
      const payload = await prepareUploadPayload(file, chosenQuality, {
        caption,
        replyToId: replying?.id,
        signal: controller.signal,
        onProgress: setUploadProgress,
      })
      await onSendMedia(payload)
      setDraft('')
      setReplyTo(null)
      setQualityOverride(null)
    } catch (err) {
      if (!controller.signal.aborted) setLocalError(pageErrorMessage(err))
    } finally {
      uploadAbort.current = null
      setUploadProgress(null)
    }
  }

  async function sendAudio(blob: Blob) {
    const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' })
    await sendFile(file, quality)
  }

  const shownError = localError || error
  return (
    <ChatBox data-chat-pane aria-label={`Conversa com ${title}`}>
      <ChatHeader>
        <Link to="/conversas" aria-label="Voltar às conversas">
          <ArrowLeft size={23} />
        </Link>
        <ChatAvatar aria-hidden="true">
          {avatarUrl ? <img src={avatarUrl} alt="" /> : (title.trim()[0] ?? '').toUpperCase()}
        </ChatAvatar>
        <ChatHeaderIdentity>
          <h1>{title}</h1>
          {subtitle && <ChatHeaderStatus>{subtitle}</ChatHeaderStatus>}
        </ChatHeaderIdentity>
        <ChatIconButton
          type="button"
          aria-label="Buscar na conversa"
          onClick={() => {
            setShowSearch((v) => !v)
            setSearch('')
          }}
        >
          <MagnifyingGlass size={20} />
        </ChatIconButton>
        {menuItems && (
          <ChatHeaderMenuWrap>
            <ChatIconButton
              type="button"
              aria-label="Mais opções"
              aria-haspopup="menu"
              aria-expanded={headerMenu}
              onClick={() => setHeaderMenu((v) => !v)}
            >
              <DotsThreeVertical size={22} weight="bold" />
            </ChatIconButton>
            {headerMenu && (
              <>
                <ChatMenuBackdrop onClick={() => setHeaderMenu(false)} />
                <ChatMenuPanel $align="right" role="menu" aria-label="Opções da conversa" onClick={() => setHeaderMenu(false)}>
                  {menuItems}
                </ChatMenuPanel>
              </>
            )}
          </ChatHeaderMenuWrap>
        )}
      </ChatHeader>
      {showSearch && (
        <ChatSearchBar>
          <input
            aria-label="Buscar mensagens"
            placeholder="Buscar na conversa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <ChatButton
            $secondary
            type="button"
            onClick={() => {
              setShowSearch(false)
              setSearch('')
            }}
          >
            Fechar
          </ChatButton>
        </ChatSearchBar>
      )}
      {topBanner}
      <ChatHistory ref={historyRef} $wallpaper={chatSettings.wallpaper} aria-label="Mensagens">
        <ChatBanner>
          <ShieldCheck size={14} aria-hidden="true" />
          {banner}
        </ChatBanner>
        {loading && <ChatEmptyHint role="status">Carregando…</ChatEmptyHint>}
        {decorated.map(({ message, own, first, divider }) => {
          const canMenu = !!(message.text || message.attachment) && canWrite
          const replySender = message.replyTo
            ? message.replyTo.from === ownSide
              ? 'Você'
              : title
            : ''
          return (
            <Fragment key={message.id}>
              {divider && <ChatDayChip data-day-divider>{divider}</ChatDayChip>}
              <ChatBubble
                data-message-id={message.id}
                $own={own}
                $fontSize={bubbleFontSize}
                $first={first}
                $tools={canMenu}
              >
                {ownSide === 'STAFF' && message.staffName && <strong>{message.staffName}</strong>}
                {message.replyTo && (
                  <ChatQuote>
                    {replySender ? `${replySender}: ` : ''}
                    {message.replyTo.excerpt}
                  </ChatQuote>
                )}
                {message.attachment && (
                  <PageAttachmentMedia
                    attachment={message.attachment}
                    mediaPath={mediaBasePath}
                    auto={autoMedia}
                  />
                )}
                {message.text && <span>{message.text}</span>}
                {canMenu && (
                  <>
                    <ChatBubbleMenuButton
                      data-bubble-menu
                      type="button"
                      aria-label="Mais opções da mensagem"
                      aria-haspopup="menu"
                      aria-expanded={menuMessageId === message.id}
                      onClick={() => setMenuMessageId((id) => (id === message.id ? null : message.id))}
                    >
                      <CaretDown size={16} weight="bold" aria-hidden="true" />
                    </ChatBubbleMenuButton>
                    {menuMessageId === message.id && (
                      <>
                        <ChatMenuBackdrop onClick={() => setMenuMessageId(null)} />
                        <ChatMenuPanel
                          $align={own ? 'right' : 'left'}
                          role="menu"
                          aria-label="Opções da mensagem"
                          style={{ top: 28 }}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setReplyTo({
                                id: message.id,
                                senderName: own ? 'Você' : (message.staffName ?? title),
                                excerpt:
                                  message.text ||
                                  (message.attachment ? mediaKindLabel(message.attachment.kind) : 'Mensagem'),
                              })
                              setMenuMessageId(null)
                            }}
                          >
                            <ArrowBendUpLeft size={20} aria-hidden="true" />
                            Responder
                          </button>
                          {message.text && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuMessageId(null)
                                void navigator.clipboard
                                  ?.writeText(message.text)
                                  .catch(() => setLocalError('Não foi possível copiar o texto.'))
                              }}
                            >
                              <CopyIcon size={20} aria-hidden="true" />
                              Copiar texto
                            </button>
                          )}
                        </ChatMenuPanel>
                      </>
                    )}
                  </>
                )}
                <ChatMetaRow>
                  <span>{formatChatTime(message.createdAt)}</span>
                </ChatMetaRow>
              </ChatBubble>
            </Fragment>
          )
        })}
        {!loading && !decorated.length && <ChatEmptyHint>{search ? 'Nenhuma mensagem encontrada.' : emptyText}</ChatEmptyHint>}
        {historyFooter}
        <div ref={bottomRef} />
      </ChatHistory>
      {shownError && <ChatStatus role="alert">{shownError}</ChatStatus>}
      {footer ?? (
        <ChatComposerBar
          draft={draft}
          onDraftChange={setDraft}
          onSubmitText={submitText}
          onSendFile={sendFile}
          onSendAudio={sendAudio}
          onError={setLocalError}
          placeholder={placeholder}
          maxLength={2000}
          canType={canWrite}
          canWrite={canWrite}
          busy={busy || uploadProgress !== null}
          quality={quality}
          onToggleQuality={() => setQualityOverride(quality === 'high' ? 'normal' : 'high')}
          replyTo={replyTo}
          onCancelNote={() => setReplyTo(null)}
          uploadProgress={uploadProgress}
          onCancelUpload={() => uploadAbort.current?.abort()}
        />
      )}
    </ChatBox>
  )
}

// ── Cidadão ──────────────────────────────────────────────────────────────────

/** Conversa do cidadão com a equipe de uma página. Sem conversa ainda, a primeira mensagem a cria. */
export function CitizenPagePane({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const thread = usePageThread(orgType, orgId, true)
  const threadId = thread.data?.conversation?.id ?? ''
  const conversation = useMyPageConversation(threadId)
  const send = useSendPageMessage(orgType, orgId)
  const sendMedia = useSendPageMedia(orgType, orgId)
  const remove = useDeleteMyPageConversation()
  const respond = useRespondPageConversation()
  const opened = conversation.isSuccess
  // Abrir zera as não lidas no servidor: a lista da caixa e o selo precisam saber.
  useEffect(() => {
    if (opened) {
      void client.invalidateQueries({ queryKey: ['page-inbox', 'mine-list'] })
      void client.invalidateQueries({ queryKey: ['page-inbox', 'mine', 'unread'] })
    }
  }, [opened, threadId, client])

  const page = conversation.data?.page ?? thread.data?.page
  const name = page?.name ?? 'Página'
  const data = conversation.data
  // A página começou a conversa e a pessoa ainda não decidiu (ou recusou).
  const pendingRequest = !!data && data.startedBy === 'STAFF' && !data.accepted
  const declined = pendingRequest && data?.status === 'BLOCKED'
  const blocked = data?.status === 'BLOCKED' && !pendingRequest
  const loading = thread.isLoading || (!!threadId && conversation.isLoading)
  const err =
    (thread.isError && pageErrorMessage(thread.error)) ||
    (conversation.isError && pageErrorMessage(conversation.error)) ||
    (respond.isError && pageErrorMessage(respond.error)) ||
    (remove.isError && pageErrorMessage(remove.error)) ||
    ''

  return (
    <PageThreadShell
      title={name}
      subtitle={`${page?.username ? `@${page.username} · ` : ''}Página`}
      avatarUrl={page?.avatarUrl}
      ownSide="CITIZEN"
      banner={NOTICE_TEXT}
      emptyText={`Escreva a primeira mensagem para ${name}.`}
      messages={data?.messages ?? []}
      mediaBasePath={threadId ? `/page-inbox/mine/${threadId}/media` : ''}
      loading={loading}
      error={err}
      canWrite={thread.isSuccess && !pendingRequest && !blocked}
      busy={send.isPending || sendMedia.isPending || remove.isPending}
      placeholder={threadId ? 'Mensagem' : `Escreva para ${name}`}
      onSendText={(text, replyToId) => send.mutateAsync({ text, replyToId })}
      onSendMedia={(payload) => sendMedia.mutateAsync(payload)}
      menuItems={
        <>
          {page && (
            <Link role="menuitem" to={`/${ORG_PATH[orgType]}/${orgId}`}>
              Ver perfil da página
            </Link>
          )}
          {threadId && (
            <button
              type="button"
              role="menuitem"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('Apagar esta conversa? Ela some também para a equipe da página.')) {
                  remove.mutate(threadId, { onSuccess: () => navigate('/conversas', { replace: true }) })
                }
              }}
            >
              Apagar conversa
            </button>
          )}
        </>
      }
      footer={
        pendingRequest ? (
          <ActionBar>
            <Muted style={{ flex: 1 }}>{declined ? 'Você recusou esta conversa.' : `${name} quer conversar com você.`}</Muted>
            <PillButton $primary type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: threadId, accept: true })}>
              Aceitar
            </PillButton>
            {!declined && (
              <PillButton type="button" disabled={respond.isPending} onClick={() => respond.mutate({ id: threadId, accept: false })}>
                Recusar
              </PillButton>
            )}
          </ActionBar>
        ) : blocked ? (
          <ActionBar>
            <Muted>Esta página não está recebendo novas mensagens suas.</Muted>
          </ActionBar>
        ) : undefined
      }
    />
  )
}

// ── Equipe da página ─────────────────────────────────────────────────────────

/** Uma conversa da caixa da página, para quem está acessando como a página. */
export function StaffPagePane({ orgType, orgId, id, canReply }: { orgType: OrgType; orgId: string; id: string; canReply: boolean }) {
  const conversation = useStaffConversation(orgType, orgId, id)
  const reply = useReplyAsStaff(orgType, orgId, id)
  const replyMedia = useReplyPageMedia(orgType, orgId, id)
  const status = useSetConversationStatus(orgType, orgId, id)
  const data = conversation.data
  const waiting = !!data && data.startedBy === 'STAFF' && !data.accepted
  const citizen = data?.citizen
  const err =
    (conversation.isError && pageErrorMessage(conversation.error)) ||
    (status.isError && pageErrorMessage(status.error)) ||
    ''
  const canSend = !!data && canReply && data.status !== 'BLOCKED' && !waiting

  return (
    <PageThreadShell
      title={citizen?.name ?? 'Conversa'}
      subtitle={citizen?.username ? `@${citizen.username}` : undefined}
      avatarUrl={citizen?.avatarUrl}
      ownSide="STAFF"
      banner={NOTICE_TEXT}
      emptyText="Nenhuma mensagem nesta conversa."
      messages={data?.messages ?? []}
      mediaBasePath={`/page-inbox/${orgType}/${orgId}/conversations/${id}/media`}
      loading={conversation.isLoading}
      error={err}
      canWrite={canSend}
      busy={reply.isPending || replyMedia.isPending}
      placeholder="Mensagem"
      onSendText={(text, replyToId) => reply.mutateAsync({ text, replyToId })}
      onSendMedia={(payload) => replyMedia.mutateAsync(payload)}
      topBanner={
        waiting ? (
          <ChatNote role="status">
            <span>{data?.status === 'BLOCKED' ? 'A pessoa recusou esta conversa.' : 'Aguardando a pessoa aceitar a conversa.'}</span>
          </ChatNote>
        ) : undefined
      }
      historyFooter={
        data?.readers.length ? (
          <ChatEmptyHint style={{ fontSize: 12, marginTop: 8 }}>
            Lida por: {data.readers.map((r) => r.name).join(', ')}
          </ChatEmptyHint>
        ) : undefined
      }
      menuItems={
        canReply && data ? (
          <>
            {data.status !== 'RESOLVED' && (
              <button type="button" role="menuitem" disabled={status.isPending} onClick={() => status.mutate('RESOLVED')}>
                Marcar como resolvida
              </button>
            )}
            {data.status !== 'OPEN' && (
              <button type="button" role="menuitem" disabled={status.isPending} onClick={() => status.mutate('OPEN')}>
                Reabrir conversa
              </button>
            )}
            {data.status !== 'BLOCKED' && (
              <button
                type="button"
                role="menuitem"
                disabled={status.isPending}
                onClick={() => {
                  if (window.confirm('Bloquear esta pessoa? Ela não poderá mais escrever para a página.')) status.mutate('BLOCKED')
                }}
              >
                Bloquear pessoa
              </button>
            )}
          </>
        ) : undefined
      }
      footer={
        data && !canSend ? (
          <ActionBar>
            <Muted>
              {data.status === 'BLOCKED'
                ? 'Conversa bloqueada.'
                : waiting
                  ? 'Você poderá escrever de novo quando a pessoa aceitar.'
                  : 'Você pode ler, mas não responder.'}
            </Muted>
          </ActionBar>
        ) : undefined
      }
    />
  )
}

/** A página chama um seguidor: escolhe a pessoa e escreve a primeira mensagem; ela precisa aceitar. */
export function StaffStartPane({ orgType, orgId }: { orgType: OrgType; orgId: string }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null)
  const followers = useStaffFollowers(orgType, orgId, q.trim(), !picked)
  const start = useStartAsStaff(orgType, orgId)
  return (
    <ChatBox data-chat-pane aria-label="Nova conversa">
      <ChatHeader>
        <Link to="/conversas" aria-label="Voltar às conversas">
          <ArrowLeft size={23} />
        </Link>
        <ChatAvatar aria-hidden="true">
          {picked?.avatarUrl ? <img src={picked.avatarUrl} alt="" /> : (picked?.name ?? 'N').charAt(0).toUpperCase()}
        </ChatAvatar>
        <ChatHeaderIdentity>
          <h1>{picked ? `Mensagem para ${picked.name}` : 'Nova conversa'}</h1>
          <ChatHeaderStatus>Só com quem segue a página</ChatHeaderStatus>
        </ChatHeaderIdentity>
        {picked && (
          <TextButton type="button" onClick={() => setPicked(null)}>
            Escolher outra pessoa
          </TextButton>
        )}
      </ChatHeader>
      <StartBody>
        <Notice>A pessoa precisa aceitar antes de a página mandar mais mensagens.</Notice>
        {!picked && (
          <>
            <SearchInput aria-label="Buscar seguidor" placeholder="Nome ou @usuário" value={q} maxLength={60} onChange={(e) => setQ(e.target.value)} />
            {followers.isLoading && <Muted role="status">Carregando…</Muted>}
            {followers.isError && <ErrorLine role="alert">{pageErrorMessage(followers.error)}</ErrorLine>}
            {followers.data && !followers.data.length && <Muted>Nenhum seguidor encontrado.</Muted>}
            {followers.data?.map((f) => (
              <PersonButton key={f.id} type="button" onClick={() => setPicked({ id: f.id, name: f.name, avatarUrl: f.avatarUrl })}>
                <strong>{f.name}</strong>
                {f.username && <span>@{f.username}</span>}
              </PersonButton>
            ))}
          </>
        )}
      </StartBody>
      {picked && (
        <StartFoot>
          <SimpleComposer
            pending={start.isPending}
            placeholder="Primeira mensagem"
            onSend={async (text) => {
              const res = await start.mutateAsync({ citizenId: picked.id, text })
              navigate(`/conversas/pagina/${res.conversationId}`, { replace: true })
            }}
          />
          {start.isError && <ErrorLine role="alert">{pageErrorMessage(start.error)}</ErrorLine>}
        </StartFoot>
      )}
    </ChatBox>
  )
}
