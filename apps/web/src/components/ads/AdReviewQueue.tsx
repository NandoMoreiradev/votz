import { useState } from 'react'
import styled from 'styled-components'
import {
  AD_INTERESTS,
  AD_OBJECTIVE_LABELS,
  AD_PROHIBITED_CATEGORIES,
  AD_RESTRICTED_CATEGORIES,
  AD_REVIEW_STATUS_LABELS,
  USER_GENDER_LABELS,
  type AdAiAnalysisView,
  type AdReviewQueueItem,
} from '@votz/shared-types'
import { adsErrorMessage, formatBRL, useAdReviewQueue, useDecideAd } from '../../hooks/useAds'
import { ModerationReasonModal } from '../moderation/ModerationReasonModal'

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED'
const FILTER_LABEL: Record<Filter, string> = { PENDING: 'Na fila', APPROVED: 'Aprovados', REJECTED: 'Recusados' }

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`

const FilterBtn = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.8125rem;
  cursor: pointer;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary + '12' : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.muted)};
`

const Empty = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
`

const Item = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px;
  margin-bottom: 14px;
`

const Meta = styled.p`
  margin: 0 0 6px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const Preview = styled.div`
  margin: 12px 0;
  padding: 14px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
`

const AiNote = styled.div<{ $alert: boolean }>`
  margin: 0 0 12px;
  padding: 10px 12px;
  border-left: 3px solid ${({ theme, $alert }) => ($alert ? theme.colors.action : theme.colors.positive)};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
  font-size: 0.8125rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};

  strong { display: block; margin-bottom: 2px; }
`

const Tag = styled.span`
  display: inline-block;
  margin-bottom: 6px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
`

const Headline = styled.p`
  margin: 0 0 4px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const Body = styled.p`
  margin: 0 0 8px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
  overflow-wrap: anywhere;
`

const Cta = styled.span`
  display: inline-block;
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const Url = styled.a`
  display: block;
  margin-top: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.primary};
  overflow-wrap: anywhere;
`

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

const ActionBtn = styled.button<{ $variant: 'approve' | 'reject' }>`
  padding: 7px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => ($variant === 'approve' ? theme.colors.positive : theme.colors.action)};
  background: transparent;
  color: ${({ $variant, theme }) => ($variant === 'approve' ? theme.colors.positive : theme.colors.action)};
  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) => ($variant === 'approve' ? theme.colors.positive : theme.colors.action)};
    color: ${({ theme }) => theme.colors.white};
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Err = styled.p`
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const History = styled.ul`
  margin: 10px 0 0;
  padding-left: 18px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const interestLabel = (id: string) => AD_INTERESTS.find((interest) => interest.id === id)?.label ?? id
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

const labelOf = (list: readonly { id: string; label: string }[], id: string) => list.find((entry) => entry.id === id)?.label ?? id

/** O que a IA achou, em texto simples para o moderador. Parecer, não decisão: quem decide é a pessoa. */
function AiOpinion({ ai }: { ai: AdAiAnalysisView }) {
  const flags = ai.violations.filter((v) => v.confidence >= 0.2)
  const alert = flags.length > 0 || ai.sensitive || !!ai.restricted
  return (
    <AiNote $alert={alert} aria-label="Parecer da IA">
      <strong>{ai.autoApproved ? 'Aprovado pela IA' : 'Parecer da IA'} · certeza da leitura {Math.round(ai.confidence * 100)}%</strong>
      {ai.explanation}
      {ai.category && <div>Tema: {labelOf(AD_INTERESTS, ai.category)}</div>}
      {ai.restricted && <div>Categoria restrita: {labelOf(AD_RESTRICTED_CATEGORIES, ai.restricted)}. Só uma pessoa pode aprovar.</div>}
      {ai.sensitive && <div>Fala de tema sensível.</div>}
      {flags.map((v) => <div key={v.id}>Suspeita: {labelOf(AD_PROHIBITED_CATEGORIES, v.id)} ({Math.round(v.confidence * 100)}%)</div>)}
    </AiNote>
  )
}

function audience(item: AdReviewQueueItem): string {
  const a = item.audience
  const where = a.cities.length ? a.cities.join(', ') : a.states.length ? a.states.join(', ') : 'Brasil todo'
  if (a.automaticAudience) return `${where} · público automático`
  return [
    where,
    a.ageBands.length ? `${a.ageBands.join(', ')} anos` : 'todas as idades',
    a.genders.length ? a.genders.map((gender) => USER_GENDER_LABELS[gender]).join(', ') : null,
    a.interests.length ? a.interests.map(interestLabel).join(', ') : null,
  ].filter(Boolean).join(' · ')
}

/** Aba "Anúncios" do painel de moderação: fila de revisão. Aprovar ou recusar (com motivo); tudo fica registrado. */
export function AdReviewQueue() {
  const [status, setStatus] = useState<Filter>('PENDING')
  const [page, setPage] = useState(1)
  const [rejecting, setRejecting] = useState<AdReviewQueueItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queue = useAdReviewQueue(status, page)
  const decide = useDecideAd()

  const approve = (item: AdReviewQueueItem) => {
    setError(null)
    decide.mutate({ adId: item.adId, decision: 'APPROVED' }, { onError: (err) => setError(adsErrorMessage(err)) })
  }

  return (
    <div>
      <FilterRow>
        {(Object.keys(FILTER_LABEL) as Filter[]).map((filter) => (
          <FilterBtn key={filter} type="button" $active={status === filter} onClick={() => { setStatus(filter); setPage(1); setError(null) }}>
            {FILTER_LABEL[filter]}{filter === 'PENDING' && queue.data ? ` (${queue.data.meta.pendingCount})` : ''}
          </FilterBtn>
        ))}
      </FilterRow>
      {error && <Err role="alert">{error}</Err>}

      {queue.isLoading ? <Empty>Carregando...</Empty>
        : queue.isError ? <Empty>{adsErrorMessage(queue.error)}</Empty>
        : !queue.data?.data.length ? <Empty>{status === 'PENDING' ? 'Nenhum anúncio esperando revisão.' : 'Nenhum anúncio neste filtro.'}</Empty>
        : queue.data.data.map((item) => (
          <Item key={item.adId}>
            <Meta>
              <strong>{item.company.name}</strong>{item.company.verified ? '' : ' (empresa não verificada)'} · conta {item.accountName} · campanha {item.campaignName}
            </Meta>
            <Meta>
              {AD_OBJECTIVE_LABELS[item.objective].label} · {formatBRL(item.dailyBudgetCents)} por dia · enviado em {when(item.submittedAt)}
            </Meta>
            <Meta>Público: {audience(item)}</Meta>

            <Preview aria-label="Como o anúncio vai aparecer">
              <Tag>Patrocinado</Tag>
              <Headline>{item.creative.headline}</Headline>
              <Body>{item.creative.body}</Body>
              <Cta>{item.creative.ctaLabel}</Cta>
              <Url href={item.creative.destinationUrl} target="_blank" rel="noopener noreferrer nofollow">{item.creative.destinationUrl}</Url>
            </Preview>

            {item.aiAnalysis && <AiOpinion ai={item.aiAnalysis} />}

            {status === 'PENDING' ? (
              <Actions>
                <ActionBtn type="button" $variant="approve" disabled={decide.isPending} onClick={() => approve(item)}>Aprovar</ActionBtn>
                <ActionBtn type="button" $variant="reject" disabled={decide.isPending} onClick={() => { setError(null); setRejecting(item) }}>Recusar…</ActionBtn>
              </Actions>
            ) : (
              <Meta>{AD_REVIEW_STATUS_LABELS[item.reviewStatus]} em {when(item.reviewedAt)}{item.reviewNote ? ` · Motivo: ${item.reviewNote}` : ''}</Meta>
            )}

            {item.history.length > 0 && (
              <History>
                {item.history.map((entry, index) => (
                  <li key={index}>
                    {AD_REVIEW_STATUS_LABELS[entry.decision]} em {when(entry.createdAt)}{entry.reviewerName ? ` por ${entry.reviewerName}` : entry.source === 'AI' ? ' pela IA' : ''}{entry.reason ? `: ${entry.reason}` : ''}
                  </li>
                ))}
              </History>
            )}
          </Item>
        ))}

      {queue.data && queue.data.meta.totalPages > 1 && (
        <FilterRow>
          <FilterBtn type="button" $active={false} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</FilterBtn>
          <span>Página {page} de {queue.data.meta.totalPages}</span>
          <FilterBtn type="button" $active={false} disabled={page >= queue.data.meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</FilterBtn>
        </FilterRow>
      )}

      <ModerationReasonModal
        isOpen={!!rejecting}
        title="Recusar anúncio"
        description="O anunciante vai ler este motivo no Estúdio e poderá corrigir e enviar de novo. A decisão fica registrada com o seu nome."
        confirmLabel="Recusar anúncio"
        isPending={decide.isPending}
        errorMessage={error}
        onConfirm={(reason) => {
          if (!rejecting) return
          decide.mutate(
            { adId: rejecting.adId, decision: 'REJECTED', reason },
            { onSuccess: () => { setRejecting(null); setError(null) }, onError: (err) => setError(adsErrorMessage(err)) },
          )
        }}
        onClose={() => { setRejecting(null); setError(null) }}
      />
    </div>
  )
}
