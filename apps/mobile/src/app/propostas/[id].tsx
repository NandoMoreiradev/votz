import { useState } from 'react'
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import ExternalLink from 'lucide-react-native/icons/external-link'
import ThumbsDown from 'lucide-react-native/icons/thumbs-down'
import ThumbsUp from 'lucide-react-native/icons/thumbs-up'
import { Screen, Toolbar } from '../../components/screen'
import { Button, Card, ErrorText, State } from '../../components/ui'
import {
  useAtualizarStatusProposta,
  useMeuVotoProposta,
  useProposta,
  useRemoverVotoProposta,
  useVotarProposta,
} from '../../hooks/use-politician-tools'
import { errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'
import { useAppTheme } from '../../theme-context'
import { PROPOSTA_STATUS_LABELS } from '../propostas'

const NEXT_STATUSES = ['EM_DISCUSSAO', 'PROTOCOLADA', 'EM_TRAMITACAO', 'APROVADA', 'REJEITADA', 'ARQUIVADA'] as const

export default function PropostaDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const activeContext = useSession((s) => s.activeContext)

  const query = useProposta(id ?? '')
  const myVote = useMeuVotoProposta(id ?? '', !!user)
  const voteMut = useVotarProposta(id ?? '')
  const removeVoteMut = useRemoverVotoProposta(id ?? '')
  const updateMut = useAtualizarStatusProposta(id ?? '')

  const [newStatus, setNewStatus] = useState('')
  const [updateText, setUpdateText] = useState('')

  const data = query.data
  const isOwnerPolitician =
    activeContext?.type === 'POLITICIAN' && !!data && activeContext.id === data.politicoId

  const handleVote = (apoio: boolean) => {
    if (!user) {
      router.push('/login')
      return
    }
    if (myVote.data?.apoio === apoio) {
      removeVoteMut.mutate()
    } else {
      voteMut.mutate(apoio)
    }
  }

  return (
    <Screen>
      <Toolbar title="Proposta" back />
      {query.isPending || query.isError || !data ? (
        <State
          loading={query.isPending}
          title={query.isPending ? 'Carregando proposta…' : 'Proposta não encontrada'}
          retry={query.isError ? () => { void query.refetch() } : undefined}
        />
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
        >
          <Card>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action, textTransform: 'uppercase' }}>
              {PROPOSTA_STATUS_LABELS[data.status] ?? data.status}
            </Text>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, color: colors.primary, lineHeight: 26 }}>
              {data.titulo}
            </Text>
            {data.politico && (
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'politicians', id: data.politico!.id } })
                }
              >
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.muted }}>
                  {data.politico.name} · {data.politico.office} ({data.politico.party.abbreviation}) →
                </Text>
              </Pressable>
            )}
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, color: colors.text, lineHeight: 22 }}>
              {data.descricao}
            </Text>
            {!!data.linkExterno && (
              <Pressable
                onPress={() => void Linking.openURL(data.linkExterno!).catch(() => {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
              >
                <ExternalLink size={15} color={colors.action} />
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
                  Ver documento oficial
                </Text>
              </Pressable>
            )}
          </Card>

          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
              O que você acha desta proposta?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={voteMut.isPending || removeVoteMut.isPending}
                onPress={() => handleVote(true)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 42,
                  borderRadius: 21,
                  borderWidth: 1,
                  borderColor: myVote.data?.apoio === true ? colors.positive : colors.border,
                  backgroundColor: myVote.data?.apoio === true ? colors.tint : colors.soft,
                }}
              >
                <ThumbsUp size={16} color={colors.positive} />
                <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary }}>
                  Apoiar · {data.totalApoios}
                </Text>
              </Pressable>
              <Pressable
                disabled={voteMut.isPending || removeVoteMut.isPending}
                onPress={() => handleVote(false)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  minHeight: 42,
                  borderRadius: 21,
                  borderWidth: 1,
                  borderColor: myVote.data?.apoio === false ? colors.action : colors.border,
                  backgroundColor: myVote.data?.apoio === false ? colors.tint : colors.soft,
                }}
              >
                <ThumbsDown size={16} color={colors.action} />
                <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary }}>
                  Rejeitar · {data.totalRejeicoes}
                </Text>
              </Pressable>
            </View>
          </Card>

          {isOwnerPolitician && (
            <Card>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                Atualizar andamento da proposta
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {NEXT_STATUSES.map((st) => (
                  <Pressable
                    key={st}
                    onPress={() => setNewStatus(st)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 18,
                      borderWidth: 1,
                      borderColor: newStatus === st ? colors.action : colors.border,
                      backgroundColor: newStatus === st ? colors.tint : colors.soft,
                    }}
                  >
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: newStatus === st ? colors.action : colors.primary }}>
                      {PROPOSTA_STATUS_LABELS[st] ?? st}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
              <TextInput
                value={updateText}
                onChangeText={setUpdateText}
                multiline
                placeholder="Descreva o que avançou na tramitação…"
                placeholderTextColor={colors.muted}
                style={{
                  minHeight: 80,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  padding: 10,
                  textAlignVertical: 'top',
                  color: colors.text,
                  backgroundColor: colors.background,
                  fontFamily: theme.fonts.body,
                  fontSize: 14,
                }}
              />
              <ErrorText message={updateMut.isError ? errorMessage(updateMut.error) : undefined} />
              <Button
                title="Publicar atualização"
                loading={updateMut.isPending}
                disabled={!newStatus || updateText.trim().length < 5}
                onPress={() =>
                  updateMut.mutate(
                    { status: newStatus, conteudo: updateText.trim() },
                    {
                      onSuccess: () => {
                        setNewStatus('')
                        setUpdateText('')
                      },
                    },
                  )
                }
              />
            </Card>
          )}

          {data.timeline && data.timeline.length > 0 && (
            <Card>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                Histórico da proposta
              </Text>
              {data.timeline.map((ev) => (
                <View
                  key={ev.id}
                  style={{
                    borderLeftWidth: 2,
                    borderLeftColor: colors.action,
                    paddingLeft: 12,
                    paddingVertical: 4,
                    gap: 3,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text }}>{ev.conteudo}</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                    {new Date(ev.createdAt).toLocaleDateString('pt-BR')}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </ScrollView>
      )}
    </Screen>
  )
}
