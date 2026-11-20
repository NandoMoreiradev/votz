import { useEffect, useState } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Field, State } from '../../components/ui'
import {
  NOTICE_TEXT,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useRespondPageConversation,
  useSendPageMessage,
  type OrgType,
  type PageMessageView,
} from '../../hooks/use-page-inbox'
import { errorMessage } from '../../lib/api'
import { theme } from '../../theme'

function Bubble({ message }: { message: PageMessageView }) {
  const own = message.from === 'CITIZEN'
  return (
    <View
      style={{
        alignSelf: own ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        marginVertical: 4,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: own ? theme.colors.bubbleOwn : theme.colors.chatBackground,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 15 }}>{message.text}</Text>
      <Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 4 }}>
        {new Date(message.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  )
}

function PageThread({ orgType, orgId, initialName }: { orgType: OrgType; orgId: string; initialName?: string }) {
  const client = useQueryClient()
  const thread = usePageThread(orgType, orgId)
  const threadId = thread.data?.conversation?.id ?? ''
  const conversation = useMyPageConversation(threadId)
  const send = useSendPageMessage(orgType, orgId)
  const remove = useDeleteMyPageConversation()
  const respond = useRespondPageConversation()
  const [text, setText] = useState('')
  const opened = conversation.isSuccess
  useEffect(() => {
    if (opened) void client.invalidateQueries({ queryKey: ['page-inbox', 'mine-list'] })
  }, [opened, threadId, client])
  const title = conversation.data?.page?.name ?? thread.data?.page?.name ?? initialName ?? 'Mensagens'
  const data = conversation.data
  // A página começou a conversa e a pessoa ainda não decidiu (ou recusou).
  const pendingRequest = !!data && data.startedBy === 'STAFF' && !data.accepted
  const declined = pendingRequest && data?.status === 'BLOCKED'
  const blocked = data?.status === 'BLOCKED' && !pendingRequest
  if (thread.isError)
    return (
      <>
        <Toolbar title={title} back />
        <State title="Não foi possível abrir" description={errorMessage(thread.error)} retry={() => { void thread.refetch() }} />
      </>
    )
  if (thread.isLoading || (!!threadId && !conversation.data && !conversation.isError))
    return (
      <>
        <Toolbar title={title} back />
        <State loading title="Carregando" />
      </>
    )
  const messages = [...(conversation.data?.messages ?? [])].reverse()
  return (
    <>
      <Toolbar title={title} back />
      <Text style={{ color: theme.colors.muted, fontSize: 12, padding: 12, backgroundColor: theme.colors.chatBackground }}>{NOTICE_TEXT}</Text>
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
        ListEmptyComponent={
          <Text style={{ color: theme.colors.muted, textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] }}>
            Escreva a primeira mensagem para a equipe.
          </Text>
        }
        renderItem={({ item }) => <Bubble message={item} />}
      />
      <View style={{ padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
        {conversation.isError && <ErrorText message={errorMessage(conversation.error)} />}
        {send.isError && <ErrorText message={errorMessage(send.error)} />}
        {pendingRequest ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.text }}>{declined ? 'Você recusou esta conversa.' : `${title} quer conversar com você.`}</Text>
            {respond.isError && <ErrorText message={errorMessage(respond.error)} />}
            <Button title="Aceitar" loading={respond.isPending} onPress={() => respond.mutate({ id: threadId, accept: true })} />
            {!declined && <Button secondary title="Recusar" disabled={respond.isPending} onPress={() => respond.mutate({ id: threadId, accept: false })} />}
          </View>
        ) : blocked ? (
          <Text style={{ color: theme.colors.muted }}>Esta página não está recebendo novas mensagens suas.</Text>
        ) : (
          <>
            <Field bare multiline maxLength={2000} placeholder="Escreva sua mensagem" value={text} onChangeText={setText} style={{ maxHeight: 120 }} />
            <Button
              title="Enviar"
              loading={send.isPending}
              disabled={!text.trim() || send.isPending}
              onPress={() => send.mutate(text.trim(), { onSuccess: () => setText('') })}
            />
          </>
        )}
        {!!threadId && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Apagar esta conversa?', 'Ela some também para a equipe da página.', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Apagar',
                  style: 'destructive',
                  onPress: () => remove.mutate(threadId, { onSuccess: () => router.replace('/conversations') }),
                },
              ])
            }
          >
            <Text style={{ color: theme.colors.muted, fontSize: 12, textDecorationLine: 'underline' }}>Apagar conversa</Text>
          </Pressable>
        )}
      </View>
    </>
  )
}

/** Conversa do cidadão com uma página dentro do módulo unificado de Conversas. */
export default function PageConversationScreen() {
  const { orgType, orgId, name } = useLocalSearchParams<{ orgType: OrgType; orgId: string; name?: string }>()
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
        <PageThread orgType={orgType} orgId={orgId} initialName={name} />
      </ConversationGate>
    </Screen>
  )
}
