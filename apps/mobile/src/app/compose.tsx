import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { Redirect, router } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Category } from '@votz/shared-types'
import { Button, Card, ErrorText, Field, Heading, Label, styles } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useCreateContent } from '../hooks/use-content'
import { useSession } from '../lib/session'

const categories: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Moradia', ENVIRONMENT: 'Meio ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência social', OTHER: 'Outro',
}
export default function Compose() {
  const user = useSession((s) => s.user)
  const [kind, setKind] = useState<'posts' | 'reports'>('posts')
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>(Category.INFRASTRUCTURE)
  const [city, setCity] = useState(user?.city || '')
  const [state, setState] = useState(user?.state || '')
  const [anonymous, setAnonymous] = useState(false)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([])
  const create = useCreateContent()
  const media = useMutation({ mutationFn: async (camera: boolean) => {
    const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) throw new Error('Autorize o acesso nas configurações do celular para adicionar fotos.')
    const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75, allowsMultipleSelection: true, selectionLimit: Math.max(1, (kind === 'posts' ? 4 : 5) - photos.length) })
    if (!result.canceled) setPhotos((current) => [...current, ...result.assets].slice(0, kind === 'posts' ? 4 : 5))
  } })
  const location = useMutation({ mutationFn: async () => {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (permission.status !== 'granted') throw new Error('Você pode informar a cidade e o estado manualmente.')
    const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    setCoords({ latitude: result.coords.latitude, longitude: result.coords.longitude })
    const addresses = await Location.reverseGeocodeAsync(result.coords).catch(() => [])
    if (addresses[0]?.city) setCity(addresses[0].city)
    if (addresses[0]?.region && /^[A-Z]{2}$/.test(addresses[0].region)) setState(addresses[0].region)
  } })
  const publish = useMutation({ mutationFn: async () => {
    const urls: string[] = []
    for (const photo of photos) {
      const form = new FormData()
      form.append('file', { uri: photo.uri, name: photo.fileName || `votz-${Date.now()}.jpg`, type: photo.mimeType || 'image/jpeg' } as unknown as Blob)
      const uploaded = await api<{ url: string }>(`/storage/upload/${kind === 'posts' ? 'post-media' : 'report-media'}`, { method: 'POST', body: form })
      urls.push(uploaded.url)
    }
    return create.mutateAsync({ kind, body: {
      ...(kind === 'posts' ? { content: content.trim() } : { title: title.trim(), description: content.trim(), category, anonymous, ...coords }),
      ...(city.trim() ? { city: city.trim() } : {}), ...(state.trim() ? { state: state.trim().toUpperCase() } : {}),
      media: urls,
    } })
  }, onSuccess: (created) => { router.replace(kind === 'posts' ? { pathname: '/post/[id]', params: { id: created.id } } : { pathname: '/report/[id]', params: { id: created.id } }) } })
  if (!user) return <Redirect href="/login" />
  const valid = kind === 'posts' ? !!content.trim() || photos.length > 0 : title.trim().length >= 10 && content.trim().length >= 30
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Heading>O que você quer compartilhar?</Heading>
    <View style={styles.row}><Button title="Publicação" secondary={kind !== 'posts'} disabled={publish.isPending} onPress={() => { setKind('posts'); setPhotos((items) => items.slice(0, 4)) }} /><Button title="Relato" secondary={kind !== 'reports'} disabled={publish.isPending} onPress={() => setKind('reports')} /></View>
    {!user.emailVerified && <Card><Label>Confirme seu e-mail antes de publicar. Use o link enviado para sua caixa de entrada.</Label></Card>}
    {kind === 'reports' && <Field label="Título do problema" placeholder="Conte o problema em uma frase" value={title} onChangeText={setTitle} maxLength={120} editable={!publish.isPending} />}
    <Field label={kind === 'posts' ? 'Sua publicação' : 'Descreva o que está acontecendo'} placeholder={kind === 'posts' ? 'Compartilhe uma ideia com a comunidade…' : 'Dê detalhes que ajudem a entender e resolver o problema…'} value={content} onChangeText={setContent} multiline maxLength={2000} editable={!publish.isPending} />
    <Label muted>{content.length}/2000{kind === 'reports' ? ' · Mínimo de 30 caracteres na descrição e 10 no título' : ''}</Label>
    {kind === 'reports' && <><Label>Categoria</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{Object.entries(categories).map(([value, label]) => <Button key={value} title={label} secondary={category !== value} disabled={publish.isPending} onPress={() => setCategory(value as Category)} />)}</View><View style={[styles.row, { justifyContent: 'space-between' }]}><Label>Publicar relato anônimo</Label><Switch accessibilityLabel="Publicar relato anônimo" value={anonymous} onValueChange={setAnonymous} disabled={publish.isPending} /></View></>}
    <View style={styles.row}><View style={{ flex: 1 }}><Field label="Cidade" value={city} onChangeText={setCity} maxLength={100} editable={!publish.isPending} /></View><View style={{ width: 80 }}><Field label="UF" value={state} onChangeText={(value) => setState(value.toUpperCase())} autoCapitalize="characters" maxLength={2} editable={!publish.isPending} /></View></View>
    {kind === 'reports' && <><Button secondary title={coords ? 'Localização adicionada' : 'Usar minha localização'} loading={location.isPending} disabled={publish.isPending} onPress={() => location.mutate()} /><ErrorText message={location.isError ? location.error.message : undefined} /></>}
    <View style={styles.row}><Button secondary title="Adicionar fotos" loading={media.isPending} disabled={publish.isPending || photos.length >= (kind === 'posts' ? 4 : 5)} onPress={() => media.mutate(false)} /><Button secondary title="Câmera" disabled={publish.isPending || media.isPending || photos.length >= (kind === 'posts' ? 4 : 5)} onPress={() => media.mutate(true)} /></View>
    <ErrorText message={media.isError ? media.error.message : undefined} />
    {photos.map((photo, index) => <Card key={`${photo.uri}-${index}`}><Image source={photo.uri} style={{ height: 200, borderRadius: 12 }} contentFit="cover" /><Button secondary title={`Remover foto ${index + 1}`} disabled={publish.isPending} onPress={() => setPhotos((items) => items.filter((_, position) => position !== index))} /></Card>)}
    <ErrorText message={publish.isError ? errorMessage(publish.error) : undefined} />
    <Button title={kind === 'posts' ? 'Publicar' : 'Registrar relato'} loading={publish.isPending} disabled={!valid || !user.emailVerified || media.isPending || location.isPending || (!!state && !/^[A-Z]{2}$/.test(state))} onPress={() => publish.mutate()} />
  </ScrollView></KeyboardAvoidingView>
}
