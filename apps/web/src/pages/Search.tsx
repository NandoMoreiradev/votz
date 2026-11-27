import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowUp, ChatCircle, MagnifyingGlass, SealCheck, X } from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { useReports } from '../hooks/useReports'
import { usePoliticians } from '../hooks/usePoliticians'
import { useEntities } from '../hooks/useEntities'
import { useCompanies } from '../hooks/useCompanies'
import { useSearchUsers } from '../hooks/useUser'

type Kind = 'relatos' | 'politicos' | 'entidades' | 'empresas' | 'pessoas'

const TABS: readonly { value: Kind; label: string; placeholder: string; empty: string }[] = [
  { value: 'relatos', label: 'Relatos', placeholder: 'Buscar relatos por título ou descrição', empty: 'Nenhum relato encontrado.' },
  { value: 'politicos', label: 'Políticos', placeholder: 'Buscar políticos pelo nome', empty: 'Nenhum político encontrado.' },
  { value: 'entidades', label: 'Entidades', placeholder: 'Buscar entidades pelo nome', empty: 'Nenhuma entidade encontrada.' },
  { value: 'empresas', label: 'Empresas', placeholder: 'Buscar empresas pelo nome', empty: 'Nenhuma empresa encontrada.' },
  { value: 'pessoas', label: 'Pessoas', placeholder: 'Buscar cidadãos por nome ou @usuário', empty: 'Nenhuma pessoa encontrada.' },
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
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;
  @media (max-width: 820px) { padding: 16px 16px 48px; }
`
const Header = styled.div`
  margin-bottom: 20px;
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
const SearchBar = styled.form`
  margin-bottom: 16px;
`
const Field = styled.label`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 18px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
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
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`
const Tab = styled.button<{ $active: boolean }>`
  padding: 8px 18px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1.5px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? '#fff' : theme.colors.text)};
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`
const Summary = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 14px;
`
const Results = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`
const Row = styled(Link)`
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 20px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  color: inherit;
  text-decoration: none;
  transition: box-shadow 0.15s, border-color 0.15s;
  &:hover {
    box-shadow: ${({ theme }) => theme.shadows.md};
    border-color: ${({ theme }) => theme.colors.primary}40;
  }
`
const Avatar = styled.div<{ $src?: string | null }>`
  width: 52px;
  height: 52px;
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
  const peopleQueryReady = debounced.replace(/^@+/, '').length >= 2
  const reports = useReports({ search, page, limit: 15, enabled: kind === 'relatos' })
  const politicians = usePoliticians({ search, page, enabled: kind === 'politicos' })
  const entities = useEntities({ search, page, enabled: kind === 'entidades' })
  const companies = useCompanies({ search, page, enabled: kind === 'empresas' })
  const people = useSearchUsers({ search, page, limit: 15, enabled: kind === 'pessoas' })
  const active = { relatos: reports, politicos: politicians, entidades: entities, empresas: companies, pessoas: people }[kind]
  const meta = active.data?.meta
  const tab = TABS.find((item) => item.value === kind)!

  return (
    <Page>
      <Navbar />
      <Column>
        <Header>
          <Title>Buscar</Title>
          <Subtitle>Encontre relatos, políticos, entidades, empresas e pessoas.</Subtitle>
        </Header>

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

        {kind === 'pessoas' && !peopleQueryReady && (
          <Notice>Digite pelo menos 2 caracteres do nome ou @usuário para buscar pessoas.</Notice>
        )}
        {!(kind === 'pessoas' && !peopleQueryReady) && !active.isLoading && !active.isError && !!meta && meta.total > 0 && (
          <Summary>
            {meta.total.toLocaleString('pt-BR')} {meta.total === 1 ? 'resultado' : 'resultados'}
            {debounced ? ` para “${debounced}”` : ''}
          </Summary>
        )}
        {!(kind === 'pessoas' && !peopleQueryReady) && active.isLoading && <Notice>Buscando…</Notice>}
        {!(kind === 'pessoas' && !peopleQueryReady) && active.isError && <Notice>Não foi possível buscar agora. Tente de novo em instantes.</Notice>}
        {!(kind === 'pessoas' && !peopleQueryReady) && !active.isLoading && !active.isError && meta?.total === 0 && <Notice>{tab.empty}</Notice>}

        <Results>
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

        {kind === 'pessoas' && peopleQueryReady && people.data?.data.map((person) => (
          <Row key={person.id} to={`/perfil/${person.id}`}>
            <Avatar $src={person.avatarUrl}>{!person.avatarUrl && person.name.charAt(0).toUpperCase()}</Avatar>
            <Body>
              <Name>{person.name}{person.verified && <SealCheck size={15} weight="fill" aria-label="Perfil verificado" />}</Name>
              <Meta>
                {person.username && <span>@{person.username}</span>}
                <span>{person.followersCount.toLocaleString('pt-BR')} {person.followersCount === 1 ? 'seguidor' : 'seguidores'}</span>
              </Meta>
              {person.bio && <Snippet>{person.bio}</Snippet>}
            </Body>
          </Row>
        ))}

        </Results>

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
