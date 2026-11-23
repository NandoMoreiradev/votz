import { useState } from 'react'
import styled from 'styled-components'
import {
  PRESS_CONTACT_LIMITS,
  PRESS_CREDENTIAL_STATUS_LABELS,
  PRESS_PLAN_LABELS,
  PRESS_OUTLET_LABELS,
  type PressCredentialStatus,
} from '@votz/shared-types'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import {
  apiErrorMessage,
  usePressCredentialDecision,
  usePressPlanChange,
  usePressCredentialQueue,
  type PressCredentialReview,
  type PressDecision,
} from '../../hooks/usePressCredential'

const STATUSES: PressCredentialStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED']

const Filters = styled.div`display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;`
const Chip = styled.button<{ $active: boolean }>`
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? theme.colors.white : theme.colors.text)};
  border-radius: ${({ theme }) => theme.radii.full};
  padding: 6px 14px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  cursor: pointer;
`
const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
  margin-bottom: 12px;
`
const Head = styled.div`display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: baseline;`
const OutletName = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
`
const Meta = styled.div`font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.muted}; margin-top: 2px;`
const Signals = styled.div`display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0;`
const Signal = styled.span<{ $tone: 'good' | 'warn' | 'bad' }>`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  color: ${({ $tone }) => ($tone === 'good' ? '#166534' : $tone === 'warn' ? '#92400E' : '#991B1B')};
  background: ${({ $tone }) => ($tone === 'good' ? '#DCFCE7' : $tone === 'warn' ? '#FEF3C7' : '#FEE2E2')};
`
const Dl = styled.dl`
  display: grid; grid-template-columns: 150px 1fr; gap: 6px 12px; margin: 0 0 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  dt { color: ${({ theme }) => theme.colors.muted}; }
  dd { margin: 0; word-break: break-word; }
  @media (max-width: 640px) { grid-template-columns: 1fr; dt { margin-top: 6px; } }
`
const Actions = styled.div`display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start;`
const NoteBox = styled.textarea`
  width: 100%; min-height: 70px; margin: 10px 0 8px; padding: 10px 12px; font: inherit; font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md};
`
const Hint = styled.div<{ $error?: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
  margin-top: 8px;
`

function SafeLink({ href }: { href: string }) {
  // Só http(s) chega aqui (o servidor valida), mas confere de novo antes de virar link.
  if (!/^https?:\/\//i.test(href)) return <span>{href}</span>
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{href}</a>
}

function ReviewCard({ item }: { item: PressCredentialReview }) {
  const decide = usePressCredentialDecision()
  const changePlan = usePressPlanChange()
  const isAdmin = useAuthStore((st) => st.user?.type === 'ADMIN')
  const [planNote, setPlanNote] = useState<string | null>(null)
  const [pending, setPending] = useState<PressDecision | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const s = item.signals

  function run(action: PressDecision, reviewNote?: string) {
    setError('')
    decide.mutate(
      { id: item.id, action, reviewNote },
      {
        onSuccess: () => { setPending(null); setNote('') },
        onError: (err) => setError(apiErrorMessage(err, 'Não foi possível concluir.')),
      },
    )
  }

  const needsNote = pending === 'recusar' || pending === 'cancelar'

  return (
    <Card>
      <Head>
        <div>
          <OutletName>{item.outletName}</OutletName>
          <Meta>
            {PRESS_OUTLET_LABELS[item.outletType]}
            {item.jobTitle ? ` · ${item.jobTitle}` : ''} · pedido em {new Date(item.createdAt).toLocaleDateString('pt-BR')}
          </Meta>
        </div>
        <Meta>
          {PRESS_CREDENTIAL_STATUS_LABELS[item.status]}
          {item.status === 'APPROVED' ? ' · ' + PRESS_PLAN_LABELS[item.plan] : ''}
        </Meta>
      </Head>

      <Signals>
        <Signal $tone={s.emailConfirmed ? 'good' : 'bad'}>
          {s.emailConfirmed ? 'E-mail da redação confirmado' : 'E-mail da redação NÃO confirmado'}
        </Signal>
        <Signal $tone={s.emailMatchesWebsite ? 'good' : s.emailIsFreeProvider ? 'warn' : 'warn'}>
          {s.emailMatchesWebsite
            ? `E-mail (${s.emailDomain}) combina com o site`
            : s.emailIsFreeProvider
              ? `E-mail de provedor aberto (${s.emailDomain})`
              : `E-mail (${s.emailDomain}) diferente do site (${s.websiteHost})`}
        </Signal>
        <Signal $tone={s.accountAgeDays < 7 ? 'warn' : 'good'}>Conta criada há {s.accountAgeDays} dia(s)</Signal>
        {item.contactAbuseCount > 0 && (
          <Signal $tone="bad">
            {item.contactAbuseCount} denúncia(s) de abuso em pedidos de contato{item.contactAbuseCount >= PRESS_CONTACT_LIMITS.ABUSE_SUSPEND_AT ? ' (pedidos suspensos)' : ''}
          </Signal>
        )}
      </Signals>

      <Dl>
        <dt>Pessoa</dt><dd>{item.user.name} · {item.user.email}</dd>
        <dt>Site</dt><dd><SafeLink href={item.website} /></dd>
        <dt>E-mail da redação</dt><dd>{item.newsroomEmail}</dd>
        {item.coverageArea && (<><dt>Cobertura</dt><dd>{item.coverageArea}</dd></>)}
        <dt>Matérias</dt>
        <dd>{item.portfolioUrls.map((u) => <div key={u}><SafeLink href={u} /></div>)}</dd>
        {item.note && (<><dt>Recado</dt><dd>{item.note}</dd></>)}
        {item.reviewNote && (<><dt>Decisão</dt><dd>{item.reviewNote}{item.reviewer ? ` (${item.reviewer.name})` : ''}</dd></>)}
      </Dl>

      {needsNote && (
        <>
          <NoteBox
            autoFocus
            maxLength={500}
            placeholder="Escreva o motivo (mínimo 10 caracteres). A pessoa vai ler."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Actions>
            <Button variant="action" size="sm" disabled={decide.isPending || note.trim().length < 10} onClick={() => run(pending!, note)}>
              {pending === 'recusar' ? 'Confirmar recusa' : 'Confirmar cancelamento'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setPending(null); setNote('') }}>Voltar</Button>
          </Actions>
        </>
      )}

      {!needsNote && item.status === 'PENDING' && (
        <Actions>
          <Button variant="primary" size="sm" disabled={decide.isPending || !s.emailConfirmed} onClick={() => run('aprovar')}>
            Aprovar
          </Button>
          <Button variant="outline" size="sm" disabled={decide.isPending} onClick={() => setPending('recusar')}>Recusar</Button>
        </Actions>
      )}
      {!needsNote && item.status === 'APPROVED' && planNote === null && (
        <Actions>
          {isAdmin && (
            <Button variant="primary" size="sm" disabled={decide.isPending} onClick={() => setPlanNote('')}>
              {item.plan === 'PRO' ? 'Voltar para gratuita' : 'Dar plano Pro'}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={decide.isPending} onClick={() => setPending('cancelar')}>Cancelar credencial</Button>
        </Actions>
      )}
      {!needsNote && item.status === 'APPROVED' && planNote !== null && (
        <>
          <NoteBox
            autoFocus
            maxLength={500}
            placeholder="Motivo da troca de plano (mínimo 10 caracteres). Fica no registro de auditoria."
            value={planNote}
            onChange={(e) => setPlanNote(e.target.value)}
          />
          <Actions>
            <Button
              variant="action" size="sm" disabled={changePlan.isPending || planNote.trim().length < 10}
              onClick={() => {
                setError('')
                changePlan.mutate(
                  { id: item.id, plan: item.plan === 'PRO' ? 'GRATUITA' : 'PRO', reason: planNote },
                  { onSuccess: () => setPlanNote(null), onError: (err) => setError(apiErrorMessage(err, 'Não foi possível trocar o plano.')) },
                )
              }}
            >
              Confirmar troca para {item.plan === 'PRO' ? 'gratuita' : 'Pro'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPlanNote(null)}>Voltar</Button>
          </Actions>
        </>
      )}

      {item.status === 'PENDING' && !s.emailConfirmed && !needsNote && (
        <Hint>Só dá para aprovar depois que a pessoa confirmar o e-mail da redação.</Hint>
      )}
      {error && <Hint $error>{error}</Hint>}
    </Card>
  )
}

export function PressCredentialQueue() {
  const [status, setStatus] = useState<PressCredentialStatus>('PENDING')
  const { data, isLoading, isError } = usePressCredentialQueue(status)
  const items = data?.data ?? []

  return (
    <div>
      <Filters>
        {STATUSES.map((st) => (
          <Chip key={st} $active={st === status} onClick={() => setStatus(st)}>
            {PRESS_CREDENTIAL_STATUS_LABELS[st]}
          </Chip>
        ))}
      </Filters>
      {isLoading && <Hint>Carregando…</Hint>}
      {isError && <Hint $error>Não foi possível carregar os pedidos.</Hint>}
      {!isLoading && !isError && items.length === 0 && <Hint>Nenhum pedido nesta situação.</Hint>}
      {items.map((item) => <ReviewCard key={item.id} item={item} />)}
    </div>
  )
}
