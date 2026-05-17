import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { useEntities } from '../hooks/useEntities'
import { EntityType } from '@votz/shared-types'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
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
`

// ── Cards ──────────────────────────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
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

const Logo = styled.div<{ $src: string | null }>`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  color: ${({ theme }) => theme.colors.muted};
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
  margin-top: 2px;
`

const TypeBadge = styled.span`
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

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
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

// ── Helpers ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  CITY_HALL:       'Prefeitura',
  HOSPITAL:        'Hospital',
  CONCESSIONAIRE:  'Concessionária',
  AUTARCHY:        'Autarquia',
  SECRETARIAT:     'Secretaria',
  OTHER:           'Outro',
}

// ── Componente ─────────────────────────────────────────────────────────────

export function EntitiesList() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState<EntityType | ''>('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = useEntities({
    search: search || undefined,
    type: type || undefined,
    state: state || undefined,
    page,
  })

  function handleSearch(v: string) { setSearch(v); setPage(1) }
  function handleType(v: string) { setType(v as EntityType | ''); setPage(1) }
  function handleState(v: string) { setState(v); setPage(1) }

  return (
    <Page>
      <Navbar />
      <Content>
        <PageHeader>
          <Title>Entidades públicas</Title>
          <Subtitle>Prefeituras, hospitais, concessionárias e outras instituições.</Subtitle>
        </PageHeader>

        <Filters>
          <SearchInput
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          <Select value={type} onChange={(e) => handleType(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(ENTITY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <SearchInput
            placeholder="Estado (ex: SP)"
            value={state}
            onChange={(e) => handleState(e.target.value.toUpperCase())}
            style={{ maxWidth: 90 }}
          />
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
              {data.data.map((e) => (
                <Card key={e.id} to={`/entidade/${e.id}`}>
                  <CardTop>
                    <Logo $src={e.logoUrl}>
                      {!e.logoUrl && e.legalName.charAt(0)}
                    </Logo>
                    <CardInfo>
                      <CardName>{e.legalName}</CardName>
                      <CardMeta>
                        <TypeBadge>{ENTITY_TYPE_LABELS[e.type] ?? e.type}</TypeBadge>
                        {e.verified && <VerifiedDot>✓</VerifiedDot>}
                      </CardMeta>
                    </CardInfo>
                  </CardTop>

                  {(e.city || e.state) && (
                    <Location>📍 {[e.city, e.state].filter(Boolean).join(', ')}</Location>
                  )}

                  <CardStats>
                    <Stat>
                      <StatValue $color={
                        e.votzScore >= 70 ? '#2DC653' :
                        e.votzScore >= 40 ? '#F59E0B' : '#E63946'
                      }>
                        {Math.round(e.votzScore)}
                      </StatValue>
                      <StatLabel>Votz Score</StatLabel>
                    </Stat>
                  </CardStats>
                </Card>
              ))}
            </Grid>

            {data.meta.totalPages > 1 && (
              <Pagination>
                <PageBtn disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</PageBtn>
                {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map((p) => (
                  <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
                ))}
                <PageBtn disabled={page === data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>→</PageBtn>
              </Pagination>
            )}
          </>
        ) : (
          <Empty>
            {search || type || state
              ? 'Nenhuma entidade encontrada com esses filtros.'
              : 'Nenhuma entidade cadastrada ainda.'}
          </Empty>
        )}
      </Content>
    </Page>
  )
}
