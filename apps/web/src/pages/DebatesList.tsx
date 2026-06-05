import { useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { useDebates, useCreateDebate } from '../hooks/useDebates'
import { useAuthStore } from '../store/auth.store'
import { usePoliticians } from '../hooks/usePoliticians'
import { Debate, DebateStatus } from '../types/api'

// ── Animations ─────────────────────────────────────────────────────────────

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 32px 64px;
  @media (max-width: 720px) { padding: 16px 16px 48px; }
`

const PageHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
  flex-wrap: wrap;
`

const TitleGroup = styled.div``

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

const NewDebateBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
  &:hover { opacity: 0.88; }
`

const Tabs = styled.div`
  display: flex;
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  margin-bottom: 24px;
  gap: 4px;
`

const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 12px;
  border: none;
  background: none;
  font-size: 0.9375rem;
  font-weight: ${({ $active }) => ($active ? 700 : 400)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.muted)};
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  margin-bottom: -2px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const LiveDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  animation: ${pulse} 1.5s ease-in-out infinite;
`

const DebateCard = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s;
  margin-bottom: 12px;
  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary}40;
  }
`

const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`

const CardTitle = styled.h2`
  font-size: 1.0625rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.3;
  flex: 1;
`

const StatusBadge = styled.span<{ $status: DebateStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  background: ${({ $status, theme }) =>
    $status === 'LIVE' ? theme.colors.action + '18' :
    $status === 'SCHEDULED' ? theme.colors.primary + '12' :
    $status === 'ENDED' ? theme.colors.border :
    theme.colors.border};
  color: ${({ $status, theme }) =>
    $status === 'LIVE' ? theme.colors.action :
    $status === 'SCHEDULED' ? theme.colors.primary :
    theme.colors.muted};
`

const Participants = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const AvatarStack = styled.div`
  display: flex;
`

const Avatar = styled.div<{ $url?: string | null }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${({ $url, theme }) => $url ? `url(${$url}) center/cover` : theme.colors.primary};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  border: 2px solid #fff;
  margin-right: -10px;
  &:last-child { margin-right: 0; }
`

const ParticipantNames = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 10px;
`

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
`

const Skeleton = styled.div`
  background: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  height: 96px;
  margin-bottom: 12px;
  animation: ${pulse} 1.5s ease-in-out infinite;
`

// ── Create Debate Modal ─────────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
`

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  width: 100%;
  max-width: 520px;
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const ModalTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 20px;
`

const Field = styled.div`
  margin-bottom: 16px;
`

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  box-sizing: border-box;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  resize: vertical;
  min-height: 72px;
  box-sizing: border-box;
  font-family: inherit;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const ModalActions = styled.div`
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
`

const BtnSecondary = styled.button`
  padding: 0 16px;
  height: 38px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
`

const BtnPrimary = styled.button`
  padding: 0 20px;
  height: 38px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<DebateStatus, string> = {
  LIVE: '🔴 Ao Vivo',
  SCHEDULED: 'Agendado',
  ENDED: 'Encerrado',
  CANCELLED: 'Cancelado',
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function DebateCardItem({ debate }: { debate: Debate }) {
  const confirmed = debate.participants.filter((p) => p.inviteStatus === 'CONFIRMED')
  const initials = (name: string) => name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()

  return (
    <DebateCard to={`/debates/${debate.id}`}>
      <CardTop>
        <CardTitle>{debate.title}</CardTitle>
        <StatusBadge $status={debate.status}>
          {debate.status === 'LIVE' && <LiveDot />}
          {STATUS_LABELS[debate.status]}
        </StatusBadge>
      </CardTop>

      <Participants>
        <AvatarStack>
          {confirmed.slice(0, 4).map((p) => (
            <Avatar key={p.id} $url={p.politician.avatarUrl} title={p.politician.name}>
              {!p.politician.avatarUrl && initials(p.politician.name)}
            </Avatar>
          ))}
        </AvatarStack>
        <ParticipantNames>
          {confirmed.map((p) => p.politician.name).join(' · ') || 'Aguardando confirmações'}
        </ParticipantNames>
      </Participants>

      <CardMeta>
        <span>{formatDate(debate.scheduledFor)}</span>
        {debate.status === 'LIVE' && debate.viewerCount > 0 && (
          <span>{debate.viewerCount.toLocaleString('pt-BR')} assistindo</span>
        )}
      </CardMeta>
    </DebateCard>
  )
}

// ── Create Debate Modal ─────────────────────────────────────────────────────

function CreateDebateModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [inviteSearch, setInviteSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data: politicians } = usePoliticians({ search: inviteSearch || undefined, enabled: inviteSearch.length > 1 })
  const createDebate = useCreateDebate()

  const toggle = (id: string) =>
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])

  const submit = async () => {
    if (!title || !scheduledFor) return
    await createDebate.mutateAsync({ title, description, scheduledFor, invites: selectedIds })
    onClose()
  }

  return (
    <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Modal>
        <ModalTitle>Agendar Debate</ModalTitle>

        <Field>
          <Label>Título *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Debate sobre segurança pública" />
        </Field>

        <Field>
          <Label>Descrição</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Do que trata este debate?" />
        </Field>

        <Field>
          <Label>Data e hora *</Label>
          <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </Field>

        <Field>
          <Label>Convidar políticos</Label>
          <Input
            value={inviteSearch}
            onChange={(e) => setInviteSearch(e.target.value)}
            placeholder="Buscar por nome..."
          />
          {politicians?.data && politicians.data.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {politicians.data.slice(0, 5).map((p) => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {p.name} — {p.office} ({p.party.abbreviation})
                </label>
              ))}
            </div>
          )}
        </Field>

        <ModalActions>
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={submit} disabled={!title || !scheduledFor || createDebate.isPending}>
            {createDebate.isPending ? 'Criando...' : 'Criar Debate'}
          </BtnPrimary>
        </ModalActions>
      </Modal>
    </Overlay>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

type TabKey = 'LIVE' | 'SCHEDULED' | 'ENDED'

export default function DebatesList() {
  const [tab, setTab] = useState<TabKey>('LIVE')
  const [showModal, setShowModal] = useState(false)
  const activeContext = useAuthStore((s) => s.activeContext)
  const isPolitician = activeContext?.type === 'POLITICIAN'

  const liveQ = useDebates({ status: 'LIVE' })
  const scheduledQ = useDebates({ status: 'SCHEDULED', upcoming: true })
  const endedQ = useDebates({ status: 'ENDED' })

  const tabData = { LIVE: liveQ, SCHEDULED: scheduledQ, ENDED: endedQ }
  const current = tabData[tab]

  return (
    <Page>
      <Navbar />
      <Content>
        <PageHeader>
          <TitleGroup>
            <Title>Debates ao Vivo</Title>
            <Subtitle>Acompanhe e participe de debates entre políticos em tempo real</Subtitle>
          </TitleGroup>
          {isPolitician && (
            <NewDebateBtn onClick={() => setShowModal(true)}>+ Agendar Debate</NewDebateBtn>
          )}
        </PageHeader>

        <Tabs>
          <Tab $active={tab === 'LIVE'} onClick={() => setTab('LIVE')}>
            <LiveDot />
            Ao Vivo
            {(liveQ.data?.meta.total ?? 0) > 0 && ` (${liveQ.data!.meta.total})`}
          </Tab>
          <Tab $active={tab === 'SCHEDULED'} onClick={() => setTab('SCHEDULED')}>
            Próximos
            {(scheduledQ.data?.meta.total ?? 0) > 0 && ` (${scheduledQ.data!.meta.total})`}
          </Tab>
          <Tab $active={tab === 'ENDED'} onClick={() => setTab('ENDED')}>
            Encerrados
          </Tab>
        </Tabs>

        {current.isLoading ? (
          <>
            <Skeleton />
            <Skeleton />
            <Skeleton style={{ opacity: 0.5 }} />
          </>
        ) : !current.data?.data.length ? (
          <EmptyState>
            {tab === 'LIVE'
              ? 'Nenhum debate ao vivo no momento.'
              : tab === 'SCHEDULED'
                ? 'Nenhum debate agendado.'
                : 'Nenhum debate encerrado ainda.'}
          </EmptyState>
        ) : (
          current.data.data.map((debate) => (
            <DebateCardItem key={debate.id} debate={debate} />
          ))
        )}
      </Content>

      {showModal && <CreateDebateModal onClose={() => setShowModal(false)} />}
    </Page>
  )
}
