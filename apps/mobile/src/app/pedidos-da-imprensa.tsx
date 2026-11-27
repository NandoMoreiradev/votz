import { useState } from 'react'
import { FlatList, Pressable, Switch, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import {
  PRESS_CONTACT_DECLINE_LABELS,
  PRESS_CONTACT_DECLINE_REASONS,
  PRESS_CONTACT_LIMITS as L,
  PRESS_CONTACT_STATUS_LABELS,
  PRESS_OUTLET_LABELS,
  type PressContactDeclineReason,
  type PressContactReceived,
} from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, State } from '../components/ui'
import { useReceivedPressContacts, useRespondPressContact } from '../hooks/use-press'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

function PressRequestItem({ item }: { item: PressContactReceived }) {
  const { colors, theme } = useAppTheme()
  const respond = useRespondPressContact()
  const [mode, setMode] = useState<'accept' | 'decline' | null>(null)
  const [reply, setReply] = useState('')
  const [viaChat, setViaChat] = useState(false)
  const [reason, setReason] = useState<PressContactDeclineReason>('NOT_NOW')
  const [block, setBlock] = useState(false)

  const pending = item.status === 'PENDING'
  const statusColor = item.status === 'ACCEPTED' ? colors.positive : pending ? colors.action : colors.muted

  const send = () => {
    respond.mutate(
      mode === 'accept'
        ? { id: item.id, action: 'accept', reply: reply.trim() || undefined, viaVotzChat: viaChat }
        : { id: item.id, action: 'decline', reason, block: block || reason === 'ABUSIVE' },
      { onSuccess: () => setMode(null) },
    )
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
            {item.outlet.name}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
            {PRESS_OUTLET_LABELS[item.outlet.type]} · {item.journalist.name}
          </Text>
        </View>
        <View style={{ backgroundColor: statusColor, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}>
          <Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.medium, fontSize: 11 }}>
            {PRESS_CONTACT_STATUS_LABELS[item.status]}
          </Text>
        </View>
      </View>

      <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.report.id } })}>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
          Relato: {item.report.title} →
        </Text>
      </Pressable>

      <View
        style={{
          borderLeftWidth: 3,
          borderLeftColor: colors.action,
          backgroundColor: colors.soft,
          padding: 10,
          borderRadius: 6,
        }}
      >
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 }}>
          {item.message}
        </Text>
      </View>

      {item.status === 'ACCEPTED' && (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
          Você aceitou{item.reply ? ` e respondeu: "${item.reply}"` : ''}
          {item.viaVotzChat ? ' · Preferiu Conversas do Votz' : ''}
        </Text>
      )}

      {pending && mode === null && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
            Válido até {new Date(item.expiresAt).toLocaleDateString('pt-BR')}. Seu telefone e e-mail não foram passados.
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Aceitar" style={{ flex: 1 }} onPress={() => setMode('accept')} />
            <Button title="Recusar" secondary style={{ flex: 1 }} onPress={() => setMode('decline')} />
          </View>
        </View>
      )}

      {pending && mode === 'accept' && (
        <View style={{ gap: 10 }}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            multiline
            maxLength={L.REPLY_MAX}
            placeholder="Recado opcional (ex.: melhor horário ou como prefere falar)"
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 74,
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, flex: 1 }}>
              Prefiro conversar pelas Conversas do Votz
            </Text>
            <Switch value={viaChat} onValueChange={setViaChat} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Voltar" secondary style={{ flex: 1 }} onPress={() => setMode(null)} />
            <Button title="Confirmar" style={{ flex: 1 }} loading={respond.isPending} onPress={send} />
          </View>
        </View>
      )}

      {pending && mode === 'decline' && (
        <View style={{ gap: 8 }}>
          {PRESS_CONTACT_DECLINE_REASONS.map((r) => (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: reason === r ? colors.action : colors.border,
                backgroundColor: reason === r ? colors.tint : colors.soft,
              }}
            >
              <Text style={{ color: reason === r ? colors.action : colors.muted }}>{reason === r ? '●' : '○'}</Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, flex: 1 }}>
                {PRESS_CONTACT_DECLINE_LABELS[r]}
              </Text>
            </Pressable>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, flex: 1 }}>
              Não receber mais pedidos deste jornalista
            </Text>
            <Switch
              value={block || reason === 'ABUSIVE'}
              disabled={reason === 'ABUSIVE'}
              onValueChange={setBlock}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Voltar" secondary style={{ flex: 1 }} onPress={() => setMode(null)} />
            <Button title="Confirmar recusa" style={{ flex: 1 }} loading={respond.isPending} onPress={send} />
          </View>
        </View>
      )}

      <ErrorText message={respond.isError ? errorMessage(respond.error) : undefined} />
    </Card>
  )
}

export default function PressContactInboxScreen() {
  const { colors } = useAppTheme()
  const user = useSession((s) => s.user)
  const query = useReceivedPressContacts(!!user)

  return (
    <Screen>
      <Toolbar title="Pedidos da imprensa" back />
      {!user ? (
        <State title="Entre na sua conta" description="Faça login para ver pedidos de contato da imprensa." />
      ) : (
        <FlatList
          style={{ flex: 1, backgroundColor: colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 }}
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch()
          }}
          renderItem={({ item }) => <PressRequestItem item={item} />}
          ListEmptyComponent={
            <State
              loading={query.isPending}
              title={
                query.isPending
                  ? 'Carregando pedidos…'
                  : query.isError
                    ? 'Não foi possível carregar'
                    : 'Nenhum pedido da imprensa'
              }
              description={
                query.isError
                  ? errorMessage(query.error)
                  : 'Quando jornalistas credenciados pedirem contato sobre relatos em que você autorizou, os pedidos aparecerão aqui.'
              }
              retry={query.isError ? () => { void query.refetch() } : undefined}
            />
          }
        />
      )}
    </Screen>
  )
}
