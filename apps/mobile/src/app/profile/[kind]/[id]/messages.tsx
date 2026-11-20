import { useState } from 'react'
import { Alert, FlatList, Pressable, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Screen, Toolbar } from '../../../../components/screen'
import { Button, ErrorText, Field, State } from '../../../../components/ui'
import {
  NOTICE_TEXT,
  ORG_BY_KIND,
  useDeleteMyPageConversation,
  useMyPageConversation,
  usePageThread,
  useSendPageMessage,
  type PageMessageView,
} from '../../../../hooks/use-page-inbox'
import { errorMessage } from '../../../../lib/api'
import type { ProfileKind } from '../../../../lib/types'
import { theme } from '../../../../theme'

function Bubble({ message }: { message: PageMessageView }) {
  const own = message.from === 'CITIZEN'
  return (
    <View style={{ alignSelf: own ? 'flex-end' : 'flex-start', maxWidth: '82%', marginVertical: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: own ? theme.colors.bubbleOwn : theme.colors.chatBackground }}>
      <Text style={{ color: theme.colors.text, fontSize: 15 }}>{message.text}</Text>
      <Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 4 }}>{new Date(message.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</Text>
    </View>
  )
}

/**
 * Mensagens com a equipe de uma página. Fica dentro da rota do perfil
 * (`/profile/<tipo>/<id>/messages`): o voltar leva ao perfil, e a primeira mensagem cria a conversa.
 */
export default function ProfileMessages() {
  const { kind, id, name } = useLocalSearchParams<{ kind: ProfileKind; id: string; name?: string }>()
  const orgType = ORG_BY_KIND[kind]
  const thread = usePageThread(orgType, id)
  const threadId = thread.data?.id ?? ''
  const conversation = useMyPageConversation(threadId)
  const send = useSendPageMessage(orgType, id)
  const remove = useDeleteMyPageConversation()
  const [text, setText] = useState('')
  const title = conversation.data?.page?.name ?? name ?? 'Mensagens'
  const blocked = conversation.data?.status === 'BLOCKED'
  if (!orgType) return <Screen><Toolbar title="Mensagens" back /><State title="Página não encontrada" /></Screen>
  if (thread.isError) return <Screen><Toolbar title={title} back /><State title="Não foi possível abrir" description={errorMessage(thread.error)} retry={() => { void thread.refetch() }} /></Screen>
  if (thread.isLoading || (!!threadId && !conversation.data && !conversation.isError)) return <Screen><Toolbar title={title} back /><State loading title="Carregando" /></Screen>
  const messages = [...(conversation.data?.messages ?? [])].reverse()
  return (
    <Screen>
      <Toolbar title={title} back />
      <Text style={{ color: theme.colors.muted, fontSize: 12, padding: 12, backgroundColor: theme.colors.chatBackground }}>{NOTICE_TEXT}</Text>
      <FlatList
        inverted
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
        ListEmptyComponent={<Text style={{ color: theme.colors.muted, textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] }}>Escreva a primeira mensagem para a equipe.</Text>}
        renderItem={({ item }) => <Bubble message={item} />}
      />
      <View style={{ padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.border }}>
        {conversation.isError && <ErrorText message={errorMessage(conversation.error)} />}
        {send.isError && <ErrorText message={errorMessage(send.error)} />}
        {blocked ? (
          <Text style={{ color: theme.colors.muted }}>Esta página não está recebendo novas mensagens suas.</Text>
        ) : (
          <>
            <Field bare multiline maxLength={2000} placeholder="Escreva sua mensagem" value={text} onChangeText={setText} style={{ maxHeight: 120 }} />
            <Button title="Enviar" loading={send.isPending} disabled={!text.trim() || send.isPending} onPress={() => send.mutate(text.trim(), { onSuccess: () => setText('') })} />
          </>
        )}
        {!!threadId && (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert('Apagar esta conversa?', 'Ela some também para a equipe da página.', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Apagar', style: 'destructive', onPress: () => remove.mutate(threadId) },
              ])
            }
          >
            <Text style={{ color: theme.colors.muted, fontSize: 12, textDecorationLine: 'underline' }}>Apagar conversa</Text>
          </Pressable>
        )}
      </View>
    </Screen>
  )
}
