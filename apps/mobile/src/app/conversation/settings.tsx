import { StyleSheet, Switch, View } from 'react-native'
import { router } from 'expo-router'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  type ConversationAudience,
  type ConversationDirectPolicy,
  type ConversationFontScale,
  type ConversationMediaAutoDownload,
  type ConversationWallpaper,
  type UpdateConversationSettings,
} from '@votz/shared-types'
import { ConversationGate } from '../../components/conversation-ui'
import { FormScroll, Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Heading, Label, State } from '../../components/ui'
import {
  useConversationSettings,
  useUpdateConversationSettings,
} from '../../hooks/use-conversations'
import { errorMessage } from '../../lib/api'
import { theme } from '../../theme'

function ChoiceGroup<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T
  options: [T, string][]
  disabled: boolean
  onChange: (next: T) => void
}) {
  return (
    <View style={styles.choices}>
      {options.map(([key, label]) => (
        <Button
          key={key}
          title={label}
          secondary={value !== key}
          disabled={disabled}
          onPress={() => onChange(key)}
        />
      ))}
    </View>
  )
}

function ToggleRow({
  title,
  help,
  value,
  disabled,
  onChange,
}: {
  title: string
  help?: string
  value: boolean
  disabled: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Label>{title}</Label>
        {help ? <Label muted>{help}</Label> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </View>
  )
}

function SettingsContent() {
  const query = useConversationSettings()
  const update = useUpdateConversationSettings()
  const settings = query.data ?? DEFAULT_CONVERSATION_SETTINGS

  function save(patch: UpdateConversationSettings) {
    update.mutate(patch)
  }

  if (query.isPending) return <State loading title="Carregando configurações…" />
  if (query.isError)
    return (
      <State
        title="Não foi possível carregar"
        description={errorMessage(query.error)}
        retry={() => {
          void query.refetch()
        }}
      />
    )

  return (
    <FormScroll contentContainerStyle={styles.container}>
      {update.isError && <ErrorText message={errorMessage(update.error)} />}

      <View style={styles.section}>
        <Heading>Privacidade</Heading>
        <ToggleRow
          title="Confirmação de leitura"
          help="Mostra quando você leu uma mensagem. Se desativado, você também não vê quando outras pessoas leram."
          value={settings.readReceiptsEnabled}
          disabled={update.isPending}
          onChange={(readReceiptsEnabled) => save({ readReceiptsEnabled })}
        />
        <Label>Visto por último</Label>
        <Label muted>
          Recíproco: ao escolher "Ninguém", você também não vê o de outras pessoas.
        </Label>
        <ChoiceGroup<ConversationAudience>
          value={settings.lastSeenVisibility}
          disabled={update.isPending}
          options={[
            ['EVERYONE', 'Todos'],
            ['CONTACTS', 'Meus contatos'],
            ['NOBODY', 'Ninguém'],
          ]}
          onChange={(lastSeenVisibility) => save({ lastSeenVisibility })}
        />
        <Label>Quem pode me adicionar a grupos</Label>
        <ChoiceGroup<ConversationAudience>
          value={settings.groupInvitePolicy}
          disabled={update.isPending}
          options={[
            ['EVERYONE', 'Todos'],
            ['CONTACTS', 'Meus contatos'],
            ['NOBODY', 'Ninguém'],
          ]}
          onChange={(groupInvitePolicy) => save({ groupInvitePolicy })}
        />
        <Label>Quem pode me enviar solicitações</Label>
        <ChoiceGroup<ConversationDirectPolicy>
          value={settings.directRequestPolicy}
          disabled={update.isPending}
          options={[
            ['EVERYONE', 'Todos'],
            ['NOBODY', 'Ninguém'],
          ]}
          onChange={(directRequestPolicy) => save({ directRequestPolicy })}
        />
        <Button
          secondary
          title="Pessoas bloqueadas"
          onPress={() => router.push('/conversation/blocked')}
        />
      </View>

      <View style={styles.section}>
        <Heading>Notificações</Heading>
        <ToggleRow
          title="Som nas notificações"
          value={settings.notifySound}
          disabled={update.isPending}
          onChange={(notifySound) => save({ notifySound })}
        />
        <ToggleRow
          title="Vibração"
          value={settings.notifyVibration}
          disabled={update.isPending}
          onChange={(notifyVibration) => save({ notifyVibration })}
        />
        <ToggleRow
          title="Mostrar aviso detalhado"
          help="Notificações nunca mostram o texto das mensagens, apenas que há uma nova mensagem."
          value={settings.notifyPreview}
          disabled={update.isPending}
          onChange={(notifyPreview) => save({ notifyPreview })}
        />
        <Label muted>
          Para silenciar uma conversa ou grupo, abra os Detalhes dentro da conversa.
        </Label>
      </View>

      <View style={styles.section}>
        <Heading>Aparelhos e segurança</Heading>
        <Button
          secondary
          title="Aparelhos conectados"
          onPress={() => router.push('/conversation/devices')}
        />
        <ToggleRow
          title="Alertas de segurança"
          help="Avisa dentro da conversa quando um contato muda de aparelho."
          value={settings.securityAlertsEnabled}
          disabled={update.isPending}
          onChange={(securityAlertsEnabled) => save({ securityAlertsEnabled })}
        />
        <ToggleRow
          title="Backup protegido na nuvem (opcional)"
          help="Desativado por padrão. Mantém suas conversas apenas nos seus aparelhos quando desligado."
          value={settings.keyBackupEnabled}
          disabled={update.isPending}
          onChange={(keyBackupEnabled) => save({ keyBackupEnabled })}
        />
      </View>

      <View style={styles.section}>
        <Heading>Mídia e aparência</Heading>
        <Label>Download automático de mídia</Label>
        <ChoiceGroup<ConversationMediaAutoDownload>
          value={settings.mediaAutoDownload}
          disabled={update.isPending}
          options={[
            ['WIFI_ONLY', 'Somente no Wi-Fi'],
            ['ALWAYS', 'Wi-Fi e dados móveis'],
            ['NEVER', 'Nunca'],
          ]}
          onChange={(mediaAutoDownload) => save({ mediaAutoDownload })}
        />
        <Label>Tamanho da fonte nas conversas</Label>
        <ChoiceGroup<ConversationFontScale>
          value={settings.fontScale}
          disabled={update.isPending}
          options={[
            ['SMALL', 'Pequena'],
            ['MEDIUM', 'Padrão'],
            ['LARGE', 'Grande'],
          ]}
          onChange={(fontScale) => save({ fontScale })}
        />
        <Label>Papel de parede das conversas</Label>
        <ChoiceGroup<ConversationWallpaper>
          value={settings.wallpaper}
          disabled={update.isPending}
          options={[
            ['DEFAULT', 'Padrão'],
            ['SOFT', 'Suave'],
            ['PLAIN', 'Liso'],
          ]}
          onChange={(wallpaper) => save({ wallpaper })}
        />
      </View>
    </FormScroll>
  )
}

export default function ConversationSettingsScreen() {
  return (
    <Screen>
      <Toolbar title="Configurações de conversas" back />
      <ConversationGate>
        <SettingsContent />
      </ConversationGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 20,
  },
  section: {
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
})
