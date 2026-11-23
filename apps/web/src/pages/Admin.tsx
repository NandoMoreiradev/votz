import { useState } from 'react'
import styled from 'styled-components'
import { Link, Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FlagStatus, FlagTargetType, SuggestionStatus } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import {
  ContentFlagItem,
  FLAG_REASON_LABEL_MAP,
  useAdminFlags,
  useResolveFlag,
} from '../hooks/useModeration'
import { ModerationReasonModal } from '../components/moderation/ModerationReasonModal'
import {
  PlatformSuggestionItem,
  useSuggestions,
  useUpdateSuggestionStatus,
} from '../hooks/useSuggestions'
import { SUGGESTION_CATEGORY_LABEL, SUGGESTION_STATUS_META } from './Sugestoes'
import { AdReviewQueue } from '../components/ads/AdReviewQueue'
import { PressCredentialQueue } from '../components/press/PressCredentialQueue'
import { useAdReviewQueue } from '../hooks/useAds'

function extractApiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(msg)) return msg[0] || fallback
  return msg || fallback
}

// ── Acesso ─────────────────────────────────────────────────────────────────

const ALLOWED = new Set(['MODERATOR', 'ADMIN'])

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
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

const TabCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

const PreviewExcerpt = styled.p`
  margin: 4px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.4;
`

const PreviewLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: underline;
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

const RoleSelect = styled.select`
  font-size: 0.8125rem;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
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

const ASSIGNABLE_ROLES = ['CITIZEN', 'PRESS', 'NGO', 'RESEARCHER', 'MODERATOR', 'ADMIN'] as const

function UsersTab() {
  const qc = useQueryClient()
  const currentUser = useAuthStore((s) => s.user)
  const isAdmin = currentUser?.type === 'ADMIN'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [banTarget, setBanTarget] = useState<{ id: string; name: string } | null>(null)
  const [banError, setBanError] = useState<string | null>(null)
  const [typeTarget, setTypeTarget] = useState<{
    id: string
    name: string
    nextType: string
  } | null>(null)
  const [typeError, setTypeError] = useState<string | null>(null)
  const { data, isLoading } = useAdminUsers(search, page)

  const ban = useMutation({
    mutationFn: ({ id, banned, reason }: { id: string; banned: boolean; reason?: string }) =>
      api.patch(`/admin/users/${id}/ban`, { banned, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setBanTarget(null)
      setBanError(null)
    },
    onError: (err) => {
      setBanError(extractApiError(err, 'Não foi possível atualizar o status do usuário.'))
    },
  })

  const changeType = useMutation({
    mutationFn: ({ id, type, reason }: { id: string; type: string; reason: string }) =>
      api.patch(`/admin/users/${id}/type`, { type, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setTypeTarget(null)
      setTypeError(null)
    },
    onError: (err) => {
      setTypeError(extractApiError(err, 'Não foi possível alterar o papel do usuário.'))
    },
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
                <Td>
                  {isAdmin && u.id !== currentUser?.id ? (
                    <RoleSelect
                      aria-label={`Papel de ${u.name}`}
                      value={u.type}
                      onChange={(ev) => {
                        const nextType = ev.target.value
                        if (nextType === u.type) return
                        setTypeError(null)
                        setTypeTarget({ id: u.id, name: u.name, nextType })
                      }}
                    >
                      {!ASSIGNABLE_ROLES.includes(u.type) && (
                        <option value={u.type} disabled>
                          {u.type} (cadastro)
                        </option>
                      )}
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </RoleSelect>
                  ) : (
                    <Badge>{u.type}</Badge>
                  )}
                </Td>
                <Td>
                  {u.banned
                    ? <Badge $color="#E63946">Banido</Badge>
                    : <Badge $color="#2DC653">Ativo</Badge>}
                </Td>
                <Td style={{ fontFamily: 'monospace' }}>{u._count?.reports ?? 0}</Td>
                <Td>
                  <ActionBtn
                    $variant={u.banned ? 'success' : 'danger'}
                    onClick={() => {
                      if (u.banned) {
                        ban.mutate({ id: u.id, banned: false })
                      } else {
                        setBanError(null)
                        setBanTarget({ id: u.id, name: u.name })
                      }
                    }}
                  >
                    {u.banned ? 'Desbanir' : 'Banir'}
                  </ActionBtn>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <ModerationReasonModal
        isOpen={Boolean(banTarget)}
        title={`Banir ${banTarget?.name ?? 'usuário'}`}
        description="O usuário será bloqueado imediatamente e receberá este motivo por e-mail com instruções para contestação."
        confirmLabel="Confirmar banimento"
        isPending={ban.isPending}
        errorMessage={banError}
        onConfirm={(reason) => {
          if (banTarget) ban.mutate({ id: banTarget.id, banned: true, reason })
        }}
        onClose={() => {
          setBanTarget(null)
          setBanError(null)
        }}
      />
      <ModerationReasonModal
        isOpen={Boolean(typeTarget)}
        title={`Alterar papel de ${typeTarget?.name ?? 'usuário'}`}
        description={`Novo papel: ${typeTarget?.nextType ?? ''}. As sessões ativas deste usuário serão revogadas para aplicar a mudança.`}
        confirmLabel="Confirmar alteração"
        danger={typeTarget?.nextType === 'ADMIN'}
        isPending={changeType.isPending}
        errorMessage={typeError}
        onConfirm={(reason) => {
          if (typeTarget) {
            changeType.mutate({ id: typeTarget.id, type: typeTarget.nextType, reason })
          }
        }}
        onClose={() => {
          setTypeTarget(null)
          setTypeError(null)
        }}
      />
    </div>
  )
}

function ReportsTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const { data, isLoading } = useAdminReports(search, page)

  const del = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.delete(`/admin/reports/${id}`, { data: { reason } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-reports'] })
      qc.invalidateQueries({ queryKey: ['admin-flags'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setDeleteTarget(null)
      setDeleteError(null)
    },
    onError: (err) => {
      setDeleteError(extractApiError(err, 'Não foi possível remover o relato.'))
    },
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
              <Th>Título</Th><Th>Categoria</Th><Th>Status</Th><Th>Autor</Th><Th>Votos</Th><Th>Ações</Th>
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
                <Td>
                  <ActionBtn
                    $variant="danger"
                    onClick={() => {
                      setDeleteError(null)
                      setDeleteTarget({ id: r.id, title: r.title })
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
        title="Remover relato"
        description={`Você está removendo "${deleteTarget?.title ?? ''}". O motivo será registrado em auditoria e enviado ao autor, se identificado.`}
        confirmLabel="Remover relato"
        isPending={del.isPending}
        errorMessage={deleteError}
        onConfirm={(reason) => {
          if (deleteTarget) del.mutate({ id: deleteTarget.id, reason })
        }}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
      />
    </div>
  )
}

function FlagsTab() {
  const [status, setStatus] = useState<FlagStatus>(FlagStatus.OPEN)
  const [page, setPage] = useState(1)
  const [pendingAction, setPendingAction] = useState<{
    flag: ContentFlagItem
    action: 'DISMISS' | 'REMOVE_CONTENT'
  } | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  const { data, isLoading } = useAdminFlags(status, page)
  const resolveFlag = useResolveFlag()

  const FLAG_STATUS_LABEL: Record<FlagStatus, string> = {
    OPEN: 'Abertas',
    ACTIONED: 'Removidas',
    DISMISSED: 'Descartadas',
  }

  return (
    <div>
      <FilterRow>
        {([FlagStatus.OPEN, FlagStatus.ACTIONED, FlagStatus.DISMISSED] as FlagStatus[]).map((st) => (
          <FilterBtn
            key={st}
            $active={status === st}
            onClick={() => {
              setStatus(st)
              setPage(1)
            }}
          >
            {FLAG_STATUS_LABEL[st]}
          </FilterBtn>
        ))}
      </FilterRow>

      {isLoading ? (
        <Empty>Carregando...</Empty>
      ) : !data?.data?.length ? (
        <Empty>Nenhuma sinalização neste filtro.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Conteúdo</Th>
              <Th>Motivo e detalhes</Th>
              <Th>Sinalizado por</Th>
              <Th>Data</Th>
              <Th>{status === FlagStatus.OPEN ? 'Ações' : 'Observação'}</Th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((flag) => (
              <Tr key={flag.id}>
                <Td>
                  <div>
                    <Badge>
                      {flag.targetType === FlagTargetType.REPORT
                        ? 'Relato'
                        : flag.targetType === FlagTargetType.POST
                        ? 'Publicação'
                        : flag.targetType === FlagTargetType.POST_COMMENT
                        ? 'Comentário de publicação'
                        : 'Comentário'}
                    </Badge>
                    {flag.targetPreview.link && (
                      <span style={{ marginLeft: 8 }}>
                        <PreviewLink to={flag.targetPreview.link}>Ver conteúdo</PreviewLink>
                      </span>
                    )}
                  </div>
                  {flag.targetPreview.title && (
                    <div style={{ fontWeight: 600, marginTop: 4 }}>{flag.targetPreview.title}</div>
                  )}
                  <PreviewExcerpt>{flag.targetPreview.excerpt}</PreviewExcerpt>
                </Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>
                    {FLAG_REASON_LABEL_MAP[flag.reason] ?? flag.reason}
                  </div>
                  {flag.details && <PreviewExcerpt>"{flag.details}"</PreviewExcerpt>}
                </Td>
                <Td>{flag.reporter?.name ?? 'Conta excluída'}</Td>
                <Td>{new Date(flag.createdAt).toLocaleDateString('pt-BR')}</Td>
                <Td>
                  {status === FlagStatus.OPEN ? (
                    <>
                      <ActionBtn
                        onClick={() => {
                          setResolveError(null)
                          setPendingAction({ flag, action: 'DISMISS' })
                        }}
                      >
                        Descartar
                      </ActionBtn>
                      <ActionBtn
                        $variant="danger"
                        onClick={() => {
                          setResolveError(null)
                          setPendingAction({ flag, action: 'REMOVE_CONTENT' })
                        }}
                      >
                        Remover conteúdo
                      </ActionBtn>
                    </>
                  ) : (
                    <PreviewExcerpt>{flag.resolutionNote ?? '—'}</PreviewExcerpt>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <ModerationReasonModal
        isOpen={Boolean(pendingAction)}
        title={
          pendingAction?.action === 'REMOVE_CONTENT'
            ? 'Remover conteúdo sinalizado'
            : 'Descartar sinalização'
        }
        description={
          pendingAction?.action === 'REMOVE_CONTENT'
            ? 'O conteúdo será removido, a ação ficará registrada e o autor (se identificado) receberá este motivo por e-mail.'
            : 'Registre por que esta sinalização não viola as Diretrizes da Comunidade.'
        }
        confirmLabel={
          pendingAction?.action === 'REMOVE_CONTENT' ? 'Remover conteúdo' : 'Descartar sinalização'
        }
        danger={pendingAction?.action === 'REMOVE_CONTENT'}
        isPending={resolveFlag.isPending}
        errorMessage={resolveError}
        onConfirm={(note) => {
          if (!pendingAction) return
          resolveFlag.mutate(
            { id: pendingAction.flag.id, action: pendingAction.action, note },
            {
              onSuccess: () => {
                setPendingAction(null)
                setResolveError(null)
              },
              onError: (err) => {
                setResolveError(extractApiError(err, 'Não foi possível concluir a análise.'))
              },
            },
          )
        }}
        onClose={() => {
          setPendingAction(null)
          setResolveError(null)
        }}
      />
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

  const setPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => api.patch(`/admin/entities/${id}/plan`, { plan }),
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
            <tr><Th>Nome</Th><Th>CNPJ</Th><Th>Tipo</Th><Th>Estado</Th><Th>Status</Th><Th>Plano</Th><Th>Ações</Th></tr>
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
                  <select
                    value={e.plan ?? 'BASICO'}
                    onChange={(ev) => setPlan.mutate({ id: e.id, plan: ev.target.value })}
                    style={{ fontSize: '0.8125rem', padding: '2px 6px', borderRadius: 4, border: '1px solid #E5E5E5' }}
                  >
                    <option value="BASICO">Básico</option>
                    <option value="GESTAO">Gestão</option>
                    <option value="INTEGRACAO">Integração</option>
                  </select>
                </Td>
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

  const setPlan = useMutation({
    mutationFn: ({ id, plan }: { id: string; plan: string }) => api.patch(`/admin/politicians/${id}/plan`, { plan }),
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
            <tr><Th>Nome</Th><Th>Partido</Th><Th>Cargo</Th><Th>Estado</Th><Th>Status</Th><Th>Plano</Th><Th>Ações</Th></tr>
          </thead>
          <tbody>
            {data.data.map((p: any) => (
              <Tr key={p.id}>
                <Td>
                  <Link to={`/politico/${p.id}`} style={{ color: 'inherit', textDecoration: 'underline' }}>{p.name}</Link>
                </Td>
                <Td><Badge>{p.party?.abbreviation}</Badge></Td>
                <Td>{p.office}</Td>
                <Td>{p.state}</Td>
                <Td>{p.verified ? <Badge $color="#2DC653">Verificado</Badge> : <Badge $color="#F59E0B">Pendente</Badge>}</Td>
                <Td>
                  <select
                    value={p.plan ?? 'BASICO'}
                    onChange={(ev) => setPlan.mutate({ id: p.id, plan: ev.target.value })}
                    style={{ fontSize: '0.8125rem', padding: '2px 6px', borderRadius: 4, border: '1px solid #E5E5E5' }}
                  >
                    <option value="BASICO">Básico</option>
                    <option value="MANDATO">Mandato</option>
                    <option value="MANDATO_PRO">Mandato Pro</option>
                  </select>
                </Td>
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

const DocGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
`

const DocThumb = styled.a`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-decoration: none;
  color: inherit;
`

const DocImg = styled.img`
  width: 120px;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
`

const DocLabel = styled.span`
  font-size: 0.6875rem;
  color: #6B7280;
  text-align: center;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

interface DocViewerProps { requestId: string }

function DocViewer({ requestId }: DocViewerProps) {
  const [open, setOpen] = useState(false)
  const { data, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['doc-urls', requestId],
    queryFn: () => api.get(`/registration-requests/${requestId}/document-urls`).then(r => r.data),
    enabled: open,
    staleTime: 55 * 60 * 1000,
  })

  const keys = Object.keys(data ?? {})

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ padding: '4px 10px', border: '1px solid #6B7280', borderRadius: 6, background: 'transparent', color: '#6B7280', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}>
        Ver docs
      </button>
    )
  }

  if (isLoading) return <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>Carregando…</span>
  if (!keys.length) return <span style={{ fontSize: '0.8125rem', color: '#9CA3AF' }}>Sem documentos</span>

  return (
    <DocGrid>
      {keys.map(field => {
        const url = data![field]
        const isPdf = url.includes('.pdf') || url.includes('%2Fpdf')
        return (
          <DocThumb key={field} href={url} target="_blank" rel="noopener noreferrer">
            {isPdf ? (
              <div style={{ width: 120, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: '1.5rem' }}>
                📄
              </div>
            ) : (
              <DocImg src={url} alt={field} />
            )}
            <DocLabel title={field}>{field}</DocLabel>
          </DocThumb>
        )
      })}
    </DocGrid>
  )
}

function RequestsTab() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['admin-requests'],
    queryFn: () => api.get('/registration-requests?status=PENDING&limit=50').then(r => r.data),
  })

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/registration-requests/${id}/approve`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-requests'] }),
  })
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/registration-requests/${id}/reject`, { reviewNote: 'Informações insuficientes.' }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-requests'] }),
  })

  const requests = data?.data ?? []

  return (
    <div>
      {requests.length === 0 && (
        <p style={{ color: '#6B7280', fontSize: '0.9375rem' }}>Nenhuma solicitação pendente.</p>
      )}
      {requests.map((req: any) => {
        const payload = req.payload as Record<string, unknown>
        const isClaim = !!req.claimTargetId
        const hasDocs = !!(payload?.['documents'] && typeof payload['documents'] === 'object' && Object.keys(payload['documents'] as object).length > 0)
        const displayPayload = Object.entries(payload).filter(([k]) => k !== 'documents').slice(0, 5)

        const typeColor = req.type === 'ENTITY' ? { bg: '#dbeafe', text: '#1e40af' }
          : req.type === 'POLITICIAN' ? { bg: '#ede9fe', text: '#5b21b6' }
          : { bg: '#dcfce7', text: '#166534' }

        const typeLabel = {
          ENTITY: 'Entidade', POLITICIAN: 'Político', COMPANY: 'Empresa',
        }[req.type as string] ?? req.type

        const profilePath = isClaim
          ? (req.type === 'POLITICIAN' ? `/politico/${req.claimTargetId}` : `/entidade/${req.claimTargetId}`)
          : null

        return (
          <div key={req.id} style={{
            background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12,
            padding: 20, marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {/* Badges de tipo e modo */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                    background: typeColor.bg, color: typeColor.text,
                    padding: '2px 8px', borderRadius: 99,
                  }}>{typeLabel}</span>
                  {isClaim && (
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                      background: '#FEF3C7', color: '#92400E',
                      padding: '2px 8px', borderRadius: 99,
                    }}>REIVINDICAÇÃO</span>
                  )}
                  <span style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                    por {req.requester?.name} · {new Date(req.createdAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>

                {/* Perfil sendo reivindicado (claim) ou dados do novo cadastro */}
                {isClaim ? (
                  <div style={{ marginBottom: 8, fontSize: '0.875rem', color: '#374151' }}>
                    <b>Perfil:</b>{' '}
                    {profilePath ? (
                      <a href={profilePath} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#1A1A2E', textDecoration: 'underline' }}>
                        Ver perfil reivindicado ↗
                      </a>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: '#6B7280' }}>
                        {req.claimTargetId}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    {displayPayload.map(([k, v]) => (
                      <span key={k} style={{ fontSize: '0.8125rem', marginRight: 16, color: '#374151' }}>
                        <b>{k}:</b> {String(v)}
                      </span>
                    ))}
                  </div>
                )}

                {hasDocs && <DocViewer requestId={req.id} />}

                {req.note && (
                  <div style={{ marginTop: 8, fontSize: '0.8125rem', color: '#4B5563' }}>
                    <b>Observação:</b> {req.note}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button onClick={() => approve.mutate(req.id)} disabled={approve.isPending}
                  style={{ padding: '7px 16px', background: '#2DC653', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                  Aprovar
                </button>
                <button onClick={() => reject.mutate(req.id)} disabled={reject.isPending}
                  style={{ padding: '7px 16px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>
                  Rejeitar
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SuggestionsTab() {
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | ''>('')
  const [editing, setEditing] = useState<PlatformSuggestionItem | null>(null)
  const [nextStatus, setNextStatus] = useState<SuggestionStatus>(SuggestionStatus.UNDER_REVIEW)
  const [adminNote, setAdminNote] = useState('')
  const { data, isLoading } = useSuggestions({ status: statusFilter || undefined, sort: 'top' })
  const updateStatus = useUpdateSuggestionStatus()

  function openEdit(item: PlatformSuggestionItem) {
    setEditing(item)
    setNextStatus(item.status)
    setAdminNote(item.adminNote ?? '')
  }

  return (
    <div>
      <FilterRow>
        <FilterBtn $active={statusFilter === ''} onClick={() => setStatusFilter('')}>Todas</FilterBtn>
        {(Object.keys(SUGGESTION_STATUS_META) as SuggestionStatus[]).map((st) => (
          <FilterBtn key={st} $active={statusFilter === st} onClick={() => setStatusFilter(st)}>
            {SUGGESTION_STATUS_META[st].label}
          </FilterBtn>
        ))}
      </FilterRow>

      {isLoading ? (
        <Empty>Carregando...</Empty>
      ) : !data?.data?.length ? (
        <Empty>Nenhuma sugestão encontrada.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Sugestão</Th>
              <Th>Categoria</Th>
              <Th>Status</Th>
              <Th>Apoios</Th>
              <Th>Autor</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {data.data.map((item) => {
              const stMeta = SUGGESTION_STATUS_META[item.status]
              return (
                <Tr key={item.id}>
                  <Td>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <PreviewExcerpt>{item.description}</PreviewExcerpt>
                    {item.adminNote && (
                      <PreviewExcerpt style={{ color: '#1A1A2E', marginTop: 4 }}>
                        Resposta: {item.adminNote}
                      </PreviewExcerpt>
                    )}
                  </Td>
                  <Td><Badge>{SUGGESTION_CATEGORY_LABEL[item.category]}</Badge></Td>
                  <Td><Badge $color={stMeta.color}>{stMeta.label}</Badge></Td>
                  <Td style={{ fontFamily: 'monospace' }}>{item.votesCount}</Td>
                  <Td>{item.author.name}</Td>
                  <Td>
                    <ActionBtn onClick={() => openEdit(item)}>Responder / Status</ActionBtn>
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {editing && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,15,26,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, padding: 20,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              width: '100%', maxWidth: 480, background: '#fff', borderRadius: 12,
              padding: 24, border: '1px solid #E5E7EB',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontWeight: 700, marginBottom: 6 }}>Atualizar sugestão</h3>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: 14 }}>{editing.title}</p>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 4 }}>
              Status
            </label>
            <select
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value as SuggestionStatus)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 12 }}
            >
              {(Object.keys(SUGGESTION_STATUS_META) as SuggestionStatus[]).map((st) => (
                <option key={st} value={st}>{SUGGESTION_STATUS_META[st].label}</option>
              ))}
            </select>

            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: 4 }}>
              Resposta pública da equipe (opcional)
            </label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Ex.: Entrou no planejamento do próximo mês..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #E5E7EB', marginBottom: 14 }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <ActionBtn onClick={() => setEditing(null)}>Cancelar</ActionBtn>
              <ActionBtn
                $variant="success"
                disabled={updateStatus.isPending}
                onClick={() => {
                  updateStatus.mutate(
                    { id: editing.id, status: nextStatus, adminNote },
                    { onSuccess: () => setEditing(null) },
                  )
                }}
              >
                {updateStatus.isPending ? 'Salvando...' : 'Salvar'}
              </ActionBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type TabId = 'ads' | 'press' | 'users' | 'reports' | 'flags' | 'entities' | 'politicians' | 'requests' | 'suggestions'

export function Admin() {
  const user = useAuthStore((s) => s.user)
  const [tab, setTab] = useState<TabId>('requests')
  const { data: stats } = useAdminStats()
  const canAccess = Boolean(user && ALLOWED.has(user.type))
  const { data: openFlags } = useAdminFlags(FlagStatus.OPEN, 1, canAccess)
  const { data: pendingAds } = useAdReviewQueue('PENDING', 1, canAccess)

  if (!user || !ALLOWED.has(user.type)) return <Navigate to="/" replace />

  const isAdmin = user.type === 'ADMIN'
  const openCount = openFlags?.meta?.openCount ?? 0

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
          <Tab $active={tab === 'requests'} onClick={() => setTab('requests')}>Solicitações</Tab>
          <Tab $active={tab === 'flags'} onClick={() => setTab('flags')}>
            Sinalizações
            {openCount > 0 && <TabCount>{openCount}</TabCount>}
          </Tab>
          <Tab $active={tab === 'ads'} onClick={() => setTab('ads')}>
            Anúncios
            {(pendingAds?.meta.pendingCount ?? 0) > 0 && <TabCount>{pendingAds?.meta.pendingCount}</TabCount>}
          </Tab>
          <Tab $active={tab === 'press'} onClick={() => setTab('press')}>Imprensa</Tab>
          <Tab $active={tab === 'entities'} onClick={() => setTab('entities')}>Entidades</Tab>
          <Tab $active={tab === 'politicians'} onClick={() => setTab('politicians')}>Políticos</Tab>
          <Tab $active={tab === 'reports'} onClick={() => setTab('reports')}>Relatos</Tab>
          <Tab $active={tab === 'suggestions'} onClick={() => setTab('suggestions')}>Sugestões</Tab>
          {isAdmin && <Tab $active={tab === 'users'} onClick={() => setTab('users')}>Usuários</Tab>}
        </Tabs>

        {tab === 'requests'    && <RequestsTab />}
        {tab === 'flags'       && <FlagsTab />}
        {tab === 'ads'         && <AdReviewQueue />}
        {tab === 'press'       && <PressCredentialQueue />}
        {tab === 'entities'    && <EntitiesTab />}
        {tab === 'politicians' && <PoliticiansTab />}
        {tab === 'reports'     && <ReportsTab />}
        {tab === 'suggestions' && <SuggestionsTab />}
        {tab === 'users'       && isAdmin && <UsersTab />}
      </Content>
    </Page>
  )
}

