import { useState } from 'react'
import styled from 'styled-components'
import { AD_FRAUD_SIGNAL_LABELS, AD_OBJECTIVE_LABELS, type AdFraudFlagItem, type AdFraudStatus } from '@votz/shared-types'
import { adsErrorMessage, formatBRL, useAdFraudQueue, useResolveAdFraud } from '../../hooks/useAds'

const FILTER_LABEL: Record<AdFraudStatus, string> = { OPEN: 'Em aberto', CONFIRMED: 'Confirmados', DISMISSED: 'Descartados' }

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

const Item = styled.article<{ $extreme: boolean }>`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ $extreme, theme }) => ($extreme ? theme.colors.action : theme.colors.border)};
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

const Level = styled.span<{ $extreme: boolean }>`
  display: inline-block;
  margin-right: 8px;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ $extreme, theme }) => ($extreme ? theme.colors.white : theme.colors.primary)};
  background: ${({ $extreme, theme }) => ($extreme ? theme.colors.action : theme.colors.primary + '14')};
`

const Numbers = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  margin: 12px 0;

  dt { font-size: 0.75rem; color: ${({ theme }) => theme.colors.muted}; }
  dd { margin: 2px 0 0; font-family: ${({ theme }) => theme.fonts.mono}; font-size: 0.9375rem; color: ${({ theme }) => theme.colors.text}; }
`

const Actions = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

const ActionBtn = styled.button<{ $variant: 'confirm' | 'dismiss' }>`
  padding: 7px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  border: 1px solid ${({ $variant, theme }) => ($variant === 'confirm' ? theme.colors.action : theme.colors.positive)};
  background: transparent;
  color: ${({ $variant, theme }) => ($variant === 'confirm' ? theme.colors.action : theme.colors.positive)};
  &:hover:not(:disabled) {
    background: ${({ $variant, theme }) => ($variant === 'confirm' ? theme.colors.action : theme.colors.positive)};
    color: ${({ theme }) => theme.colors.white};
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Err = styled.p`
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—')

function Case({ item, busy, onResolve }: { item: AdFraudFlagItem; busy: boolean; onResolve: (resolution: 'CONFIRMED' | 'DISMISSED') => void }) {
  const extreme = item.level === 'EXTREME'
  return (
    <Item $extreme={extreme}>
      <Meta>
        <Level $extreme={extreme}>{extreme ? 'Extremo' : 'Para revisar'}</Level>
        <strong>{item.company.name}</strong> · campanha {item.campaignName} · anúncio "{item.ad.headline}" · {AD_OBJECTIVE_LABELS[item.objective].label} · dia {day(item.day)}
      </Meta>
      <Meta>{item.signals.map((signal) => AD_FRAUD_SIGNAL_LABELS[signal]).join(' · ')}</Meta>
      <Numbers>
        <div><dt>Exibições vistas</dt><dd>{item.viewable}</dd></div>
        <div><dt>Cliques</dt><dd>{item.clicks}</dd></div>
        <div><dt>Taxa de cliques</dt><dd>{item.ctrPercent === null ? '—' : `${item.ctrPercent}%`}</dd></div>
        <div><dt>Cliques sem exibição vista</dt><dd>{item.clicksWithoutView}</dd></div>
        <div><dt>Contados como inválidos</dt><dd>{item.invalidClicks}</dd></div>
        <div><dt>Já devolvido</dt><dd>{formatBRL(item.creditedCents)}</dd></div>
      </Numbers>
      {item.pausedAd && <Meta>{item.status === 'OPEN' ? 'O anúncio foi pausado por este caso e volta quando você resolver.' : 'O anúncio tinha sido pausado por este caso e foi religado.'}</Meta>}
      {item.status === 'OPEN' ? (
        <Actions>
          <ActionBtn type="button" $variant="confirm" disabled={busy} onClick={() => onResolve('CONFIRMED')}>Era tráfego inválido</ActionBtn>
          <ActionBtn type="button" $variant="dismiss" disabled={busy} onClick={() => onResolve('DISMISSED')}>Era tráfego normal</ActionBtn>
        </Actions>
      ) : (
        <Meta>{item.status === 'CONFIRMED' ? 'Confirmado como inválido' : 'Descartado (tráfego normal)'} em {when(item.resolvedAt)}.</Meta>
      )}
    </Item>
  )
}

/**
 * Tráfego suspeito nos anúncios. O clique inválido já foi devolvido ao anunciante (só em anúncio cobrado por clique);
 * aqui a moderação confirma que era inválido ou descarta. Resolver religa o anúncio que o próprio caso pausou; o crédito
 * fica com o anunciante. Confirmado, o caso segue devolvendo o que passar do plausível naquele dia; descartado, para.
 */
export function AdFraudQueue() {
  const [status, setStatus] = useState<AdFraudStatus>('OPEN')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const queue = useAdFraudQueue(status, page)
  const resolve = useResolveAdFraud()

  const act = (item: AdFraudFlagItem, resolution: 'CONFIRMED' | 'DISMISSED') => {
    setError(null)
    resolve.mutate({ flagId: item.id, resolution }, { onError: (err) => setError(adsErrorMessage(err)) })
  }

  return (
    <div>
      <Intro>
        Anúncios com taxa de cliques fora do normal ou com cliques sem o anúncio ter sido visto. O Votz já devolveu ao anunciante o que foi cobrado por
        esses cliques; só os casos extremos pausam o anúncio sozinhos.
      </Intro>
      <FilterRow>
        {(Object.keys(FILTER_LABEL) as AdFraudStatus[]).map((filter) => (
          <FilterBtn key={filter} type="button" $active={status === filter} onClick={() => { setStatus(filter); setPage(1); setError(null) }}>
            {FILTER_LABEL[filter]}{filter === 'OPEN' && queue.data ? ` (${queue.data.meta.openCount})` : ''}
          </FilterBtn>
        ))}
      </FilterRow>
      {error && <Err role="alert">{error}</Err>}

      {queue.isLoading ? <Empty>Carregando...</Empty>
        : queue.isError ? <Empty>{adsErrorMessage(queue.error)}</Empty>
        : !queue.data?.data.length ? <Empty>{status === 'OPEN' ? 'Nenhum tráfego suspeito em aberto.' : 'Nenhum caso neste filtro.'}</Empty>
        : queue.data.data.map((item) => <Case key={item.id} item={item} busy={resolve.isPending} onResolve={(resolution) => act(item, resolution)} />)}

      {queue.data && queue.data.meta.totalPages > 1 && (
        <FilterRow>
          <FilterBtn type="button" $active={false} disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</FilterBtn>
          <span>Página {page} de {queue.data.meta.totalPages}</span>
          <FilterBtn type="button" $active={false} disabled={page >= queue.data.meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</FilterBtn>
        </FilterRow>
      )}
    </div>
  )
}
