import { useState } from 'react'
import styled from 'styled-components'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { ModerationReasonModal } from '../components/moderation/ModerationReasonModal'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  flex-direction: column;
`

const Content = styled.main`
  max-width: 1480px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 32px 64px;
  flex: 1;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
`

const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 28px;
`

const Eyebrow = styled.span`
  display: inline-block;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.action};
  margin-bottom: 4px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`

const ModLink = styled(Link)`
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: none;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`

const Tabs = styled.div`
  display: flex;
  gap: 4px;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 24px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const Tab = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: 0 16px 12px;
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  margin-bottom: -2px;
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.muted)};
  font-size: 0.9375rem;
  font-weight: ${({ $active }) => ($active ? 700 : 400)};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
  margin-bottom: 24px;
`

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px;
`

const StatNum = styled.div<{ $highlight?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.75rem;
  font-weight: 700;
  color: ${({ $highlight, theme }) => ($highlight ? theme.colors.action : theme.colors.primary)};
`

const StatLabel = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 4px;
`

const SectionCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
  margin-bottom: 20px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  font-weight: 700;
  margin-bottom: 12px;
`

const SearchInput = styled.input`
  width: 100%;
  max-width: 360px;
  padding: 9px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  margin-bottom: 16px;
  background: ${({ theme }) => theme.colors.white};
`

const SubFilterRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`

const SubFilterBtn = styled.button<{ $active: boolean }>`
  padding: 7px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
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
  padding: 12px 14px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.muted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};
`

const Td = styled.td`
  padding: 12px 14px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  vertical-align: top;
`

const Select = styled.select`
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 0.8125rem;
  background: ${({ theme }) => theme.colors.white};
`

const ActionBtn = styled.button<{ $danger?: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.border)};
  background: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.white)};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.white : theme.colors.text)};
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const Badge = styled.span`
  display: inline-block;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: 600;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.text};
`

const Empty = styled.div`
  padding: 36px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
`

type SuperTab = 'overview' | 'plans' | 'api-keys' | 'posts' | 'audit'

function OverviewTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-overview'],
    queryFn: () => api.get('/admin/superadmin/overview').then((r) => r.data),
  })

  if (isLoading) return <Empty>Carregando visão operacional...</Empty>
  if (!data) return <Empty>Não foi possível carregar os dados.</Empty>

  const { totals, growth7d } = data

  return (
    <div>
      <Grid>
        <StatCard><StatNum>{totals.users}</StatNum><StatLabel>Usuários totais</StatLabel></StatCard>
        <StatCard><StatNum>{totals.reports}</StatNum><StatLabel>Relatos</StatLabel></StatCard>
        <StatCard><StatNum>{totals.posts}</StatNum><StatLabel>Publicações</StatLabel></StatCard>
        <StatCard><StatNum>{totals.propostas}</StatNum><StatLabel>Propostas</StatLabel></StatCard>
        <StatCard><StatNum>{totals.debates}</StatNum><StatLabel>Debates</StatLabel></StatCard>
        <StatCard><StatNum>{totals.entities}</StatNum><StatLabel>Entidades</StatLabel></StatCard>
        <StatCard><StatNum>{totals.politicians}</StatNum><StatLabel>Políticos</StatLabel></StatCard>
        <StatCard><StatNum>{totals.companies}</StatNum><StatLabel>Empresas</StatLabel></StatCard>
        <StatCard><StatNum $highlight={totals.flagsOpen > 0}>{totals.flagsOpen}</StatNum><StatLabel>Sinalizações abertas</StatLabel></StatCard>
        <StatCard><StatNum $highlight={totals.pendingRequests > 0}>{totals.pendingRequests}</StatNum><StatLabel>Solicitações pendentes</StatLabel></StatCard>
        <StatCard><StatNum>{totals.suggestionsOpen}</StatNum><StatLabel>Sugestões abertas</StatLabel></StatCard>
        <StatCard><StatNum>{totals.activeApiKeys}</StatNum><StatLabel>API Keys ativas</StatLabel></StatCard>
      </Grid>

      <SectionCard>
        <SectionTitle>Crescimento nos últimos 7 dias</SectionTitle>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: '1.25rem' }}>+{growth7d.users}</strong> <span style={{ color: '#6B7280' }}>novos usuários</span></div>
          <div><strong style={{ fontSize: '1.25rem' }}>+{growth7d.reports}</strong> <span style={{ color: '#6B7280' }}>novos relatos</span></div>
          <div><strong style={{ fontSize: '1.25rem' }}>+{growth7d.posts}</strong> <span style={{ color: '#6B7280' }}>novas publicações</span></div>
        </div>
      </SectionCard>
    </div>
  )
}

function PlansTab() {
  const qc = useQueryClient()
  const [target, setTarget] = useState<'companies' | 'entities' | 'politicians'>('companies')
  const [search, setSearch] = useState('')

  const { data: companies, isLoading: loadingCompanies } = useQuery({
    queryKey: ['superadmin-companies', search],
    queryFn: () => api.get('/admin/companies', { params: { search: search || undefined, limit: 30 } }).then((r) => r.data),
    enabled: target === 'companies',
  })

  const { data: entities, isLoading: loadingEntities } = useQuery({
    queryKey: ['superadmin-entities'],
    queryFn: () => api.get('/admin/entities', { params: { limit: 30 } }).then((r) => r.data),
    enabled: target === 'entities',
  })

  const { data: politicians, isLoading: loadingPoliticians } = useQuery({
    queryKey: ['superadmin-politicians'],
    queryFn: () => api.get('/admin/politicians', { params: { limit: 30 } }).then((r) => r.data),
    enabled: target === 'politicians',
  })

  const setCompanyPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => api.patch(`/admin/companies/${id}/plan`, { plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-companies'] }),
  })

  const setEntityPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => api.patch(`/admin/entities/${id}/plan`, { plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-entities'] }),
  })

  const setPoliticianPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => api.patch(`/admin/politicians/${id}/plan`, { plan }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['superadmin-politicians'] }),
  })

  return (
    <div>
      <SubFilterRow>
        <SubFilterBtn $active={target === 'companies'} onClick={() => setTarget('companies')}>Empresas</SubFilterBtn>
        <SubFilterBtn $active={target === 'entities'} onClick={() => setTarget('entities')}>Entidades</SubFilterBtn>
        <SubFilterBtn $active={target === 'politicians'} onClick={() => setTarget('politicians')}>Políticos</SubFilterBtn>
      </SubFilterRow>

      {target === 'companies' && (
        <>
          <SearchInput
            placeholder="Buscar empresa por nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loadingCompanies ? <Empty>Carregando...</Empty> : !companies?.data?.length ? <Empty>Nenhuma empresa encontrada.</Empty> : (
            <Table>
              <thead>
                <tr><Th>Empresa</Th><Th>CNPJ</Th><Th>Setor</Th><Th>Porte</Th><Th>Plano</Th></tr>
              </thead>
              <tbody>
                {companies.data.map((c: any) => (
                  <Tr key={c.id}>
                    <Td><strong>{c.tradeName || c.legalName}</strong></Td>
                    <Td style={{ fontFamily: 'monospace' }}>{c.cnpj}</Td>
                    <Td><Badge>{c.sector}</Badge></Td>
                    <Td>{c.size}</Td>
                    <Td>
                      <Select
                        value={c.plan}
                        disabled={setCompanyPlan.isPending}
                        onChange={(e) => setCompanyPlan.mutate({ id: c.id, plan: e.target.value })}
                      >
                        <option value="STARTER">STARTER</option>
                        <option value="BUSINESS">BUSINESS</option>
                        <option value="ENTERPRISE">ENTERPRISE</option>
                        <option value="WHITE_LABEL">WHITE_LABEL</option>
                      </Select>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </>
      )}

      {target === 'entities' && (
        loadingEntities ? <Empty>Carregando...</Empty> : !entities?.data?.length ? <Empty>Nenhuma entidade encontrada.</Empty> : (
          <Table>
            <thead>
              <tr><Th>Entidade</Th><Th>Tipo</Th><Th>Cidade/UF</Th><Th>Plano</Th></tr>
            </thead>
            <tbody>
              {entities.data.map((ent: any) => (
                <Tr key={ent.id}>
                  <Td><strong>{ent.legalName}</strong></Td>
                  <Td><Badge>{ent.type}</Badge></Td>
                  <Td>{ent.city}/{ent.state}</Td>
                  <Td>
                    <Select
                      value={ent.plan}
                      disabled={setEntityPlan.isPending}
                      onChange={(e) => setEntityPlan.mutate({ id: ent.id, plan: e.target.value })}
                    >
                      <option value="BASICO">BASICO</option>
                      <option value="GESTAO">GESTAO</option>
                      <option value="INTEGRACAO">INTEGRACAO</option>
                    </Select>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )
      )}

      {target === 'politicians' && (
        loadingPoliticians ? <Empty>Carregando...</Empty> : !politicians?.data?.length ? <Empty>Nenhum político encontrado.</Empty> : (
          <Table>
            <thead>
              <tr><Th>Político</Th><Th>Partido</Th><Th>Cargo / UF</Th><Th>Plano</Th></tr>
            </thead>
            <tbody>
              {politicians.data.map((p: any) => (
                <Tr key={p.id}>
                  <Td><strong>{p.name}</strong></Td>
                  <Td><Badge>{p.party}</Badge></Td>
                  <Td>{p.office} · {p.state}</Td>
                  <Td>
                    <Select
                      value={p.plan}
                      disabled={setPoliticianPlan.isPending}
                      onChange={(e) => setPoliticianPlan.mutate({ id: p.id, plan: e.target.value })}
                    >
                      <option value="BASICO">BASICO</option>
                      <option value="MANDATO">MANDATO</option>
                      <option value="MANDATO_PRO">MANDATO_PRO</option>
                    </Select>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )
      )}
    </div>
  )
}

function ApiKeysTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [tierTarget, setTierTarget] = useState<{ id: string; name: string; nextTier: 'FREE' | 'PAID' } | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-api-keys', search],
    queryFn: () => api.get('/admin/api-keys', { params: { search: search || undefined, limit: 30 } }).then((r) => r.data),
  })

  const updateTier = useMutation({
    mutationFn: ({ id, tier, reason }: { id: string; tier: 'FREE' | 'PAID'; reason: string }) =>
      api.patch(`/admin/api-keys/${id}/tier`, { tier, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-api-keys'] })
      setTierTarget(null)
      setErrMsg(null)
    },
    onError: () => setErrMsg('Não foi possível alterar o tier da API key.'),
  })

  return (
    <div>
      <SearchInput
        placeholder="Buscar por nome, prefixo ou e-mail..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhuma API Key encontrada.</Empty> : (
        <Table>
          <thead>
            <tr><Th>Nome</Th><Th>Prefixo</Th><Th>Responsável</Th><Th>Tier</Th><Th>Status</Th><Th>Ação</Th></tr>
          </thead>
          <tbody>
            {data.data.map((k: any) => (
              <Tr key={k.id}>
                <Td><strong>{k.name}</strong></Td>
                <Td style={{ fontFamily: 'monospace' }}>{k.prefix}…</Td>
                <Td>{k.user?.name} ({k.user?.email})</Td>
                <Td><Badge>{k.tier}</Badge></Td>
                <Td>{k.revokedAt ? 'Revogada' : 'Ativa'}</Td>
                <Td>
                  <ActionBtn
                    onClick={() => {
                      setErrMsg(null)
                      setTierTarget({ id: k.id, name: k.name, nextTier: k.tier === 'FREE' ? 'PAID' : 'FREE' })
                    }}
                  >
                    Mudar para {k.tier === 'FREE' ? 'PAID' : 'FREE'}
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <ModerationReasonModal
        isOpen={Boolean(tierTarget)}
        title="Alterar tier da API Key"
        description={`Alterando "${tierTarget?.name ?? ''}" para ${tierTarget?.nextTier ?? ''}. Registre o motivo em auditoria.`}
        confirmLabel="Confirmar alteração"
        isPending={updateTier.isPending}
        errorMessage={errMsg}
        onConfirm={(reason) => {
          if (tierTarget) updateTier.mutate({ id: tierTarget.id, tier: tierTarget.nextTier, reason })
        }}
        onClose={() => setTierTarget(null)}
      />
    </div>
  )
}

function PostsTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; excerpt: string } | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-posts', search],
    queryFn: () => api.get('/admin/posts', { params: { search: search || undefined, limit: 25 } }).then((r) => r.data),
  })

  const delPost = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/admin/posts/${id}`, { data: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-posts'] })
      setDeleteTarget(null)
      setErrMsg(null)
    },
    onError: () => setErrMsg('Não foi possível remover a publicação.'),
  })

  return (
    <div>
      <SearchInput
        placeholder="Buscar publicações por texto..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {isLoading ? <Empty>Carregando...</Empty> : !data?.data?.length ? <Empty>Nenhuma publicação encontrada.</Empty> : (
        <Table>
          <thead>
            <tr><Th>Tipo</Th><Th>Conteúdo</Th><Th>Autor</Th><Th>Engajamento</Th><Th>Ação</Th></tr>
          </thead>
          <tbody>
            {data.data.map((p: any) => (
              <Tr key={p.id}>
                <Td><Badge>{p.kind}</Badge></Td>
                <Td>
                  <Link to={`/publicacoes/${p.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>
                    {p.content.length > 100 ? p.content.slice(0, 100) + '…' : p.content}
                  </Link>
                </Td>
                <Td>{p.authorUser?.name ?? 'Organização'}</Td>
                <Td style={{ fontFamily: 'monospace' }}>
                  {p._count?.likes ?? 0} curtidas · {p._count?.comments ?? 0} coment.
                </Td>
                <Td>
                  <ActionBtn
                    $danger
                    onClick={() => {
                      setErrMsg(null)
                      setDeleteTarget({ id: p.id, excerpt: p.content.slice(0, 60) })
                    }}
                  >
                    Excluir
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <ModerationReasonModal
        isOpen={Boolean(deleteTarget)}
        title="Remover publicação"
        description={`Você está removendo "${deleteTarget?.excerpt ?? ''}...". O motivo ficará registrado em auditoria.`}
        confirmLabel="Remover publicação"
        danger
        isPending={delPost.isPending}
        errorMessage={errMsg}
        onConfirm={(reason) => {
          if (deleteTarget) delPost.mutate({ id: deleteTarget.id, reason })
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function AuditTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['superadmin-audit-logs'],
    queryFn: () => api.get('/admin/audit-logs', { params: { limit: 40 } }).then((r) => r.data),
  })

  if (isLoading) return <Empty>Carregando logs de auditoria...</Empty>
  if (!data?.data?.length) return <Empty>Nenhum registro de auditoria ainda.</Empty>

  return (
    <Table>
      <thead>
        <tr><Th>Ação</Th><Th>Alvo</Th><Th>Motivo</Th><Th>Responsável</Th><Th>Data</Th></tr>
      </thead>
      <tbody>
        {data.data.map((log: any) => (
          <Tr key={log.id}>
            <Td><Badge>{log.action}</Badge></Td>
            <Td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {log.targetType}: {log.targetId.slice(0, 8)}…
            </Td>
            <Td>{log.reason}</Td>
            <Td>{log.actor?.name ?? 'Sistema'}</Td>
            <Td>{new Date(log.createdAt).toLocaleString('pt-BR')}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}

const Tr = styled.tr``

export function Superadmin() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<SuperTab>('overview')

  if (!user || user.type !== 'ADMIN') {
    return <Navigate to="/" replace />
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <HeaderRow>
          <div>
            <Eyebrow>Governança da plataforma</Eyebrow>
            <Title>Painel de Superadmin</Title>
            <Subtitle>Planos, chaves de API, publicações e auditoria da plataforma.</Subtitle>
          </div>
          <ModLink to="/admin">Ir para Painel de Moderação →</ModLink>
        </HeaderRow>

        <Tabs>
          <Tab $active={tab === 'overview'} onClick={() => setTab('overview')}>Visão geral</Tab>
          <Tab $active={tab === 'plans'} onClick={() => setTab('plans')}>Planos &amp; Contas</Tab>
          <Tab $active={tab === 'api-keys'} onClick={() => setTab('api-keys')}>API Keys</Tab>
          <Tab $active={tab === 'posts'} onClick={() => setTab('posts')}>Publicações</Tab>
          <Tab $active={tab === 'audit'} onClick={() => setTab('audit')}>Auditoria</Tab>
        </Tabs>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'api-keys' && <ApiKeysTab />}
        {tab === 'posts' && <PostsTab />}
        {tab === 'audit' && <AuditTab />}
      </Content>
    </Page>
  )
}
