import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowSquareOut } from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { usePolitician } from '../../hooks/usePoliticians'
import { useEntity } from '../../hooks/useEntities'
import { useCompany } from '../../hooks/useCompanies'
import { ORG_TYPE_LABEL, publicProfilePath, studioShortcuts } from './studio-nav'

const Head = styled.header`
  margin-bottom: 20px;
`

const Title = styled.h1`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Sub = styled.p`
  margin: 0;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
  margin-bottom: 20px;
`

const CardTitle = styled.h2`
  margin: 0 0 2px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
`

const CardSub = styled.p`
  margin: 0 0 12px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Kpis = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 720px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`

const Kpi = styled.div<{ $color?: string }>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};

  strong {
    display: block;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 1.25rem;
    line-height: 1.2;
    color: ${({ $color, theme }) => $color ?? theme.colors.text};
  }
  span {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const Shortcuts = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
`

const Shortcut = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
  color: inherit;
  transition: box-shadow 0.15s, border-color 0.15s;

  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary}40;
  }

  .ico {
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    background: ${({ theme }) => theme.colors.primary}12;
    color: ${({ theme }) => theme.colors.primary};
  }
  strong { font-family: ${({ theme }) => theme.fonts.heading}; }
  small { color: ${({ theme }) => theme.colors.muted}; font-size: 0.8125rem; }
  .go {
    margin-top: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.action};
  }
`

const PublicRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const PublicLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 18px;
  border-radius: 9999px;
  border: 1.5px solid ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.primary};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.875rem;
  font-weight: 600;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
`

interface Figures {
  total: number
  open: number
  inProgress: number
  resolved: number
}

function KpiCard({ figures, loading }: { figures: Figures | null; loading: boolean }) {
  if (loading) return <CardSub>Carregando números…</CardSub>
  if (!figures) return <CardSub>Ainda não há relatos para mostrar.</CardSub>
  const rate = figures.total > 0 ? Math.round((figures.resolved / figures.total) * 100) : 0
  return (
    <Kpis>
      <Kpi><strong>{figures.total}</strong><span>Total de relatos</span></Kpi>
      <Kpi $color="#E63946"><strong>{figures.open}</strong><span>Sem resposta</span></Kpi>
      <Kpi $color="#3B82F6"><strong>{figures.inProgress}</strong><span>Em andamento</span></Kpi>
      <Kpi $color="#2DC653"><strong>{figures.resolved}</strong><span>Resolvidos ({rate}%)</span></Kpi>
    </Kpis>
  )
}

function PoliticianFigures({ id }: { id: string }) {
  const { data, isLoading } = usePolitician(id)
  const m = data?.mandatometer
  return (
    <KpiCard
      loading={isLoading}
      figures={m ? { total: m.total, open: m.open, inProgress: m.inProgress, resolved: m.resolved } : null}
    />
  )
}

function EntityFigures({ id }: { id: string }) {
  const { data, isLoading } = useEntity(id)
  const s = data?.stats
  return (
    <KpiCard
      loading={isLoading}
      figures={s ? { total: s.total, open: s.byStatus?.OPEN ?? 0, inProgress: s.byStatus?.IN_PROGRESS ?? 0, resolved: s.resolved } : null}
    />
  )
}

function CompanyFigures({ id }: { id: string }) {
  const { data, isLoading } = useCompany(id)
  const s = data?.stats
  return (
    <KpiCard
      loading={isLoading}
      figures={s ? { total: s.total, open: s.byStatus?.OPEN ?? 0, inProgress: s.byStatus?.IN_PROGRESS ?? 0, resolved: s.resolved } : null}
    />
  )
}

/** Primeira tela do Estúdio: resumo e atalhos para o que mais se usa. */
export function StudioOverview() {
  const { user, activeContext } = useAuthStore()
  if (!activeContext) return null

  const firstName = user?.name?.split(' ')[0] ?? ''
  const shortcuts = studioShortcuts(activeContext.type, activeContext.id)

  return (
    <>
      <Head>
        <Title>{firstName ? `Olá, ${firstName}` : 'Estúdio'}</Title>
        <Sub>
          Você está gerenciando <strong>{activeContext.name}</strong> ({ORG_TYPE_LABEL[activeContext.type].toLowerCase()}).
        </Sub>
      </Head>

      <Card>
        <CardTitle>Como estão os relatos</CardTitle>
        <CardSub>Resumo do que os cidadãos registraram para você.</CardSub>
        {activeContext.type === 'POLITICIAN' && <PoliticianFigures id={activeContext.id} />}
        {activeContext.type === 'ENTITY' && <EntityFigures id={activeContext.id} />}
        {activeContext.type === 'COMPANY' && <CompanyFigures id={activeContext.id} />}
      </Card>

      <Card>
        <CardTitle>Atalhos</CardTitle>
        <CardSub>O que você mais usa, a um clique.</CardSub>
        <Shortcuts>
          {shortcuts.map((s) => {
            const Icon = s.icon
            return (
              <Shortcut key={s.to} to={s.to}>
                <span className="ico"><Icon size={20} aria-hidden="true" /></span>
                <strong>{s.label}</strong>
                {s.hint && <small>{s.hint}</small>}
                <span className="go">Abrir <ArrowRight size={14} weight="bold" aria-hidden="true" /></span>
              </Shortcut>
            )
          })}
        </Shortcuts>
      </Card>

      <Card>
        <PublicRow>
          <div>
            <CardTitle>Sua página pública</CardTitle>
            <CardSub style={{ margin: 0 }}>É a página que os cidadãos veem. Daqui você edita foto, capa e dados.</CardSub>
          </div>
          <PublicLink to={publicProfilePath(activeContext.type, activeContext.id)}>
            Abrir página <ArrowSquareOut size={15} aria-hidden="true" />
          </PublicLink>
        </PublicRow>
      </Card>
    </>
  )
}
