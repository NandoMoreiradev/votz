import { useRef, useState } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Category } from '@votz/shared-types'
import X from 'lucide-react-native/icons/x'
import ImagePlus from 'lucide-react-native/icons/image-plus'
import Camera from 'lucide-react-native/icons/camera'
import MapPin from 'lucide-react-native/icons/map-pin'
import ChartNoAxesColumn from 'lucide-react-native/icons/chart-no-axes-column'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import { Avatar, Button, ErrorText, Field, IconButton } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import { ChoiceSheet } from '../components/choice-sheet'
import { api, errorMessage } from '../lib/api'
import { useCreateContent } from '../hooks/use-content'
import { useSession } from '../lib/session'
import { theme } from '../theme'

const categories: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Moradia', ENVIRONMENT: 'Meio ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência social', OTHER: 'Outro',
}
export default function ComposeScreen() {
  const user = useSession((s) => s.user)
  const params = useLocalSearchParams<{ kind?: string }>()
  const [kind, setKind] = useState<'posts' | 'reports'>(params.kind === 'reports' ? 'reports' : 'posts')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>(Category.INFRASTRUCTURE)
  const [categorySheet, setCategorySheet] = useState(false)
  const [city, setCity] = useState(user?.city || '')
  const [state, setState] = useState(user?.state || '')
  const [details, setDetails] = useState(false)
  const [anonymous, setAnonymous] = useState(false)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([])
  const [poll, setPoll] = useState(false)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const uploadedUrls = useRef(new Map<string, string>())
  const create = useCreateContent()
  const media = useMutation({ mutationFn: async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Autorize a câmera nas configurações do celular para tirar uma foto.')
    const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, allowsMultipleSelection: true, selectionLimit: Math.max(1, (kind === 'posts' ? 4 : 5) - photos.length) })
    if (!result.canceled) setPhotos((current) => [...current, ...result.assets].slice(0, kind === 'posts' ? 4 : 5))
  } })
  const location = useMutation({ mutationFn: async () => {
    if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('Você também pode informar a cidade e o estado manualmente.')
    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    setCoords({ latitude: result.coords.latitude, longitude: result.coords.longitude })
    const addresses = await Location.reverseGeocodeAsync(result.coords).catch(() => [])
    if (addresses[0]?.city) setCity(addresses[0].city)
    if (addresses[0]?.region && /^[A-Z]{2}$/.test(addresses[0].region)) setState(addresses[0].region)
  } })
  const publish = useMutation({ mutationFn: async () => {
    const urls: string[] = []
    for (const photo of photos) {
      let url = uploadedUrls.current.get(photo.uri)
      if (!url) {
        const form = new FormData()
        form.append('file', { uri: photo.uri, name: photo.fileName || `votz-${Date.now()}.jpg`, type: photo.mimeType || 'image/jpeg' } as unknown as Blob)
        const uploaded = await api<{ url: string }>(`/storage/upload/${kind === 'posts' ? 'post-media' : 'report-media'}`, { method: 'POST', body: form })
        url = uploaded.url
        uploadedUrls.current.set(photo.uri, url)
      }
      urls.push(url)
    }
    return create.mutateAsync({ kind, body: {
      ...(kind === 'posts' ? { content: content.trim(), ...(poll ? { poll: { question: question.trim() || undefined, options: options.map((option) => option.trim()), durationHours: 24 } } : {}) } : { title: title.trim(), description: content.trim(), category, anonymous, ...coords }),
      ...(city.trim() ? { city: city.trim() } : {}), ...(state.trim() ? { state: state.trim().toUpperCase() } : {}), media: urls,
    } })
  }, onSuccess: (created) => router.replace(kind === 'posts' ? { pathname: '/post/[id]', params: { id: created.id } } : { pathname: '/report/[id]', params: { id: created.id } }) })
  if (!user) return <Redirect href="/login" />
  const pollValid = !poll || options.every((option) => !!option.trim())
  const valid = kind === 'posts' ? (!!content.trim() || photos.length > 0 || poll) && pollValid : title.trim().length >= 10 && content.trim().length >= 30
  const busy = publish.isPending || media.isPending || location.isPending
  return <Screen>
    <Toolbar title={kind === 'posts' ? 'Nova publicação' : 'Novo relato'} left={<IconButton label="Cancelar publicação" onPress={() => router.back()} disabled={publish.isPending}><X size={23} color={theme.colors.primary} /></IconButton>} right={<Button title={kind === 'posts' ? 'Publicar' : 'Registrar'} loading={publish.isPending} disabled={!valid || !user.emailVerified || busy || (!!state && !/^[A-Z]{2}$/.test(state))} onPress={() => publish.mutate()} />} />
    <FormScroll contentContainerStyle={{ paddingTop: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Avatar name={anonymous && kind === 'reports' ? 'Anônimo' : user.name} uri={anonymous && kind === 'reports' ? null : user.avatarUrl} size={38} /><View style={{ flex: 1 }}><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary, fontSize: 14 }}>{anonymous && kind === 'reports' ? 'Relato anônimo' : user.name}</Text><Text style={{ color: theme.colors.muted, fontSize: 11, marginTop: 2 }}>Público · Comunidade Votz</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Alternar publicação e relato" disabled={publish.isPending} onPress={() => { setKind(kind === 'posts' ? 'reports' : 'posts'); setPhotos((items) => items.slice(0, 4)); uploadedUrls.current.clear() }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 18, padding: 8 }}><Text style={{ fontSize: 12, color: theme.colors.action, fontFamily: theme.fonts.medium }}>{kind === 'posts' ? 'Publicação' : 'Relato'}</Text><ChevronDown size={13} color={theme.colors.action} /></Pressable></View>
      {!user.emailVerified && <ErrorText message="Confirme seu e-mail para publicar no Votz." />}
      {kind === 'reports' && <Field bare accessibilityLabel="Título do relato" placeholder="O que precisa mudar?" value={title} onChangeText={setTitle} maxLength={120} editable={!publish.isPending} style={{ fontFamily: theme.fonts.heading, fontSize: 22, minHeight: 44 }} />}
      <Field bare accessibilityLabel={kind === 'posts' ? 'Texto da publicação' : 'Descrição do relato'} placeholder={kind === 'posts' ? 'O que está acontecendo?' : 'Conte onde e como o problema acontece…'} value={content} onChangeText={setContent} multiline maxLength={2000} editable={!publish.isPending} style={{ fontSize: 18, lineHeight: 27, minHeight: 148, maxHeight: 240 }} />
      {kind === 'reports' && <View style={{ gap: 12 }}><Pressable accessibilityRole="button" accessibilityLabel="Escolher categoria do relato" onPress={() => setCategorySheet(true)} disabled={publish.isPending} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: theme.colors.soft }}><Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.primary }}>{categories[category]}</Text><ChevronDown size={14} color={theme.colors.muted} /></Pressable><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: theme.colors.muted, fontSize: 13 }}>Ocultar minha identidade</Text><Switch accessibilityLabel="Publicar relato anônimo" value={anonymous} onValueChange={setAnonymous} disabled={publish.isPending} trackColor={{ true: theme.colors.action }} /></View><Text style={{ color: theme.colors.muted, fontSize: 11 }}>Título: mínimo de 10 caracteres · Descrição: mínimo de 30</Text></View>}
      {poll && kind === 'posts' && <View style={{ borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, gap: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary }}>Enquete · 24 horas</Text><IconButton label="Remover enquete" onPress={() => setPoll(false)} disabled={publish.isPending}><X size={18} color={theme.colors.muted} /></IconButton></View><Field label="Pergunta (opcional)" value={question} onChangeText={setQuestion} maxLength={280} editable={!publish.isPending} />{options.map((option, index) => <Field key={index} label={`Opção ${index + 1}`} value={option} onChangeText={(value) => setOptions((current) => current.map((item, at) => at === index ? value : item))} maxLength={100} editable={!publish.isPending} />)}{options.length < 4 && <Button secondary title="Adicionar opção" disabled={publish.isPending} onPress={() => setOptions((current) => [...current, ''])} />}</View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{photos.map((photo, index) => <View key={`${photo.uri}-${index}`} style={{ width: '48%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' }}><Image source={photo.uri} style={{ flex: 1 }} contentFit="cover" /><Pressable accessibilityRole="button" accessibilityLabel={`Remover foto ${index + 1}`} disabled={publish.isPending} onPress={() => setPhotos((items) => items.filter((_, position) => position !== index))} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}><X color={theme.colors.surface} size={16} /></Pressable></View>)}</View>
      {details && <View style={{ gap: 12, paddingTop: 4 }}><View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Field label="Cidade" value={city} onChangeText={setCity} maxLength={100} editable={!publish.isPending} /></View><View style={{ width: 70 }}><Field label="UF" value={state} onChangeText={(value) => setState(value.toUpperCase())} autoCapitalize="characters" maxLength={2} editable={!publish.isPending} /></View></View>{kind === 'reports' && <Button secondary title={coords ? 'Localização adicionada' : 'Usar minha localização'} loading={location.isPending} disabled={publish.isPending} onPress={() => location.mutate()} />}</View>}
      <ErrorText message={media.isError ? media.error.message : location.isError ? location.error.message : publish.isError ? errorMessage(publish.error) : undefined} />
    </FormScroll>
    <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border, paddingHorizontal: 12, paddingVertical: 4, flexDirection: 'row', alignItems: 'center' }}>
      <IconButton label="Adicionar fotos" disabled={busy || photos.length >= (kind === 'posts' ? 4 : 5)} onPress={() => media.mutate(false)}><ImagePlus size={21} color={theme.colors.action} /></IconButton><IconButton label="Abrir câmera" disabled={busy || photos.length >= (kind === 'posts' ? 4 : 5)} onPress={() => media.mutate(true)}><Camera size={21} color={theme.colors.action} /></IconButton><IconButton label="Local do conteúdo" disabled={busy} onPress={() => setDetails(!details)}><MapPin size={21} color={details ? theme.colors.action : theme.colors.muted} /></IconButton>{kind === 'posts' && <IconButton label={poll ? 'Remover enquete' : 'Adicionar enquete'} disabled={busy} onPress={() => setPoll(!poll)}><ChartNoAxesColumn size={21} color={poll ? theme.colors.action : theme.colors.muted} /></IconButton>}<Text style={{ flex: 1, textAlign: 'right', color: theme.colors.muted, fontSize: 12, paddingRight: 6 }}>{content.length}/2000</Text>
    </View>
    <ChoiceSheet visible={categorySheet} title="Categoria do relato" options={Object.entries(categories).map(([value, label]) => ({ value: value as Category, label }))} value={category} onChange={setCategory} onClose={() => setCategorySheet(false)} />
  </Screen>
}
