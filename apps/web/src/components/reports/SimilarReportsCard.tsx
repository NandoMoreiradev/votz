import { Link } from 'react-router-dom'
import styled, { keyframes } from 'styled-components'
import { SimilarReport } from '../../types/api'
import { CATEGORY_CONFIG, STATUS_CONFIG } from '../ui/Badge'
import { Category, ReportStatus } from '@votz/shared-types'

const fadeIn = keyframes`from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); }`

const Wrapper = styled.div`
  border: 1.5px solid ${({ theme }) => theme.colors.action}40;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action}06;
  padding: 16px;
  animation: ${fadeIn} 0.2s ease;
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
`

const Icon = styled.div`
  font-size: 1.25rem;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 1px;
`

const HeaderText = styled.div``

const Title = styled.p`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 2px;
`

const Subtitle = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;
`

const List = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Item = styled.li`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 12px 14px;
`

const ItemTitle = styled(Link)`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
  display: block;
  margin-bottom: 6px;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`

const ItemMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const MetaBadge = styled.span<{ $color: string }>`
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ $color }) => $color};
  background: ${({ $color }) => $color}18;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
`

const MetaText = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const SourceTags = styled.div`
  display: flex;
  gap: 4px;
  margin-left: auto;
`

const SourceTag = styled.span`
  font-size: 0.625rem;
  color: ${({ theme }) => theme.colors.muted};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.full};
  padding: 1px 6px;
`

const SOURCE_LABELS: Record<string, string> = {
  trigram: 'texto',
  fulltext: 'palavras',
  semantic: 'semântico',
}

interface Props {
  reports: SimilarReport[]
  isLoading?: boolean
}

export function SimilarReportsCard({ reports, isLoading }: Props) {
  if (isLoading || reports.length === 0) return null

  return (
    <Wrapper>
      <Header>
        <Icon>⚠️</Icon>
        <HeaderText>
          <Title>Relatos parecidos já existem</Title>
          <Subtitle>
            Apoiar um relato existente concentra pressão e acelera a resposta — considere antes de criar um novo.
          </Subtitle>
        </HeaderText>
      </Header>

      <List>
        {reports.map((r) => {
          const cat = CATEGORY_CONFIG[r.category as Category]
          const st = STATUS_CONFIG[r.status as ReportStatus]
          const location = [r.city, r.state].filter(Boolean).join(', ')

          return (
            <Item key={r.id}>
              <ItemTitle to={`/relatos/${r.id}`} target="_blank">
                {r.title}
              </ItemTitle>
              <ItemMeta>
                {cat && <MetaBadge $color={cat.color}>{cat.label}</MetaBadge>}
                {st && <MetaBadge $color={st.color}>{st.label}</MetaBadge>}
                {location && <MetaText>{location}</MetaText>}
                <SourceTags>
                  {r.sources.map((s) => (
                    <SourceTag key={s}>{SOURCE_LABELS[s] ?? s}</SourceTag>
                  ))}
                </SourceTags>
              </ItemMeta>
            </Item>
          )
        })}
      </List>
    </Wrapper>
  )
}
