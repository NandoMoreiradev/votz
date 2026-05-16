import { useState } from 'react'
import styled from 'styled-components'
import { Link, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'

// ── Acesso ─────────────────────────────────────────────────────────────────

const ALLOWED = new Set(['MODERATOR', 'ADMIN'])

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 32px 16px 80px;
`

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 24px;
`

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 32px;
`

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
`

const StatNum = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const StatLabel = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const Tabs = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 24px;
`

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.muted};
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.colors.primary : 'transparent'};
  margin-bottom: -2px;
  transition: all 0.15s;

  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const SearchInput = styled.input`
  width: 100%;
  max-width: 320px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  margin-bottom: 16px;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  overflow: hidden;
`

const Th = styled.th`
  text-align: left;
  padding: 10px 14px;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: ${({ theme }) => theme.colors.neutral};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const Td = styled.td`
  padding: 10px 14px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: middle;
`

const Tr = styled.tr`
  &:last-child td { border-bottom: none; }
  &:hover td { background: ${({ theme }) => theme.colors.neutral}; }
`

const ActionBtn = styled.button<{ $variant?: 'danger' | 'success' | 'default' }>`
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  border: 1px solid;
  transition: all 0.15s;
  margin-right: 6px;

  ${({ $variant, theme }) =>
    $variant === 'danger'
      ? `color: ${theme.colors.action}; border-color: ${theme.colors.action}; background: transparent; &:hover { background: ${theme.colors.action}; color: #fff; }`
      : $variant === 'success'
      ? `color: ${theme.colors.positive}; border-color: ${theme.colors.positive}; background: transparent; &:hover { background: ${theme.colors.positive}; color: #fff; }`
      : `color: ${theme.colors.primary}; border-color: ${theme.colors.primary}; background: transparent; &:hover { background: ${theme.colors.primary}; color: #fff; }`
  }
`

const Badge = styled.span<{ $color?: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.7rem;
  font-weight: 600;
  background: ${({ $color }) => ($color ?? '#6B7280') + '18'};
  color: ${({ $color }) => $color ?? '#6B7280'};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const Empty = styled.div`
  text-align: center;
  padding: 48px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
`

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
`

const FilterBtn = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.8125rem;
  cursor: pointer;
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '12' : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.muted};
`

// ── Hooks ──────────────────────────────────────────────────────────────────

function useAdminStats() {
  return useQuery({ queryKey: ['admin-stats'], queryFn: () => api.get('/admin/stats').then(r => r.data), staleTime: 30_000 })
}

function useAdminUsers(search: string, page: number) {
  return useQuery({
    queryKey: ['admin-users', search, page],
    queryFn: () => api.get('/admin/users', { params: { search: search || undefined, page, limit: 20 } }).then(r => r.data),
    staleTime: 10_000,
  })
}

function useAdminReports(search: string, page: number) {
  return useQuery({
    queryKey: ['admin-reports', search, page],
    queryFn: () => api.get('/admin/reports', { params: { search: search || undefined, page, limit: 20 } }).then(r => r.data),
    staleTime: 10_000,
  })
}

function useAdminEntities(verified: boolean | undefined, page: number) {
  return useQuery({
    queryKey: ['admin-entities', verified, page],
    queryFn: () => api.get('/admin/entities', { params: { verified: verified === undefined ? undefined : String(verified), page, limit: 20 } }).then(r => r.data),
    staleTime: 10_000,
  })
}

function useAdminPoliticians(verified: boolean | undefined, page: number) {
  return useQuery({
    queryKey: ['admin-politicians', verified, page],
    queryFn: () => api.get('/admin/politicians', { params: { verified: verified === undefined ? undefined : String(verified), page, limit: 20 } }).then(r => r.data),
    staleTime: 10_000,
  })
}

// ── Sub-abas ───────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminUsers(search, page)

  const ban = useMutation({
    mutationFn: ({ id, banned }: { id: string; banned: boolean }) =>
      api.patch(`/admin/users/${id}/ban`, { banned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  return (
    <div>
      <SearchInput placeholder="Buscar por nome ou e-mail..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhum usuário encontrado.</Empty> : (
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th><Th>E-mail</Th><Th>Tipo</Th><Th>Status</Th><Th>Relatos</Th><Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((u: any) => (
              <Tr key={u.id}>
                <Td>{u.name}</Td>
                <Td style={{ color: '#6B7280' }}>{u.email}</Td>
                <Td><Badge>{u.type}</Badge></Td>
                <Td>
                  {u.banned
                    ? <Badge $color="#E63946">Banido</Badge>
                    : <Badge $color="#2DC653">Ativo</Badge>}
                </Td>
                <Td style={{ fontFamily: 'monospace' }}>{u._count?.reports ?? 0}</Td>
                <Td>
                  <ActionBtn
                    $variant={u.banned ? 'success' : 'danger'}
                    onClick={() => ban.mutate({ id: u.id, banned: !u.banned })}
                  >
                    {u.banned ? 'Desbanir' : 'Banir'}
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function ReportsTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminReports(search, page)

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reports'] }),
  })

  const STATUS_COLORS: Record<string, string> = {
    OPEN: '#6B7280', UNDER_REVIEW: '#3B82F6', IN_PROGRESS: '#F59E0B',
    RESOLVED: '#2DC653', DISPUTED: '#E63946', ARCHIVED: '#9CA3AF',
  }

  return (
    <div>
      <SearchInput placeholder="Buscar por título..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhum relato encontrado.</Empty> : (
        <Table>
          <thead>
            <tr>
              <Th>Título</Th><Th>Categoria</Th><Th>Status</Th><Th>Autor</Th><Th>Votos</Th>{isAdmin && <Th>Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {data.data.map((r: any) => (
              <Tr key={r.id}>
                <Td>
                  <Link to={`/relatos/${r.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {r.title.length > 60 ? r.title.slice(0, 60) + '…' : r.title}
                  </Link>
                </Td>
                <Td><Badge>{r.category}</Badge></Td>
                <Td><Badge $color={STATUS_COLORS[r.status]}>{r.status}</Badge></Td>
                <Td>{r.anonymous ? <span style={{ color: '#9CA3AF' }}>Anônimo</span> : r.author?.name}</Td>
                <Td style={{ fontFamily: 'monospace' }}>{r._count?.votes ?? 0}</Td>
                {isAdmin && (
                  <Td>
                    <ActionBtn $variant="danger" onClick={() => { if (confirm('Excluir este relato?')) del.mutate(r.id) }}>
                      Excluir
                    </ActionBtn>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function EntitiesTab() {
  const qc = useQueryClient()
  const [verified, setVerified] = useState<boolean | undefined>(false)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminEntities(verified, page)

  const verify = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => api.patch(`/admin/entities/${id}/verify`, { verified: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-entities'] }),
  })

  return (
    <div>
      <FilterRow>
        <FilterBtn $active={verified === false} onClick={() => { setVerified(false); setPage(1) }}>Pendentes</FilterBtn>
        <FilterBtn $active={verified === true} onClick={() => { setVerified(true); setPage(1) }}>Verificadas</FilterBtn>
        <FilterBtn $active={verified === undefined} onClick={() => { setVerified(undefined); setPage(1) }}>Todas</FilterBtn>
      </FilterRow>
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhuma entidade encontrada.</Empty> : (
        <Table>
          <thead>
            <tr><Th>Nome</Th><Th>CNPJ</Th><Th>Tipo</Th><Th>Estado</Th><Th>Status</Th><Th>Ações</Th></tr>
          </thead>
          <tbody>
            {data.data.map((e: any) => (
              <Tr key={e.id}>
                <Td>
                  <Link to={`/entidade/${e.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{e.legalName}</Link>
                </Td>
                <Td style={{ fontFamily: 'monospace', color: '#6B7280' }}>{e.cnpj}</Td>
                <Td><Badge>{e.type}</Badge></Td>
                <Td>{e.state}</Td>
                <Td>{e.verified ? <Badge $color="#2DC653">Verificada</Badge> : <Badge $color="#F59E0B">Pendente</Badge>}</Td>
                <Td>
                  <ActionBtn
                    $variant={e.verified ? 'danger' : 'success'}
                    onClick={() => verify.mutate({ id: e.id, v: !e.verified })}
                  >
                    {e.verified ? 'Remover verificação' : 'Verificar'}
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function PoliticiansTab() {
  const qc = useQueryClient()
  const [verified, setVerified] = useState<boolean | undefined>(false)
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAdminPoliticians(verified, page)

  const verify = useMutation({
    mutationFn: ({ id, v }: { id: string; v: boolean }) => api.patch(`/admin/politicians/${id}/verify`, { verified: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-politicians'] }),
  })

  return (
    <div>
      <FilterRow>
        <FilterBtn $active={verified === false} onClick={() => { setVerified(false); setPage(1) }}>Pendentes</FilterBtn>
        <FilterBtn $active={verified === true} onClick={() => { setVerified(true); setPage(1) }}>Verificados</FilterBtn>
        <FilterBtn $active={verified === undefined} onClick={() => { setVerified(undefined); setPage(1) }}>Todos</FilterBtn>
      </FilterRow>
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhum político encontrado.</Empty> : (
        <Table>
          <thead>
            <tr><Th>Nome</Th><Th>E-mail</Th><Th>Partido</Th><Th>Cargo</Th><Th>Estado</Th><Th>Status</Th><Th>Ações</Th></tr>
          </thead>
          <tbody>
            {data.data.map((p: any) => (
              <Tr key={p.id}>
                <Td>
                  <Link to={`/politico/${p.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{p.user.name}</Link>
                </Td>
                <Td style={{ color: '#6B7280' }}>{p.user.email}</Td>
                <Td><Badge>{p.party}</Badge></Td>
                <Td>{p.office}</Td>
                <Td>{p.state}</Td>
                <Td>{p.verified ? <Badge $color="#2DC653">Verificado</Badge> : <Badge $color="#F59E0B">Pendente</Badge>}</Td>
                <Td>
                  <ActionBtn
                    $variant={p.verified ? 'danger' : 'success'}
                    onClick={() => verify.mutate({ id: p.id, v: !p.verified })}
                  >
                    {p.verified ? 'Remover verificação' : 'Verificar'}
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────

type TabId = 'users' | 'reports' | 'entities' | 'politicians'

export function Admin() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabId>('entities')
  const { data: stats } = useAdminStats()

  if (!user || !ALLOWED.has(user.type)) return <Navigate to="/" replace />

  const isAdmin = user.type === 'ADMIN'

  return (
    <Page>
      <Navbar />
      <Content>
        <PageTitle>Painel de moderação</PageTitle>

        {stats && (
          <StatsGrid>
            <StatCard>
              <StatNum>{stats.users.toLocaleString('pt-BR')}</StatNum>
              <StatLabel>Usuários</StatLabel>
            </StatCard>
            <StatCard>
              <StatNum>{stats.reports.toLocaleString('pt-BR')}</StatNum>
              <StatLabel>Relatos</StatLabel>
            </StatCard>
            <StatCard>
              <StatNum style={{ color: stats.pendingEntities > 0 ? '#F59E0B' : undefined }}>
                {stats.pendingEntities}
              </StatNum>
              <StatLabel>Entidades pendentes</StatLabel>
            </StatCard>
            <StatCard>
              <StatNum style={{ color: stats.pendingPoliticians > 0 ? '#F59E0B' : undefined }}>
                {stats.pendingPoliticians}
              </StatNum>
              <StatLabel>Políticos pendentes</StatLabel>
            </StatCard>
          </StatsGrid>
        )}

        <Tabs>
          <Tab $active={tab === 'entities'} onClick={() => setTab('entities')}>Entidades</Tab>
          <Tab $active={tab === 'politicians'} onClick={() => setTab('politicians')}>Políticos</Tab>
          <Tab $active={tab === 'reports'} onClick={() => setTab('reports')}>Relatos</Tab>
          {isAdmin && <Tab $active={tab === 'users'} onClick={() => setTab('users')}>Usuários</Tab>}
        </Tabs>

        {tab === 'entities' && <EntitiesTab />}
        {tab === 'politicians' && <PoliticiansTab />}
        {tab === 'reports' && <ReportsTab isAdmin={isAdmin} />}
        {tab === 'users' && isAdmin && <UsersTab />}
      </Content>
    </Page>
  )
}
