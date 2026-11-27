import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { REPORT_LIFECYCLE_LIMITS as L, getArchiveReasonLabel } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { useDisputeQueue, useResolveDispute, type DisputeQueueItem } from '../../hooks/useReports'
import { apiErrorMessage } from '../../lib/api-error'

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const Intro = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const Item = styled.article`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
`

const Head = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;

  h3 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.md};
    color: ${({ theme }) => theme.colors.text};
  }
`

const Meta = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const Waiting = styled.span<{ $late: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ $late, theme }) => ($late ? theme.colors.action : theme.colors.muted)};
`

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
`

const Block = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};

  h4 {
    margin: 0 0 6px;
    font-size: ${({ theme }) => theme.fontSizes.xs};
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.muted};
  }
  p { margin: 0 0 6px; white-space: pre-wrap; }
`

const Flag = styled.span`
  display: inline-block;
  margin-top: 4px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.warning};
`

const Textarea = styled.textarea`
  display: block;
  width: 100%;
  min-height: 80px;
  box-sizing: border-box;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
`

const ErrorText = styled.p`
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const Pager = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

function evidenceOf(meta: unknown): string[] {
  const m = (meta ?? {}) as Record<string, unknown>
  const list = Array.isArray(m.evidence) ? m.evidence : Array.isArray(m.media) ? m.media : []
  return (list as unknown[]).filter((u): u is string => typeof u === 'string')
}

function EvidenceLinks({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <p>
      {urls.map((u, i) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
          Anexo {i + 1}
        </a>
      ))}
    </p>
  )
}

function DisputeItem({ item }: { item: DisputeQueueItem }) {
  const [justification, setJustification] = useState('')
  const decide = useResolveDispute(item.id)
  const text = justification.trim()
  const ready = text.length >= L.DECISION_MIN && !decide.isPending
  const by = item.dispute?.metadata?.disputedBy === 'ME_TOO' ? 'quem marcou “Eu também”' : 'quem fez o relato'

  return (
    <Item>
      <Head>
        <div>
          <h3>
            <Link to={`/relatos/${item.id}`}>{item.title}</Link>
          </h3>
          <Meta>
            {[item.city, item.state].filter(Boolean).join('/')}
            {item.recipientName ? ` · enviado para ${item.recipientName}` : ''}
          </Meta>
        </div>
        <Waiting $late={item.waitingDays >= 7}>
          {item.waitingDays === 0 ? 'contestado hoje' : `esperando há ${item.waitingDays} dia${item.waitingDays === 1 ? '' : 's'}`}
        </Waiting>
      </Head>

      <Columns>
        <Block>
          <h4>{item.closing?.type === 'ARCHIVED' ? 'Arquivamento' : 'Resolução'}</h4>
          {item.closing ? (
            <>
              <p>{item.closing.content}</p>
              <EvidenceLinks urls={evidenceOf(item.closing.metadata)} />
              <Meta>{day(item.closing.createdAt)}</Meta>
            </>
          ) : (
            <p>Sem registro do encerramento.</p>
          )}
          {item.resolvedWithoutEvidence && <Flag>Resolvido sem foto ou documento</Flag>}
          {item.archiveReason && <Flag>Motivo: {getArchiveReasonLabel(item.archiveReason)}</Flag>}
        </Block>

        <Block>
          <h4>Contestação ({by})</h4>
          {item.dispute ? (
            <>
              <p>{item.dispute.content}</p>
              <EvidenceLinks urls={evidenceOf(item.dispute.metadata)} />
              <Meta>{day(item.dispute.createdAt)}</Meta>
            </>
          ) : (
            <p>Sem texto.</p>
          )}
        </Block>

        <Block>
          <h4>Respostas depois da contestação</h4>
          {item.repliesAfterDispute.length === 0 ? (
            <p>Ninguém respondeu ainda.</p>
          ) : (
            item.repliesAfterDispute.map((r) => (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <p>{r.content}</p>
                <EvidenceLinks urls={evidenceOf(r.metadata)} />
                <Meta>{day(r.createdAt)}</Meta>
              </div>
            ))
          )}
        </Block>
      </Columns>

      <Textarea
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        maxLength={1000}
        aria-label="Justificativa da decisão"
        placeholder={`Explique a decisão (mínimo ${L.DECISION_MIN} letras). O texto aparece na Memória do relato.`}
      />
      {decide.isError && <ErrorText>{apiErrorMessage(decide.error, 'Não foi possível registrar a decisão.')}</ErrorText>}
      <Actions>
        <Button variant="action" size="sm" disabled={!ready} onClick={() => decide.mutate({ decision: 'REOPEN', justification: text })}>
          Contestação procede: reabrir
        </Button>
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => decide.mutate({ decision: 'UPHOLD', justification: text })}>
          Manter {item.closing?.type === 'ARCHIVED' ? 'o arquivamento' : 'a resolução'}
        </Button>
      </Actions>
    </Item>
  )
}

/** Fila de contestações: a moderação decide se o relato volta a andar ou se a resolução vale. */
export function DisputesAdminTab() {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useDisputeQueue(page)

  return (
    <Wrap>
      <Intro>
        Relatos contestados por quem fez o relato ou por quem marcou “Eu também”. Compare o que foi dito na resolução com a
        contestação e as respostas. Reabrir devolve o relato para “Aberto” e conta contra quem resolveu no Mandatômetro.
      </Intro>
      {isLoading && <Intro>Carregando…</Intro>}
      {isError && <Intro>Não foi possível carregar a fila.</Intro>}
      {data && data.data.length === 0 && <Intro>Nenhuma contestação esperando decisão.</Intro>}
      {data?.data.map((item) => <DisputeItem key={item.id} item={item} />)}
      {data && data.meta.totalPages > 1 && (
        <Pager>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          Página {page} de {data.meta.totalPages}
          <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </Pager>
      )}
    </Wrap>
  )
}
