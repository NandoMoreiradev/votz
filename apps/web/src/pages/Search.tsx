import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUp, ChatCircle, MagnifyingGlass, SealCheck, X } from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { socialRow, socialTab } from '../components/ui/social'
import { useReports } from '../hooks/useReports'
import { usePoliticians } from '../hooks/usePoliticians'
import { useEntities } from '../hooks/useEntities'
import { useCompanies } from '../hooks/useCompanies'

type Kind = 'relatos' | 'politicos' | 'entidades' | 'empresas'

const TABS: readonly { value: Kind; label: string; placeholder: string; empty: string }[] = [
  { value: 'relatos', label: 'Relatos', placeholder: 'Buscar relatos por título ou descrição', empty: 'Nenhum relato encontrado.' },
  { value: 'politicos', label: 'Políticos', placeholder: 'Buscar políticos pelo nome', empty: 'Nenhum político encontrado.' },
  { value: 'entidades', label: 'Entidades', placeholder: 'Buscar entidades pelo nome', empty: 'Nenhuma entidade encontrada.' },
  { value: 'empresas', label: 'Empresas', placeholder: 'Buscar empresas pelo nome', empty: 'Nenhuma empresa encontrada.' },
]
const STATUS: Record<string, string> = {
  OPEN: 'Aberto', UNDER_REVIEW: 'Em análise', IN_PROGRESS: 'Em andamento', RESOLVED: 'Resolvido', DISPUTED: 'Contestado', ARCHIVED: 'Arquivado',
}
const SECTOR: Record<string, string> = {
  TELECOM: 'Telecom', SUPPLEMENTAL_HEALTH: 'Saúde suplementar', FINANCIAL: 'Financeiro', ENERGY: 'Energia',
  TRANSPORTATION: 'Transporte', RETAIL: 'Varejo', FOOD: 'Alimentação', CONDOMINIUM: 'Condomínio', OTHER: 'Outro setor',
}

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`
const Column = styled.main`
  max-width: 680px;
  margin: 0 auto;
  background: ${({ theme }) => theme.colors.white};
  border-left: 1px solid ${({ theme }) => theme.colors.border};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  min-height: calc(100vh - 56px);
  @media (max-width: 720px) {
    border-left: none;
    border-right: none;
  }
`
const SearchBar = styled.form`
  position: sticky;
  top: 56px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`
const Field = styled.label`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.muted};
  &:focus-within {
    outline: 2px solid ${({ theme }) => theme.colors.action};
    outline-offset: 0;
  }
  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font: inherit;
    font-size: 15px;
    color: ${({ theme }) => theme.colors.text};
    &::-webkit-search-cancel-button,
    &::-webkit-search-decoration { display: none; }
  }
`
const ClearBtn = styled.button`
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.border}; }
`
const Tabs = styled.div`
  display: flex;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`
const Tab = styled.button<{ $active: boolean }>`
  ${socialTab}
`
const Row = styled(Link)`
  ${socialRow}
  display: flex;
  gap: 12px;
  align-items: flex-start;
  color: inherit;
  text-decoration: none;
`
const Avatar = styled.div<{ $src?: string | null }>`
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.action};
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : `${theme.colors.action}14`)};
`
const Body = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
`
const Name = styled.span`
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 15px;
  color: ${({ theme }) => theme.colors.primary};
  svg { color: ${({ theme }) => theme.colors.action}; flex-shrink: 0; }
`
const Meta = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: center;
`
const ReportTitle = styled.span`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 16px;
  line-height: 1.35;
  color: ${({ theme }) => theme.colors.primary};
`
const Snippet = styled.span`
  font-size: 14px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
const Count = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
`
const Notice = styled.p`
  margin: 0;
  padding: 40px 24px;
  text-align: center;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.muted};
`
const Pager = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
`
const PagerBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: default; }
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

function isKind(value: string | null): value is Kind {
  return TABS.some((tab) => tab.value === value)
}

export function Search() {
  const [params, setParams] = useSearchParams()
  const kind: Kind = isKind(params.get('tipo')) ? (params.get('tipo') as Kind) : 'relatos'
  const [text, setText] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(text.trim())
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(text.trim())
      setPage(1)
      setParams((current) => {
        const next = new URLSearchParams(current)
        if (text.trim()) next.set('q', text.trim())
        else next.delete('q')
        return next
      }, { replace: true })
    }, 300)
    return () => clearTimeout(timer)
  }, [text, setParams])

  function chooseKind(next: Kind) {
    setPage(1)
    setParams((current) => {
      const copy = new URLSearchParams(current)
      copy.set('tipo', next)
      return copy
    }, { replace: true })
  }

  const search = debounced || undefined
  const reports = useReports({ search, page, limit: 15, enabled: kind === 'relatos' })
  const politicians = usePoliticians({ search, page, enabled: kind === 'politicos' })
  const entities = useEntities({ search, page, enabled: kind === 'entidades' })
  const companies = useCompanies({ search, page, enabled: kind === 'empresas' })
  const active = { relatos: reports, politicos: politicians, entidades: entities, empresas: companies }[kind]
  const meta = active.data?.meta
  const tab = TABS.find((item) => item.value === kind)!

  return (
    <Page>
      <Navbar />
      <Column>
        <SearchBar role="search" onSubmit={(event) => event.preventDefault()}>
          <Field>
            <MagnifyingGlass size={18} aria-hidden="true" />
            <input
              type="search"
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={tab.placeholder}
              aria-label={tab.placeholder}
              maxLength={120}
            />
            {text && (
              <ClearBtn type="button" aria-label="Limpar busca" onClick={() => setText('')}>
                <X size={14} weight="bold" aria-hidden="true" />
              </ClearBtn>
            )}
          </Field>
        </SearchBar>

        <Tabs role="tablist" aria-label="O que buscar">
          {TABS.map((item) => (
            <Tab key={item.value} type="button" role="tab" aria-selected={kind === item.value} $active={kind === item.value} onClick={() => chooseKind(item.value)}>
              {item.label}
            </Tab>
          ))}
        </Tabs>

        {active.isLoading && <Notice>Buscando…</Notice>}
        {active.isError && <Notice>Não foi possível buscar agora. Tente de novo em instantes.</Notice>}
        {!active.isLoading && !active.isError && meta?.total === 0 && <Notice>{tab.empty}</Notice>}

        {kind === 'relatos' && reports.data?.data.map((report) => (
          <Row key={report.id} to={`/relatos/${report.id}`}>
            <Body>
              <Meta>
                <span>{STATUS[report.status] ?? report.status}</span>
                {report.city && <span>{[report.city, report.state].filter(Boolean).join(', ')}</span>}
                <span>{new Date(report.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </Meta>
              <ReportTitle>{report.title}</ReportTitle>
              <Snippet>{report.description}</Snippet>
              <Meta>
                <Count><ArrowUp size={14} aria-hidden="true" /> {report._count.votes.toLocaleString('pt-BR')} {report._count.votes === 1 ? 'apoio' : 'apoios'}</Count>
                <Count><ChatCircle size={14} aria-hidden="true" /> {report._count.comments.toLocaleString('pt-BR')}</Count>
              </Meta>
            </Body>
          </Row>
        ))}

        {kind === 'politicos' && politicians.data?.data.map((politician) => (
          <Row key={politician.id} to={`/politico/${politician.id}`}>
            <Avatar $src={politician.avatarUrl}>{!politician.avatarUrl && politician.name.charAt(0).toUpperCase()}</Avatar>
            <Body>
              <Name>{politician.name}{politician.verified && <SealCheck size={15} weight="fill" aria-label="Perfil verificado" />}</Name>
              <Meta>
                <span>{politician.office}</span>
                {politician.party?.abbreviation && <span>{politician.party.abbreviation}</span>}
                <span>{[politician.city, politician.state].filter(Boolean).join(', ')}</span>
              </Meta>
            </Body>
          </Row>
        ))}

        {kind === 'entidades' && entities.data?.data.map((entity) => (
          <Row key={entity.id} to={`/entidade/${entity.id}`}>
            <Avatar $src={entity.logoUrl}>{!entity.logoUrl && entity.legalName.charAt(0).toUpperCase()}</Avatar>
            <Body>
              <Name>{entity.legalName}{entity.verified && <SealCheck size={15} weight="fill" aria-label="Perfil verificado" />}</Name>
              <Meta><span>{[entity.city, entity.state].filter(Boolean).join(', ') || 'Entidade pública'}</span></Meta>
            </Body>
          </Row>
        ))}

        {kind === 'empresas' && companies.data?.data.map((company) => (
          <Row key={company.id} to={`/empresa/${company.id}`}>
            <Avatar $src={company.logoUrl}>{!company.logoUrl && (company.tradeName || company.legalName).charAt(0).toUpperCase()}</Avatar>
            <Body>
              <Name>{company.tradeName || company.legalName}{company.verified && <SealCheck size={15} weight="fill" aria-label="Perfil verificado" />}</Name>
              <Meta>
                <span>{SECTOR[company.sector] ?? company.sector}</span>
                {company.tradeName && company.legalName !== company.tradeName && <span>{company.legalName}</span>}
              </Meta>
            </Body>
          </Row>
        ))}

        {meta && meta.totalPages > 1 && (
          <Pager>
            <PagerBtn type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</PagerBtn>
            <span>Página {meta.page} de {meta.totalPages}</span>
            <PagerBtn type="button" disabled={page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima</PagerBtn>
          </Pager>
        )}
      </Column>
    </Page>
  )
}
