import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Button, Card, ErrorText, Field, Heading, Label, styles } from '../components/ui'
import { api, errorMessage, json } from '../lib/api'
import { useSession } from '../lib/session'
import type { LoginResult, Session } from '../lib/types'

type Challenge = { type: 'verify' | 'setup'; token: string; secret?: string }
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [completedSession, setCompletedSession] = useState<Session | null>(null)
  const login = useMutation({
    mutationFn: async () => {
      if (challenge?.type === 'verify') return api<Session>('/auth/mobile/mfa/verify', json({ mfaToken: challenge.token, code: code.trim() }), false)
      if (challenge?.type === 'setup') return api<Session & { backupCodes: string[] }>('/auth/mobile/mfa/enable/forced', { ...json({ code: code.trim() }), headers: { Authorization: `Bearer ${challenge.token}` } }, false)
      return api<LoginResult>('/auth/mobile/login', json({ email: email.trim().toLowerCase(), password }), false)
    },
    onSuccess: async (result) => {
      if ('requiresMfa' in result) { setPassword(''); setChallenge({ type: 'verify', token: result.mfaToken }); return }
      if ('requiresMfaSetup' in result) { setPassword(''); setChallenge({ type: 'setup', token: result.mfaSetupToken }); return }
      if ('backupCodes' in result) {
        setBackupCodes(result.backupCodes as string[])
        setCompletedSession(result)
        return
      }
      await useSession.getState().accept(result)
      router.back()
    },
  })
  const setup = useMutation({
    mutationFn: () => api<{ secret: string }>('/auth/mfa/setup/forced', { ...json({}), headers: { Authorization: `Bearer ${challenge?.token}` } }, false),
    onSuccess: ({ secret }) => setChallenge((current) => current ? { ...current, secret } : null),
  })
  const finish = useMutation({ mutationFn: async () => {
    if (completedSession) await useSession.getState().accept(completedSession)
    router.back()
  } })
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Heading>{backupCodes.length ? 'Guarde seus códigos' : challenge ? 'Proteja sua voz' : 'Sua cidade. Sua voz.'}</Heading>
    <Label muted>{challenge ? 'Conclua a autenticação em duas etapas para continuar.' : 'Entre com sua conta Votz para publicar, apoiar e acompanhar.'}</Label>
    {backupCodes.length ? <Card><Label>Guarde estes códigos em um lugar seguro. Cada código só pode ser usado uma vez.</Label>{backupCodes.map((value) => <Label key={value}>{value}</Label>)}<ErrorText message={finish.isError ? errorMessage(finish.error) : undefined} /><Button title="Guardei os códigos. Continuar" loading={finish.isPending} onPress={() => finish.mutate()} /></Card> : <>
      {!challenge && <><Field label="E-mail" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" /><Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" /></>}
      {challenge?.type === 'setup' && <Card><Label>Adicione uma chave ao seu aplicativo autenticador.</Label>{challenge.secret ? <Label>{challenge.secret}</Label> : <Button title="Gerar chave do autenticador" loading={setup.isPending} onPress={() => setup.mutate()} />}<ErrorText message={setup.isError ? errorMessage(setup.error) : undefined} /></Card>}
      {challenge && <Field label={challenge.type === 'verify' ? 'Código do autenticador ou de recuperação' : 'Código do autenticador'} value={code} onChangeText={setCode} autoCapitalize="characters" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={20} />}
      <ErrorText message={login.isError ? errorMessage(login.error) : undefined} />
      <Button title={challenge ? 'Confirmar e entrar' : 'Entrar no Votz'} loading={login.isPending} disabled={challenge ? !code.trim() || (challenge.type === 'setup' && !challenge.secret) : !email.trim() || !password} onPress={() => login.mutate()} />
      {challenge && <Button secondary title="Usar outra conta" disabled={login.isPending} onPress={() => { setChallenge(null); setCode(''); login.reset(); setup.reset() }} />}
    </>}
  </ScrollView></KeyboardAvoidingView>
}
