import styled from 'styled-components'
import { MonthlyVolumeDatum } from '../../types/api'

const PT_MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function monthLabel(yearMonth: string) {
  const [, m] = yearMonth.split('-')
  return PT_MONTH_ABBR[parseInt(m, 10) - 1]
}

const ChartArea = styled.div`
  display: flex;
  gap: 3px;
  height: 72px;
  align-items: flex-end;
`

const BarWrap = styled.div`
  flex: 1;
  height: 100%;
  display: flex;
  align-items: flex-end;
`

const Bar = styled.div<{ $pct: number; $highlight: boolean }>`
  width: 100%;
  min-height: 3px;
  height: ${({ $pct }) => Math.max($pct, 4)}%;
  background: ${({ $highlight, theme }) =>
    $highlight ? theme.colors.action : theme.colors.primary + '50'};
  border-radius: 2px 2px 0 0;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
  }
`

const LabelsRow = styled.div`
  display: flex;
  gap: 3px;
  margin-top: 5px;
`

const LabelCell = styled.div`
  flex: 1;
  text-align: center;
`

const MonthLabel = styled.span`
  font-size: 0.5625rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
`

interface Props {
  data: MonthlyVolumeDatum[]
}

export function VolumeChart({ data }: Props) {
  const max = Math.max(...data.map((d) => d.count), 1)

  return (
    <div>
      <ChartArea>
        {data.map(({ month, count }) => (
          <BarWrap key={month} title={`${count} relato${count !== 1 ? 's' : ''}`}>
            <Bar $pct={(count / max) * 100} $highlight={count === max && max > 0} />
          </BarWrap>
        ))}
      </ChartArea>
      <LabelsRow>
        {data.map(({ month }) => (
          <LabelCell key={month}>
            <MonthLabel>{monthLabel(month)}</MonthLabel>
          </LabelCell>
        ))}
      </LabelsRow>
    </div>
  )
}
