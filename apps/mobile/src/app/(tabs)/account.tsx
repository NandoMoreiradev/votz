import { Alert, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Avatar, Button, Card, ErrorText, Heading, Label, styles } from '../../components/ui'
import { errorMessage } from '../../lib/api'
import { useSession } from '../../lib/session'

export default function Account() {
  const { user, restoreError, restore, logout } = useSession()
  const signOut = useMutation({ mutationFn: logout })
  const retry = useMutation({ mutationFn: restore })
  return <SafeAreaView edges={['top']} style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <Heading>Seu espaço no Votz</Heading>
    {user ? <>
      <Card><Avatar name={user.name} uri={user.avatarUrl} size={72} /><Heading>{user.name}</Heading><Label muted>{user.email}</Label><Label>{user.emailVerified ? 'E-mail verificado' : 'Verifique seu e-mail para liberar todas as interações.'}</Label><Button secondary title="Ver meu perfil público" onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: user.id } })} /></Card>
      <Button title="Criar publicação ou relato" onPress={() => router.push('/compose')} />
      <ErrorText message={signOut.isError ? errorMessage(signOut.error) : undefined} />
      <Button title="Sair da conta" secondary loading={signOut.isPending} onPress={() => Alert.alert('Sair do Votz?', 'Você poderá entrar novamente quando quiser.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: () => signOut.mutate() }])} />
    </> : <Card><Heading>Faça parte da conversa</Heading><Label muted>Publique ideias, registre problemas e acompanhe as pessoas que transformam sua cidade.</Label><Button title="Entrar na minha conta" onPress={() => router.push('/login')} />{restoreError && <><Label muted>Não conseguimos recuperar sua sessão. Você pode tentar novamente.</Label><Button title="Recuperar sessão" secondary loading={retry.isPending} onPress={() => retry.mutate()} /></>}</Card>}
  </ScrollView></SafeAreaView>
}
