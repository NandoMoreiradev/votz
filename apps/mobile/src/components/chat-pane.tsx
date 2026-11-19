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
import { router, useFocusEffect } from 'expo-router'
import Send from 'lucide-react-native/icons/send'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import type { ConversationSummary } from '@votz/shared-types'
import {
  ChatDeviceDisconnectedError,
  ENROLL_WAITING,
  RESET_WARNING,
  chatError,
  chatView,
  deviceRequestText,
  messagePlaceholder,
  messageStatusLabel,
  type ChatClient,
  type ChatMessage,
  type ChatState,
  type VerificationAction,
} from '@votz/chat-core'
import { forgetNativeChat, openNativeChat, resetNativeChat } from '../lib/chat-runtime'
import { useSession } from '../lib/session'
import { Button, ErrorText, Field, Heading, Label } from './ui'
import { theme } from '../theme'
import { Toolbar } from './screen'

const viewability = { itemVisiblePercentThreshold: 60, minimumViewTime: 500 }

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
  const peer = conversation.members.find(
    (member) => member.user.id !== userId,
  )!.user
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
  const runtimeRef = useRef<ChatClient | null>(null)
  const onVisible = useCallback(
    ({ viewableItems }: { viewableItems: { item: ChatMessage }[] }) => {
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
  const verification = state?.verification
  const verified = verification?.state === 'done'
  const view = chatView(state, peer.name, verified)
  const verifying =
    !!verification && !['none', 'cancelled', 'done'].includes(verification.state)
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
  return (
    <View style={{ flex: 1 }}>
      <Toolbar
        back
        title={peer.name}
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
            disabled={!state.room?.peer.deviceId || verified}
            onPress={() => setShowVerify((value) => !value)}
            style={styles.status}
          >
            <ShieldCheck size={17} color={theme.colors.muted} />
            <Text style={styles.small}>{view.banner}</Text>
          </Pressable>
          {state.deviceLinks.map((link) => {
            const request = deviceRequestText(link)
            return (
              <View key={link.id} style={styles.card}>
                <Text style={styles.name}>{request.title}</Text>
                <Label muted>{request.text}</Label>
                <Button
                  title={request.allow}
                  loading={busy}
                  onPress={() => {
                    void attemptAction(() =>
                      runtime!.decideDeviceLink(link.id, true),
                    )
                  }}
                />
                <Button
                  secondary
                  title={request.deny}
                  disabled={busy}
                  onPress={() => {
                    void attemptAction(() =>
                      runtime!.decideDeviceLink(link.id, false),
                    )
                  }}
                />
              </View>
            )
          })}
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
          {!verified &&
            state.room?.peer.deviceId &&
            (showVerify || verifying) && (
              <View style={styles.card}>
                <Text style={styles.name}>Confirmar identidade (opcional)</Text>
                <Label muted>
                  Comparem os três números nas duas telas com {peer.name}. Só
                  confirme se forem iguais. Você pode conversar sem fazer isso.
                </Label>
                {verification?.decimals && (
                  <Text
                    accessibilityLabel="Código de verificação"
                    style={styles.code}
                  >
                    {verification.decimals.join(' · ')}
                  </Text>
                )}
                {(!verification ||
                  ['none', 'cancelled'].includes(verification.state)) && (
                  <Button
                    title="Começar a confirmação"
                    loading={busy}
                    onPress={() => {
                      void verify('request')
                    }}
                  />
                )}
                {verification?.state === 'requested' && verification.incoming && (
                  <Button
                    title="Aceitar"
                    loading={busy}
                    onPress={() => {
                      void verify('accept')
                    }}
                  />
                )}
                {verification?.state === 'requested' &&
                  !verification.incoming && (
                    <Label muted>Esperando a outra pessoa aceitar…</Label>
                  )}
                {verification?.state === 'ready' && (
                  <Label muted>Preparando os números…</Label>
                )}
                {verification?.state === 'comparing' && (
                  <Button
                    title="Os números são iguais"
                    loading={busy}
                    onPress={() => {
                      void verify('confirm')
                    }}
                  />
                )}
                {verification?.state === 'confirmed' && (
                  <Label muted>Esperando a outra pessoa confirmar…</Label>
                )}
                {verification &&
                  !['none', 'cancelled'].includes(verification.state) && (
                    <Button
                      secondary
                      title="Cancelar"
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
            data={[...state.messages].reverse()}
            inverted
            keyExtractor={(message) => message.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 16, gap: 8 }}
            initialNumToRender={20}
            windowSize={7}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.bubble,
                  item.sender === 'self' ? styles.own : styles.peer,
                ]}
              >
                <Text selectable style={styles.message}>
                  {item.text ?? messagePlaceholder(item.status)}
                </Text>
                <Text style={styles.time}>
                  {new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {item.sender === 'self'
                    ? ` · ${messageStatusLabel(item.status)}`
                    : ''}
                </Text>
                {item.status === 'failed' && item.txnId && (
                  <Button
                    title="Tentar enviar novamente"
                    secondary
                    disabled={!state.room?.canSend || busy}
                    onPress={() => {
                      void runtime
                        ?.retry(item.txnId!)
                        .catch((failure) => setError(chatError(failure)))
                    }}
                  />
                )}
              </View>
            )}
            ListEmptyComponent={
              view.canWrite && state.ready ? (
                <View style={{ transform: [{ scaleY: -1 }], padding: 20 }}>
                  <Label muted>A conversa de vocês começa aqui.</Label>
                </View>
              ) : undefined
            }
            ListFooterComponent={
              state.historyCursor ? (
                <Button
                  title="Mensagens anteriores"
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
            <Text style={styles.small}>Compartilhar quando eu ler</Text>
            <Switch
              accessibilityLabel="Compartilhar quando eu ler"
              value={state.readReceiptsEnabled}
              disabled={busy || !state.ready || !state.connected}
              onValueChange={() => {
                void toggleReceipts()
              }}
            />
          </View>
          <View style={styles.composer}>
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
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.action,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
