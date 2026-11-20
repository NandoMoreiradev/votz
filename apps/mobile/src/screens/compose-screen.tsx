import { useRef, useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Category } from '@votz/shared-types'
import X from 'lucide-react-native/icons/x'
import ImagePlus from 'lucide-react-native/icons/image-plus'
import Camera from 'lucide-react-native/icons/camera'
import FileUp from 'lucide-react-native/icons/file-up'
import MapPin from 'lucide-react-native/icons/map-pin'
import ChartNoAxesColumn from 'lucide-react-native/icons/chart-no-axes-column'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import { Avatar, Button, ErrorText, Field, IconButton } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import { ChoiceSheet } from '../components/choice-sheet'
import { LocationPanel, MediaTiles, RecipientPicker, SimilarReportsCard } from '../components/report-compose-parts'
import { api, errorMessage } from '../lib/api'
import { useCreateContent } from '../hooks/use-content'
import { useSession } from '../lib/session'
import { buildLocationPayload, emptyLocation, locationError, type LocationDraft } from '../lib/report-location'
import { POST_MEDIA_LIMIT, REPORT_MEDIA_LIMIT, mediaSlots, prepareMedia, uploadTimeoutMs, type MediaItem } from '../lib/report-media'
import type { Recipient, RecipientKind } from '../lib/types'
import { theme } from '../theme'

const categories: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Moradia', ENVIRONMENT: 'Meio ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência social', OTHER: 'Outro',
}
const RECIPIENT_KINDS: readonly string[] = ['ENTITY', 'POLITICIAN', 'COMPANY']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Destinatário vindo de um perfil (/compose?recipientType=…): ignora qualquer valor fora do padrão. */
function recipientFromParams(params: { recipientType?: string; recipientId?: string; recipientName?: string }): Recipient | null {
  const { recipientType, recipientId, recipientName } = params
  if (!recipientType || !recipientId || !recipientName || !RECIPIENT_KINDS.includes(recipientType) || !UUID.test(recipientId)) return null
  return { type: recipientType as RecipientKind, id: recipientId, name: recipientName.slice(0, 160) }
}

export default function ComposeScreen() {
  const user = useSession((s) => s.user)
  const params = useLocalSearchParams<{ kind?: string; recipientType?: string; recipientId?: string; recipientName?: string }>()
  const initialRecipient = recipientFromParams(params)
  const [kind, setKind] = useState<'posts' | 'reports'>(params.kind === 'reports' || initialRecipient ? 'reports' : 'posts')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [categorySheet, setCategorySheet] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [recipient, setRecipient] = useState<Recipient | null>(initialRecipient)
  const [location, setLocation] = useState<LocationDraft>(emptyLocation)
  // Publicação: cidade/UF sugeridas do perfil. Relato: o local do problema começa vazio, nunca o do perfil.
  const [postCity, setPostCity] = useState(user?.city || '')
  const [postState, setPostState] = useState(user?.state || '')
  const [details, setDetails] = useState(kind === 'reports')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [poll, setPoll] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const uploadedUrls = useRef(new Map<string, string>())
  const create = useCreateContent()
  const isReport = kind === 'reports'
  const mediaLimit = isReport ? REPORT_MEDIA_LIMIT : POST_MEDIA_LIMIT

  const pick = useMutation({
    mutationFn: async (source: 'camera' | 'library' | 'document') => {
      const slots = mediaSlots(mediaLimit, media.length)
      if (!slots) return
      const raw: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null; type?: string | null }[] = []
      if (source === 'document') {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false })
        if (!result.canceled) raw.push(...result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size })))
      } else {
        if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Autorize a câmera nas configurações do celular para tirar uma foto ou gravar um vídeo.')
        const result = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: isReport ? ['images', 'videos'] : ['images'], quality: 0.75, videoMaxDuration: 60 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: isReport ? ['images', 'videos'] : ['images'], quality: 0.75, allowsMultipleSelection: true, selectionLimit: slots })
        if (!result.canceled) raw.push(...result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize, type: asset.type })))
      }
      const accepted: MediaItem[] = []
      let refusal: string | undefined
      for (const asset of raw.slice(0, slots)) {
        const prepared = prepareMedia(asset)
        if ('item' in prepared) accepted.push(prepared.item)
        else refusal ??= prepared.error
      }
      if (accepted.length) setMedia((current) => [...current, ...accepted].slice(0, mediaLimit))
      if (refusal) throw new Error(refusal)
    },
  })

  const publish = useMutation({
    mutationFn: async () => {
      const urls: string[] = []
      for (const item of media) {
        let url = uploadedUrls.current.get(item.uri)
        if (!url) {
          const form = new FormData()
          form.append('file', { uri: item.uri, name: item.name, type: item.mimeType } as unknown as Blob)
          const uploaded = await api<{ url: string }>(`/storage/upload/${isReport ? 'report-media' : 'post-media'}`, { method: 'POST', body: form, timeoutMs: uploadTimeoutMs(item.kind) })
          url = uploaded.url
          uploadedUrls.current.set(item.uri, url)
        }
        urls.push(url)
      }
      const body = isReport
        ? {
            title: title.trim(), description: content.trim(), category, anonymous,
            ...(recipient ? { recipientType: recipient.type, recipientId: recipient.id } : {}),
            ...buildLocationPayload(location), media: urls,
          }
        : {
            content: content.trim(),
            ...(poll ? { poll: { question: question.trim() || undefined, options: options.map((option) => option.trim()), durationHours: 24 } } : {}),
            ...(postCity.trim() ? { city: postCity.trim() } : {}), ...(postState.trim() ? { state: postState.trim().toUpperCase() } : {}), media: urls,
          }
      return create.mutateAsync({ kind, body })
    },
    onSuccess: (created) => router.replace(isReport ? { pathname: '/report/[id]', params: { id: created.id } } : { pathname: '/post/[id]', params: { id: created.id } }),
  })

  if (!user) return <Redirect href="/login" />

  const pollValid = !poll || options.every((option) => !!option.trim())
  const reportLocationError = isReport ? locationError(location) : null
  const valid = isReport
    ? title.trim().length >= 10 && content.trim().length >= 30 && !!category && !reportLocationError
    : (!!content.trim() || media.length > 0 || poll) && pollValid
  const busy = publish.isPending || pick.isPending
  const postStateInvalid = !isReport && !!postState && !/^[A-Z]{2}$/.test(postState)
  const full = media.length >= mediaLimit

  const switchKind = () => {
    const next = isReport ? 'posts' : 'reports'
    setKind(next)
    setDetails(next === 'reports')
    // Publicação só aceita fotos (até 4); relato aceita também vídeo e PDF (até 5).
    if (next === 'posts') setMedia((items) => items.filter((item) => item.kind === 'image').slice(0, POST_MEDIA_LIMIT))
    uploadedUrls.current.clear()
  }

  return <Screen>
    <Toolbar title={isReport ? 'Novo relato' : 'Nova publicação'}
      left={<IconButton label="Cancelar publicação" onPress={() => router.back()} disabled={publish.isPending}><X size={23} color={theme.colors.primary} /></IconButton>}
      right={<Button title={isReport ? 'Registrar' : 'Publicar'} loading={publish.isPending} disabled={!valid || !user.emailVerified || busy || postStateInvalid} onPress={() => publish.mutate()} />} />
    <FormScroll contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={anonymous && isReport ? 'Anônimo' : user.name} uri={anonymous && isReport ? null : user.avatarUrl} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary, fontSize: 14 }}>{anonymous && isReport ? 'Relato anônimo' : user.name}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 2 }}>Público · Comunidade Votz</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Alternar publicação e relato" disabled={publish.isPending} onPress={switchKind} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 18, padding: 8 }}>
          <Text style={{ fontSize: 12, color: theme.colors.action, fontFamily: theme.fonts.medium }}>{isReport ? 'Relato' : 'Publicação'}</Text>
          <ChevronDown size={13} color={theme.colors.action} />
        </Pressable>
      </View>
      {!user.emailVerified && <ErrorText message="Confirme seu e-mail para publicar no Votz." />}

      {isReport && <View style={{ gap: 4 }}>
        <Field bare accessibilityLabel="Título do relato" placeholder="O que precisa mudar?" value={title} onChangeText={setTitle} maxLength={120} editable={!publish.isPending} style={{ fontFamily: theme.fonts.heading, fontSize: 22, minHeight: 44 }} />
        <Text style={{ alignSelf: 'flex-end', fontSize: 11, color: title.length > 110 ? theme.colors.action : theme.colors.muted }}>{title.length}/120</Text>
      </View>}
      {isReport && <SimilarReportsCard title={title} description={content} enabled={!publish.isPending} />}

      <Field bare accessibilityLabel={isReport ? 'Descrição do relato' : 'Texto da publicação'} placeholder={isReport ? 'Conte onde e como o problema acontece…' : 'O que está acontecendo?'} value={content} onChangeText={setContent} multiline maxLength={2000} editable={!publish.isPending} style={{ fontSize: 18, lineHeight: 27, minHeight: 148, maxHeight: 240 }} />

      {isReport && <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Escolher categoria do relato" onPress={() => setCategorySheet(true)} disabled={publish.isPending} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: category ? theme.colors.soft : theme.colors.tint, borderWidth: category ? 0 : 1, borderColor: theme.colors.action }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: category ? theme.colors.primary : theme.colors.action }}>{category ? categories[category] : 'Escolher categoria (obrigatório)'}</Text>
          <ChevronDown size={14} color={theme.colors.muted} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: theme.colors.muted, fontSize: 13, flex: 1, paddingRight: 12 }}>Relatar anonimamente (seu nome não aparece publicamente)</Text>
          <Switch accessibilityLabel="Publicar relato anônimo" value={anonymous} onValueChange={setAnonymous} disabled={publish.isPending} trackColor={{ true: theme.colors.action }} />
        </View>
        <Text style={{ color: theme.colors.muted, fontSize: 11 }}>Título: mínimo de 10 caracteres · Descrição: mínimo de 30</Text>
        <RecipientPicker value={recipient} onChange={setRecipient} disabled={publish.isPending} />
      </View>}

      {poll && !isReport && <View style={{ borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary }}>Enquete · 24 horas</Text>
          <IconButton label="Remover enquete" onPress={() => setPoll(false)} disabled={publish.isPending}><X size={18} color={theme.colors.muted} /></IconButton>
        </View>
        <Field label="Pergunta (opcional)" value={question} onChangeText={setQuestion} maxLength={280} editable={!publish.isPending} />
        {options.map((option, index) => <Field key={index} label={`Opção ${index + 1}`} value={option} onChangeText={(value) => setOptions((current) => current.map((item, at) => at === index ? value : item))} maxLength={100} editable={!publish.isPending} />)}
        {options.length < 4 && <Button secondary title="Adicionar opção" disabled={publish.isPending} onPress={() => setOptions((current) => [...current, ''])} />}
      </View>}

      <MediaTiles items={media} disabled={publish.isPending} onRemove={(index) => setMedia((items) => items.filter((_, position) => position !== index))} />

      {details && (isReport
        ? <LocationPanel draft={location} onChange={setLocation} disabled={publish.isPending} />
        : <View style={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
            <View style={{ flex: 1 }}><Field label="Cidade" value={postCity} onChangeText={setPostCity} maxLength={100} editable={!publish.isPending} /></View>
            <View style={{ width: 70 }}><Field label="UF" value={postState} onChangeText={(value) => setPostState(value.toUpperCase())} autoCapitalize="characters" maxLength={2} editable={!publish.isPending} /></View>
          </View>)}

      <ErrorText message={pick.isError ? pick.error.message : publish.isError ? errorMessage(publish.error) : undefined} />
    </FormScroll>
    <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
      <IconButton label={isReport ? 'Adicionar fotos ou vídeos' : 'Adicionar fotos'} disabled={busy || full} onPress={() => pick.mutate('library')}><ImagePlus size={21} color={theme.colors.action} /></IconButton>
      <IconButton label={isReport ? 'Abrir câmera para foto ou vídeo' : 'Abrir câmera'} disabled={busy || full} onPress={() => pick.mutate('camera')}><Camera size={21} color={theme.colors.action} /></IconButton>
      {isReport && <IconButton label="Adicionar PDF" disabled={busy || full} onPress={() => pick.mutate('document')}><FileUp size={21} color={theme.colors.action} /></IconButton>}
      <IconButton label="Local do conteúdo" disabled={busy} onPress={() => setDetails(!details)}><MapPin size={21} color={details ? theme.colors.action : theme.colors.muted} /></IconButton>
      {!isReport && <IconButton label={poll ? 'Remover enquete' : 'Adicionar enquete'} disabled={busy} onPress={() => setPoll(!poll)}><ChartNoAxesColumn size={21} color={poll ? theme.colors.action : theme.colors.muted} /></IconButton>}
      <Text style={{ flex: 1, textAlign: 'right', color: theme.colors.muted, fontSize: 12, paddingRight: 6 }}>{media.length}/{mediaLimit} · {content.length}/2000</Text>
    </View>
    <ChoiceSheet visible={categorySheet} title="Categoria do relato" options={Object.entries(categories).map(([value, label]) => ({ value: value as Category, label }))} value={category} onChange={setCategory} onClose={() => setCategorySheet(false)} />
  </Screen>
}
