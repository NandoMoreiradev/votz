import { useState } from 'react'
import styled from 'styled-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActiveSessionView } from '@votz/shared-types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/useAuth'

const Card = styled.section`
  margin-top: 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px 32px;
  @media (max-width: 600px) { padding: 20px 16px; }
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Desc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 18px;
  line-height: 1.5;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
`

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  height: 42px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
`

const Btn = styled.button<{ $danger?: boolean }>`
  padding: 9px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: 1.5px solid ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.primary)};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.primary)};
  background: transparent;
  &:hover {
    background: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.primary)};
    color: #fff;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const SessionRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
`

const Feedback = styled.p<{ $error?: boolean }>`
  font-size: 0.875rem;
  margin-top: 8px;
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.positiveText)};
`

export function SecuritySessionsSection() {
  const { user } = useAuthStore()
  const { data: me, refetch: refetchMe } = useMe()
  const qc = useQueryClient()

  const hasPassword = me?.hasPassword ?? user?.hasPassword ?? true
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdFeedback, setPwdFeedback] = useState<{ msg: string; error?: boolean } | null>(null)

  const sessionsQuery = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api.get<ActiveSessionView[]>('/auth/sessions').then((r) => r.data),
    enabled: !!user,
  })

  const changePwdMut = useMutation({
    mutationFn: (payload: { currentPassword?: string; newPassword: string }) =>
      api.post('/auth/change-password', payload).then((r) => r.data),
    onSuccess: () => {
      setPwdFeedback({ msg: hasPassword ? 'Senha alterada com sucesso.' : 'Senha definida com sucesso.' })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      void refetchMe()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
      setPwdFeedback({ msg: Array.isArray(msg) ? msg[0] : msg || 'Erro ao alterar senha.', error: true })
    },
  })

  const revokeOneMut = useMutation({
    mutationFn: (familyId: string) => api.delete(`/auth/sessions/${familyId}`).then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }) },
  })

  const revokeOthersMut = useMutation({
    mutationFn: () => api.delete('/auth/sessions').then((r) => r.data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] }) },
  })

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPwdFeedback(null)
    if (newPassword.length < 8) {
      setPwdFeedback({ msg: 'A nova senha precisa ter pelo menos 8 caracteres.', error: true })
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdFeedback({ msg: 'A confirmação de senha não confere.', error: true })
      return
    }
    changePwdMut.mutate({
      ...(hasPassword ? { currentPassword } : {}),
      newPassword,
    })
  }

  const sessions = sessionsQuery.data ?? []

  return (
    <>
      <Card>
        <Title>{hasPassword ? 'Alterar senha' : 'Definir senha'}</Title>
        <Desc>
          {hasPassword
            ? 'Use uma senha forte (mínimo 8 caracteres, com letras e números).'
            : 'Sua conta entrou via Google. Você pode definir uma senha para também acessar com e-mail.'}
        </Desc>
        <form onSubmit={handlePasswordSubmit}>
          {hasPassword && (
            <Field>
              <Label htmlFor="cur-pwd">Senha atual</Label>
              <Input
                id="cur-pwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </Field>
          )}
          <Field>
            <Label htmlFor="new-pwd">Nova senha</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Field>
            <Label htmlFor="cnf-pwd">Confirmar nova senha</Label>
            <Input
              id="cnf-pwd"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          {pwdFeedback && <Feedback $error={pwdFeedback.error}>{pwdFeedback.msg}</Feedback>}
          <div style={{ marginTop: 14 }}>
            <Btn type="submit" disabled={changePwdMut.isPending}>
              {changePwdMut.isPending ? 'Salvando…' : hasPassword ? 'Atualizar senha' : 'Definir senha'}
            </Btn>
          </div>
        </form>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <Title>Sessões ativas</Title>
            <Desc>Dispositivos e navegadores conectados à sua conta no momento.</Desc>
          </div>
          {sessions.length > 1 && (
            <Btn type="button" $danger disabled={revokeOthersMut.isPending} onClick={() => revokeOthersMut.mutate()}>
              {revokeOthersMut.isPending ? 'Encerrando…' : 'Sair de outros dispositivos'}
            </Btn>
          )}
        </div>

        {sessionsQuery.isLoading ? (
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Carregando sessões…</p>
        ) : sessions.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: '#6B7280' }}>Nenhuma sessão ativa encontrada.</p>
        ) : (
          sessions.map((s) => (
            <SessionRow key={s.familyId}>
              <div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600 }}>
                  {s.current ? 'Este dispositivo (sessão atual)' : `Sessão ${s.familyId.slice(0, 8)}`}
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                  Iniciada em {new Date(s.createdAt).toLocaleString('pt-BR')} · expira em{' '}
                  {new Date(s.expiresAt).toLocaleDateString('pt-BR')}
                </div>
              </div>
              {!s.current && (
                <Btn type="button" $danger disabled={revokeOneMut.isPending} onClick={() => revokeOneMut.mutate(s.familyId)}>
                  Encerrar
                </Btn>
              )}
            </SessionRow>
          ))
        )}
      </Card>
    </>
  )
}
