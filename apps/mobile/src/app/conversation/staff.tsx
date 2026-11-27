import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { useNetworkState } from 'expo-network'
import { router, useLocalSearchParams } from 'expo-router'
import Ban from 'lucide-react-native/icons/ban'
import CheckCircle2 from 'lucide-react-native/icons/check-circle-2'
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import RotateCcw from 'lucide-react-native/icons/rotate-ccw'
import User from 'lucide-react-native/icons/user'
import { formatFileSize, mediaKindLabel, parseChatQuality, type ChatMediaQuality } from '@votz/chat-core'
import { DEFAULT_CONVERSATION_SETTINGS, conversationFontSize } from '@votz/shared-types'
import { MenuItem, PopoverMenu } from '../../components/chat-sheet'
import { ChatComposerBar, chatUiStyles, formatDayDividerLabel, pickPreparedChatMedia } from '../../components/chat-ui'
import { Screen, Toolbar } from '../../components/screen'
import { ErrorText, IconButton, State } from '../../components/ui'
import { useConversationSettings } from '../../hooks/use-conversations'
import {
  downloadStaffPageMediaFile,
  useReplyAsStaff,
  useReplyPageMedia,
  useSetStaffConversationStatus,
  useStaffConversation,
  type OrgType,
  type PageAttachmentView,
  type PageMessageView,
  type PageStatus,
} from '../../hooks/use-page-inbox'
import { errorMessage } from '../../lib/api'
import { shouldAutoDownload } from '../../lib/network-policy'
import { useSession } from '../../lib/session'
import { useAppTheme } from '../../theme-context'

const STATUS_LABEL: Record<PageStatus, string> = {
  OPEN: 'Aberta',
  RESOLVED: 'Resolvida',
  BLOCKED: 'Bloqueada',
}

function StaffAttachmentBox({
  orgType,
  orgId,
  conversationId,
  attachment,
  autoDownload,
}: {
  orgType: OrgType
  orgId: string
  conversationId: string
  attachment: PageAttachmentView
  autoDownload: boolean
}) {
  const [uri, setUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState('')

  const load = useCallback(async () => {
    if (loading || uri) return
    setLoading(true)
    setFailed('')
    try {
      const localUri = await downloadStaffPageMediaFile(orgType, orgId, conversationId, attachment.id)
      setUri(localUri)
    } catch {
      setFailed('Não foi possível abrir este arquivo.')
    } finally {
      setLoading(false)
    }
  }, [loading, uri, orgType, orgId, conversationId, attachment.id])

  useEffect(() => {
    if (attachment.kind === 'image' && autoDownload) void load()
  }, [attachment.id, attachment.kind, autoDownload, load])

  return (
    <View style={chatUiStyles.mediaBox}>
      {uri && attachment.kind === 'image' ? (
        <Image source={{ uri }} accessibilityLabel={attachment.name} contentFit="cover" style={chatUiStyles.mediaImage} />
      ) : (
        <Pressable accessibilityRole="button" disabled={loading} onPress={() => void load()} style={chatUiStyles.mediaCard}>
          <Text style={chatUiStyles.small}>
            {loading
              ? 'Baixando…'
              : `${mediaKindLabel(attachment.kind)}: ${attachment.name} (${formatFileSize(attachment.sizeBytes)})`}
          </Text>
        </Pressable>
      )}
      {!!failed && <Text style={chatUiStyles.mediaError}>{failed}</Text>}
    </View>
  )
}

interface DecoratedStaffMessage {
  message: PageMessageView
  own: boolean
  first: boolean
  dayDivider: string | null
  time: string
}

export default function StaffPageConversationScreen() {
  const params = useLocalSearchParams<{ id?: string; orgType?: string; orgId?: string; citizenName?: string }>()
  const activeContext = useSession((s) => s.activeContext)
  const { colors, theme } = useAppTheme()
  const network = useNetworkState()
  const settingsQuery = useConversationSettings()
  const chatSettings = settingsQuery.data ?? DEFAULT_CONVERSATION_SETTINGS
  const bubbleFontSize = conversationFontSize(chatSettings.fontScale)
  const autoDownload = shouldAutoDownload(chatSettings.mediaAutoDownload, network.type)

  const orgType = (params.orgType as OrgType | undefined) ?? (activeContext?.type as OrgType | undefined)
  const orgId = params.orgId ?? activeContext?.id
  const conversationId = params.id ?? ''

  const conv = useStaffConversation(orgType, orgId, conversationId)
  const reply = useReplyAsStaff(orgType, orgId, conversationId)
  const replyMedia = useReplyPageMedia(orgType, orgId, conversationId)
  const setStatus = useSetStaffConversationStatus(orgType, orgId, conversationId)

  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<{ eventId: string; senderName: string; excerpt: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [qualityOverride, setQualityOverride] = useState<ChatMediaQuality | null>(null)
  const quality: ChatMediaQuality = qualityOverride ?? parseChatQuality(chatSettings.mediaUploadQuality)
  const uploadAbort = useRef<AbortController | null>(null)

  const data = conv.data
  const citizen = data?.citizen
  const title = citizen?.name ?? params.citizenName ?? 'Atendimento'
  const canReply = !!data && data.status !== 'BLOCKED'

  const listData = useMemo(() => {
    const raw = data?.messages ?? []
    let prevDay = ''
    let prevAuthor = ''
    const decorated: DecoratedStaffMessage[] = raw.map((m) => {
      const day = formatDayDividerLabel(m.createdAt)
      const own = m.from === 'STAFF'
      const author = own ? `staff:${m.staffName ?? ''}` : 'citizen'
      const first = day.key !== prevDay || author !== prevAuthor
      const dayDivider = day.key !== prevDay ? day.label : null
      prevDay = day.key
      prevAuthor = author
      return {
        message: m,
        own,
        first,
        dayDivider,
        time: new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      }
    })
    return decorated.reverse()
  }, [data?.messages])

  function sendText() {
    const value = draft.trim()
    if (!value || !canReply) return
    const replying = replyTo
    setDraft('')
    setReplyTo(null)
    setLocalError('')
    reply.mutate(
      { text: value, replyToId: replying?.eventId },
      {
        onError: (err) => {
          setDraft((c) => c || value)
          setReplyTo((c) => c ?? replying)
          setLocalError(errorMessage(err))
        },
      },
    )
  }

  async function attachMedia(fromCamera: boolean) {
    if (!canReply || uploading) return
    const picked = await pickPreparedChatMedia(fromCamera, quality)
    if (!picked) return
    const controller = new AbortController()
    uploadAbort.current = controller
    setUploading(true)
    setLocalError('')
    const caption = draft.trim() || undefined
    const replying = replyTo
    try {
      await replyMedia.mutateAsync({
        uri: picked.uri,
        mimeType: picked.mimeType,
        caption,
        replyToId: replying?.eventId,
        width: picked.width,
        height: picked.height,
        durationMs: picked.durationMs,
        thumbnail: picked.thumbnail,
        signal: controller.signal,
      })
      setDraft('')
      setReplyTo(null)
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setLocalError(errorMessage(err))
      }
    } finally {
      uploadAbort.current = null
      setUploading(false)
    }
  }

  const updateStatus = (next: PageStatus) => {
    setMenuOpen(false)
    if (next === 'BLOCKED') {
      Alert.alert(
        'Bloquear conversa?',
        'O cidadão não poderá mais enviar mensagens nesta conversa.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Bloquear', style: 'destructive', onPress: () => setStatus.mutate('BLOCKED') },
        ],
      )
      return
    }
    setStatus.mutate(next)
  }

  if (!orgType || !orgId || !conversationId) {
    return (
      <Screen>
        <Toolbar title="Atendimento" back />
        <State title="Conversa indisponível" description="Selecione um perfil institucional para abrir este atendimento." />
      </Screen>
    )
  }

  return (
    <Screen>
      <Toolbar
        title={title}
        back
        right={
          data ? (
            <>
              <IconButton label="Opções do atendimento" onPress={() => setMenuOpen(true)}>
                <EllipsisVertical size={22} color={colors.primary} />
              </IconButton>
              <PopoverMenu visible={menuOpen} onClose={() => setMenuOpen(false)}>
                {citizen && (
                  <MenuItem
                    label="Ver perfil do cidadão"
                    icon={<User size={19} color={colors.muted} />}
                    onPress={() => {
                      setMenuOpen(false)
                      router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: citizen.id } })
                    }}
                  />
                )}
                {data.status !== 'RESOLVED' && (
                  <MenuItem
                    label="Marcar como resolvida"
                    icon={<CheckCircle2 size={19} color={colors.positive} />}
                    onPress={() => updateStatus('RESOLVED')}
                  />
                )}
                {data.status !== 'OPEN' && (
                  <MenuItem
                    label="Reabrir conversa"
                    icon={<RotateCcw size={19} color={colors.primary} />}
                    onPress={() => updateStatus('OPEN')}
                  />
                )}
                {data.status !== 'BLOCKED' && (
                  <MenuItem
                    label="Bloquear cidadão"
                    icon={<Ban size={19} color={colors.action} />}
                    onPress={() => updateStatus('BLOCKED')}
                  />
                )}
              </PopoverMenu>
            </>
          ) : undefined
        }
      />

      {conv.isPending ? (
        <View style={[chatUiStyles.loading, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.action} />
          <Text style={[chatUiStyles.empty, { color: colors.muted }]}>Carregando conversa…</Text>
        </View>
      ) : conv.isError || !data ? (
        <State
          title="Não foi possível abrir"
          description={conv.isError ? errorMessage(conv.error) : undefined}
          retry={() => {
            void conv.refetch()
          }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: colors.surface,
              borderBottomWidth: 0.5,
              borderBottomColor: colors.border,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
              Status: <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary }}>{STATUS_LABEL[data.status]}</Text>
              {data.startedBy === 'STAFF' && !data.accepted ? ' · Aguardando aceite do cidadão' : ''}
            </Text>
          </View>

          <FlatList
            inverted
            style={{ flex: 1 }}
            contentContainerStyle={chatUiStyles.history}
            data={listData}
            keyExtractor={(item) => item.message.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <View>
                {item.dayDivider && (
                  <View style={chatUiStyles.dayChip}>
                    <Text style={chatUiStyles.dayChipText}>{item.dayDivider}</Text>
                  </View>
                )}
                <Pressable
                  onLongPress={() =>
                    setReplyTo({
                      eventId: item.message.id,
                      senderName: item.own ? item.message.staffName || 'Equipe' : title,
                      excerpt: item.message.text || item.message.attachment?.name || 'Anexo',
                    })
                  }
                  style={[
                    chatUiStyles.bubble,
                    item.own ? chatUiStyles.own : chatUiStyles.peer,
                    item.first && (item.own ? chatUiStyles.ownFirst : chatUiStyles.peerFirst),
                  ]}
                >
                  {item.first && <View pointerEvents="none" style={item.own ? chatUiStyles.tailOwn : chatUiStyles.tailPeer} />}
                  {item.own && item.first && !!item.message.staffName && (
                    <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 2, fontFamily: theme.fonts.medium }}>
                      {item.message.staffName}
                    </Text>
                  )}
                  {item.message.replyTo && (
                    <View style={chatUiStyles.quote}>
                      <Text numberOfLines={2} style={chatUiStyles.small}>
                        {item.message.replyTo.excerpt}
                      </Text>
                    </View>
                  )}
                  {item.message.attachment && (
                    <StaffAttachmentBox
                      orgType={orgType}
                      orgId={orgId}
                      conversationId={conversationId}
                      attachment={item.message.attachment}
                      autoDownload={autoDownload}
                    />
                  )}
                  {!!item.message.text && (
                    <Text
                      style={[
                        chatUiStyles.message,
                        {
                          fontSize: bubbleFontSize,
                          lineHeight: Math.round(bubbleFontSize * 1.4),
                        },
                      ]}
                    >
                      {item.message.text}
                    </Text>
                  )}
                  <View style={chatUiStyles.metaRow}>
                    <Text style={chatUiStyles.time}>{item.time}</Text>
                  </View>
                </Pressable>
              </View>
            )}
          />

          {!!localError && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 4 }}>
              <ErrorText message={localError} />
            </View>
          )}
          <ErrorText message={setStatus.isError ? errorMessage(setStatus.error) : undefined} />

          {canReply ? (
            <ChatComposerBar
              draft={draft}
              onChangeDraft={setDraft}
              onSendText={sendText}
              onAttachMedia={(fromCamera) => void attachMedia(fromCamera)}
              placeholder="Responder como equipe…"
              maxLength={2000}
              canType={canReply}
              canWrite={canReply}
              busy={reply.isPending || uploading}
              quality={quality}
              onToggleQuality={() => setQualityOverride(quality === 'high' ? 'normal' : 'high')}
              replyTo={replyTo}
              onCancelNote={() => setReplyTo(null)}
              uploading={uploading}
              onCancelUpload={() => uploadAbort.current?.abort()}
            />
          ) : (
            <View style={{ padding: 14, backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.border }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' }}>
                Esta conversa está bloqueada. Reabra pelo menu para voltar a responder.
              </Text>
            </View>
          )}
        </View>
      )}
    </Screen>
  )
}
