import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Report } from '../../types/api'
import { CategoryBadge, StatusBadge } from '../ui/Badge'
import { PressureBar } from '../ui/PressureBar'

const Card = styled(Link)`
  display: block;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  transition: all 0.15s ease;
  cursor: pointer;

  &:hover {
    border-color: #c4c4c4;
    box-shadow: ${({ theme }) => theme.shadows.md};
    transform: translateY(-1px);
  }
`

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
`

const Badges = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const Location = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
  margin-top: 2px;
`

const Title = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.3;
  margin-bottom: 16px;
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 16px;
`

const Stat = styled.span`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Dot = styled.span`
  color: ${({ theme }) => theme.colors.border};
  font-size: 0.75rem;
`

const Ago = styled.span`
  margin-left: auto;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}sem`
  return `${Math.floor(days / 30)}m`
}

interface ReportCardProps {
  report: Report
}

export function ReportCard({ report }: ReportCardProps) {
  const locationParts = [report.city, report.state].filter(Boolean)
  const location = locationParts.join(', ')

  return (
    <Card to={`/relatos/${report.id}`}>
      <Header>
        <Badges>
          <CategoryBadge category={report.category} />
          <StatusBadge status={report.status} />
        </Badges>
        {location && <Location>{location}</Location>}
      </Header>

      <Title>{report.title}</Title>

      <PressureBar score={report.pressureScore} />

      <Footer>
        <Stat>▲ {report._count.votes}</Stat>
        <Dot>·</Dot>
        <Stat>💬 {report._count.comments}</Stat>
        <Ago>{timeAgo(report.createdAt)}</Ago>
      </Footer>
    </Card>
  )
}
