import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Category } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { CategoryFilter } from '../components/reports/CategoryFilter'
import { ReportCard } from '../components/reports/ReportCard'
import { useReports } from '../hooks/useReports'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 680px;
  margin: 0 auto;
  padding: 32px 16px 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const FilterRow = styled.div`
  position: sticky;
  top: 56px;
  z-index: 10;
  background: ${({ theme }) => theme.colors.neutral};
  padding: 16px 0 12px;
  margin: -8px 0 0;
`

const Feed = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const EmptyState = styled.div`
  text-align: center;
  padding: 64px 24px;
  color: ${({ theme }) => theme.colors.muted};

  h3 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.xl};
    color: ${({ theme }) => theme.colors.text};
    margin-bottom: 8px;
  }
  p { font-size: 0.9375rem; }
`

const SkeletonCard = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  height: 140px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
`

const FabLink = styled(Link)`
  position: fixed;
  bottom: 28px;
  right: 28px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  box-shadow: 0 4px 16px rgba(230, 57, 70, 0.4);
  transition: all 0.15s;
  z-index: 50;

  &:hover {
    background: #c8313d;
    transform: scale(1.06);
    box-shadow: 0 6px 20px rgba(230, 57, 70, 0.5);
  }
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const Total = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
`

export function Home() {
  const [category, setCategory] = useState<Category | undefined>()

  const { data, isLoading, isError } = useReports({ category })

  return (
    <Page>
      <Navbar />

      <Content>
        <FilterRow>
          <CategoryFilter selected={category} onChange={setCategory} />
        </FilterRow>

        {!isLoading && data && (
          <MetaRow>
            <Total>{data.meta.total} relatos</Total>
          </MetaRow>
        )}

        <Feed>
          {isLoading && Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}

          {isError && (
            <EmptyState>
              <h3>Não foi possível carregar</h3>
              <p>Verifique sua conexão e tente novamente.</p>
            </EmptyState>
          )}

          {!isLoading && data?.data.length === 0 && (
            <EmptyState>
              <h3>Nenhum relato aqui ainda</h3>
              <p>Seja o primeiro a registrar um problema.</p>
            </EmptyState>
          )}

          {data?.data.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </Feed>
      </Content>

      <FabLink to="/novo" title="Criar relato">
        +
      </FabLink>
    </Page>
  )
}
