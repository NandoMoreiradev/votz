import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useNetworkState } from 'expo-network'
import { router, useFocusEffect } from 'expo-router'
import AlertCircle from 'lucide-react-native/icons/circle-alert'
import Camera from 'lucide-react-native/icons/camera'
import Check from 'lucide-react-native/icons/check'
import CheckCheck from 'lucide-react-native/icons/check-check'
import Clock from 'lucide-react-native/icons/clock'
import Copy from 'lucide-react-native/icons/copy'
import Forward from 'lucide-react-native/icons/forward'
import Mic from 'lucide-react-native/icons/mic'
import Paperclip from 'lucide-react-native/icons/paperclip'
import Reply from 'lucide-react-native/icons/reply'
import Send from 'lucide-react-native/icons/send'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  conversationFontSize,
  conversationHeaderStatus,
  conversationTitle,
  type ConversationSummary,
} from '@votz/shared-types'
import {
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  QUICK_REACTIONS,
  RESET_WARNING,
  chatError,
  chatSeedState,
  chatView,
  mediaKindFromMime,
  type ChatClient,
  type ChatReplyTo,
  type ChatState,
  type ChatViewAttachment,
  type ChatViewMessage,
  type VerificationAction,
} from '@votz/chat-core'
import {
  useConversationList,
  useConversationSettings,
} from '../hooks/use-conversations'
import {
  downloadNativeChatMedia,
  forgetNativeChat,
  openNativeChat,
  resetNativeChat,
  uploadNativeChatMedia,
} from '../lib/chat-runtime'
import { api, ApiError } from '../lib/api'
import { useTypingUsers } from '../lib/chat-typing'
import { useSession } from '../lib/session'
import { ChatHeader } from './chat-header'
import { MessageMenu, type MenuAction, type MenuAnchor } from './chat-sheet'
import { copyText } from '../lib/clipboard'
import { shouldAutoDownload } from '../lib/network-policy'
import { Button, ErrorText, Field, Heading, Label } from './ui'
import { theme } from '../theme'

const viewability = { itemVisiblePercentThreshold: 60, minimumViewTime: 500 }
const NBSP = ' '
/** Texto encaminhado em memória entre telas de conversa (nunca gravado em disco). */
let pendingForward: { targetId: string; text: string } | null = null

function bytesToBase64(bytes: Uint8Array): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out +=
      chars[(n >> 18) & 63] +
      chars[(n >> 12) & 63] +
      (i + 1 < bytes.length ? chars[(n >> 6) & 63] : '=') +
      (i + 2 < bytes.length ? chars[n & 63] : '=')
  }
  return out
}

function NativeAttachmentView({
  attachment,
  userId,
  conversationId,
  runtime,
  autoDownload,
}: {
  attachment: ChatViewAttachment
  userId: string
  conversationId: string
  runtime: ChatClient | null
  /** Baixar a foto sozinha (configuração "Download automático de mídia"). */
  autoDownload: boolean
}) {
  const [dataUri, setDataUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    if (!runtime || loading || dataUri) return
    setLoading(true)
    setFailed('')
    try {
      const cipher = await downloadNativeChatMedia(
        userId,
        conversationId,
        attachment.id,
      )
      const plain = await runtime.decryptMedia(cipher, attachment.secret)
      if (attachment.kind === 'image')
        setDataUri(
          `data:${attachment.mimeType || 'image/jpeg'};base64,${bytesToBase64(plain)}`,
        )
    } catch (err) {
      setFailed(
        err instanceof ApiError && err.status === 410
          ? 'Este arquivo expirou após 90 dias.'
          : 'Não foi possível abrir este arquivo.',
      )
    } finally {
      setLoading(false)
    }
  }, [runtime, loading, dataUri, userId, conversationId, attachment])

  useEffect(() => {
    if (attachment.kind === 'image' && autoDownload) void load()
  }, [attachment.id, attachment.kind, autoDownload, load])

  return (
    <View style={styles.mediaBox}>
      {dataUri && attachment.kind === 'image' ? (
        <Image
          source={{ uri: dataUri }}
          accessibilityLabel={attachment.name}
          contentFit="cover"
          style={styles.mediaImage}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => {
            void load()
          }}
          style={styles.mediaCard}
        >
          <Text style={styles.small}>
            {loading
              ? 'Baixando…'
              : `${attachment.kindLabel}: ${attachment.name} (${attachment.sizeLabel})`}
          </Text>
        </Pressable>
      )}
      {!!failed && <Text style={styles.mediaError}>{failed}</Text>}
    </View>
  )
}

interface BubbleProps {
  item: ChatViewMessage
  fontSize: number
  userId: string
  conversationId: string
  runtime: ChatClient | null
  autoDownload: boolean
  busy: boolean
  registerRef: (id: string, node: ComponentRef<typeof View> | null) => void
  onMenu: (item: ChatViewMessage) => void
  onReact: (id: string, emoji: string) => void
  onRetry: (txnId: string) => void
}

/** Só o que muda o desenho de uma bolha: o resto do estado da conversa não a redesenha. */
function bubbleKey(item: ChatViewMessage) {
  return [
    item.id,
    item.body,
    item.time,
    item.deliveryIcon,
    item.statusLabel,
    item.isFirstInGroup,
    item.dayDivider,
    item.canReact,
    item.retryTxnId,
    item.canRetry,
    item.senderName,
    item.unreadable,
    item.attachment?.id,
    item.reactions.map((r) => `${r.emoji}${r.count}${r.mine ? 'm' : ''}`).join(','),
  ].join('|')
}

const MessageBubble = memo(
  function MessageBubble({
    item,
    fontSize,
    userId,
    conversationId,
    runtime,
    autoDownload,
    busy,
    registerRef,
    onMenu,
    onReact,
    onRetry,
  }: BubbleProps) {
    // Mensagem só de texto: a hora fica no canto, na última linha, como no WhatsApp.
    const inlineMeta =
      !!item.body &&
      !item.unreadable &&
      !item.attachment &&
      !item.card &&
      !item.retryTxnId &&
      item.reactions.length === 0
    const meta = (
      <View
        accessible
        accessibilityLabel={[item.time, item.statusLabel].filter(Boolean).join('. ')}
        style={[styles.metaRow, inlineMeta && styles.metaInline]}
      >
        <Text style={styles.time}>{item.time}</Text>
        {item.deliveryIcon === 'clock' && <Clock size={12} color={theme.colors.muted} />}
        {item.deliveryIcon === 'check' && <Check size={13} color={theme.colors.muted} />}
        {item.deliveryIcon === 'checks' && (
          <CheckCheck size={14} color={theme.colors.muted} />
        )}
        {item.deliveryIcon === 'checks-read' && (
          <CheckCheck size={14} color={theme.colors.positive} />
        )}
        {item.deliveryIcon === 'alert' && (
          <AlertCircle size={12} color={theme.colors.action} />
        )}
      </View>
    )
    return (
      <View>
        {item.dayDivider && (
          <View style={styles.dayChip}>
            <Text style={styles.dayChipText}>{item.dayDivider}</Text>
          </View>
        )}
        <Pressable
          ref={(node) => registerRef(item.id, node)}
          onLongPress={item.canReact ? () => onMenu(item) : undefined}
          delayLongPress={280}
          accessibilityHint={
            item.canReact
              ? 'Segure para reagir, responder, encaminhar ou copiar.'
              : undefined
          }
          style={[
            styles.bubble,
            item.own ? styles.own : styles.peer,
            item.isFirstInGroup && (item.own ? styles.ownFirst : styles.peerFirst),
          ]}
        >
          {item.isFirstInGroup && (
            <View pointerEvents="none" style={item.own ? styles.tailOwn : styles.tailPeer} />
          )}
          {item.senderName && <Text style={styles.sender}>{item.senderName}</Text>}
          {item.forwarded && <Text style={styles.forwarded}>Encaminhada</Text>}
          {item.replyTo && (
            <View style={styles.quote}>
              <Text style={styles.small} numberOfLines={2}>
                {item.replyTo.senderName ? `${item.replyTo.senderName}: ` : ''}
                {item.replyTo.excerpt}
              </Text>
            </View>
          )}
          {item.attachment && (
            <NativeAttachmentView
              attachment={item.attachment}
              userId={userId}
              conversationId={conversationId}
              runtime={runtime}
              autoDownload={autoDownload}
            />
          )}
          {!!item.body && (
            <Text
              style={[
                styles.message,
                { fontSize, lineHeight: Math.round(fontSize * 1.4) },
                item.unreadable && styles.unreadable,
              ]}
            >
              {item.body}
              {/* Espaço invisível no fim do texto: reserva o canto da hora e quebra junto com ele. */}
              {inlineMeta && (
                <Text style={styles.metaSpacer}>
                  {item.own ? NBSP.repeat(19) : NBSP.repeat(11)}
                </Text>
              )}
            </Text>
          )}
          {item.card && (
            <Pressable
              accessibilityRole="button"
              style={styles.cardLink}
              onPress={() =>
                router.push({
                  pathname: item.card!.kind === 'post' ? '/post/[id]' : '/report/[id]',
                  params: { id: item.card!.id },
                })
              }
            >
              <Text style={styles.sender}>
                {item.card.label}
                {item.card.title ? ` · ${item.card.title}` : ''}
              </Text>
            </Pressable>
          )}
          {item.reactions.length > 0 && (
            <View style={styles.reactionRow}>
              {item.reactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  accessibilityRole="button"
                  style={[styles.pill, r.mine && styles.pillMine]}
                  onPress={() => onReact(item.id, r.emoji)}
                >
                  <Text style={styles.small}>
                    {r.emoji} {r.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {meta}
          {item.retryTxnId && (
            <Button
              title={item.retryLabel}
              secondary
              disabled={!item.canRetry || busy}
              onPress={() => onRetry(item.retryTxnId!)}
            />
          )}
        </Pressable>
      </View>
    )
  },
  (prev, next) =>
    prev.fontSize === next.fontSize &&
    prev.userId === next.userId &&
    prev.conversationId === next.conversationId &&
    prev.runtime === next.runtime &&
    prev.autoDownload === next.autoDownload &&
    prev.registerRef === next.registerRef &&
    prev.onMenu === next.onMenu &&
    prev.onReact === next.onReact &&
    prev.onRetry === next.onRetry &&
    (!next.item.retryTxnId || prev.busy === next.busy) &&
    bubbleKey(prev.item) === bubbleKey(next.item),
)

/**
 * A conversa abre sozinha: as chaves são criadas e guardadas no cofre do
 * aparelho sem a pessoa fazer nada. Só aparece uma tela de espera quando é
 * preciso permitir este aparelho em outro que a pessoa já usa.
 */
export function ChatPane({
  conversation,
}: {
  conversation: ConversationSummary
}) {
  const userId = useSession((state) => state.user!.id)
  const conversations = useConversationList('active')
  const settingsQuery = useConversationSettings()
  const chatSettings = settingsQuery.data ?? DEFAULT_CONVERSATION_SETTINGS
  const network = useNetworkState()
  const bubbleFontSize = conversationFontSize(chatSettings.fontScale)
  const listBackground =
    chatSettings.wallpaper === 'SOFT'
      ? theme.colors.soft
      : chatSettings.wallpaper === 'PLAIN'
        ? theme.colors.surface
        : theme.colors.chatBackground
  const title = conversationTitle(conversation, userId)
  const [focused, setFocused] = useState(false)
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  )
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ChatState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<ChatReplyTo | null>(null)
  const [forwardedDraft, setForwardedDraft] = useState(false)
  const [forwardingText, setForwardingText] = useState<string | null>(null)
  const typingNames = useTypingUsers(conversation.id)
  const typingSentAt = useRef(0)
  const typingActive = useRef(false)
  const emitTyping = useCallback(
    (typing: boolean) => {
      const now = Date.now()
      if (typing) {
        if (typingActive.current && now - typingSentAt.current < 3000) return
        typingActive.current = true
        typingSentAt.current = now
      } else {
        if (!typingActive.current) return
        typingActive.current = false
        typingSentAt.current = 0
      }
      void api(`/conversations/${conversation.id}/chat/typing`, {
        method: 'POST',
        body: JSON.stringify({ typing }),
      }).catch(() => {})
    },
    [conversation.id],
  )
  useEffect(() => {
    return () => {
      if (typingActive.current) {
        typingActive.current = false
        void api(`/conversations/${conversation.id}/chat/typing`, {
          method: 'POST',
          body: JSON.stringify({ typing: false }),
        }).catch(() => {})
      }
    }
  }, [conversation.id])
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [menu, setMenu] = useState<{ message: ChatViewMessage; anchor: MenuAnchor } | null>(null)
  const bubbleRefs = useRef<Record<string, ComponentRef<typeof View> | null>>({})
  const [pending, setPending] = useState<{ code: string } | null>(null)
  const [showVerify, setShowVerify] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [password, setPassword] = useState('')
  const [runtime, setRuntime] = useState<ChatClient | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadAbort = useRef<AbortController | null>(null)
  const runtimeRef = useRef<ChatClient | null>(null)
  const onVisible = useCallback(
    ({ viewableItems }: { viewableItems: { item: ChatViewMessage }[] }) => {
      runtimeRef.current?.visibleMessages(
        viewableItems.map((token) => token.item.id),
      )
    },
    [],
  )
  const onRuntime = useCallback((value: ChatClient) => {
    runtimeRef.current = value
    setRuntime(value)
  }, [])
  const restart = useCallback(() => {
    setError('')
    setAttempt((value) => value + 1)
  }, [])
  // Aparelho desconectado: apaga as credenciais locais e recomeça sozinho.
  const startOver = useCallback(() => {
    void forgetNativeChat(userId).then(restart)
  }, [userId, restart])
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      return () => {
        setFocused(false)
        setState(null)
        setDraft('')
      }
    }, []),
  )
  useEffect(() => {
    const listener = AppState.addEventListener('change', (value) => {
      setForeground(value === 'active')
      if (value !== 'active') {
        setState(null)
        setDraft('')
      }
    })
    return () => listener.remove()
  }, [])
  useEffect(() => {
    if (!focused || !foreground) return
    const abort = new AbortController()
    let close = () => {}
    void openNativeChat(
      userId,
      conversation.id,
      abort.signal,
      setState,
      onRuntime,
      setPending,
    )
      .then((value) => {
        if (abort.signal.aborted) value()
        else close = value
      })
      .catch((failure) => {
        if (abort.signal.aborted) return
        if (failure instanceof ChatDeviceDisconnectedError) startOver()
        else setError((failure as Error).message || chatError(failure))
      })
    return () => {
      abort.abort()
      runtimeRef.current = null
      close()
      setRuntime(null)
      setPending(null)
    }
  }, [focused, foreground, userId, conversation.id, onRuntime, attempt, startOver])
  useEffect(() => {
    if (pendingForward && pendingForward.targetId === conversation.id) {
      setDraft(pendingForward.text)
      setForwardedDraft(true)
      pendingForward = null
    }
  }, [conversation.id])
  useEffect(() => {
    if (state?.reactivate) startOver()
  }, [state?.reactivate, startOver])
  // Voltando a uma conversa recente, as últimas mensagens aparecem na hora, da memória.
  const seed = useMemo(
    () => (state ? null : chatSeedState(conversation.id)),
    [state, conversation.id],
  )
  const shown = state ?? seed
  const view = useMemo(
    () => chatView(shown, title, undefined, showSearch ? search : ''),
    [shown, title, showSearch, search],
  )
  const listData = useMemo(() => [...view.messages].reverse(), [view.messages])
  const headerStatus = conversationHeaderStatus(conversation, typingNames)
  const forwardTargets = (
    conversations.data?.pages.flatMap((page) => page.items) ?? []
  ).filter((item) => item.id !== conversation.id && !item.archivedAt)
  async function attemptAction(work: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  const verify = (action: VerificationAction) =>
    attemptAction(() => runtime!.verification(action))
  const toggleReceipts = () =>
    attemptAction(() => runtime!.setReadReceipts(!state!.readReceiptsEnabled))
  async function reset() {
    if (busy || !password) return
    setBusy(true)
    setError('')
    try {
      await resetNativeChat(userId, password)
      setPassword('')
      setResetting(false)
      restart()
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function send() {
    if (!runtime || !draft.trim()) return
    // Como no WhatsApp: o campo esvazia na hora e a bolha aparece; o envio segue por trás.
    // Só se for recusado o texto volta para o campo. Sem travar o campo: dá para mandar várias seguidas.
    const text = draft
    const replying = replyTo
    const forwarding = forwardedDraft
    setDraft('')
    setReplyTo(null)
    setForwardedDraft(false)
    setError('')
    emitTyping(false)
    try {
      await runtime.send(text, {
        ...(replying ? { replyTo: replying } : {}),
        ...(forwarding ? { forwarded: true } : {}),
      })
    } catch (failure) {
      setDraft((current) => current || text)
      setReplyTo((current) => current ?? replying)
      setForwardedDraft((current) => current || forwarding)
      setError((failure as Error).message || chatError(failure))
    }
  }
  async function react(messageId: string, emoji: string) {
    if (!runtime || busy) return
    setMenu(null)
    try {
      await runtime.react(messageId, emoji)
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    }
  }
  /** Abre o menu junto da mensagem tocada: mede onde ela está na tela. */
  function openMenu(message: ChatViewMessage) {
    bubbleRefs.current[message.id]?.measureInWindow((x, y, width, height) => {
      setMenu({ message, anchor: { x, y, width, height, own: message.own } })
    })
  }
  function retry(txnId: string) {
    void runtime?.retry(txnId).catch((failure) => setError(chatError(failure)))
  }
  // Sempre a versão mais recente das funções, com identidade estável para as bolhas.
  const live = useRef({ openMenu, react, retry })
  useEffect(() => {
    live.current = { openMenu, react, retry }
  })
  const registerRef = useCallback(
    (id: string, node: ComponentRef<typeof View> | null) => {
      bubbleRefs.current[id] = node
    },
    [],
  )
  const onMenu = useCallback((message: ChatViewMessage) => live.current.openMenu(message), [])
  const onReact = useCallback(
    (id: string, emoji: string) => void live.current.react(id, emoji),
    [],
  )
  const onRetry = useCallback((txnId: string) => live.current.retry(txnId), [])
  function messageActions(message: ChatViewMessage): MenuAction[] {
    const actions: MenuAction[] = [
      {
        label: 'Responder',
        icon: <Reply size={21} color={theme.colors.muted} />,
        onPress: () => {
          setReplyTo({
            eventId: message.id,
            senderName: message.own ? 'Você' : (message.senderName ?? title),
            excerpt: message.body || message.attachment?.kindLabel || 'Mensagem',
          })
          setMenu(null)
        },
      },
    ]
    if (message.body && !message.unreadable) {
      actions.push(
        {
          label: 'Encaminhar',
          icon: <Forward size={21} color={theme.colors.muted} />,
          onPress: () => {
            setForwardingText(message.body)
            setMenu(null)
          },
        },
        {
          label: 'Copiar texto',
          icon: <Copy size={21} color={theme.colors.muted} />,
          onPress: () => {
            setMenu(null)
            void copyText(message.body).then((copied) => {
              if (!copied)
                Alert.alert(
                  'Copiar texto',
                  'Copiar o texto chega na próxima atualização do aplicativo.',
                )
            })
          },
        },
      )
    }
    return actions
  }
  async function attachMedia(fromCamera = false) {
    if (!runtime || busy) return
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
        })
    const asset = result.canceled ? null : result.assets[0]
    if (!asset) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setBusy(true)
    setUploading(true)
    setError('')
    try {
      const { File } = await import('expo-file-system')
      const bytes = await new File(asset.uri).bytes()
      const mimeType =
        asset.mimeType ||
        (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
      const kind = mediaKindFromMime(mimeType)
      await runtime.sendMedia({
        kind,
        name: asset.fileName || (kind === 'video' ? 'video.mp4' : 'foto.jpg'),
        mimeType,
        bytes,
        caption: draft.trim() || undefined,
        width: asset.width,
        height: asset.height,
        durationMs: asset.duration ?? undefined,
        upload: (ciphertext) =>
          uploadNativeChatMedia(
            userId,
            conversation.id,
            ciphertext,
            controller.signal,
          ),
      })
      setDraft('')
    } catch (failure) {
      if (!controller.signal.aborted)
        setError((failure as Error).message || chatError(failure))
    } finally {
      uploadAbort.current = null
      setUploading(false)
      setBusy(false)
    }
  }
  return (
    <View style={{ flex: 1 }}>
      <ChatHeader
        title={title}
        group={conversation.kind === 'GROUP'}
        person={conversation.members.find((m) => m.user.id !== userId)?.user}
        status={headerStatus.text}
        typing={headerStatus.typing}
        onSearch={() => {
          setShowSearch((value) => !value)
          setSearch('')
        }}
        onDetails={() =>
          router.push({
            pathname: '/conversation/[id]',
            params: { id: conversation.id, details: '1' },
          })
        }
        receipts={
          state
            ? {
                label: view.readReceipts.label,
                enabled: view.readReceipts.enabled,
                disabled: busy || view.readReceipts.disabled,
                onToggle: () => {
                  void toggleReceipts()
                },
              }
            : undefined
        }
      />
      {showSearch && (
        <View style={styles.searchBar}>
          <View style={{ flex: 1 }}>
            <Field
              accessibilityLabel="Buscar mensagens"
              bare
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar na conversa…"
              style={styles.field}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setShowSearch(false)
              setSearch('')
            }}
          >
            <Text style={styles.link}>Fechar</Text>
          </Pressable>
        </View>
      )}
      {forwardingText && (
        <View style={styles.card}>
          <Text style={styles.name}>Encaminhar para</Text>
          {forwardTargets.length ? (
            forwardTargets.slice(0, 6).map((target) => (
              <Button
                key={target.id}
                secondary
                title={conversationTitle(target, userId)}
                onPress={() => {
                  pendingForward = { targetId: target.id, text: forwardingText }
                  setForwardingText(null)
                  router.push({
                    pathname: '/conversation/[id]',
                    params: { id: target.id },
                  })
                }}
              />
            ))
          ) : (
            <Label muted>Nenhuma outra conversa disponível.</Label>
          )}
          <Button
            secondary
            title="Cancelar"
            onPress={() => setForwardingText(null)}
          />
        </View>
      )}
      {pending ? (
        <View style={styles.card}>
          <ShieldCheck size={26} color={theme.colors.primary} />
          <Heading>{ENROLL_WAITING.title}</Heading>
          <Label muted>{ENROLL_WAITING.text}</Label>
          <Text accessibilityLabel="Código do pedido" style={styles.code}>
            {pending.code}
          </Text>
          <Label muted>{ENROLL_WAITING.note}</Label>
          {resetting ? (
            <>
              <Text style={styles.name}>{RESET_WARNING.title}</Text>
              <Label muted>{RESET_WARNING.text}</Label>
              <Field
                accessibilityLabel="Senha do Votz"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                value={password}
                onChangeText={setPassword}
                placeholder="Sua senha do Votz"
              />
              <Button
                title={RESET_WARNING.action}
                loading={busy}
                disabled={!password}
                onPress={() => {
                  void reset()
                }}
              />
              <Button
                secondary
                title="Cancelar"
                disabled={busy}
                onPress={() => {
                  setResetting(false)
                  setPassword('')
                  setError('')
                }}
              />
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setResetting(true)}
            >
              <Text style={styles.link}>{ENROLL_WAITING.lost}</Text>
            </Pressable>
          )}
          <ErrorText message={error} />
        </View>
      ) : !shown ? (
        error ? (
          <View style={styles.card}>
            <Label>{error}</Label>
            <Button title="Tentar de novo" onPress={restart} />
          </View>
        ) : (
          <View style={[styles.loading, { backgroundColor: listBackground }]}>
            <ActivityIndicator color={theme.colors.action} />
            <Text style={styles.empty}>Preparando a conversa…</Text>
          </View>
        )
      ) : (
        <>
          {view.deviceRequests.map((request) => (
            <View key={request.id} style={styles.card}>
              <Text style={styles.name}>{request.title}</Text>
              <Label muted>{request.text}</Label>
              <Button
                title={request.allow}
                loading={busy}
                onPress={() => {
                  void attemptAction(() =>
                    runtime!.decideDeviceLink(request.id, true),
                  )
                }}
              />
              <Button
                secondary
                title={request.deny}
                disabled={busy}
                onPress={() => {
                  void attemptAction(() =>
                    runtime!.decideDeviceLink(request.id, false),
                  )
                }}
              />
            </View>
          ))}
          {view.notices.map((notice) => (
            <View key={notice.id} style={styles.notice}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.small}>{notice.text}</Text>
                {notice.detail && <Text style={styles.small}>{notice.detail}</Text>}
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void attemptAction(() => runtime!.acknowledgeNotice(notice.id))
                }}
              >
                <Text style={styles.link}>{notice.action}</Text>
              </Pressable>
            </View>
          ))}
          {view.waitingPeer && (
            <View style={styles.notice}>
              <Text style={styles.small}>{view.waitingPeer}</Text>
            </View>
          )}
          {view.verification && (showVerify || view.verification.active) && (
            <View style={styles.card}>
              <Text style={styles.name}>{view.verification.title}</Text>
              <Label muted>{view.verification.description}</Label>
              {view.verification.code && (
                <Text
                  accessibilityLabel="Código de verificação"
                  style={styles.code}
                >
                  {view.verification.code}
                </Text>
              )}
              {view.verification.primaryAction && (
                <Button
                  title={view.verification.primaryAction.label}
                  loading={busy}
                  onPress={() => {
                    void verify(view.verification!.primaryAction!.action)
                  }}
                />
              )}
              {view.verification.waitingText && (
                <Label muted>{view.verification.waitingText}</Label>
              )}
              {view.verification.canCancel && (
                <Button
                  secondary
                  title={view.verification.cancelLabel}
                  disabled={busy}
                  onPress={() => {
                    void verify('cancel')
                  }}
                />
              )}
            </View>
          )}
          {(error || shown.error) && (
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText message={error || shown.error || undefined} />
            </View>
          )}
          <FlatList
            viewabilityConfig={viewability}
            onViewableItemsChanged={onVisible}
            style={{ flex: 1, backgroundColor: listBackground }}
            data={listData}
            inverted
            keyExtractor={(message) => message.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.history}
            initialNumToRender={20}
            windowSize={7}
            renderItem={({ item }) => (
              <MessageBubble
                item={item}
                fontSize={bubbleFontSize}
                userId={userId}
                conversationId={conversation.id}
                runtime={runtime}
                autoDownload={shouldAutoDownload(chatSettings.mediaAutoDownload, network.type)}
                busy={busy}
                registerRef={registerRef}
                onMenu={onMenu}
                onReact={onReact}
                onRetry={onRetry}
              />
            )}
            ListEmptyComponent={
              view.emptyText ? (
                <View style={{ padding: 24 }}>
                  <Text style={styles.empty}>{view.emptyText}</Text>
                </View>
              ) : undefined
            }
            ListFooterComponent={
              <View>
                {view.canLoadOlder ? (
                  <Button
                    title={view.olderLabel}
                    secondary
                    loading={shown.loadingHistory}
                    onPress={() => {
                      void runtime
                        ?.older()
                        .catch((failure) => setError(chatError(failure)))
                    }}
                  />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Confirmar identidade, opcional"
                    disabled={!view.canVerify}
                    onPress={() => setShowVerify((value) => !value)}
                    style={styles.banner}
                  >
                    <Text style={styles.bannerText}>
                      <ShieldCheck size={12} color={theme.colors.muted} />
                      {` ${view.banner}`}
                    </Text>
                  </Pressable>
                )}
              </View>
            }
          />
          <MessageMenu
            anchor={menu?.anchor ?? null}
            onClose={() => setMenu(null)}
            reactions={QUICK_REACTIONS}
            onReact={(emoji) => {
              if (menu) void react(menu.message.id, emoji)
            }}
            actions={menu ? messageActions(menu.message) : []}
          />
          {(replyTo || forwardedDraft) && (
            <View style={styles.notice}>
              <Text style={[styles.small, { flex: 1 }]} numberOfLines={1}>
                {replyTo
                  ? `Respondendo a ${replyTo.senderName || 'mensagem'}: ${replyTo.excerpt}`
                  : 'Encaminhando mensagem'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setReplyTo(null)
                  setForwardedDraft(false)
                }}
              >
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </View>
          )}
          {uploading && (
            <View style={styles.notice}>
              <Text style={styles.small}>Enviando mídia…</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => uploadAbort.current?.abort()}
              >
                <Text style={styles.link}>Cancelar</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.composer}>
            <View style={styles.inputWrap}>
              <View style={{ flex: 1 }}>
                <Field
                  accessibilityLabel="Mensagem"
                  bare
                  multiline
                  maxLength={4000}
                  value={draft}
                  onChangeText={(value) => {
                    setDraft(value)
                    emitTyping(value.trim().length > 0)
                  }}
                  onBlur={() => emitTyping(false)}
                  editable={view.canType}
                  placeholder={view.placeholder}
                  style={styles.field}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Anexar foto ou vídeo"
                disabled={!view.canWrite || busy}
                onPress={() => {
                  void attachMedia(false)
                }}
                style={[styles.inlineIcon, (!view.canWrite || busy) && { opacity: 0.4 }]}
              >
                <Paperclip size={21} color={theme.colors.muted} />
              </Pressable>
              {!draft.trim() && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Tirar foto"
                  disabled={!view.canWrite || busy}
                  onPress={() => {
                    void attachMedia(true)
                  }}
                  style={[styles.inlineIcon, (!view.canWrite || busy) && { opacity: 0.4 }]}
                >
                  <Camera size={21} color={theme.colors.muted} />
                </Pressable>
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                draft.trim() ? 'Enviar mensagem' : 'Gravar mensagem de voz'
              }
              disabled={!view.canWrite || (!!draft.trim() && busy)}
              onPress={() => {
                if (draft.trim()) void send()
                else
                  Alert.alert(
                    'Mensagem de voz',
                    'A gravação de voz chega em breve no celular.',
                  )
              }}
              style={[
                styles.send,
                (!view.canWrite || (!!draft.trim() && busy)) && { opacity: 0.4 },
              ]}
            >
              {draft.trim() ? (
                <Send size={21} color={theme.colors.surface} />
              ) : (
                <Mic size={22} color={theme.colors.surface} />
              )}
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}
const styles = StyleSheet.create({
  history: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  dayChip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    elevation: 1,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  dayChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
  },
  banner: {
    alignSelf: 'center',
    maxWidth: '92%',
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  metaSpacer: {
    fontSize: 12,
    color: 'transparent',
  },
  bannerText: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  empty: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  ownFirst: {
    borderTopRightRadius: 0,
    marginTop: 8,
  },
  peerFirst: {
    borderTopLeftRadius: 0,
    marginTop: 8,
  },
  tailOwn: {
    position: 'absolute',
    top: 0,
    right: -7,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderLeftWidth: 8,
    borderTopColor: theme.colors.bubbleOwn,
    borderLeftColor: 'transparent',
  },
  tailPeer: {
    position: 'absolute',
    top: 0,
    left: -7,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderRightWidth: 8,
    borderTopColor: theme.colors.bubblePeer,
    borderRightColor: 'transparent',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  metaInline: {
    position: 'absolute',
    right: 10,
    bottom: 6,
    marginTop: 0,
  },
  name: {
    fontSize: 16,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  card: {
    margin: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    borderRadius: 16,
    gap: 12,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.soft,
  },
  link: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    color: theme.colors.action,
  },
  small: {
    fontSize: 12,
    color: theme.colors.muted,
    fontFamily: theme.fonts.body,
    flex: 1,
  },
  code: {
    fontSize: 24,
    fontFamily: theme.fonts.heading,
    color: theme.colors.primary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 3,
    elevation: 1,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.bubbleOwn,
  },
  peer: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bubblePeer,
  },
  sender: {
    fontFamily: theme.fonts.heading,
    fontSize: 12,
    color: theme.colors.primary,
  },
  message: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.text,
  },
  unreadable: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    color: theme.colors.muted,
  },
  time: {
    color: theme.colors.muted,
    fontSize: 11,
    fontFamily: theme.fonts.body,
    textAlign: 'right',
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: theme.colors.chatBackground,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 46,
    borderRadius: 24,
    paddingRight: 6,
    backgroundColor: theme.colors.surface,
  },
  field: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
    maxHeight: 130,
    fontSize: 16,
  },
  inlineIcon: {
    width: 40,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBox: {
    gap: 4,
  },
  mediaImage: {
    width: 220,
    height: 180,
    borderRadius: 8,
    backgroundColor: theme.colors.soft,
  },
  mediaCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  mediaError: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.action,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.soft,
  },
  forwarded: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    fontStyle: 'italic',
    color: theme.colors.muted,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.action,
    paddingLeft: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(26,26,46,0.06)',
    borderRadius: 6,
  },
  cardLink: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  pill: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pillMine: {
    borderColor: theme.colors.action,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.action,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
