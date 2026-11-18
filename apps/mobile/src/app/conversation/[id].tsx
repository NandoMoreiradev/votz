import { useState } from 'react'
import { Alert, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  conversationMemberLabel,
  conversationTitle,
  type ConversationPerson,
} from '@votz/shared-types'
import {
  ConversationGate,
  ConversationNotice,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { ConversationPicker } from '../../components/conversation-picker'
import { FormScroll, Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Heading, State } from '../../components/ui'
import {
  useConversation,
  useConversationAction,
  useConversationScope,
  useConversationCapabilities,
} from '../../hooks/use-conversations'
import { errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'
import { ChatPane } from '../../components/chat-pane'

function Detail({ id, showDetails }: { id: string; showDetails: boolean }) {
  const capabilities = useConversationCapabilities()
  const detail = useConversation(id)
  const action = useConversationAction()
  const [inviting, setInviting] = useState(false)
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const { user } = useConversationScope()
  const actorId = user!.id
  async function run(
    path: string,
    body?: unknown,
    method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
    leave = false,
  ) {
    try {
      await action.mutateAsync({ path, body, method })
      if (useSession.getState().user?.id !== actorId) return
      if (leave) router.replace('/conversations')
      setInviting(false)
      setPeople([])
    } catch {
      /* Authorization and network errors remain visible. */
    }
  }
  function confirm(title: string, task: () => void) {
    Alert.alert(title, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: task },
    ])
  }
  if (detail.isPending)
    return (
      <>
        <Toolbar title="Conversa" back />
        <State loading title="Carregando conversa…" />
      </>
    )
  if (detail.isError)
    return (
      <State
        title="Não foi possível abrir"
        description={errorMessage(detail.error)}
        retry={() => {
          void detail.refetch()
        }}
      />
    )
  const conversation = detail.data
  if (
    conversation.kind === 'DIRECT' &&
    conversation.members.every((member) => member.state === 'ACTIVE') &&
    capabilities.data?.messagingEnabled &&
    !showDetails
  )
    return <ChatPane key={`${user!.id}:${id}`} conversation={conversation} />
  const owner = conversation.myRole === 'OWNER'
  const admin = owner || conversation.myRole === 'ADMIN'
  const closed = !!conversation.archivedAt
  const other = conversation.members.find((m) => m.user.id !== user!.id)?.user
  return (
    <>
      <Toolbar title="Detalhes da conversa" back />
      <FormScroll contentContainerStyle={{ padding: 0, gap: 0 }}>
        <ConversationPersonRow
          group={conversation.kind === 'GROUP'}
          person={other}
          title={conversationTitle(conversation, actorId)}
          subtitle={
            closed
              ? 'Grupo encerrado'
              : conversation.kind === 'GROUP'
                ? conversationMemberLabel(conversation.memberCount)
                : 'Conversa pessoal'
          }
        />
        <ConversationNotice closed={closed} />
        <View style={{ padding: 16, gap: 14 }}>
          <ErrorText
            message={action.isError ? errorMessage(action.error) : undefined}
          />
          <Heading>
            {conversation.kind === 'GROUP'
              ? 'Participantes'
              : 'Pessoas nesta conversa'}
          </Heading>
        </View>
        {conversation.members.map((member) => (
          <ConversationPersonRow
            key={member.user.id}
            person={member.user}
            title={`${member.user.name}${member.user.id === actorId ? ' (você)' : ''}`}
            subtitle={
              member.state === 'INVITED'
                ? 'Convite pendente'
                : member.role === 'OWNER'
                  ? 'Responsável pelo grupo'
                  : member.role === 'ADMIN'
                    ? 'Administrador'
                    : 'Participante'
            }
          >
            {!closed &&
              conversation.kind === 'GROUP' &&
              member.user.id !== actorId && (
                <View style={{ gap: 8 }}>
                  {owner && member.state === 'ACTIVE' && (
                    <>
                      <Button
                        secondary
                        disabled={action.isPending}
                        title={
                          member.role === 'ADMIN'
                            ? 'Retirar administração'
                            : 'Tornar administrador'
                        }
                        onPress={() => {
                          void run(
                            `/${id}/members/${member.user.id}/role`,
                            {
                              role:
                                member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                            },
                            'PATCH',
                          )
                        }}
                      />
                      <Button
                        secondary
                        disabled={action.isPending}
                        title="Transferir grupo"
                        onPress={() =>
                          confirm(
                            `Transferir o grupo para ${member.user.name}?`,
                            () => {
                              void run(`/${id}/owner/${member.user.id}`)
                            },
                          )
                        }
                      />
                    </>
                  )}
                  {admin &&
                    member.role !== 'OWNER' &&
                    (owner || member.role !== 'ADMIN') && (
                      <Button
                        secondary
                        disabled={action.isPending}
                        title="Remover"
                        onPress={() =>
                          confirm(
                            `Remover ${member.user.name} do grupo?`,
                            () => {
                              void run(
                                `/${id}/members/${member.user.id}`,
                                undefined,
                                'DELETE',
                              )
                            },
                          )
                        }
                      />
                    )}
                </View>
              )}
          </ConversationPersonRow>
        ))}
        {!closed && (
          <View style={{ padding: 16, gap: 12 }}>
            {conversation.kind === 'GROUP' && admin && (
              <Button
                secondary
                title={inviting ? 'Cancelar convite' : 'Convidar pessoas'}
                onPress={() => setInviting(!inviting)}
              />
            )}
            {inviting && (
              <>
                <ConversationPicker
                  selected={people}
                  onChange={setPeople}
                  max={20}
                  exclude={conversation.members.map((m) => m.user.id)}
                />
                <Button
                  title="Enviar convites"
                  loading={action.isPending}
                  disabled={!people.length}
                  onPress={() => {
                    void run(`/${id}/invitations`, {
                      memberIds: people.map((p) => p.id),
                    })
                  }}
                />
              </>
            )}
            {conversation.kind === 'GROUP' && !owner && (
              <Button
                secondary
                title="Sair do grupo"
                disabled={action.isPending}
                onPress={() =>
                  confirm('Sair deste grupo?', () => {
                    void run(`/${id}/leave`, undefined, 'POST', true)
                  })
                }
              />
            )}
            {conversation.kind === 'GROUP' && owner && (
              <Button
                secondary
                title="Encerrar grupo"
                disabled={action.isPending}
                onPress={() =>
                  Alert.alert(
                    'Encerrar este grupo?',
                    'Esta ação não pode ser desfeita.',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Encerrar',
                        style: 'destructive',
                        onPress: () => {
                          void run(`/${id}/archive`)
                        },
                      },
                    ],
                  )
                }
              />
            )}
            {conversation.kind === 'DIRECT' && other && (
              <Button
                secondary
                title="Bloquear pessoa"
                disabled={action.isPending}
                onPress={() =>
                  confirm(
                    `Bloquear novas interações com ${other.name}?`,
                    () => {
                      void run(`/blocks/${other.id}`, undefined, 'POST', true)
                    },
                  )
                }
              />
            )}
          </View>
        )}
      </FormScroll>
    </>
  )
}
export default function ConversationDetailScreen() {
  const params = useLocalSearchParams<{ id: string; details?: string }>()
  const id = typeof params.id === 'string' ? params.id : ''
  return (
    <Screen>
      <ConversationGate>
        <Detail
          key={`${id}:${params.details || ''}`}
          id={id}
          showDetails={params.details === '1'}
        />
      </ConversationGate>
    </Screen>
  )
}
