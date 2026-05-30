import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { CategoryBadge, PropostaStatusBadge } from '../components/ui/Badge'
import { usePropostas } from '../hooks/usePropostas'
import { Category } from '@votz/shared-types'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px 64px;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
`

const Header = styled.div`
  margin-bottom: 28px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Filters = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`

const FilterBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.muted};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ $active, theme }) => $active ? '#fff' : theme.colors.primary}; }
`

const PropostaList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const PropostaCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 22px;
  transition: all 0.15s;
  &:hover { border-color: #c4c4c4; box-shadow: ${({ theme }) => theme.shadows.md}; transform: translateY(-1px); }
`

const CardHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
`

const Badges = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const CardTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
  line-height: 1.4;
`

const CardDesc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const CardFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 12px;
`

const PoliticoInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const PoliticoAvatar = styled.div<{ $src: string | null }>`
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.primary + '20'};
  border: 1px solid ${({ theme }) => theme.colors.border};
  flex-shrink: 0;
`

const PoliticoName = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const VoteStat = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Dot = styled.span` color: ${({ theme }) => theme.colors.border}; `

const DateSpan = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-left: auto;
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  animation: pulse 1.4s ease-in-out infinite;
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  padding: 60px 0;
`

const Pagination = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 24px;
`

const PageBtn = styled.button<{ $active?: boolean }>`
  min-width: 34px; height: 34px; padding: 0 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ theme, $active }) => $active ? theme.colors.primary : theme.colors.white};
  color: ${({ theme, $active }) => $active ? '#fff' : theme.colors.text};
  font-size: 0.875rem; cursor: pointer; transition: all 0.15s;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
`

const STATUS_FILTERS = [
  { label: 'Todas', value: '' },
  { label: 'Apresentadas', value: 'PRESENTED' },
  { label: 'Em votação', value: 'IN_VOTE' },
  { label: 'Aprovadas', value: 'APPROVED' },
  { label: 'Rejeitadas', value: 'REJECTED' },
]

const CAT_FILTERS = [
  { label: 'Todas áreas', value: '' },
  { label: 'Saúde', value: Category.HEALTH },
  { label: 'Mobilidade', value: Category.MOBILITY },
  { label: 'Educação', value: Category.EDUCATION },
  { label: 'Segurança', value: Category.SAFETY },
  { label: 'Meio Ambiente', value: Category.ENVIRONMENT },
]

function timeAgo(iso: string) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d`
  return `${Math.floor(d / 30)}m`
}

export function PropostasList() {
  const [statusFilter, setStatusFilter] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading } = usePropostas({
    status: statusFilter || undefined,
    categoria: catFilter || undefined,
    page,
    limit: 20,
  })

  function handleStatus(val: string) {
    setStatusFilter(val)
    setPage(1)
  }

  function handleCat(val: string) {
    setCatFilter(val)
    setPage(1)
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <Header>
          <Title>Propostas Políticas</Title>
          <Subtitle>Acompanhe as propostas dos seus representantes e manifeste sua opinião.</Subtitle>
        </Header>

        <Filters>
          {STATUS_FILTERS.map(f => (
            <FilterBtn key={f.value} $active={statusFilter === f.value} onClick={() => handleStatus(f.value)}>
              {f.label}
            </FilterBtn>
          ))}
        </Filters>

        <Filters>
          {CAT_FILTERS.map(f => (
            <FilterBtn key={f.value} $active={catFilter === f.value} onClick={() => handleCat(f.value)}>
              {f.label}
            </FilterBtn>
          ))}
        </Filters>

        {isLoading ? (
          <PropostaList>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} style={{ height: 130 }} />)}
          </PropostaList>
        ) : data && data.data.length > 0 ? (
          <>
            <PropostaList>
              {data.data.map(p => (
                <PropostaCard key={p.id} to={`/propostas/${p.id}`}>
                  <CardHeader>
                    <Badges>
                      <PropostaStatusBadge status={p.status} />
                      {p.categorias.slice(0, 2).map(c => (
                        <CategoryBadge key={c} category={c as Category} />
                      ))}
                    </Badges>
                  </CardHeader>
                  <CardTitle>{p.titulo}</CardTitle>
                  <CardDesc>{p.descricao.replace(/#+\s/g, '').replace(/\*\*/g, '')}</CardDesc>
                  <CardFooter>
                    {p.politico && (
                      <PoliticoInfo>
                        <PoliticoAvatar $src={p.politico.avatarUrl ?? null} />
                        <PoliticoName>
                          {p.politico.name} · {p.politico.party.abbreviation}
                        </PoliticoName>
                      </PoliticoInfo>
                    )}
                    <Dot>·</Dot>
                    <VoteStat>▲ {p.totalApoios}</VoteStat>
                    <Dot>·</Dot>
                    <VoteStat>▼ {p.totalRejeicoes}</VoteStat>
                    <DateSpan>{timeAgo(p.createdAt)}</DateSpan>
                  </CardFooter>
                </PropostaCard>
              ))}
            </PropostaList>

            {data.meta.totalPages > 1 && (
              <Pagination>
                <PageBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</PageBtn>
                {Array.from({ length: data.meta.totalPages }, (_, i) => i + 1).map(p => (
                  <PageBtn key={p} $active={p === page} onClick={() => setPage(p)}>{p}</PageBtn>
                ))}
                <PageBtn disabled={page === data.meta.totalPages} onClick={() => setPage(p => p + 1)}>→</PageBtn>
              </Pagination>
            )}
          </>
        ) : (
          <Empty>Nenhuma proposta encontrada com esses filtros.</Empty>
        )}
      </Content>
    </Page>
  )
}
