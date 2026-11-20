import { useState } from 'react'
import { Alert, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import {
  CONVERSATION_REPORT_REASONS,
  conversationIsMuted,
  conversationMemberLabel,
  conversationTitle,
  type ConversationMuteDuration,
  type ConversationPerson,
  type ConversationReportReason,
} from '@votz/shared-types'
import Ban from 'lucide-react-native/icons/ban'
import Bell from 'lucide-react-native/icons/bell'
import BellOff from 'lucide-react-native/icons/bell-off'
import CircleX from 'lucide-react-native/icons/circle-x'
import Flag from 'lucide-react-native/icons/flag'
import LogOut from 'lucide-react-native/icons/log-out'
import Pin from 'lucide-react-native/icons/pin'
import UserPlus from 'lucide-react-native/icons/user-plus'
import {
  ConversationGate,
  ConversationHero,
  ConversationNotice,
  ConversationPersonRow,
} from '../../components/conversation-ui'
import { OptionSheet, SettingsRow } from '../../components/settings-ui'
import { theme } from '../../theme'
import { ConversationPicker } from '../../components/conversation-picker'
import { FormScroll, Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Field, Heading, Label, State } from '../../components/ui'
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
  const [showMute, setShowMute] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState<ConversationReportReason>('OFFENSIVE')
  const [reportDetails, setReportDetails] = useState('')
  const [reportSent, setReportSent] = useState(false)
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
  const canOpenChat =
    !conversation.archivedAt &&
    capabilities.data?.messagingEnabled &&
    !showDetails &&
    (conversation.kind === 'GROUP'
      ? conversation.members.some(
          (member) => member.user.id === user!.id && member.state === 'ACTIVE',
        )
      : conversation.members.every((member) => member.state === 'ACTIVE'))
  if (canOpenChat)
    return <ChatPane key={`${user!.id}:${id}`} conversation={conversation} />
  const owner = conversation.myRole === 'OWNER'
  const admin = owner || conversation.myRole === 'ADMIN'
  const closed = !!conversation.archivedAt
  const other = conversation.members.find((m) => m.user.id !== user!.id)?.user
  return (
    <>
      <Toolbar title="Detalhes da conversa" back />
      <FormScroll contentContainerStyle={{ padding: 0, gap: 0 }}>
        <ConversationHero
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
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 14 }}>
          <ErrorText
            message={action.isError ? errorMessage(action.error) : undefined}
          />
          {conversation.kind === 'GROUP' && <Heading>Participantes</Heading>}
        </View>
        {/* Em conversa de duas pessoas a lista seria só repetir o topo da tela. */}
        {conversation.kind === 'GROUP' && conversation.members.map((member) => (
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
          <View>
            <View style={{ height: 8 }} />
            {conversation.kind === 'GROUP' && admin && (
              <SettingsRow
                icon={<UserPlus size={20} color={theme.colors.primary} />}
                title={inviting ? 'Cancelar convite' : 'Convidar pessoas'}
                onPress={() => setInviting(!inviting)}
              />
            )}
            {inviting && (
              <View style={{ paddingVertical: 8, gap: 12 }}>
                <ConversationPicker
                  selected={people}
                  onChange={setPeople}
                  max={20}
                  exclude={conversation.members.map((m) => m.user.id)}
                />
                <View style={{ paddingHorizontal: 16 }}>
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
                </View>
              </View>
            )}
            <SettingsRow
              icon={<Pin size={20} color={theme.colors.primary} />}
              title={conversation.pinnedAt ? 'Desafixar conversa' : 'Fixar no topo'}
              onPress={() => {
                if (!action.isPending)
                  void run(`/${id}/pin`, { pinned: !conversation.pinnedAt }, 'PATCH')
              }}
            />
            {conversationIsMuted(conversation.mutedUntil) ? (
              <SettingsRow
                icon={<Bell size={20} color={theme.colors.primary} />}
                title="Ativar notificações"
                onPress={() => {
                  if (!action.isPending)
                    void run(
                      `/${id}/mute`,
                      { duration: 'off' as ConversationMuteDuration },
                      'PATCH',
                    )
                }}
              />
            ) : (
              <SettingsRow
                icon={<BellOff size={20} color={theme.colors.primary} />}
                title="Silenciar notificações"
                onPress={() => {
                  setShowMute(true)
                  setShowReport(false)
                }}
              />
            )}
            <SettingsRow
              icon={<Flag size={20} color={theme.colors.action} />}
              title="Denunciar conversa"
              danger
              onPress={() => {
                setShowReport((value) => !value)
                setShowMute(false)
                setReportSent(false)
              }}
            />
            {showReport && (
              <View style={{ padding: 16, gap: 10 }}>
                <Label muted>Motivo da denúncia</Label>
                {CONVERSATION_REPORT_REASONS.map((option) => (
                  <Button
                    key={option.value}
                    secondary={reportReason !== option.value}
                    title={option.label}
                    onPress={() => setReportReason(option.value)}
                  />
                ))}
                <Field
                  accessibilityLabel="Detalhes da denúncia (opcional)"
                  placeholder="Descreva o que aconteceu (opcional)"
                  value={reportDetails}
                  onChangeText={setReportDetails}
                  maxLength={500}
                />
                <Button
                  title="Enviar denúncia"
                  loading={action.isPending}
                  onPress={() => {
                    void action
                      .mutateAsync({
                        path: `/${id}/report`,
                        method: 'POST',
                        body: {
                          reason: reportReason,
                          details: reportDetails.trim() || undefined,
                        },
                      })
                      .then(() => {
                        setReportSent(true)
                        setShowReport(false)
                        setReportDetails('')
                      })
                      .catch(() => {})
                  }}
                />
              </View>
            )}
            {reportSent && (
              <View style={{ padding: 16 }}>
                <Label>Denúncia enviada para análise.</Label>
              </View>
            )}
            {conversation.kind === 'DIRECT' && other && (
              <SettingsRow
                icon={<Ban size={20} color={theme.colors.action} />}
                title="Bloquear pessoa"
                danger
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
            {conversation.kind === 'GROUP' && !owner && (
              <SettingsRow
                icon={<LogOut size={20} color={theme.colors.action} />}
                title="Sair do grupo"
                danger
                onPress={() =>
                  confirm('Sair deste grupo?', () => {
                    void run(`/${id}/leave`, undefined, 'POST', true)
                  })
                }
              />
            )}
            {conversation.kind === 'GROUP' && owner && (
              <SettingsRow
                icon={<CircleX size={20} color={theme.colors.action} />}
                title="Encerrar grupo"
                danger
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
            <OptionSheet<ConversationMuteDuration>
              visible={showMute}
              title="Silenciar notificações"
              help="Por quanto tempo silenciar esta conversa?"
              options={[
                ['8h', '8 horas'],
                ['1w', '1 semana'],
                ['forever', 'Sempre'],
              ]}
              value={null}
              onSelect={(duration) => {
                void run(`/${id}/mute`, { duration }, 'PATCH')
              }}
              onClose={() => setShowMute(false)}
            />
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
