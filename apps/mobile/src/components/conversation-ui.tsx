import type { PropsWithChildren } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import Users from 'lucide-react-native/icons/users'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import { useConversationCapabilities, useConversationScope } from '../hooks/use-conversations'
import { Avatar, Button, State } from './ui'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'
import type { ConversationPerson } from '@votz/shared-types'

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
          : 'Você já pode organizar suas conversas e grupos. O envio de mensagens será liberado em breve.'}
      </Text>
    </View>
  )
}
export function ConversationPersonRow({
  person,
  group,
  title,
  subtitle,
  onPress,
  children,
}: PropsWithChildren<{
  person?: ConversationPerson
  group?: boolean
  title?: string
  subtitle?: string
  onPress?: () => void
}>) {
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {group ? (
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.soft,
          }}
        >
          <Users size={23} color={theme.colors.primary} />
        </View>
      ) : (
        <Avatar name={person?.name || title || 'Conversa'} uri={person?.avatarUrl} size={46} />
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontFamily: theme.fonts.medium, fontSize: 16, color: theme.colors.text }}
          numberOfLines={2}
        >
          {title || person?.name}
        </Text>
        {subtitle && (
          <Text
            style={{
              color: theme.colors.muted,
              fontFamily: theme.fonts.body,
              fontSize: 13,
              lineHeight: 20,
              marginTop: 3,
            }}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  )
  return (
    <View
      style={{
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.border,
        padding: 16,
        gap: 12,
      }}
    >
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
      {children}
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
