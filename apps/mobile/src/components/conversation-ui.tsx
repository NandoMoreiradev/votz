import type { PropsWithChildren, ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import BellOff from 'lucide-react-native/icons/bell-off'
import Pin from 'lucide-react-native/icons/pin'
import Users from 'lucide-react-native/icons/users'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import { useConversationCapabilities, useConversationScope } from '../hooks/use-conversations'
import { Avatar, Button, State } from './ui'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'
import { conversationUnreadLabel, type ConversationPerson } from '@votz/shared-types'

export function ConversationGate({ children }: PropsWithChildren) {
  const scope = useConversationScope()
  const capabilities = useConversationCapabilities()
  if (!scope.user)
    return (
      <View style={{ padding: 24, gap: 18 }}>
        <State
          title="Suas conversas começam aqui"
          description="Entre na sua conta para continuar."
        />
        <Button title="Entrar no Votz" onPress={() => router.push('/login')} />
      </View>
    )
  if (!scope.user.emailVerified)
    return (
      <State
        title="Confirme seu e-mail"
        description="A confirmação protege você e as pessoas com quem conversa."
      />
    )
  if (capabilities.isPending) return <State loading title="Carregando conversas…" />
  if (capabilities.isError)
    return (
      <State
        title="Não foi possível carregar"
        description={errorMessage(capabilities.error)}
        retry={() => {
          void capabilities.refetch()
        }}
      />
    )
  if (!capabilities.data?.enabled)
    return (
      <State
        title="Conversas estão chegando"
        description="Este recurso ainda não foi liberado para sua conta."
      />
    )
  return <>{children}</>
}
/** Topo da tela de detalhes: avatar grande, nome e uma linha de apoio, como nos aplicativos de mensagem. */
export function ConversationHero({
  person,
  group,
  title,
  subtitle,
}: {
  person?: ConversationPerson
  group?: boolean
  title: string
  subtitle?: string
}) {
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingTop: 24, paddingBottom: 12, paddingHorizontal: 24 }}>
      {group ? (
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.soft,
          }}
        >
          <Users size={44} color={theme.colors.primary} />
        </View>
      ) : (
        <Avatar name={person?.name || title} uri={person?.avatarUrl} size={96} />
      )}
      <Text
        style={{ marginTop: 8, fontFamily: theme.fonts.heading, fontSize: 22, color: theme.colors.primary, textAlign: 'center' }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: theme.colors.muted, textAlign: 'center' }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}
export function ConversationNotice({ closed }: { closed: boolean }) {
  return (
    <View
      style={{
        padding: 16,
        margin: 16,
        borderRadius: 14,
        backgroundColor: theme.colors.soft,
        flexDirection: 'row',
        gap: 10,
      }}
    >
      <ShieldCheck size={22} color={theme.colors.muted} />
      <Text
        style={{ flex: 1, fontFamily: theme.fonts.body, color: theme.colors.muted, lineHeight: 21 }}
      >
        {closed
          ? 'Este grupo foi encerrado. Não é possível convidar ou alterar participantes.'
          : 'As mensagens desta conversa são protegidas com criptografia de ponta a ponta.'}
      </Text>
    </View>
  )
}
export function ConversationPersonRow({
  person,
  group,
  title,
  subtitle,
  meta,
  unread = 0,
  pinned = false,
  muted = false,
  trailing,
  onPress,
  children,
}: PropsWithChildren<{
  person?: ConversationPerson
  group?: boolean
  title?: string
  subtitle?: string
  /** Horário da última mensagem, à direita do nome. */
  meta?: string
  /** Mensagens não lidas: vira um selo e destaca nome e horário. */
  unread?: number
  /** Conversa fixada no topo: mostra um alfinete. */
  pinned?: boolean
  /** Conversa silenciada: mostra o sininho cortado. */
  muted?: boolean
  /** Algo à direita da linha (por exemplo, a marca de selecionado). */
  trailing?: ReactNode
  onPress?: () => void
}>) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {group ? (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.soft,
          }}
        >
          <Users size={26} color={theme.colors.primary} />
        </View>
      ) : (
        <Avatar name={person?.name || title || 'Conversa'} uri={person?.avatarUrl} size={52} />
      )}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text
            style={{
              flex: 1,
              fontFamily: theme.fonts.medium,
              fontSize: 16,
              color: theme.colors.text,
            }}
            numberOfLines={meta ? 1 : 2}
          >
            {title || person?.name}
          </Text>
          {meta ? (
            <Text
              style={{
                fontFamily: unread ? theme.fonts.medium : theme.fonts.body,
                fontSize: 12,
                color: unread ? theme.colors.action : theme.colors.muted,
              }}
            >
              {meta}
            </Text>
          ) : null}
        </View>
        {(subtitle || unread > 0 || pinned || muted) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
            <Text
              accessibilityLabel={
                unread > 0
                  ? `${subtitle || ''}. ${unread} ${unread === 1 ? 'mensagem não lida' : 'mensagens não lidas'}`
                  : undefined
              }
              numberOfLines={meta ? 1 : undefined}
              style={{
                flex: 1,
                color: unread ? theme.colors.text : theme.colors.muted,
                fontFamily: unread ? theme.fonts.medium : theme.fonts.body,
                fontSize: 13,
                lineHeight: 20,
              }}
            >
              {subtitle}
            </Text>
            {muted && (
              <View accessible accessibilityLabel="Conversa silenciada">
                <BellOff size={15} color={theme.colors.muted} />
              </View>
            )}
            {pinned && (
              <View accessible accessibilityLabel="Conversa fixada">
                <Pin size={15} color={theme.colors.muted} />
              </View>
            )}
            {unread > 0 && (
              <View
                style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: 11,
                  paddingHorizontal: 6,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.action,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.surface,
                    fontFamily: theme.fonts.medium,
                    fontSize: 12,
                  }}
                >
                  {conversationUnreadLabel(unread)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      {trailing}
    </View>
  )
  return (
    <View>
      <View style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 12 }}>
        {onPress ? (
          <Pressable accessibilityRole="button" onPress={onPress}>
            {content}
          </Pressable>
        ) : (
          content
        )}
        {children}
      </View>
      {/* Divisória começa depois do avatar, como nos aplicativos de mensagem. */}
      <View style={{ height: 0.5, marginLeft: 80, backgroundColor: theme.colors.border }} />
    </View>
  )
}
export function ConversationLoadingMore({
  loading,
  more,
  onMore,
}: {
  loading: boolean
  more?: boolean
  onMore: () => void
}) {
  return loading ? (
    <ActivityIndicator style={{ padding: 18 }} color={theme.colors.action} />
  ) : more ? (
    <View style={{ padding: 16 }}>
      <Button title="Carregar mais" secondary onPress={onMore} />
    </View>
  ) : null
}
