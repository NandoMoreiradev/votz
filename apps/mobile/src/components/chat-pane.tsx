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
  chatError,
  messageStatusLabel,
  type ChatMessage,
  type ChatState,
  type VerificationAction,
} from '@votz/chat-core'
import { openNativeChat } from '../lib/chat-runtime'
import { useSession } from '../lib/session'
import { Button, ErrorText, Field, Heading, Label } from './ui'
import { theme } from '../theme'
import { Toolbar } from './screen'

const viewability = { itemVisiblePercentThreshold: 60, minimumViewTime: 500 }

export function ChatPane({
  conversation,
}: {
  conversation: ConversationSummary
}) {
  const userId = useSession((state) => state.user!.id)
  const peer = conversation.members.find(
    (member) => member.user.id !== userId,
  )!.user
  const [activated, setActivated] = useState(false)
  const [focused, setFocused] = useState(false)
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  )
  const [state, setState] = useState<ChatState | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [runtime, setRuntime] = useState<
    import('@votz/chat-core').ChatClient | null
  >(null)
  const runtimeRef = useRef<import('@votz/chat-core').ChatClient | null>(null)
  const onVisible = useCallback(
    ({ viewableItems }: { viewableItems: { item: ChatMessage }[] }) => {
      runtimeRef.current?.visibleMessages(
        viewableItems.map((token) => token.item.id),
      )
    },
    [],
  )
  const onRuntime = useCallback(
    (value: import('@votz/chat-core').ChatClient) => {
      runtimeRef.current = value
      setRuntime(value)
    },
    [],
  )
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
    if (!activated || !focused || !foreground) return
    const abort = new AbortController()
    let close = () => {}
    void openNativeChat(
      userId,
      conversation.id,
      abort.signal,
      setState,
      onRuntime,
    )
      .then((value) => {
        if (abort.signal.aborted) value()
        else close = value
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError((failure as Error).message || chatError(failure))
          setActivated(false)
        }
      })
    return () => {
      abort.abort()
      runtimeRef.current = null
      close()
      setRuntime(null)
    }
  }, [activated, focused, foreground, userId, conversation.id, onRuntime])
  const verification = state?.verification
  const verified = verification?.state === 'done'
  async function verify(action: VerificationAction) {
    if (!runtime || busy) return
    setBusy(true)
    setError('')
    try {
      await runtime.verification(action)
    } catch (failure) {
      if (__DEV__) console.warn('[chat.crypto] verification failure', action, (failure as { kind?: string }).kind || (failure as Error).name)
      setError(chatError(failure))
    } finally {
      setBusy(false)
    }
  }
  async function toggleReceipts() {
    if (!runtime || !state || busy) return
    setBusy(true)
    setError('')
    try {
      await runtime.setReadReceipts(!state.readReceiptsEnabled)
    } catch (failure) {
      setError(chatError(failure))
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
      {!activated ? (
        <View style={styles.card}>
          <ShieldCheck size={26} color={theme.colors.primary} />
          <Heading>Converse com segurança</Heading>
          <Label muted>
            As chaves ficam protegidas neste aparelho. Nesta fase, sua conta usa
            um dispositivo para as conversas protegidas.
          </Label>
          <Button
            title="Ativar neste aparelho"
            onPress={() => {
              setError('')
              setActivated(true)
            }}
          />
          <ErrorText message={error} />
        </View>
      ) : !state ? (
        <View style={styles.card}>
          <ActivityIndicator color={theme.colors.action} />
          <Label>Preparando suas conversas…</Label>
        </View>
      ) : (
        <>
          <View style={styles.status}>
            <ShieldCheck size={17} color={theme.colors.muted} />
            <Text style={styles.small}>
              {verified
                ? 'Identidade verificada · Criptografia de ponta a ponta'
                : 'Verifique a identidade antes de conversar'}
            </Text>
          </View>
          {!state.room?.peer.deviceId && state.ready && (
            <View style={styles.card}>
              <Label muted>
                A outra pessoa precisa ativar as conversas protegidas no
                dispositivo dela.
              </Label>
            </View>
          )}
          {!verified && state.room?.peer.deviceId && (
            <View style={styles.card}>
              <Text style={styles.name}>Confirme com {peer.name}</Text>
              <Label muted>
                Por um canal de confiança ou pessoalmente, comparem os três
                números nas duas telas. Confirme somente se forem iguais.
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
                  title="Verificar identidade"
                  loading={busy}
                  onPress={() => {
                    void verify('request')
                  }}
                />
              )}
              {verification?.state === 'requested' && verification.incoming && (
                <Button
                  title="Aceitar verificação"
                  loading={busy}
                  onPress={() => {
                    void verify('accept')
                  }}
                />
              )}
              {verification?.state === 'requested' &&
                !verification.incoming && (
                  <Label muted>Aguardando a outra pessoa aceitar…</Label>
                )}
              {verification?.state === 'ready' && (
                <Label muted>Preparando os códigos de verificação…</Label>
              )}
              {verification?.state === 'comparing' && (
                <Button
                  title="Os códigos são iguais"
                  loading={busy}
                  onPress={() => {
                    void verify('confirm')
                  }}
                />
              )}
              {verification?.state === 'confirmed' && (
                <Label muted>Aguardando a outra pessoa confirmar…</Label>
              )}
              {verification &&
                !['none', 'cancelled'].includes(verification.state) && (
                  <Button
                    secondary
                    title="Cancelar verificação"
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
                  {item.text ??
                    (item.status === 'unverified'
                      ? 'Verifique a identidade para ler esta mensagem.'
                      : 'Não foi possível abrir esta mensagem com as chaves deste aparelho.')}
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
              verified && state.ready ? (
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
                editable={verified && !!state.room?.canSend}
                placeholder={
                  verified
                    ? 'Escreva uma mensagem…'
                    : 'Verifique a identidade para conversar'
                }
                style={styles.field}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem"
              disabled={
                !verified || !state.room?.canSend || busy || !draft.trim()
              }
              onPress={() => {
                void send()
              }}
              style={[
                styles.send,
                (!verified || !draft.trim() || busy) && { opacity: 0.4 },
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
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
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
  status: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.colors.soft,
    alignItems: 'center',
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
