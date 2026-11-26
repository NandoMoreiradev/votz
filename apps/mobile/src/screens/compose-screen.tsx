import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Category, DEFAULT_MEDIA_FORMAT, MEDIA_FORMATS, nearestMediaFormat, type MediaAssetKind, type MediaFormat } from '@votz/shared-types'
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
import { errorMessage, UploadError } from '../lib/api'
import { uploadReportMedia } from '../lib/report-upload'
import { discardPostMedia, uploadPostMedia } from '../lib/post-media'
import { CroppedPreview, INITIAL_VIEW, MediaCropSheet, cropOf, type CropView } from '../components/media-crop-sheet'
import { useCreateContent } from '../hooks/use-content'
import { useSession } from '../lib/session'
import { buildLocationPayload, emptyLocation, locationError, type LocationDraft } from '../lib/report-location'
import { POST_MEDIA_LIMIT, REPORT_MEDIA_LIMIT, mediaSlots, prepareMedia, type MediaItem } from '../lib/report-media'
import type { Recipient, RecipientKind } from '../lib/types'
import { useAppTheme } from '../theme-context'

const categories: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Moradia', ENVIRONMENT: 'Meio ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência social', OTHER: 'Outro',
}
const RECIPIENT_KINDS: readonly string[] = ['ENTITY', 'POLITICIAN', 'COMPANY']

/** Cronômetro para o registro de envio que falhou (fora do componente: só roda dentro do envio). */
function startTimer() {
  const started = Date.now()
  return () => Date.now() - started
}

/**
 * Arquivo de publicação no padrão de formatos: sobe assim que é escolhido (o servidor tira os metadados e devolve
 * o tamanho real); o enquadramento escolhido no editor vai junto ao publicar.
 */
interface PostAsset {
  status: 'uploading' | 'ready' | 'error'
  kind: MediaAssetKind
  width: number
  height: number
  view: CropView
  assetId?: string
  error?: string
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Destinatário vindo de um perfil (/compose?recipientType=…): ignora qualquer valor fora do padrão. */
function recipientFromParams(params: { recipientType?: string; recipientId?: string; recipientName?: string }): Recipient | null {
  const { recipientType, recipientId, recipientName } = params
  if (!recipientType || !recipientId || !recipientName || !RECIPIENT_KINDS.includes(recipientType) || !UUID.test(recipientId)) return null
  return { type: recipientType as RecipientKind, id: recipientId, name: recipientName.slice(0, 160) }
}

export default function ComposeScreen() {
  const { colors, theme } = useAppTheme()
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
  // Publicação: formato do conjunto, estado de cada envio (por uri) e o editor de enquadramento.
  const [format, setFormat] = useState<MediaFormat>(DEFAULT_MEDIA_FORMAT)
  const [assets, setAssets] = useState<Record<string, PostAsset>>({})
  const [cropSheet, setCropSheet] = useState({ open: false, start: 0 })
  const uploads = useRef(new Map<string, Promise<void>>())
  const published = useRef(false)
  // Cópia do estado para a publicação e a limpeza ao sair (lidas fora da renderização).
  const assetsRef = useRef(assets)
  useEffect(() => { assetsRef.current = assets }, [assets])
  const patchAsset = (uri: string, patch: Partial<PostAsset>) =>
    setAssets((current) => (current[uri] ? { ...current, [uri]: { ...current[uri], ...patch } } : current))
  // Saiu sem publicar: apaga no servidor o que foi enviado.
  useEffect(() => () => {
    if (published.current) return
    for (const asset of Object.values(assetsRef.current)) if (asset.assetId) discardPostMedia(asset.assetId)
  }, [])

  /** Sobe os arquivos escolhidos para a publicação (em paralelo) e abre o editor de enquadramento. */
  const startPostUploads = (items: MediaItem[], sizes: Map<string, { width: number; height: number }>, firstOfPost: boolean) => {
    const fresh: Record<string, PostAsset> = {}
    for (const item of items) {
      const size = sizes.get(item.uri) ?? { width: 1, height: 1 }
      fresh[item.uri] = { status: 'uploading', kind: item.mimeType === 'image/gif' ? 'GIF' : item.kind === 'video' ? 'VIDEO' : 'IMAGE', ...size, view: INITIAL_VIEW }
    }
    setAssets((current) => ({ ...current, ...fresh }))
    if (firstOfPost && items[0]) {
      const size = sizes.get(items[0].uri)
      setFormat(nearestMediaFormat(size?.width, size?.height) ?? DEFAULT_MEDIA_FORMAT)
    }
    for (const item of items) {
      const task = uploadPostMedia(item)
        // O tamanho que vale é o do servidor (o recorte é calculado sobre ele).
        .then((asset) => patchAsset(item.uri, { status: 'ready', assetId: asset.id, kind: asset.kind, width: asset.width, height: asset.height }))
        .catch((error: unknown) => patchAsset(item.uri, { status: 'error', error: errorMessage(error) }))
      uploads.current.set(item.uri, task)
    }
  }

  const removeMedia = (index: number) => {
    const removed = media[index]
    setMedia((items) => items.filter((_, position) => position !== index))
    if (!removed) return
    const asset = assets[removed.uri]
    if (asset?.assetId) discardPostMedia(asset.assetId)
    uploads.current.delete(removed.uri)
    setAssets((current) => { const next = { ...current }; delete next[removed.uri]; return next })
  }

  const pick = useMutation({
    mutationFn: async (source: 'camera' | 'library' | 'document') => {
      const slots = mediaSlots(mediaLimit, media.length)
      if (!slots) return
      const raw: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null; type?: string | null; width?: number; height?: number }[] = []
      if (source === 'document') {
        const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false })
        if (!result.canceled) raw.push(...result.assets.map((asset) => ({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size })))
      } else {
        if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Autorize a câmera nas configurações do celular para tirar uma foto ou gravar um vídeo.')
        const result = source === 'camera'
          ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.75, videoMaxDuration: 60 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.75, allowsMultipleSelection: true, selectionLimit: slots })
        if (!result.canceled) raw.push(...result.assets.map((asset) => ({ uri: asset.uri, name: asset.fileName, mimeType: asset.mimeType, size: asset.fileSize, type: asset.type, width: asset.width, height: asset.height })))
      }
      const accepted: MediaItem[] = []
      const sizes = new Map<string, { width: number; height: number }>()
      let refusal: string | undefined
      for (const asset of raw.slice(0, slots)) {
        const prepared = prepareMedia(asset)
        if ('item' in prepared) {
          accepted.push(prepared.item)
          if (asset.width && asset.height) sizes.set(asset.uri, { width: asset.width, height: asset.height })
        } else refusal ??= prepared.error
      }
      if (accepted.length) {
        const firstOfPost = media.length === 0
        setMedia((current) => [...current, ...accepted].slice(0, mediaLimit))
        if (!isReport) {
          startPostUploads(accepted, sizes, firstOfPost)
          setCropSheet({ open: true, start: media.length })
        }
      }
      if (refusal) throw new Error(refusal)
    },
  })

  const publish = useMutation({
    mutationFn: async () => {
      if (!isReport) {
        // Publicação: espera os envios em andamento e manda o formato e o enquadramento de cada arquivo.
        await Promise.all(media.map((item) => uploads.current.get(item.uri)))
        const current = assetsRef.current
        const failed = media.find((item) => current[item.uri]?.status !== 'ready')
        if (failed) throw new Error(current[failed.uri]?.error ?? 'Um dos arquivos não foi enviado. Remova-o e tente de novo.')
        const body = {
          content: content.trim(),
          ...(poll ? { poll: { question: question.trim() || undefined, options: options.map((option) => option.trim()), durationHours: 24 } } : {}),
          ...(postCity.trim() ? { city: postCity.trim() } : {}), ...(postState.trim() ? { state: postState.trim().toUpperCase() } : {}),
          ...(media.length ? { mediaAssets: media.map((item) => { const asset = current[item.uri]!; return { id: asset.assetId!, format, crop: cropOf(asset, format) } }) } : {}),
        }
        const created = await create.mutateAsync({ kind, body })
        published.current = true
        return created
      }
      const urls: string[] = []
      for (const item of media) {
        let url = uploadedUrls.current.get(item.uri)
        if (!url) {
          const label = item.kind === 'video' ? 'o vídeo' : item.kind === 'pdf' ? 'o PDF' : 'a foto'
          const elapsed = startTimer()
          let uploaded: { url: string }
          try {
            uploaded = await uploadReportMedia(item)
          } catch (error) {
            console.warn('[envio] falhou', JSON.stringify({ tipo: item.kind, arquivo: item.name, mime: item.mimeType, bytes: item.size, uri: item.uri.slice(0, 60), ms: elapsed(), erro: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }))
            throw new UploadError(label, error)
          }
          url = uploaded.url
          uploadedUrls.current.set(item.uri, url)
        }
        urls.push(url)
      }
      const body = {
        title: title.trim(), description: content.trim(), category, anonymous,
        ...(recipient ? { recipientType: recipient.type, recipientId: recipient.id } : {}),
        ...buildLocationPayload(location), media: urls,
      }
      return create.mutateAsync({ kind, body })
    },
    onError: (error) => console.warn('[relato] falhou ao registrar', JSON.stringify({ tipo: kind, midias: media.length, erro: error instanceof Error ? `${error.name}: ${error.message}` : String(error) })),
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
    uploadedUrls.current.clear()
    // Publicação e relato usam envios diferentes (publicação: formato e enquadramento; relato: prova inteira).
    // Ao trocar, os arquivos ficam na lista e sobem de novo pelo caminho certo.
    for (const asset of Object.values(assets)) if (asset.assetId) discardPostMedia(asset.assetId)
    uploads.current.clear()
    setAssets({})
    if (next === 'posts') {
      // Publicação aceita foto e vídeo (até 4); relato aceita também PDF (até 5).
      const kept = media.filter((item) => item.kind !== 'pdf').slice(0, POST_MEDIA_LIMIT)
      setMedia(kept)
      if (kept.length) startPostUploads(kept, new Map(), true)
    }
  }

  return <Screen>
    <Toolbar title={isReport ? 'Novo relato' : 'Nova publicação'}
      left={<IconButton label="Cancelar publicação" onPress={() => router.back()} disabled={publish.isPending}><X size={23} color={colors.primary} /></IconButton>}
      right={<Button title={isReport ? 'Registrar' : 'Publicar'} loading={publish.isPending} disabled={!valid || !user.emailVerified || busy || postStateInvalid} onPress={() => publish.mutate()} />} />
    <FormScroll contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={anonymous && isReport ? 'Anônimo' : user.name} uri={anonymous && isReport ? null : user.avatarUrl} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary, fontSize: 14 }}>{anonymous && isReport ? 'Relato anônimo' : user.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Público · Comunidade Votz</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Alternar publicação e relato" disabled={publish.isPending} onPress={switchKind} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 18, padding: 8 }}>
          <Text style={{ fontSize: 12, color: colors.action, fontFamily: theme.fonts.medium }}>{isReport ? 'Relato' : 'Publicação'}</Text>
          <ChevronDown size={13} color={colors.action} />
        </Pressable>
      </View>
      {!user.emailVerified && <ErrorText message="Confirme seu e-mail para publicar no Votz." />}

      {isReport && <View style={{ gap: 4 }}>
        <Field bare accessibilityLabel="Título do relato" placeholder="O que precisa mudar?" value={title} onChangeText={setTitle} maxLength={120} editable={!publish.isPending} style={{ fontFamily: theme.fonts.heading, fontSize: 22, minHeight: 44 }} />
        <Text style={{ alignSelf: 'flex-end', fontSize: 11, color: title.length > 110 ? colors.action : colors.muted }}>{title.length}/120</Text>
      </View>}
      {isReport && (
        <SimilarReportsCard
          title={title}
          description={content}
          enabled={!publish.isPending}
          category={category || undefined}
          city={location.city.trim() || undefined}
          state={location.state.trim().toUpperCase() || undefined}
        />
      )}

      <Field bare accessibilityLabel={isReport ? 'Descrição do relato' : 'Texto da publicação'} placeholder={isReport ? 'Conte onde e como o problema acontece…' : 'O que está acontecendo?'} value={content} onChangeText={setContent} multiline maxLength={2000} editable={!publish.isPending} style={{ fontSize: 18, lineHeight: 27, minHeight: 148, maxHeight: 240 }} />

      {isReport && <View style={{ gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Escolher categoria do relato" onPress={() => setCategorySheet(true)} disabled={publish.isPending} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: category ? colors.soft : colors.tint, borderWidth: category ? 0.5 : 1, borderColor: category ? colors.border : colors.action }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: category ? colors.primary : colors.action }}>{category ? categories[category] : 'Escolher categoria (obrigatório)'}</Text>
          <ChevronDown size={14} color={colors.muted} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1, paddingRight: 12 }}>Relatar anonimamente (seu nome não aparece publicamente)</Text>
          <Switch accessibilityLabel="Publicar relato anônimo" value={anonymous} onValueChange={setAnonymous} disabled={publish.isPending} trackColor={{ false: colors.border, true: colors.action }} />
        </View>
        <Text style={{ color: colors.muted, fontSize: 11 }}>Título: mínimo de 10 caracteres · Descrição: mínimo de 30</Text>
        <RecipientPicker value={recipient} onChange={setRecipient} disabled={publish.isPending} />
      </View>}

      {poll && !isReport && <View style={{ borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 12, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary }}>Enquete · 24 horas</Text>
          <IconButton label="Remover enquete" onPress={() => setPoll(false)} disabled={publish.isPending}><X size={18} color={colors.muted} /></IconButton>
        </View>
        <Field label="Pergunta (opcional)" value={question} onChangeText={setQuestion} maxLength={280} editable={!publish.isPending} />
        {options.map((option, index) => <Field key={index} label={`Opção ${index + 1}`} value={option} onChangeText={(value) => setOptions((current) => current.map((item, at) => at === index ? value : item))} maxLength={100} editable={!publish.isPending} />)}
        {options.length < 4 && <Button secondary title="Adicionar opção" disabled={publish.isPending} onPress={() => setOptions((current) => [...current, ''])} />}
      </View>}

      {isReport
        ? <MediaTiles items={media} disabled={publish.isPending} onRemove={(index) => setMedia((items) => items.filter((_, position) => position !== index))} />
        : media.length > 0 && <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {media.map((item, index) => {
                const asset = assets[item.uri]
                return <View key={`${item.uri}-${index}`} style={{ width: '48%', aspectRatio: MEDIA_FORMATS[format].ratio, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.badgeBg }}>
                  {asset && <CroppedPreview item={{ uri: item.uri, kind: asset.kind, width: asset.width, height: asset.height, view: asset.view }} format={format} />}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Ajustar enquadramento do item ${index + 1}`} disabled={publish.isPending} onPress={() => setCropSheet({ open: true, start: index })} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
                  {asset?.status === 'uploading' && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10, 12, 16, 0.55)' }}><ActivityIndicator color={colors.onAccent} /></View>}
                  {asset?.status === 'error' && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, backgroundColor: colors.action }}><Text style={{ color: colors.onAccent, fontSize: 11, fontFamily: theme.fonts.medium }}>Não enviou. Remova e tente de novo.</Text></View>}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remover arquivo ${index + 1}`} disabled={publish.isPending} onPress={() => removeMedia(index)} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.badgeBg, alignItems: 'center', justifyContent: 'center' }}><X color={colors.onAccent} size={16} /></Pressable>
                </View>
              })}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Mudar formato e enquadramento" disabled={publish.isPending} onPress={() => setCropSheet({ open: true, start: 0 })} style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 0.5, borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text style={{ fontSize: 12, color: colors.primary }}>Formato: <Text style={{ fontFamily: theme.fonts.medium }}>{MEDIA_FORMATS[format].label} ({MEDIA_FORMATS[format].ratioLabel})</Text> · Ajustar</Text>
            </Pressable>
          </View>}

      {!isReport && <MediaCropSheet
        visible={cropSheet.open}
        items={media.flatMap((item) => { const asset = assets[item.uri]; return asset ? [{ key: item.uri, uri: item.uri, kind: asset.kind, width: asset.width, height: asset.height, view: asset.view }] : [] })}
        format={format}
        startIndex={cropSheet.start}
        onFormatChange={setFormat}
        onViewChange={(uri, view) => patchAsset(uri, { view })}
        onClose={() => setCropSheet((current) => ({ ...current, open: false }))}
      />}

      {details && (isReport
        ? <LocationPanel draft={location} onChange={setLocation} disabled={publish.isPending} />
        : <View style={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
            <View style={{ flex: 1 }}><Field label="Cidade" value={postCity} onChangeText={setPostCity} maxLength={100} editable={!publish.isPending} /></View>
            <View style={{ width: 70 }}><Field label="UF" value={postState} onChangeText={(value) => setPostState(value.toUpperCase())} autoCapitalize="characters" maxLength={2} editable={!publish.isPending} /></View>
          </View>)}

      <ErrorText message={pick.isError ? pick.error.message : publish.isError ? errorMessage(publish.error) : undefined} />
    </FormScroll>
    <View style={{ borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
      <IconButton label="Adicionar fotos ou vídeos" disabled={busy || full} onPress={() => pick.mutate('library')}><ImagePlus size={21} color={colors.action} /></IconButton>
      <IconButton label="Abrir câmera para foto ou vídeo" disabled={busy || full} onPress={() => pick.mutate('camera')}><Camera size={21} color={colors.action} /></IconButton>
      {isReport && <IconButton label="Adicionar PDF" disabled={busy || full} onPress={() => pick.mutate('document')}><FileUp size={21} color={colors.action} /></IconButton>}
      <IconButton label="Local do conteúdo" disabled={busy} onPress={() => setDetails(!details)}><MapPin size={21} color={details ? colors.action : colors.muted} /></IconButton>
      {!isReport && <IconButton label={poll ? 'Remover enquete' : 'Adicionar enquete'} disabled={busy} onPress={() => setPoll(!poll)}><ChartNoAxesColumn size={21} color={poll ? colors.action : colors.muted} /></IconButton>}
      <Text style={{ flex: 1, textAlign: 'right', color: colors.muted, fontSize: 12, paddingRight: 6 }}>{media.length}/{mediaLimit} · {content.length}/2000</Text>
    </View>
    <ChoiceSheet visible={categorySheet} title="Categoria do relato" options={Object.entries(categories).map(([value, label]) => ({ value: value as Category, label }))} value={category} onChange={setCategory} onClose={() => setCategorySheet(false)} />
  </Screen>
}
