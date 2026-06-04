import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { usePoliticians, useParties, usePoliticianCities } from '../hooks/usePoliticians'
import type { PoliticianStatus } from '../types/api'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 820px) { padding: 16px 16px 48px; }
`

const PageHeader = styled.div`
  margin-bottom: 28px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Filtros ────────────────────────────────────────────────────────────────

const Filters = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
  align-items: center;
`

const SearchInput = styled.input`
  flex: 1;
  min-width: 200px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`


const Select = styled.select`
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 30px;
  transition: border-color 0.15s;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

const StatusToggle = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  height: 40px;
`

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 0 14px;
  border: none;
  background: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.white};
  color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ $active }) => $active ? 600 : 400};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  &:not(:last-child) { border-right: 1px solid ${({ theme }) => theme.colors.border}; }
  &:hover { background: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.neutral}; }
`

const VerifiedBtn = styled.button<{ $active: boolean }>`
  height: 40px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.positive : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.positive + '18' : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? theme.colors.positive : theme.colors.muted)};
  font-size: 0.875rem;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.positive}; }
`

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

const OFFICES = [
  'Vereador',
  'Prefeito',
  'Deputado Estadual',
  'Deputado Federal',
  'Senador',
  'Governador',
  'Presidente',
]

// ── Cards ──────────────────────────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
`

const Card = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
  transition: all 0.15s;

  &:hover {
    border-color: #c4c4c4;
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-1px);
  }
`

const CardTop = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`

const Avatar = styled.div<{ $src: string | null }>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const CardInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const CardName = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 2px;
`

const Badge = styled.span`
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary}12;
  color: ${({ theme }) => theme.colors.primary};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const VerifiedDot = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.positive};
`

const Location = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const CardStats = styled.div`
  display: flex;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const Stat = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`

const StatValue = styled.span<{ $color?: string }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
`

const StatLabel = styled.span`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

// ── Paginação ──────────────────────────────────────────────────────────────

function getPageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | null)[] = [1]
  const left = current - 2
  const right = current + 2
  if (left > 2) pages.push(null)
  for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) pages.push(i)
  if (right < total - 1) pages.push(null)
  pages.push(total)
  return pages
}

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 32px;
`

const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.text)};
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const Ellipsis = styled.span`
  min-width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
  user-select: none;
`

// ── Skeleton / Empty ───────────────────────────────────────────────────────

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`

const Empty = styled.div`
  text-align: center;
  padding: 64px 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
`

// ── Componente ─────────────────────────────────────────────────────────────

export function PoliticiansList() {
  const [search, setSearch] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [party, setParty] = useState('')
  const [office, setOffice] = useState('')
  const [verified, setVerified] = useState(false)
  const [statusFilter, setStatusFilter] = useState<PoliticianStatus | ''>('ATIVO')
  const [page, setPage] = useState(1)

  const { data, isLoading } = usePoliticians({
    search: search || undefined,
    state: state || undefined,
    city: city || undefined,
    party: party || undefined,
    office: office || undefined,
    verified: verified || undefined,
    status: (statusFilter as PoliticianStatus) || undefined,
    page,
  })

  const { data: cities } = usePoliticianCities(state || undefined)
  const { data: parties } = useParties()

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleState(v: string) { setState(v); setPage(1) }
  function handleCity(v: string) { setCity(v); setPage(1) }
  function handleParty(v: string) { setParty(v); setPage(1) }
  function handleOffice(v: string) { setOffice(v); setPage(1) }
  function toggleVerified() { setVerified((v) => !v); setPage(1) }
  function handleStatus(v: PoliticianStatus | '') { setStatusFilter(v); setPage(1) }

  return (
    <Page>
      <Navbar />
      <Content>
        <PageHeader>
          <Title>Políticos</Title>
          <Subtitle>Vereadores, prefeitos, deputados e outros mandatários.</Subtitle>
        </PageHeader>

        <Filters>
          <SearchInput
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <Select value={party} onChange={(e) => handleParty(e.target.value)}>
            <option value="">Todos os partidos</option>
            {parties?.map((p) => (
              <option key={p.id} value={p.abbreviation}>{p.abbreviation} — {p.name}</option>
            ))}
          </Select>
          <Select value={office} onChange={(e) => handleOffice(e.target.value)}>
            <option value="">Todos os cargos</option>
            {OFFICES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
          <Select value={state} onChange={(e) => handleState(e.target.value)}>
            <option value="">Todos os estados</option>
            {BR_STATES.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </Select>
          <Select value={city} onChange={(e) => handleCity(e.target.value)}>
            <option value="">Todos os municípios</option>
            {cities?.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
          <VerifiedBtn $active={verified} onClick={toggleVerified}>
            ✓ Somente verificados
          </VerifiedBtn>
          <StatusToggle>
            <ToggleBtn $active={statusFilter === 'ATIVO'} onClick={() => handleStatus('ATIVO')}>Ativos</ToggleBtn>
            <ToggleBtn $active={statusFilter === 'ENCERRADO'} onClick={() => handleStatus('ENCERRADO')}>Encerrados</ToggleBtn>
            <ToggleBtn $active={statusFilter === ''} onClick={() => handleStatus('')}>Todos</ToggleBtn>
          </StatusToggle>
        </Filters>

        {isLoading ? (
          <Grid>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} style={{ height: 148 }} />
            ))}
          </Grid>
        ) : data && data.data.length > 0 ? (
          <>
            <Grid>
              {data.data.map((p) => {
                const resolved = p.mandatometer?.resolved ?? 0
                const total = p.mandatometer?.total ?? 0
                const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : null

                return (
                  <Card key={p.id} to={`/politico/${p.id}`}>
                    <CardTop>
                      <Avatar $src={p.avatarUrl ?? null}>
                        {!p.avatarUrl && p.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <CardInfo>
                        <CardName>{p.name}</CardName>
                        <CardMeta>
                          <Badge>{p.party.abbreviation}</Badge>
                          <Badge>{p.office}</Badge>
                          {p.verified && <VerifiedDot>✓</VerifiedDot>}
                          {p.status === 'ENCERRADO' && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 7px', borderRadius: 99, background: '#6B728018', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Encerrado
                            </span>
                          )}
                        </CardMeta>
                      </CardInfo>
                    </CardTop>

                    {(p.city || p.state) && (
                      <Location>📍 {[p.city, p.state].filter(Boolean).join(', ')}</Location>
                    )}

                    <CardStats>
                      <Stat>
                        <StatValue>{total}</StatValue>
                        <StatLabel>Relatos</StatLabel>
                      </Stat>
                      {resolutionRate !== null && (
                        <Stat>
                          <StatValue $color={
                            resolutionRate >= 70 ? '#2DC653' :
                            resolutionRate >= 40 ? '#F59E0B' : '#E63946'
                          }>
                            {resolutionRate}%
                          </StatValue>
                          <StatLabel>Resolvidos</StatLabel>
                        </Stat>
                      )}
                    </CardStats>
                  </Card>
                )
              })}
            </Grid>

            {data.meta.totalPages > 1 && (
              <Pagination>
                <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</PageBtn>
                {getPageRange(page, data.meta.totalPages).map((p, i) =>
                  p === null
                    ? <Ellipsis key={`e-${i}`}>…</Ellipsis>
                    : <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
                )}
                <PageBtn disabled={page === data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>→</PageBtn>
              </Pagination>
            )}
          </>
        ) : (
          <Empty>
            {search || state || city || party || office || verified
              ? 'Nenhum político encontrado com esses filtros.'
              : 'Nenhum político cadastrado ainda.'}
          </Empty>
        )}
      </Content>
    </Page>
  )
}

