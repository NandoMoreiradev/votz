import { useEffect, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, ErrorText, Field, State } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import { useDetail } from '../hooks/use-content'
import { api, errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import type { PublicProfile } from '../lib/types'
import { theme } from '../theme'

export default function EditProfileScreen() {
  const user = useSession((s) => s.user)
  const profile = useDetail<PublicProfile>('users', user?.id || '')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const initialized = useRef(false)
  const client = useQueryClient()
  useEffect(() => { if (profile.data && !initialized.current) { setName(profile.data.name || ''); setUsername(profile.data.username || ''); setBio(profile.data.bio || ''); initialized.current = true } }, [profile.data])
  const save = useMutation({ mutationFn: () => api<PublicProfile>(`/users/${user!.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim(), ...(username.trim() ? { username: username.trim().replace(/^@/, '').toLowerCase() } : {}), bio: bio.trim() }) }), onSuccess: async (updated) => {
    client.setQueryData(['users', user!.id], updated)
    const current = useSession.getState().user
    if (current) useSession.setState({ user: { ...current, name: updated.name || current.name, username: updated.username, bio: updated.bio } })
    await client.invalidateQueries({ queryKey: ['posts'] })
    router.back()
  } })
  if (!user) return <Redirect href="/login" />
  const cleanUsername = username.replace(/^@/, '').toLowerCase()
  const valid = name.trim().length >= 2 && (cleanUsername ? /^[a-z0-9_]{3,30}$/.test(cleanUsername) : !profile.data?.username)
  return <Screen><Toolbar title="Editar perfil" back right={<Button title="Salvar" loading={save.isPending} disabled={!profile.data || !valid} onPress={() => save.mutate()} />} />
    {!profile.data ? <State loading={profile.isPending} title={profile.isPending ? 'Carregando perfil…' : 'Não foi possível carregar'} retry={() => { void profile.refetch() }} /> : <FormScroll>
      <View style={{ alignItems: 'center', paddingVertical: 12 }}><Avatar name={name || user.name} uri={profile.data.avatarUrl} size={76} /></View>
      <Field label="Nome" value={name} onChangeText={setName} maxLength={80} autoComplete="name" editable={!save.isPending} />
      <Field label="Nome de usuário" value={username} onChangeText={setUsername} placeholder="seu_nome" autoCapitalize="none" autoCorrect={false} maxLength={30} editable={!save.isPending} />
      <Text style={{ color: theme.colors.muted, fontSize: 12 }}>De 3 a 30 caracteres: letras, números e sublinhado.</Text>
      <Field label="Bio" value={bio} onChangeText={setBio} placeholder="Como você participa da sua comunidade?" multiline maxLength={300} editable={!save.isPending} />
      <Text style={{ textAlign: 'right', color: theme.colors.muted, fontSize: 12 }}>{bio.length}/300</Text>
      <ErrorText message={save.isError ? errorMessage(save.error) : undefined} />
    </FormScroll>}
  </Screen>
}
