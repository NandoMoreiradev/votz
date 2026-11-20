import { useEffect, useState } from 'react'
import { Alert, ScrollView, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import Ban from 'lucide-react-native/icons/ban'
import Bell from 'lucide-react-native/icons/bell'
import CheckCheck from 'lucide-react-native/icons/check-check'
import Clock from 'lucide-react-native/icons/clock'
import Cloud from 'lucide-react-native/icons/cloud'
import Database from 'lucide-react-native/icons/database'
import Download from 'lucide-react-native/icons/download'
import HardDrive from 'lucide-react-native/icons/hard-drive'
import Image from 'lucide-react-native/icons/image'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Smartphone from 'lucide-react-native/icons/smartphone'
import TypeIcon from 'lucide-react-native/icons/type'
import UserPlus from 'lucide-react-native/icons/user-plus'
import Users from 'lucide-react-native/icons/users'
import Vibrate from 'lucide-react-native/icons/vibrate'
import Volume2 from 'lucide-react-native/icons/volume-2'
import {
  DEFAULT_CONVERSATION_SETTINGS,
  type ConversationAudience,
  type ConversationDirectPolicy,
  type ConversationFontScale,
  type ConversationMediaAutoDownload,
  type ConversationMediaUploadQuality,
  type ConversationSettings,
  type ConversationWallpaper,
  type UpdateConversationSettings,
} from '@votz/shared-types'
import { CHAT_CACHE_VIEW, CHAT_QUALITY_VIEW, parseChatQuality } from '@votz/chat-core'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { OptionSheet, SettingsRow, SettingsSection } from '../../components/settings-ui'
import { ErrorText, State } from '../../components/ui'
import {
  useConversationSettings,
  useUpdateConversationSettings,
} from '../../hooks/use-conversations'
import { errorMessage } from '../../lib/api'
import { getNativeMediaCache } from '../../lib/chat-media-cache'
import { useSession } from '../../lib/session'
import { theme } from '../../theme'

const AUDIENCE: [ConversationAudience, string][] = [
  ['EVERYONE', 'Todos'],
  ['CONTACTS', 'Meus contatos'],
  ['NOBODY', 'Ninguém'],
]
const DIRECT: [ConversationDirectPolicy, string][] = [
  ['EVERYONE', 'Todos'],
  ['NOBODY', 'Ninguém'],
]
const MEDIA: [ConversationMediaAutoDownload, string][] = [
  ['WIFI_ONLY', 'Somente no Wi-Fi'],
  ['ALWAYS', 'Wi-Fi e dados móveis'],
  ['NEVER', 'Nunca'],
]
const FONT: [ConversationFontScale, string][] = [
  ['SMALL', 'Pequena'],
  ['MEDIUM', 'Padrão'],
  ['LARGE', 'Grande'],
]
const WALLPAPER: [ConversationWallpaper, string][] = [
  ['DEFAULT', 'Padrão'],
  ['SOFT', 'Suave'],
  ['PLAIN', 'Liso'],
]
const QUALITY: [ConversationMediaUploadQuality, string][] = [
  ['NORMAL', CHAT_QUALITY_VIEW.options.normal.label],
  ['HIGH', CHAT_QUALITY_VIEW.options.high.label],
]
const labelOf = <T extends string>(options: [T, string][], value: T) =>
  options.find(([key]) => key === value)?.[1] ?? ''

/** Quanto espaço os arquivos já baixados ocupam neste aparelho, e como liberar. */
function CachedFilesRow() {
  const userId = useSession((state) => state.user?.id)
  const [bytes, setBytes] = useState<number | null>(null)

  useEffect(() => {
    if (!userId) return
    let alive = true
    void getNativeMediaCache(userId)
      .usage()
      .then((value) => {
        if (alive) setBytes(value)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [userId])

  if (!userId) return null
  const clear = () =>
    Alert.alert(CHAT_CACHE_VIEW.title, CHAT_CACHE_VIEW.clearConfirm, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: CHAT_CACHE_VIEW.clear,
        style: 'destructive',
        onPress: () => {
          void getNativeMediaCache(userId)
            .clear()
            .then(() => {
              setBytes(0)
              Alert.alert(CHAT_CACHE_VIEW.title, CHAT_CACHE_VIEW.cleared)
            })
        },
      },
    ])
  return (
    <SettingsRow
      icon={<Database size={ICON} color={theme.colors.primary} />}
      title={CHAT_CACHE_VIEW.title}
      subtitle={`${CHAT_CACHE_VIEW.help}${bytes !== null ? ` ${CHAT_CACHE_VIEW.usage(bytes)}` : ''}`}
      chevron={!!bytes}
      onPress={bytes ? clear : undefined}
    />
  )
}

type Choice =
  | { key: 'lastSeenVisibility'; title: string; help?: string; options: [ConversationAudience, string][] }
  | { key: 'groupInvitePolicy'; title: string; options: [ConversationAudience, string][] }
  | { key: 'directRequestPolicy'; title: string; options: [ConversationDirectPolicy, string][] }
  | { key: 'mediaAutoDownload'; title: string; options: [ConversationMediaAutoDownload, string][] }
  | { key: 'mediaUploadQuality'; title: string; help?: string; options: [ConversationMediaUploadQuality, string][] }
  | { key: 'fontScale'; title: string; options: [ConversationFontScale, string][] }
  | { key: 'wallpaper'; title: string; options: [ConversationWallpaper, string][] }

const ICON = 20

function SettingsContent() {
  const query = useConversationSettings()
  const update = useUpdateConversationSettings()
  const settings: ConversationSettings = query.data ?? DEFAULT_CONVERSATION_SETTINGS
  const [choice, setChoice] = useState<Choice | null>(null)

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

  const muted = theme.colors.primary
  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {update.isError && (
          <View style={{ padding: 16 }}>
            <ErrorText message={errorMessage(update.error)} />
          </View>
        )}
        <SettingsSection title="Privacidade">
          <SettingsRow
            icon={<CheckCheck size={ICON} color={muted} />}
            title="Confirmação de leitura"
            subtitle="Mostra quando você leu. Se desligar, você também não vê quando leram as suas."
            right={
              <Switch
                accessibilityLabel="Confirmação de leitura"
                value={settings.readReceiptsEnabled}
                onValueChange={(readReceiptsEnabled) => save({ readReceiptsEnabled })}
                trackColor={{ true: theme.colors.action }}
                thumbColor={theme.colors.surface}
              />
            }
          />
          <SettingsRow
            icon={<Clock size={ICON} color={muted} />}
            title="Visto por último"
            subtitle={labelOf(AUDIENCE, settings.lastSeenVisibility)}
            chevron
            onPress={() =>
              setChoice({
                key: 'lastSeenVisibility',
                title: 'Visto por último',
                help: 'Se você escolher "Ninguém", também não vê o de outras pessoas.',
                options: AUDIENCE,
              })
            }
          />
          <SettingsRow
            icon={<Users size={ICON} color={muted} />}
            title="Quem pode me adicionar a grupos"
            subtitle={labelOf(AUDIENCE, settings.groupInvitePolicy)}
            chevron
            onPress={() =>
              setChoice({ key: 'groupInvitePolicy', title: 'Quem pode me adicionar a grupos', options: AUDIENCE })
            }
          />
          <SettingsRow
            icon={<UserPlus size={ICON} color={muted} />}
            title="Quem pode me enviar solicitações"
            subtitle={labelOf(DIRECT, settings.directRequestPolicy)}
            chevron
            onPress={() =>
              setChoice({ key: 'directRequestPolicy', title: 'Quem pode me enviar solicitações', options: DIRECT })
            }
          />
          <SettingsRow
            icon={<Ban size={ICON} color={muted} />}
            title="Pessoas bloqueadas"
            chevron
            onPress={() => router.push('/conversation/blocked')}
          />
        </SettingsSection>

        <SettingsSection title="Conversas">
          <SettingsRow
            icon={<TypeIcon size={ICON} color={muted} />}
            title="Tamanho da fonte"
            subtitle={labelOf(FONT, settings.fontScale)}
            chevron
            onPress={() =>
              setChoice({ key: 'fontScale', title: 'Tamanho da fonte nas conversas', options: FONT })
            }
          />
          <SettingsRow
            icon={<Image size={ICON} color={muted} />}
            title="Papel de parede"
            subtitle={labelOf(WALLPAPER, settings.wallpaper)}
            chevron
            onPress={() =>
              setChoice({ key: 'wallpaper', title: 'Papel de parede das conversas', options: WALLPAPER })
            }
          />
          <SettingsRow
            icon={<Download size={ICON} color={muted} />}
            title="Download automático de mídia"
            subtitle={labelOf(MEDIA, settings.mediaAutoDownload)}
            chevron
            onPress={() =>
              setChoice({ key: 'mediaAutoDownload', title: 'Download automático de mídia', options: MEDIA })
            }
          />
          <SettingsRow
            icon={<Image size={ICON} color={muted} />}
            title={CHAT_QUALITY_VIEW.settingTitle}
            subtitle={`${labelOf(QUALITY, settings.mediaUploadQuality)}. ${CHAT_QUALITY_VIEW.options[parseChatQuality(settings.mediaUploadQuality)].help}`}
            chevron
            onPress={() =>
              setChoice({
                key: 'mediaUploadQuality',
                title: CHAT_QUALITY_VIEW.settingTitle,
                help: CHAT_QUALITY_VIEW.settingHelp,
                options: QUALITY,
              })
            }
          />
          <CachedFilesRow />
        </SettingsSection>

        <SettingsSection title="Notificações">
          <SettingsRow icon={<Volume2 size={ICON} color={muted} />} title="Som nas notificações" soon />
          <SettingsRow icon={<Vibrate size={ICON} color={muted} />} title="Vibração" soon />
          <SettingsRow
            icon={<Bell size={ICON} color={muted} />}
            title="Mostrar aviso detalhado"
            soon
          />
          <Text style={{ paddingHorizontal: 16, paddingVertical: 8, fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.muted }}>
            Para silenciar uma conversa ou grupo, abra os Detalhes dentro da conversa.
          </Text>
        </SettingsSection>

        <SettingsSection title="Aparelhos e segurança">
          <SettingsRow
            icon={<HardDrive size={ICON} color={muted} />}
            title="Gerenciar armazenamento"
            subtitle="Veja quanto espaço você usa e apague os arquivos que não quer mais guardar."
            chevron
            onPress={() => router.push('/conversation/storage')}
          />
          <SettingsRow
            icon={<Smartphone size={ICON} color={muted} />}
            title="Aparelhos conectados"
            chevron
            onPress={() => router.push('/conversation/devices')}
          />
          <SettingsRow
            icon={<ShieldCheck size={ICON} color={muted} />}
            title="Alertas de segurança"
            subtitle="Sempre ligados: avisam na conversa quando um contato muda de aparelho."
            right={
              <Switch
                accessibilityLabel="Alertas de segurança"
                value
                disabled
                trackColor={{ true: theme.colors.action }}
                thumbColor={theme.colors.surface}
              />
            }
          />
          <SettingsRow
            icon={<Cloud size={ICON} color={muted} />}
            title="Backup protegido na nuvem"
            subtitle={
              settings.keyBackupEnabled
                ? 'Ativo · restaure ou transfira seu histórico entre aparelhos.'
                : 'Desligado · guarde uma cópia protegida ou transfira o histórico.'
            }
            chevron
            onPress={() => router.push('/conversation/backup')}
          />
        </SettingsSection>
      </ScrollView>
      {choice && (
        <OptionSheet
          visible
          title={choice.title}
          help={'help' in choice ? choice.help : undefined}
          options={choice.options as readonly (readonly [string, string])[]}
          value={String(settings[choice.key])}
          onSelect={(next) => save({ [choice.key]: next } as UpdateConversationSettings)}
          onClose={() => setChoice(null)}
        />
      )}
    </>
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
