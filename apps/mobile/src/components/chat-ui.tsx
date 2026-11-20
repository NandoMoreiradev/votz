import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import Camera from 'lucide-react-native/icons/camera'
import Mic from 'lucide-react-native/icons/mic'
import Paperclip from 'lucide-react-native/icons/paperclip'
import Send from 'lucide-react-native/icons/send'
import { CHAT_QUALITY_VIEW, mediaKindFromMime, type ChatMediaQuality } from '@votz/chat-core'
import { prepareChatImage } from '../lib/chat-media-prepare'
import { Field } from './ui'
import { theme } from '../theme'

export interface PickedPreparedMedia {
  uri: string
  name: string
  mimeType: string
  kind: 'image' | 'video' | 'audio' | 'file'
  width?: number
  height?: number
  durationMs?: number
  thumbnail?: string
}

/** Seletor de foto/vídeo da galeria ou câmera com redução local antes do envio. */
export async function pickPreparedChatMedia(
  fromCamera: boolean,
  quality: ChatMediaQuality,
): Promise<PickedPreparedMedia | null> {
  const reducible = await import('../lib/chat-media-prepare').then((m) => m.imageManipulatorAvailable())
  const photoQuality = reducible ? 1 : 0.85
  const videoExportPreset =
    quality === 'high'
      ? ImagePicker.VideoExportPreset.H264_1920x1080
      : ImagePicker.VideoExportPreset.H264_1280x720
  const result = fromCamera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: photoQuality })
    : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: photoQuality,
        videoExportPreset,
      })
  const asset = result.canceled ? null : result.assets[0]
  if (!asset) return null
  const mimeType = asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg')
  const kind = mediaKindFromMime(mimeType)
  let uri = asset.uri
  let width = asset.width
  let height = asset.height
  let sentMime = mimeType
  let name = asset.fileName || (kind === 'video' ? 'video.mp4' : 'foto.jpg')
  let thumbnail: string | undefined
  if (kind === 'image') {
    const prepared = await prepareChatImage({ uri, width, height }, quality)
    if (prepared) {
      uri = prepared.uri
      width = prepared.width
      height = prepared.height
      sentMime = prepared.mimeType
      thumbnail = prepared.thumbnail
      name = `${name.replace(/\.[^./\\]+$/, '') || 'foto'}.jpg`
    }
  }
  return {
    uri,
    name,
    mimeType: sentMime,
    kind,
    width,
    height,
    durationMs: asset.duration ?? undefined,
    thumbnail,
  }
}

export function formatDayDividerLabel(ts: string | number | Date): { key: string; label: string } {
  const d = new Date(ts)
  const stamp = (v: Date) => `${v.getFullYear()}-${v.getMonth()}-${v.getDate()}`
  const key = stamp(d)
  const now = new Date()
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (key === stamp(now)) return { key, label: 'Hoje' }
  if (key === stamp(yesterday)) return { key, label: 'Ontem' }
  return { key, label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
}

/** Barra única de digitação e envio no celular: texto, HD, mídia, câmera e microfone. */
export function ChatComposerBar({
  draft,
  onChangeDraft,
  onBlur,
  onSendText,
  onAttachMedia,
  placeholder,
  maxLength = 4000,
  canType,
  canWrite,
  busy,
  quality,
  onToggleQuality,
  replyTo,
  forwardedDraft,
  onCancelNote,
  uploading,
  onCancelUpload,
}: {
  draft: string
  onChangeDraft: (value: string) => void
  onBlur?: () => void
  onSendText: () => void
  onAttachMedia: (fromCamera: boolean) => void
  placeholder: string
  maxLength?: number
  canType: boolean
  canWrite: boolean
  busy: boolean
  quality: ChatMediaQuality
  onToggleQuality: () => void
  replyTo?: { senderName?: string | null; excerpt: string } | null
  forwardedDraft?: boolean
  onCancelNote?: () => void
  uploading?: boolean
  onCancelUpload?: () => void
}) {
  return (
    <>
      {(replyTo || forwardedDraft) && (
        <View style={chatUiStyles.notice}>
          <Text style={[chatUiStyles.small, { flex: 1 }]} numberOfLines={1}>
            {replyTo
              ? `Respondendo a ${replyTo.senderName || 'mensagem'}: ${replyTo.excerpt}`
              : 'Encaminhando mensagem'}
          </Text>
          <Pressable accessibilityRole="button" onPress={onCancelNote}>
            <Text style={chatUiStyles.link}>Cancelar</Text>
          </Pressable>
        </View>
      )}
      {uploading && (
        <View style={chatUiStyles.notice}>
          <Text style={chatUiStyles.small}>Enviando mídia…</Text>
          <Pressable accessibilityRole="button" onPress={onCancelUpload}>
            <Text style={chatUiStyles.link}>Cancelar</Text>
          </Pressable>
        </View>
      )}
      <View style={chatUiStyles.composer}>
        <View style={chatUiStyles.inputWrap}>
          <View style={{ flex: 1 }}>
            <Field
              accessibilityLabel="Mensagem"
              bare
              multiline
              maxLength={maxLength}
              value={draft}
              onChangeText={onChangeDraft}
              onBlur={onBlur}
              editable={canType}
              placeholder={placeholder}
              style={chatUiStyles.field}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: quality === 'high' }}
            accessibilityLabel={quality === 'high' ? CHAT_QUALITY_VIEW.oneShotOn : CHAT_QUALITY_VIEW.oneShotOff}
            disabled={!canWrite || busy}
            onPress={onToggleQuality}
            style={[chatUiStyles.inlineIcon, (!canWrite || busy) && { opacity: 0.4 }]}
          >
            <Text
              style={[
                chatUiStyles.hdText,
                { color: quality === 'high' ? theme.colors.action : theme.colors.muted },
              ]}
            >
              {CHAT_QUALITY_VIEW.oneShotLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Anexar foto ou vídeo"
            disabled={!canWrite || busy}
            onPress={() => onAttachMedia(false)}
            style={[chatUiStyles.inlineIcon, (!canWrite || busy) && { opacity: 0.4 }]}
          >
            <Paperclip size={21} color={theme.colors.muted} />
          </Pressable>
          {!draft.trim() && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tirar foto"
              disabled={!canWrite || busy}
              onPress={() => onAttachMedia(true)}
              style={[chatUiStyles.inlineIcon, (!canWrite || busy) && { opacity: 0.4 }]}
            >
              <Camera size={21} color={theme.colors.muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={draft.trim() ? 'Enviar mensagem' : 'Gravar mensagem de voz'}
          disabled={!canWrite || (!!draft.trim() && busy)}
          onPress={() => {
            if (draft.trim()) onSendText()
            else Alert.alert('Mensagem de voz', 'A gravação de voz chega em breve no celular.')
          }}
          style={[
            chatUiStyles.send,
            (!canWrite || (!!draft.trim() && busy)) && { opacity: 0.4 },
          ]}
        >
          {draft.trim() ? (
            <Send size={21} color={theme.colors.surface} />
          ) : (
            <Mic size={22} color={theme.colors.surface} />
          )}
        </Pressable>
      </View>
    </>
  )
}

export const chatUiStyles = StyleSheet.create({
  history: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  dayChip: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    elevation: 1,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  dayChipText: {
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    color: theme.colors.muted,
  },
  banner: {
    alignSelf: 'center',
    maxWidth: '92%',
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  metaSpacer: {
    fontSize: 12,
    color: 'transparent',
  },
  bannerText: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  empty: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  ownFirst: {
    borderTopRightRadius: 0,
    marginTop: 8,
  },
  peerFirst: {
    borderTopLeftRadius: 0,
    marginTop: 8,
  },
  tailOwn: {
    position: 'absolute',
    top: 0,
    right: -7,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderLeftWidth: 8,
    borderTopColor: theme.colors.bubbleOwn,
    borderLeftColor: 'transparent',
  },
  tailPeer: {
    position: 'absolute',
    top: 0,
    left: -7,
    width: 0,
    height: 0,
    borderTopWidth: 10,
    borderRightWidth: 8,
    borderTopColor: theme.colors.bubblePeer,
    borderRightColor: 'transparent',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 3,
    marginTop: 2,
  },
  metaInline: {
    position: 'absolute',
    right: 10,
    bottom: 6,
    marginTop: 0,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.soft,
  },
  link: {
    fontSize: 13,
    fontFamily: theme.fonts.medium,
    color: theme.colors.action,
  },
  small: {
    fontSize: 12,
    color: theme.colors.muted,
    fontFamily: theme.fonts.body,
    flex: 1,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 6,
    gap: 3,
    elevation: 1,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.1,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  own: {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.bubbleOwn,
  },
  peer: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.bubblePeer,
  },
  sender: {
    fontFamily: theme.fonts.heading,
    fontSize: 12,
    color: theme.colors.primary,
  },
  message: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.text,
  },
  unreadable: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    color: theme.colors.muted,
  },
  time: {
    color: theme.colors.muted,
    fontSize: 11,
    fontFamily: theme.fonts.body,
    textAlign: 'right',
  },
  composer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: theme.colors.chatBackground,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 46,
    borderRadius: 24,
    paddingRight: 6,
    backgroundColor: theme.colors.surface,
  },
  field: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 46,
    maxHeight: 130,
    fontSize: 16,
  },
  inlineIcon: {
    width: 40,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaBox: {
    gap: 4,
  },
  mediaThumb: {
    width: 220,
    borderRadius: 8,
    backgroundColor: theme.colors.soft,
  },
  hdText: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  mediaImage: {
    width: 220,
    height: 180,
    borderRadius: 8,
    backgroundColor: theme.colors.soft,
  },
  mediaCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  mediaError: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.action,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.soft,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.action,
    paddingLeft: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(26,26,46,0.06)',
    borderRadius: 6,
  },
  send: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: theme.colors.action,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
