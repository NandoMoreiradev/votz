import { useState } from 'react'
import styled from 'styled-components'
import { AD_REFUND_LIMITS, AD_REFUND_STATUS_LABELS, type AdRefundQueueItem, type AdRefundStatus } from '@votz/shared-types'
import { adsErrorMessage, formatBRL, useAdRefundQueue, useResolveAdRefund } from '../../hooks/useAds'
import { SkeletonRows } from '../ui/Skeleton'

const FILTERS: AdRefundStatus[] = ['REQUESTED', 'PAID', 'REJECTED', 'CANCELED']

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

const Intro = styled.p`
  margin: 0 0 16px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
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

const Amount = styled.p`
  margin: 0 0 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-end;
  margin-top: 10px;
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  input { padding: 7px 10px; border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md}; font-size: 0.875rem; }
`

const Btn = styled.button<{ $variant: 'pay' | 'reject' }>`
  padding: 7px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => ($variant === 'pay' ? theme.colors.positive : theme.colors.action)};
  background: transparent;
  color: ${({ $variant, theme }) => ($variant === 'pay' ? theme.colors.positive : theme.colors.action)};
  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) => ($variant === 'pay' ? theme.colors.positive : theme.colors.action)};
    color: ${({ theme }) => theme.colors.white};
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Err = styled.p`
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

function Request({ item, busy, onResolve }: { item: AdRefundQueueItem; busy: boolean; onResolve: (body: { decision: 'PAID' | 'REJECTED'; note?: string; externalId?: string }) => void }) {
  const [externalId, setExternalId] = useState('')
  const [note, setNote] = useState('')
  const pending = item.status === 'REQUESTED'
  return (
    <Item>
      <Amount>{formatBRL(item.amountCents)}</Amount>
      <Meta><strong>{item.companyName}</strong> · CNPJ {item.companyCnpj} · conta {item.accountName}</Meta>
      <Meta>Pedida em {when(item.requestedAt)}{item.reason ? ` · motivo do anunciante: ${item.reason}` : ''}</Meta>
      {pending ? (
        <>
          <Actions>
            <Field>Código do Pix ou da transferência (opcional)<input value={externalId} maxLength={100} onChange={(event) => setExternalId(event.target.value)} /></Field>
            <Btn type="button" $variant="pay" disabled={busy} onClick={() => onResolve({ decision: 'PAID', externalId: externalId.trim() || undefined })}>Já devolvi o dinheiro</Btn>
          </Actions>
          <Actions>
            <Field>Motivo da recusa (o anunciante lê)<input value={note} maxLength={AD_REFUND_LIMITS.NOTE_MAX} onChange={(event) => setNote(event.target.value)} /></Field>
            <Btn type="button" $variant="reject" disabled={busy || note.trim().length < 10} onClick={() => onResolve({ decision: 'REJECTED', note: note.trim() })}>Recusar (valor volta ao saldo)</Btn>
          </Actions>
        </>
      ) : (
        <Meta>{AD_REFUND_STATUS_LABELS[item.status]} em {when(item.resolvedAt)}{item.resolutionNote ? ` · ${item.resolutionNote}` : ''}</Meta>
      )}
    </Item>
  )
}

/**
 * Devoluções de saldo pedidas por anunciantes. O valor já saiu do saldo do anunciante no pedido. Quem é admin devolve o
 * dinheiro por fora (Pix ou transferência) e marca como devolvido aqui, ou recusa com o motivo e o valor volta ao saldo.
 */
export function AdRefundQueue() {
  const [status, setStatus] = useState<AdRefundStatus>('REQUESTED')
  const [error, setError] = useState<string | null>(null)
  const queue = useAdRefundQueue(status)
  const resolve = useResolveAdRefund()

  return (
    <div>
      <Intro>Devolva o dinheiro por Pix ou transferência para a conta da empresa e marque como devolvido. Só se devolve o que o anunciante pagou em recargas.</Intro>
      <FilterRow>
        {FILTERS.map((filter) => (
          <FilterBtn key={filter} type="button" $active={status === filter} onClick={() => { setStatus(filter); setError(null) }}>
            {AD_REFUND_STATUS_LABELS[filter]}{filter === 'REQUESTED' && queue.data && status === 'REQUESTED' ? ` (${queue.data.length})` : ''}
          </FilterBtn>
        ))}
      </FilterRow>
      {error && <Err role="alert">{error}</Err>}
      {queue.isLoading ? <SkeletonRows />
        : queue.isError ? <Empty>{adsErrorMessage(queue.error)}</Empty>
        : !queue.data?.length ? <Empty>{status === 'REQUESTED' ? 'Nenhum pedido de devolução esperando.' : 'Nenhum pedido neste filtro.'}</Empty>
        : queue.data.map((item) => (
            <Request key={item.id} item={item} busy={resolve.isPending} onResolve={(body) => { setError(null); resolve.mutate({ refundId: item.id, ...body }, { onError: (err) => setError(adsErrorMessage(err)) }) }} />
          ))}
    </div>
  )
}
