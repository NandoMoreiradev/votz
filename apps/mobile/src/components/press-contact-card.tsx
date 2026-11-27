import { useState } from 'react'
import { Pressable, Switch, Text, TextInput, View } from 'react-native'
import { router, type Href } from 'expo-router'
import Newspaper from 'lucide-react-native/icons/newspaper'
import { PRESS_CONTACT_LIMITS as L } from '@votz/shared-types'
import { Button, ErrorText } from './ui'
import { usePressContactStatus, useRequestPressContact, useSetPressContactOptIn } from '../hooks/use-press'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

export function PressContactCard({ reportId, anonymous }: { reportId: string; anonymous: boolean }) {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const { data: status } = usePressContactStatus(reportId, !!user && !anonymous)
  const setOptIn = useSetPressContactOptIn(reportId)
  const request = useRequestPressContact()

  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  if (anonymous || !user || !status) return null

  const shell = {
    padding: 16,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.border,
  } as const

  if (status.isAuthor) {
    return (
      <View style={shell}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Newspaper size={15} color={colors.muted} />
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
            Imprensa
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.text, flex: 1 }}>
            Aceito falar com a imprensa sobre este relato
          </Text>
          <Switch
            value={status.optIn}
            disabled={setOptIn.isPending}
            onValueChange={(val) => setOptIn.mutate(val)}
          />
        </View>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
          Jornalistas credenciados podem pedir contato. Você decide se aceita ou recusa, e seu telefone e e-mail nunca são compartilhados.
        </Text>
        <ErrorText message={setOptIn.isError ? errorMessage(setOptIn.error) : undefined} />
        {status.optIn && (
          <Pressable onPress={() => router.push('/pedidos-da-imprensa' as Href)}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
              Ver pedidos da imprensa →
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  if (!status.optIn) return null

  if (sent || status.alreadyRequested) {
    return (
      <View style={shell}>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
          Pedido de contato (Imprensa)
        </Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.positive, lineHeight: 19 }}>
          {sent
            ? 'Pedido enviado. Você será avisado quando o autor responder.'
            : 'Você já fez um pedido de contato para este relato.'}
        </Text>
      </View>
    )
  }

  return (
    <View style={shell}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Newspaper size={15} color={colors.action} />
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.primary, textTransform: 'uppercase' }}>
          Falar com quem relatou
        </Text>
      </View>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
        O autor deste relato aceitou falar com a imprensa credenciada.
      </Text>
      {!status.canRequest && !!status.reason && (
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{status.reason}</Text>
      )}
      {status.canRequest && !open && (
        <Button title="Pedir contato" onPress={() => setOpen(true)} />
      )}
      {status.canRequest && open && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            Diga quem você é, o que quer saber e para quando. O autor vê o nome do seu veículo e decide se aceita.
          </Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={L.MESSAGE_MAX}
            placeholder="Ex.: Sou repórter e gostaria de ouvir o seu relato…"
            placeholderTextColor={colors.muted}
            style={{
              minHeight: 86,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              textAlignVertical: 'top',
              color: colors.text,
              backgroundColor: colors.background,
              fontFamily: theme.fonts.body,
              fontSize: 14,
            }}
          />
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'right' }}>
            {message.trim().length}/{L.MESSAGE_MAX} (mín. {L.MESSAGE_MIN})
          </Text>
          <ErrorText message={request.isError ? errorMessage(request.error) : undefined} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Cancelar" secondary style={{ flex: 1 }} onPress={() => setOpen(false)} />
            <Button
              title="Enviar pedido"
              style={{ flex: 1 }}
              loading={request.isPending}
              disabled={message.trim().length < L.MESSAGE_MIN}
              onPress={() =>
                request.mutate(
                  { reportId, message: message.trim() },
                  {
                    onSuccess: () => {
                      setSent(true)
                      setOpen(false)
                    },
                  },
                )
              }
            />
          </View>
        </View>
      )}
    </View>
  )
}
