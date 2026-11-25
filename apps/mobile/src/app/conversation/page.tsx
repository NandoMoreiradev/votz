import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useNetworkState } from 'expo-network'
import { router, useLocalSearchParams } from 'expo-router'
import Copy from 'lucide-react-native/icons/copy'
import Reply from 'lucide-react-native/icons/reply'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Trash2 from 'lucide-react-native/icons/trash-2'
import { formatFileSize, mediaKindLabel, parseChatQuality, type ChatMediaQuality } from '@votz/chat-core'
import { DEFAULT_CONVERSATION_SETTINGS, conversationFontSize } from '@votz/shared-types'
import { ChatHeader } from '../../components/chat-header'
import { MenuItem, MessageMenu, type MenuAction, type MenuAnchor } from '../../components/chat-sheet'
import { ChatComposerBar, chatUiStyles, formatDayDividerLabel, pickPreparedChatMedia } from '../../components/chat-ui'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Field, State } from '../../components/ui'
import { useConversationSettings } from '../../hooks/use-conversations'
import {
  KIND_BY_ORG,
  NOTICE_TEXT,
  downloadPageMediaFile,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useRespondPageConversation,
  useSendPageMedia,
  useSendPageMessage,
  type OrgType,
  type PageAttachmentView,
  type PageMessageView,
} from '../../hooks/use-page-inbox'
import { errorMessage } from '../../lib/api'
import { copyText } from '../../lib/clipboard'
import { shouldAutoDownload } from '../../lib/network-policy'
import { theme } from '../../theme'

const NBSP = '\u00A0'

function PageAttachmentViewBox({
  attachment,
  conversationId,
  autoDownload,
}: {
  attachment: PageAttachmentView
  conversationId: string
  autoDownload: boolean
}) {
  const [uri, setUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    if (loading || uri) return
    setLoading(true)
    setFailed('')
    try {
      const localUri = await downloadPageMediaFile(conversationId, attachment.id)
      setUri(localUri)
    } catch {
      setFailed('Não foi possível abrir este arquivo.')
    } finally {
      setLoading(false)
    }
  }, [loading, uri, conversationId, attachment.id])

  useEffect(() => {
    if (attachment.kind === 'image' && autoDownload) void load()
  }, [attachment.id, attachment.kind, autoDownload, load])

  return (
    <View style={chatUiStyles.mediaBox}>
      {uri && attachment.kind === 'image' ? (
        <Image source={{ uri }} accessibilityLabel={attachment.name} contentFit="cover" style={chatUiStyles.mediaImage} />
      ) : (
        <>
          {!!attachment.thumbnail && (attachment.kind === 'image' || attachment.kind === 'video') && (
            <Image
              source={{ uri: attachment.thumbnail }}
              accessible={false}
              contentFit="cover"
              style={[
                chatUiStyles.mediaThumb,
                attachment.width && attachment.height ? { aspectRatio: attachment.width / attachment.height } : { height: 180 },
              ]}
            />
          )}
          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={() => {
              void load()
            }}
            style={chatUiStyles.mediaCard}
          >
            <Text style={chatUiStyles.small}>
              {loading
                ? 'Baixando…'
                : `${mediaKindLabel(attachment.kind)}: ${attachment.name} (${formatFileSize(attachment.sizeBytes)})`}
            </Text>
          </Pressable>
        </>
      )}
      {!!failed && <Text style={chatUiStyles.mediaError}>{failed}</Text>}
    </View>
  )
}

interface DecoratedPageMessage {
  message: PageMessageView
  own: boolean
  first: boolean
  dayDivider: string | null
  time: string
}

function PageThread({ orgType, orgId, initialName, adClickId: arrivedWithClick }: { orgType: OrgType; orgId: string; initialName?: string; adClickId?: string }) {
  const client = useQueryClient()
  // Veio de um anúncio de mensagens: o identificador vai com a primeira mensagem e some depois (o servidor conta uma vez por clique).
  const [adClickId, setAdClickId] = useState<string | undefined>(arrivedWithClick && /^[A-Za-z0-9_-]{22}$/.test(arrivedWithClick) ? arrivedWithClick : undefined)
  const network = useNetworkState()
  const settingsQuery = useConversationSettings()
  const chatSettings = settingsQuery.data ?? DEFAULT_CONVERSATION_SETTINGS
  const bubbleFontSize = conversationFontSize(chatSettings.fontScale)
  const autoDownload = shouldAutoDownload(chatSettings.mediaAutoDownload, network.type)

  const thread = usePageThread(orgType, orgId)
  const threadId = thread.data?.conversation?.id ?? ''
  const conversation = useMyPageConversation(threadId)
  const send = useSendPageMessage(orgType, orgId)
  const sendMedia = useSendPageMedia(orgType, orgId)
  const remove = useDeleteMyPageConversation()
  const respond = useRespondPageConversation()

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ eventId: string; senderName: string; excerpt: string } | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [qualityOverride, setQualityOverride] = useState<ChatMediaQuality | null>(null)
  const quality: ChatMediaQuality = qualityOverride ?? parseChatQuality(chatSettings.mediaUploadQuality)
  const uploadAbort = useRef<AbortController | null>(null)
  const bubbleRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({})
  const [menu, setMenu] = useState<{ message: PageMessageView; anchor: MenuAnchor } | null>(null)

  const opened = conversation.isSuccess
  useEffect(() => {
    if (opened) void client.invalidateQueries({ queryKey: ['page-inbox', 'mine-list'] })
  }, [opened, threadId, client])

  const page = conversation.data?.page ?? thread.data?.page
  const title = page?.name ?? initialName ?? 'Mensagens'
  const data = conversation.data
  const pendingRequest = !!data && data.startedBy === 'STAFF' && !data.accepted
  const declined = pendingRequest && data?.status === 'BLOCKED'
  const blocked = data?.status === 'BLOCKED' && !pendingRequest
  const canWrite = thread.isSuccess && !pendingRequest && !blocked

  const listData = useMemo(() => {
    const raw = data?.messages ?? []
    const q = search.trim().toLowerCase()
    const filtered = q ? raw.filter((m) => `${m.text} ${m.attachment?.name ?? ''}`.toLowerCase().includes(q)) : raw
    let prevDay = ''
    let prevAuthor = ''
    const decorated: DecoratedPageMessage[] = filtered.map((m) => {
      const day = formatDayDividerLabel(m.createdAt)
      const own = m.from === 'CITIZEN'
      const author = own ? 'self' : 'peer'
      const first = day.key !== prevDay || author !== prevAuthor
      const dayDivider = day.key !== prevDay ? day.label : null
      prevDay = day.key
      prevAuthor = author
      return {
        message: m,
        own,
        first,
        dayDivider,
        time: new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
    })
    return decorated.reverse()
  }, [data?.messages, search])

  if (thread.isError) {
    return (
      <>
        <Toolbar title={title} back />
        <State title="Não foi possível abrir" description={errorMessage(thread.error)} retry={() => { void thread.refetch() }} />
      </>
    )
  }
  if (thread.isLoading || (!!threadId && !conversation.data && !conversation.isError)) {
    return (
      <>
        <Toolbar title={title} back />
        <View style={[chatUiStyles.loading, { backgroundColor: theme.colors.chatBackground }]}>
          <ActivityIndicator color={theme.colors.action} />
          <Text style={chatUiStyles.empty}>Carregando…</Text>
        </View>
      </>
    )
  }

  const listBackground =
    chatSettings.wallpaper === 'SOFT'
      ? theme.colors.soft
      : chatSettings.wallpaper === 'PLAIN'
        ? theme.colors.surface
        : theme.colors.chatBackground

  function sendText() {
    const value = draft.trim()
    if (!value || !canWrite) return
    const replying = replyTo
    setDraft('')
    setReplyTo(null)
    setLocalError('')
    send.mutate(
      { text: value, replyToId: replying?.eventId, adClickId },
      {
        onSuccess: () => setAdClickId(undefined),
        onError: (err) => {
          setDraft((c) => c || value)
          setReplyTo((c) => c ?? replying)
          setLocalError(errorMessage(err))
        },
      },
    )
  }

  async function attachMedia(fromCamera: boolean) {
    if (!canWrite || uploading) return
    const picked = await pickPreparedChatMedia(fromCamera, quality)
    if (!picked) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setUploading(true)
    setLocalError('')
    const caption = draft.trim() || undefined
    const replying = replyTo
    try {
      await sendMedia.mutateAsync({
        uri: picked.uri,
        mimeType: picked.mimeType,
        caption,
        replyToId: replying?.eventId,
        adClickId,
        width: picked.width,
        height: picked.height,
        durationMs: picked.durationMs,
        thumbnail: picked.thumbnail,
        signal: controller.signal,
      })
      setDraft('')
      setReplyTo(null)
      setQualityOverride(null)
      setAdClickId(undefined)
    } catch (err) {
      if (!controller.signal.aborted) setLocalError(errorMessage(err))
    } finally {
      uploadAbort.current = null
      setUploading(false)
    }
  }

  function openMenu(message: PageMessageView) {
    bubbleRefs.current[message.id]?.measureInWindow((x, y, width, height) => {
      setMenu({ message, anchor: { x, y, width, height, own: message.from === 'CITIZEN' } })
    })
  }

  function messageActions(message: PageMessageView): MenuAction[] {
    const actions: MenuAction[] = [
      {
        label: 'Responder',
        icon: <Reply size={21} color={theme.colors.muted} />,
        onPress: () => {
          setReplyTo({
            eventId: message.id,
            senderName: message.from === 'CITIZEN' ? 'Você' : title,
            excerpt: message.text || (message.attachment ? mediaKindLabel(message.attachment.kind) : 'Mensagem'),
          })
          setMenu(null)
        },
      },
    ]
    if (message.text) {
      actions.push({
        label: 'Copiar texto',
        icon: <Copy size={21} color={theme.colors.muted} />,
        onPress: () => {
          setMenu(null)
          void copyText(message.text).then((copied) => {
            if (!copied) Alert.alert('Copiar texto', 'Copiar o texto chega na próxima atualização do aplicativo.')
          })
        },
      })
    }
    return actions
  }

  const openProfile = () =>
    router.push({ pathname: '/profile/[kind]/[id]', params: { kind: KIND_BY_ORG[orgType], id: orgId } })

  return (
    <View style={{ flex: 1 }}>
      <ChatHeader
        title={title}
        group={false}
        person={page ? { id: page.orgId, name: page.name, username: page.username, avatarUrl: page.avatarUrl, verified: false } : undefined}
        status={page?.username ? `@${page.username} · Página` : 'Página'}
        typing={false}
        onSearch={() => {
          setShowSearch((v) => !v)
          setSearch('')
        }}
        detailsLabel="Ver perfil da página"
        onDetails={openProfile}
        extraMenu={(close) =>
          threadId ? (
            <MenuItem
              label="Apagar conversa"
              icon={<Trash2 size={20} color={theme.colors.action} />}
              onPress={() => {
                close()
                Alert.alert('Apagar esta conversa?', 'Ela some também para a equipe da página.', [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Apagar',
                    style: 'destructive',
                    onPress: () => remove.mutate(threadId, { onSuccess: () => router.replace('/conversations') }),
                  },
                ])
              }}
            />
          ) : null
        }
      />
      {showSearch && (
        <View style={chatUiStyles.searchBar}>
          <View style={{ flex: 1 }}>
            <Field
              bare
              accessibilityLabel="Buscar mensagens"
              placeholder="Buscar na conversa…"
              value={search}
              onChangeText={setSearch}
              style={{ paddingVertical: 8 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setShowSearch(false)
              setSearch('')
            }}
          >
            <Text style={chatUiStyles.link}>Fechar</Text>
          </Pressable>
        </View>
      )}
      {(!!localError || conversation.isError) && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorText message={localError || errorMessage(conversation.error)} />
        </View>
      )}
      <FlatList
        style={{ flex: 1, backgroundColor: listBackground }}
        data={listData}
        inverted
        keyExtractor={(item) => item.message.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={chatUiStyles.history}
        renderItem={({ item }) => {
          const { message, own, first, dayDivider, time } = item
          const inlineMeta = !!message.text && !message.attachment
          return (
            <View>
              {dayDivider && (
                <View style={chatUiStyles.dayChip}>
                  <Text style={chatUiStyles.dayChipText}>{dayDivider}</Text>
                </View>
              )}
              <Pressable
                ref={(node) => {
                  bubbleRefs.current[message.id] = node
                }}
                onLongPress={canWrite ? () => openMenu(message) : undefined}
                delayLongPress={280}
                style={[
                  chatUiStyles.bubble,
                  own ? chatUiStyles.own : chatUiStyles.peer,
                  first && (own ? chatUiStyles.ownFirst : chatUiStyles.peerFirst),
                ]}
              >
                {first && <View pointerEvents="none" style={own ? chatUiStyles.tailOwn : chatUiStyles.tailPeer} />}
                {message.replyTo && (
                  <View style={chatUiStyles.quote}>
                    <Text style={chatUiStyles.small} numberOfLines={2}>
                      {message.replyTo.from === 'CITIZEN' ? 'Você' : title}: {message.replyTo.excerpt}
                    </Text>
                  </View>
                )}
                {message.attachment && (
                  <PageAttachmentViewBox
                    attachment={message.attachment}
                    conversationId={threadId}
                    autoDownload={autoDownload}
                  />
                )}
                {!!message.text && (
                  <Text style={[chatUiStyles.message, { fontSize: bubbleFontSize, lineHeight: Math.round(bubbleFontSize * 1.4) }]}>
                    {message.text}
                    {inlineMeta && <Text style={chatUiStyles.metaSpacer}>{NBSP.repeat(11)}</Text>}
                  </Text>
                )}
                <View style={[chatUiStyles.metaRow, inlineMeta && chatUiStyles.metaInline]}>
                  <Text style={chatUiStyles.time}>{time}</Text>
                </View>
              </Pressable>
            </View>
          )
        }}
        ListEmptyComponent={
          <View style={{ padding: 24 }}>
            <Text style={chatUiStyles.empty}>
              {search ? 'Nenhuma mensagem encontrada.' : `Escreva a primeira mensagem para ${title}.`}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={chatUiStyles.banner}>
            <Text style={chatUiStyles.bannerText}>
              <ShieldCheck size={12} color={theme.colors.muted} />
              {` ${NOTICE_TEXT}`}
            </Text>
          </View>
        }
      />
      <MessageMenu
        anchor={menu?.anchor ?? null}
        onClose={() => setMenu(null)}
        reactions={[]}
        onReact={() => {}}
        actions={menu ? messageActions(menu.message) : []}
      />
      {pendingRequest ? (
        <View style={{ padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
          <Text style={{ color: theme.colors.text }}>{declined ? 'Você recusou esta conversa.' : `${title} quer conversar com você.`}</Text>
          {respond.isError && <ErrorText message={errorMessage(respond.error)} />}
          <Button title="Aceitar" loading={respond.isPending} onPress={() => respond.mutate({ id: threadId, accept: true })} />
          {!declined && <Button secondary title="Recusar" disabled={respond.isPending} onPress={() => respond.mutate({ id: threadId, accept: false })} />}
        </View>
      ) : blocked ? (
        <View style={{ padding: 14, borderTopWidth: 0.5, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
          <Text style={{ color: theme.colors.muted }}>Esta página não está recebendo novas mensagens suas.</Text>
        </View>
      ) : (
        <ChatComposerBar
          draft={draft}
          onChangeDraft={setDraft}
          onSendText={sendText}
          onAttachMedia={(fromCamera) => void attachMedia(fromCamera)}
          placeholder={threadId ? 'Mensagem' : `Escreva para ${title}`}
          maxLength={2000}
          canType={canWrite}
          canWrite={canWrite}
          busy={send.isPending || uploading}
          quality={quality}
          onToggleQuality={() => setQualityOverride(quality === 'high' ? 'normal' : 'high')}
          replyTo={replyTo}
          onCancelNote={() => setReplyTo(null)}
          uploading={uploading}
          onCancelUpload={() => uploadAbort.current?.abort()}
        />
      )}
    </View>
  )
}

/** Conversa do cidadão com uma página dentro do módulo unificado de Conversas. */
export default function PageConversationScreen() {
  const { orgType, orgId, name, adClickId } = useLocalSearchParams<{ orgType: OrgType; orgId: string; name?: string; adClickId?: string }>()
  if (!orgType || !orgId) {
    return (
      <Screen>
        <Toolbar title="Mensagens" back />
        <State title="Página não encontrada" />
      </Screen>
    )
  }
  return (
    <Screen>
      <ConversationGate allowWithoutChat>
        <PageThread orgType={orgType} orgId={orgId} initialName={name} adClickId={adClickId} />
      </ConversationGate>
    </Screen>
  )
}
