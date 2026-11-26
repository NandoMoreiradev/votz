import styled from 'styled-components'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UserAccountPreferencesView } from '@votz/shared-types'
import { api } from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'

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

const Row = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;
`

const RowText = styled.div`
  flex: 1;
  strong { display: block; font-size: 0.9375rem; color: ${({ theme }) => theme.colors.text}; font-weight: 600; }
  span { display: block; font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; margin-top: 2px; }
`

const Select = styled.select`
  height: 36px;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
`

type BoolKey = {
  [K in keyof UserAccountPreferencesView]: UserAccountPreferencesView[K] extends boolean ? K : never
}[keyof UserAccountPreferencesView]

const CHANNELS: { key: BoolKey; title: string; hint: string }[] = [
  { key: 'inAppEnabled', title: 'Notificações no app', hint: 'Avisos no sino dentro do Votz.' },
  { key: 'emailEnabled', title: 'Notificações por e-mail', hint: 'Alertas importantes enviados para o seu e-mail.' },
  { key: 'pushEnabled', title: 'Notificações push no celular', hint: 'Alertas no aparelho quando o app estiver instalado.' },
]

const EVENTS: { key: BoolKey; title: string; hint: string }[] = [
  { key: 'reportUpdates', title: 'Atualizações nos seus relatos', hint: 'Mudanças de status, avocação ou contestação.' },
  { key: 'officialResponses', title: 'Respostas oficiais', hint: 'Quando uma entidade, político ou empresa responder.' },
  { key: 'reportComments', title: 'Comentários e apoios', hint: 'Interações da comunidade nos seus relatos.' },
  { key: 'localSurges', title: 'Surtos na sua cidade', hint: 'Problemas em escala detectados na sua região.' },
  { key: 'officialSurveys', title: 'Novas Pesquisas Votz', hint: 'Convites para pesquisas oficiais da sua região.' },
  { key: 'mentions', title: 'Menções (@você)', hint: 'Quando alguém mencionar seu perfil.' },
  { key: 'weeklyDigest', title: 'Resumo semanal', hint: 'Um compilado por e-mail das novidades da sua cidade.' },
]

const CIVIC_PRIVACY: { key: BoolKey; title: string; hint: string }[] = [
  { key: 'defaultAnonymousReports', title: 'Sugerir relato anônimo por padrão', hint: 'Ao abrir um novo relato, marcar a opção anônima automaticamente.' },
  { key: 'publicActivityVisible', title: 'Mostrar atividades no perfil público', hint: 'Exibir seus relatos públicos e interações para visitantes.' },
  { key: 'acceptPressContact', title: 'Aceitar pedidos de contato da imprensa', hint: 'Permite que jornalistas verificados peçam para conversar sobre seus relatos.' },
]

export function NotificationsPrivacySection() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['users', 'me', 'preferences'],
    queryFn: () => api.get<UserAccountPreferencesView>('/users/me/preferences').then((r) => r.data),
    enabled: !!user,
  })

  const mut = useMutation({
    mutationFn: (patch: Partial<UserAccountPreferencesView>) =>
      api.patch<UserAccountPreferencesView>('/users/me/preferences', patch).then((r) => r.data),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ['users', 'me', 'preferences'] })
      const prev = qc.getQueryData<UserAccountPreferencesView>(['users', 'me', 'preferences'])
      if (prev) qc.setQueryData(['users', 'me', 'preferences'], { ...prev, ...patch })
      return { prev }
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData(['users', 'me', 'preferences'], ctx.prev)
    },
  })

  const prefs = query.data
  if (query.isLoading || !prefs) {
    return <Card>Carregando preferências…</Card>
  }

  return (
    <>
      <Card>
        <Title>Canais de notificação</Title>
        <Desc>Escolha onde deseja receber avisos do Votz.</Desc>
        {CHANNELS.map((item) => (
          <Row key={item.key}>
            <RowText>
              <strong>{item.title}</strong>
              <span>{item.hint}</span>
            </RowText>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={(e) => mut.mutate({ [item.key]: e.target.checked })}
            />
          </Row>
        ))}
      </Card>

      <Card>
        <Title>Tipos de alerta e horário de silêncio</Title>
        <Desc>Defina o que importa para você e evite notificações de madrugada.</Desc>
        {EVENTS.map((item) => (
          <Row key={item.key}>
            <RowText>
              <strong>{item.title}</strong>
              <span>{item.hint}</span>
            </RowText>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={(e) => mut.mutate({ [item.key]: e.target.checked })}
            />
          </Row>
        ))}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid #E5E5E5', marginTop: 6 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Não perturbe:</span>
          <Select
            value={prefs.quietHoursStart === null ? '' : String(prefs.quietHoursStart)}
            onChange={(e) =>
              mut.mutate({
                quietHoursStart: e.target.value === '' ? null : Number(e.target.value),
                quietHoursEnd: e.target.value === '' ? null : prefs.quietHoursEnd ?? 7,
              })
            }
          >
            <option value="">Desligado</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>Das {String(h).padStart(2, '0')}h</option>
            ))}
          </Select>
          {prefs.quietHoursStart !== null && (
            <Select
              value={prefs.quietHoursEnd === null ? '7' : String(prefs.quietHoursEnd)}
              onChange={(e) => mut.mutate({ quietHoursEnd: Number(e.target.value) })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>até {String(h).padStart(2, '0')}h</option>
              ))}
            </Select>
          )}
        </div>
      </Card>

      <Card>
        <Title>Privacidade cívica</Title>
        <Desc>Preferências padrão de exposição e contato para a sua conta cidadã.</Desc>
        {CIVIC_PRIVACY.map((item) => (
          <Row key={item.key}>
            <RowText>
              <strong>{item.title}</strong>
              <span>{item.hint}</span>
            </RowText>
            <input
              type="checkbox"
              checked={prefs[item.key]}
              onChange={(e) => mut.mutate({ [item.key]: e.target.checked })}
            />
          </Row>
        ))}
      </Card>
    </>
  )
}
