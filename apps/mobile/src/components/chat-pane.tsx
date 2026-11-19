import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router, useFocusEffect } from 'expo-router'
import Paperclip from 'lucide-react-native/icons/paperclip'
import Send from 'lucide-react-native/icons/send'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import {
  conversationTitle,
  type ConversationSummary,
} from '@votz/shared-types'
import {
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  RESET_WARNING,
  chatError,
  chatView,
  mediaKindFromMime,
  type ChatClient,
  type ChatState,
  type ChatViewAttachment,
  type ChatViewMessage,
  type VerificationAction,
} from '@votz/chat-core'
import {
  downloadNativeChatMedia,
  forgetNativeChat,
  openNativeChat,
  resetNativeChat,
  uploadNativeChatMedia,
} from '../lib/chat-runtime'
import { ApiError } from '../lib/api'
import { useSession } from '../lib/session'
import { Button, ErrorText, Field, Heading, Label } from './ui'
import { theme } from '../theme'
import { Toolbar } from './screen'

const viewability = { itemVisiblePercentThreshold: 60, minimumViewTime: 500 }

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
}: {
  attachment: ChatViewAttachment
  userId: string
  conversationId: string
  runtime: ChatClient | null
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
    if (attachment.kind === 'image') void load()
  }, [attachment.id, attachment.kind, load])

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
    if (state?.reactivate) startOver()
  }, [state?.reactivate, startOver])
  const view = chatView(state, title)
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
    if (!runtime || busy || !draft.trim()) return
    setBusy(true)
    setError('')
    try {
      await runtime.send(draft)
      setDraft('')
    } catch (failure) {
      setError((failure as Error).message || chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function attachMedia() {
    if (!runtime || busy) return
    const result = await ImagePicker.launchImageLibraryAsync({
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
      <Toolbar
        back
        title={title}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Detalhes da conversa"
            onPress={() =>
              router.push({
                pathname: '/conversation/[id]',
                params: { id: conversation.id, details: '1' },
              })
            }
          >
            <Label muted>Detalhes</Label>
          </Pressable>
        }
      />
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
      ) : !state ? (
        <View style={styles.card}>
          {error ? (
            <>
              <Label>{error}</Label>
              <Button title="Tentar de novo" onPress={restart} />
            </>
          ) : (
            <>
              <ActivityIndicator color={theme.colors.action} />
              <Label muted>Preparando a conversa…</Label>
            </>
          )}
        </View>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Confirmar identidade, opcional"
            disabled={!view.canVerify}
            onPress={() => setShowVerify((value) => !value)}
            style={styles.status}
          >
            <ShieldCheck size={17} color={theme.colors.muted} />
            <Text style={styles.small}>{view.banner}</Text>
          </Pressable>
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
          {(error || state.error) && (
            <View style={{ paddingHorizontal: 16 }}>
              <ErrorText message={error || state.error || undefined} />
            </View>
          )}
          <FlatList
            viewabilityConfig={viewability}
            onViewableItemsChanged={onVisible}
            style={{ flex: 1 }}
            data={[...view.messages].reverse()}
            inverted
            keyExtractor={(message) => message.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, gap: 8 }}
            initialNumToRender={20}
            windowSize={7}
            renderItem={({ item }) => (
              <View
                style={[styles.bubble, item.own ? styles.own : styles.peer]}
              >
                {item.senderName && (
                  <Text style={styles.sender}>{item.senderName}</Text>
                )}
                {item.attachment && (
                  <NativeAttachmentView
                    attachment={item.attachment}
                    userId={userId}
                    conversationId={conversation.id}
                    runtime={runtime}
                  />
                )}
                {!!item.body && (
                  <Text selectable style={styles.message}>
                    {item.body}
                  </Text>
                )}
                <Text style={styles.time}>{item.meta}</Text>
                {item.retryTxnId && (
                  <Button
                    title={item.retryLabel}
                    secondary
                    disabled={!item.canRetry || busy}
                    onPress={() => {
                      void runtime
                        ?.retry(item.retryTxnId!)
                        .catch((failure) => setError(chatError(failure)))
                    }}
                  />
                )}
              </View>
            )}
            ListEmptyComponent={
              view.emptyText ? (
                <View style={{ transform: [{ scaleY: -1 }], padding: 20 }}>
                  <Label muted>{view.emptyText}</Label>
                </View>
              ) : undefined
            }
            ListFooterComponent={
              view.canLoadOlder ? (
                <Button
                  title={view.olderLabel}
                  secondary
                  loading={state.loadingHistory}
                  onPress={() => {
                    void runtime
                      ?.older()
                      .catch((failure) => setError(chatError(failure)))
                  }}
                />
              ) : undefined
            }
          />
          <View style={styles.status}>
            <Text style={styles.small}>{view.readReceipts.label}</Text>
            <Switch
              accessibilityLabel={view.readReceipts.label}
              value={view.readReceipts.enabled}
              disabled={busy || view.readReceipts.disabled}
              onValueChange={() => {
                void toggleReceipts()
              }}
            />
          </View>
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Anexar foto ou vídeo"
              disabled={!view.canWrite || busy}
              onPress={() => {
                void attachMedia()
              }}
              style={[styles.attach, (!view.canWrite || busy) && { opacity: 0.4 }]}
            >
              <Paperclip size={20} color={theme.colors.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Field
                accessibilityLabel="Mensagem"
                bare
                multiline
                maxLength={4000}
                value={draft}
                onChangeText={setDraft}
                editable={view.canWrite}
                placeholder={view.placeholder}
                style={styles.field}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem"
              disabled={!view.canWrite || busy || !draft.trim()}
              onPress={() => {
                void send()
              }}
              style={[
                styles.send,
                (!view.canWrite || !draft.trim() || busy) && { opacity: 0.4 },
              ]}
            >
              <Send size={21} color={theme.colors.surface} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  )
}
const styles = StyleSheet.create({
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
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.soft,
  },
  status: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.soft,
    alignItems: 'center',
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
    maxWidth: '85%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 5,
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.tint,
    borderBottomRightRadius: 4,
  },
  peer: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.soft,
    borderBottomLeftRadius: 4,
  },
  sender: {
    fontFamily: theme.fonts.heading,
    fontSize: 12,
    color: theme.colors.primary,
  },
  message: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    lineHeight: 23,
    color: theme.colors.text,
  },
  time: {
    color: theme.colors.muted,
    fontSize: 10,
    fontFamily: theme.fonts.body,
    textAlign: 'right',
  },
  composer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
  },
  field: {
    borderRadius: 20,
    backgroundColor: theme.colors.soft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 130,
  },
  attach: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.soft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBox: {
    gap: 4,
  },
  mediaImage: {
    width: 220,
    height: 180,
    borderRadius: 12,
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
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.action,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
