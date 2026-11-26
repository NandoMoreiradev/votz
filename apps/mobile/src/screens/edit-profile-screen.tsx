import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import Camera from 'lucide-react-native/icons/camera'
import { Redirect, router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PROFILE_DEMOGRAPHICS_PURPOSE, USER_GENDERS, USER_GENDER_LABELS, type UserGender } from '@votz/shared-types'
import { Avatar, Button, ErrorText, Field, State } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import { ChoiceSheet } from '../components/choice-sheet'
import { birthDateError, birthDateFromIso, birthDateToIso, maskBirthDate } from '../lib/birth-date'
import { useDetail } from '../hooks/use-content'
import { ApiError, api, errorMessage, uploadFile } from '../lib/api'
import { mimeFromName } from '../lib/report-media'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { PublicProfile } from '../lib/types'

type ImageKind = 'cover' | 'photo'
/** Medidas pedidas ao cidadão (iguais às do web). O recorte do celular já abre na proporção certa. */
const IMAGE_SPEC = {
  cover: { aspect: [3, 1] as [number, number], upload: '/storage/upload/cover', field: 'coverUrl' },
  photo: { aspect: [1, 1] as [number, number], upload: '/storage/upload/avatar', field: 'avatarUrl' },
}
const IMAGE_MAX_BYTES = 5 * 1024 * 1024

export default function EditProfileScreen() {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const profile = useDetail<PublicProfile>('users', user?.id || '')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const initialized = useRef(false)
  const client = useQueryClient()
  useEffect(() => { if (profile.data && !initialized.current) { setName(profile.data.name || ''); setUsername(profile.data.username || ''); setBio(profile.data.bio || ''); initialized.current = true } }, [profile.data])
  // Data de nascimento e gênero: opcionais, nunca públicos (plano de anúncios, decisão 3). Vêm dos dados privados.
  const privateData = useQuery({ queryKey: ['users', 'me', 'private'], queryFn: () => api<{ birthDate: string | null; gender: UserGender | null }>('/users/me'), enabled: !!user })
  const savedBirthDate = birthDateFromIso(privateData.data?.birthDate)
  const savedGender = privateData.data?.gender ?? null
  const [birthDate, setBirthDate] = useState<string | null>(null)
  const [gender, setGender] = useState<UserGender | null | undefined>(undefined)
  const [genderSheet, setGenderSheet] = useState(false)
  const shownBirthDate = birthDate ?? savedBirthDate
  const shownGender = gender === undefined ? savedGender : gender
  const birthDateProblem = birthDateError(shownBirthDate)
  const save = useMutation({ mutationFn: () => api<PublicProfile>(`/users/${user!.id}`, { method: 'PATCH', body: JSON.stringify({
    name: name.trim(), ...(username.trim() ? { username: username.trim().replace(/^@/, '').toLowerCase() } : {}), bio: bio.trim(),
    // Vazio apaga (null); sem mudança, não envia.
    ...(birthDate !== null && birthDate !== savedBirthDate ? { birthDate: birthDateToIso(birthDate) } : {}),
    ...(gender !== undefined && gender !== savedGender ? { gender } : {}),
  }) }), onSuccess: async (updated) => {
    client.setQueryData(['users', user!.id], updated)
    await client.invalidateQueries({ queryKey: ['users', 'me', 'private'] })
    const current = useSession.getState().user
    if (current) useSession.setState({ user: { ...current, name: updated.name || current.name, username: updated.username, bio: updated.bio } })
    await client.invalidateQueries({ queryKey: ['posts'] })
    router.back()
  } })
  const pickImage = useMutation({
    mutationFn: async (kind: ImageKind) => {
      const spec = IMAGE_SPEC[kind]
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: spec.aspect, quality: 0.85 })
      if (result.canceled) return null
      const asset = result.assets[0]
      const mimeType = asset.mimeType || mimeFromName(asset.fileName || asset.uri) || ''
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new ApiError('Use uma imagem JPG, PNG ou WebP.', 400)
      if (typeof asset.fileSize === 'number' && asset.fileSize > IMAGE_MAX_BYTES) throw new ApiError('A imagem passa de 5 MB. Escolha uma menor.', 400)
      const uploaded = await uploadFile<{ url: string }>(spec.upload, { uri: asset.uri, mimeType })
      await api(`/users/${user!.id}`, { method: 'PATCH', body: JSON.stringify({ [spec.field]: uploaded.url }) })
      return { field: spec.field, url: uploaded.url }
    },
    onSuccess: (changed) => {
      if (!changed) return
      client.setQueryData<PublicProfile>(['users', user!.id], (old) => old && { ...old, [changed.field]: changed.url })
      if (changed.field === 'avatarUrl') {
        const current = useSession.getState().user
        if (current) useSession.setState({ user: { ...current, avatarUrl: changed.url } })
        void client.invalidateQueries({ queryKey: ['posts'] })
      }
    },
  })
  if (!user) return <Redirect href="/login" />
  const cleanUsername = username.replace(/^@/, '').toLowerCase()
  const valid = name.trim().length >= 2 && (cleanUsername ? /^[a-z0-9_]{3,30}$/.test(cleanUsername) : !profile.data?.username) && !birthDateProblem
  return <Screen><Toolbar title="Editar perfil" back right={<Button title="Salvar" loading={save.isPending} disabled={!profile.data || !valid} onPress={() => save.mutate()} />} />
    {!profile.data ? <State loading={profile.isPending} title={profile.isPending ? 'Carregando perfil…' : 'Não foi possível carregar'} retry={() => { void profile.refetch() }} /> : <FormScroll>
      <View>
        <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.badgeBg }}>
          {profile.data.coverUrl ? <Image source={profile.data.coverUrl} recyclingKey={profile.data.coverUrl} accessibilityLabel="Capa atual" style={{ width: '100%', aspectRatio: 3 }} contentFit="cover" /> : <View style={{ width: '100%', aspectRatio: 3 }} />}
          <Pressable accessibilityRole="button" accessibilityLabel="Alterar capa" disabled={pickImage.isPending} onPress={() => pickImage.mutate('cover')} style={{ position: 'absolute', right: 8, top: 8, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0D0D0D99', opacity: pickImage.isPending ? 0.5 : 1 }}><Camera size={15} color="#FFFFFF" /><Text style={{ color: '#FFFFFF', fontFamily: theme.fonts.medium, fontSize: 13 }}>{pickImage.isPending && pickImage.variables === 'cover' ? 'Enviando…' : 'Alterar capa'}</Text></Pressable>
        </View>
        <View style={{ alignItems: 'center', marginTop: -38, gap: 8 }}>
          <View style={{ borderWidth: 4, borderColor: colors.background, borderRadius: 44, backgroundColor: colors.background }}><Avatar name={name || user.name} uri={profile.data.avatarUrl} size={76} /></View>
          <Button secondary title={pickImage.isPending && pickImage.variables === 'photo' ? 'Enviando…' : 'Alterar foto'} disabled={pickImage.isPending} onPress={() => pickImage.mutate('photo')} />
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Capa: 1500 × 500 px (bem larga, 3:1). Foto: 400 × 400 px (quadrada). JPG, PNG ou WebP, até 5 MB. O celular abre o recorte para você ajustar.</Text>
      <ErrorText message={pickImage.isError ? errorMessage(pickImage.error) : undefined} />
      <Field label="Nome" value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!save.isPending} />
      <Field label="Nome de usuário" value={username} onChangeText={setUsername} placeholder="seu_nome" autoCapitalize="none" autoCorrect={false} maxLength={30} editable={!save.isPending} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>De 3 a 30 caracteres: letras, números e sublinhado.</Text>
      <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Como você participa da sua comunidade?" multiline maxLength={300} editable={!save.isPending} />
      <Text style={{ textAlign: 'right', color: colors.muted, fontSize: 12 }}>{bio.length}/300</Text>
      <View style={{ gap: 10, paddingTop: 6 }}>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>Sobre você</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>{PROFILE_DEMOGRAPHICS_PURPOSE}</Text>
        <Field label="Data de nascimento (opcional)" value={shownBirthDate} onChangeText={(value) => setBirthDate(maskBirthDate(value))} placeholder="DD/MM/AAAA" keyboardType="number-pad" maxLength={10} editable={!save.isPending && !privateData.isPending} accessibilityHint="Opcional. Não aparece no seu perfil." />
        <ErrorText message={birthDateProblem ?? undefined} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Gênero (opcional): ${shownGender ? USER_GENDER_LABELS[shownGender] : 'não informado'}`} disabled={save.isPending || privateData.isPending} onPress={() => setGenderSheet(true)} style={{ minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Gênero (opcional)</Text>
          <Text style={{ color: colors.primary, fontSize: 15 }}>{shownGender ? USER_GENDER_LABELS[shownGender] : 'Não informar'}</Text>
        </Pressable>
        {!!shownGender && <Button secondary title="Não informar gênero" disabled={save.isPending} onPress={() => setGender(null)} />}
      </View>
      <ErrorText message={save.isError ? errorMessage(save.error) : undefined} />
    </FormScroll>}
    <ChoiceSheet visible={genderSheet} title="Gênero" options={USER_GENDERS.map((value) => ({ value, label: USER_GENDER_LABELS[value] }))} value={shownGender} onChange={(value) => setGender(value)} onClose={() => setGenderSheet(false)} />
  </Screen>
}
