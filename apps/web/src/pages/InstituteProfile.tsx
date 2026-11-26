import styled from 'styled-components'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, SealCheck } from '@phosphor-icons/react'
import { SURVEY_KIND_LABELS } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useInstituteProfile } from '../hooks/useSurveys'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.main`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 720px) { padding: 16px 16px 48px; }
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  margin-bottom: 16px;
`

const SurveyRow = styled(Link)`
  display: block;
  padding: 14px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  &:last-child { border-bottom: none; }
  &:hover h3 { text-decoration: underline; }
`

export function InstituteProfile() {
  const { slug } = useParams<{ slug: string }>()
  const { data, isLoading, isError } = useInstituteProfile(slug)

  return (
    <Page>
      <Navbar />
      <Content>
        <Link to="/pesquisas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: '#6B7280', marginBottom: 16 }}>
          <ArrowLeft size={16} /> Voltar para Pesquisas Votz
        </Link>

        {isLoading ? (
          <Card>Carregando instituto…</Card>
        ) : isError || !data ? (
          <Card>Instituto de pesquisa não encontrado.</Card>
        ) : (
          <>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{data.institute.name}</h1>
                {data.institute.verified && <SealCheck size={22} weight="fill" color="#2563EB" />}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#6B7280', marginBottom: 12 }}>
                {data.institute.legalName}
                {data.institute.cnpj ? ` · CNPJ ${data.institute.cnpj}` : ''}
              </div>
              {data.institute.description && (
                <p style={{ fontSize: '0.9375rem', lineHeight: 1.55, marginBottom: 12 }}>{data.institute.description}</p>
              )}
              <div style={{ fontSize: '0.8125rem', color: '#6B7280', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {data.institute.statisticianLead && (
                  <span>
                    Estatístico responsável: <strong>{data.institute.statisticianLead}</strong>
                    {data.institute.conreLead ? ` (${data.institute.conreLead})` : ''}
                  </span>
                )}
                {data.institute.website && (
                  <a href={data.institute.website} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                    Site oficial ↗
                  </a>
                )}
              </div>
            </Card>

            <Card>
              <h2 style={{ fontSize: '1.125rem', marginBottom: 8 }}>
                Pesquisas publicadas ({data.surveys.length})
              </h2>
              {data.surveys.length === 0 ? (
                <p style={{ color: '#6B7280', fontSize: '0.875rem' }}>Nenhuma pesquisa pública registrada ainda.</p>
              ) : (
                data.surveys.map((s) => (
                  <SurveyRow key={s.id} to={`/pesquisas/${s.slug}`}>
                    <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>{s.title}</h3>
                    <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                      {SURVEY_KIND_LABELS[s.kind]} · {s.totalBallots.toLocaleString('pt-BR')} cédulas
                      {s.tseRegistrationCode ? ` · TSE ${s.tseRegistrationCode}` : ''}
                    </div>
                  </SurveyRow>
                ))
              )}
            </Card>
          </>
        )}
      </Content>
    </Page>
  )
}
