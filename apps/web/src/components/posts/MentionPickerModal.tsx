import { useState } from 'react'
import styled from 'styled-components'
import { X, MagnifyingGlass, Megaphone, Broadcast, Scroll, ChartBar } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useReports } from '../../hooks/useReports'
import { useDebates } from '../../hooks/useDebates'
import { usePropostas } from '../../hooks/usePropostas'
import { DebatePoll } from '../../types/api'

export type SelectedMention =
  | { type: 'report'; id: string; label: string; sub?: string }
  | { type: 'debate'; id: string; label: string; sub?: string }
  | { type: 'proposta'; id: string; label: string; sub?: string }
  | { type: 'debatePoll'; id: string; label: string; sub?: string }

interface MentionPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (mention: SelectedMention) => void
}

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 950;
  background: rgba(13, 13, 13, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`

const Card = styled.div`
  width: min(560px, 100%);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  overflow: hidden;
`

const Head = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  h3 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.md};
    color: ${({ theme }) => theme.colors.text};
  }
`

const CloseBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Tabs = styled.div`
  display: flex;
  gap: 6px;
  padding: 12px 20px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  overflow-x: auto;
`

const TabBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 10px;
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.action : 'transparent')};
  background: transparent;
  color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  white-space: nowrap;
`

const SearchWrap = styled.div`
  padding: 12px 20px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  gap: 8px;
  background: ${({ theme }) => theme.colors.surfaceHover};

  input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: ${({ theme }) => theme.fontSizes.sm};
    color: ${({ theme }) => theme.colors.text};
    outline: none;
  }
`

const List = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const ItemBtn = styled.button`
  width: 100%;
  text-align: left;
  padding: 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const ItemTitle = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const ItemSub = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const Empty = styled.div`
  text-align: center;
  padding: 32px 16px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

export function MentionPickerModal({ isOpen, onClose, onSelect }: MentionPickerModalProps) {
  const [tab, setTab] = useState<'reports' | 'debates' | 'propostas' | 'debatePolls'>('reports')
  const [search, setSearch] = useState('')
  const [selectedDebateId, setSelectedDebateId] = useState<string | null>(null)

  const { data: reportsData, isLoading: loadingReports } = useReports({
    search: search.trim() || undefined,
    limit: 12,
  })
  const { data: debatesData, isLoading: loadingDebates } = useDebates({
    enabled: isOpen && (tab === 'debates' || tab === 'debatePolls'),
  })
  const { data: propostasData, isLoading: loadingPropostas } = usePropostas({ limit: 15 })

  const { data: activePoll } = useQuery({
    queryKey: ['debate-active-poll', selectedDebateId],
    queryFn: () =>
      api.get<DebatePoll | null>(`/debates/${selectedDebateId}/polls/active`).then((r) => r.data),
    enabled: isOpen && tab === 'debatePolls' && !!selectedDebateId,
  })

  if (!isOpen) return null

  const q = search.trim().toLowerCase()
  const debates = (debatesData?.data ?? []).filter(
    (d) => !q || d.title.toLowerCase().includes(q),
  )
  const propostas = (propostasData?.data ?? []).filter(
    (p) => !q || p.titulo.toLowerCase().includes(q),
  )

  return (
    <Overlay onClick={onClose} role="dialog" aria-modal="true" aria-label="Mencionar conteúdo">
      <Card onClick={(e) => e.stopPropagation()}>
        <Head>
          <h3>Mencionar no post</h3>
          <CloseBtn type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </CloseBtn>
        </Head>

        <Tabs>
          <TabBtn type="button" $active={tab === 'reports'} onClick={() => setTab('reports')}>
            <Megaphone size={15} /> Relatos
          </TabBtn>
          <TabBtn type="button" $active={tab === 'debates'} onClick={() => setTab('debates')}>
            <Broadcast size={15} /> Debates
          </TabBtn>
          <TabBtn type="button" $active={tab === 'debatePolls'} onClick={() => setTab('debatePolls')}>
            <ChartBar size={15} /> Enquetes de Debate
          </TabBtn>
          <TabBtn type="button" $active={tab === 'propostas'} onClick={() => setTab('propostas')}>
            <Scroll size={15} /> Propostas
          </TabBtn>
        </Tabs>

        <SearchWrap>
          <MagnifyingGlass size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por título..."
            autoFocus
          />
        </SearchWrap>

        <List>
          {tab === 'reports' && (
            <>
              {loadingReports && <Empty>Carregando relatos...</Empty>}
              {!loadingReports && (reportsData?.data ?? []).length === 0 && (
                <Empty>Nenhum relato encontrado.</Empty>
              )}
              {(reportsData?.data ?? []).map((r) => (
                <ItemBtn
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onSelect({
                      type: 'report',
                      id: r.id,
                      label: r.title,
                      sub: [r.city, r.state].filter(Boolean).join(' · ') || undefined,
                    })
                    onClose()
                  }}
                >
                  <ItemTitle>{r.title}</ItemTitle>
                  <ItemSub>
                    Pressão {r.pressureScore.toFixed(1)} · {r.city ?? 'Brasil'}
                    {r.state ? `/${r.state}` : ''}
                  </ItemSub>
                </ItemBtn>
              ))}
            </>
          )}

          {tab === 'debates' && (
            <>
              {loadingDebates && <Empty>Carregando debates...</Empty>}
              {!loadingDebates && debates.length === 0 && <Empty>Nenhum debate encontrado.</Empty>}
              {debates.map((d) => (
                <ItemBtn
                  key={d.id}
                  type="button"
                  onClick={() => {
                    onSelect({
                      type: 'debate',
                      id: d.id,
                      label: d.title,
                      sub: d.status === 'LIVE' ? 'Ao vivo' : new Date(d.scheduledFor).toLocaleDateString('pt-BR'),
                    })
                    onClose()
                  }}
                >
                  <ItemTitle>{d.title}</ItemTitle>
                  <ItemSub>
                    {d.status} · por {d.creator?.name ?? d.hostEntity?.legalName ?? 'Votz'}
                  </ItemSub>
                </ItemBtn>
              ))}
            </>
          )}

          {tab === 'debatePolls' && (
            <>
              <ItemSub style={{ padding: '4px 4px 6px' }}>
                Selecione um debate para verificar a enquete ativa:
              </ItemSub>
              {debates.map((d) => (
                <ItemBtn
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedDebateId(d.id)}
                  style={selectedDebateId === d.id ? { borderColor: '#1A1A2E' } : undefined}
                >
                  <ItemTitle>{d.title}</ItemTitle>
                  <ItemSub>{d.status}</ItemSub>
                </ItemBtn>
              ))}
              {selectedDebateId && activePoll && (
                <ItemBtn
                  type="button"
                  onClick={() => {
                    onSelect({
                      type: 'debatePoll',
                      id: activePoll.id,
                      label: activePoll.question,
                      sub: `${activePoll.options.length} opções`,
                    })
                    onClose()
                  }}
                  style={{ borderColor: '#2DC653', marginTop: 8 }}
                >
                  <ItemTitle>Usar enquete: {activePoll.question}</ItemTitle>
                  <ItemSub>{activePoll.options.map((o) => o.text).join(' · ')}</ItemSub>
                </ItemBtn>
              )}
              {selectedDebateId && activePoll === null && (
                <Empty>Este debate não possui enquete ativa no momento.</Empty>
              )}
            </>
          )}

          {tab === 'propostas' && (
            <>
              {loadingPropostas && <Empty>Carregando propostas...</Empty>}
              {!loadingPropostas && propostas.length === 0 && (
                <Empty>Nenhuma proposta encontrada.</Empty>
              )}
              {propostas.map((p) => (
                <ItemBtn
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onSelect({
                      type: 'proposta',
                      id: p.id,
                      label: p.titulo,
                      sub: p.politico?.name,
                    })
                    onClose()
                  }}
                >
                  <ItemTitle>{p.titulo}</ItemTitle>
                  <ItemSub>
                    {p.status} · {p.politico?.name ?? 'Mandato'}
                  </ItemSub>
                </ItemBtn>
              ))}
            </>
          )}
        </List>
      </Card>
    </Overlay>
  )
}
