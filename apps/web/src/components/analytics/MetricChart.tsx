import { useEffect, useRef, useState } from 'react'
import styled, { useTheme } from 'styled-components'
import {
  AnalyticsMetricKey,
  formatCountPtBr,
  formatDecimalPtBr,
  formatMonthOrDateBr,
  formatPercentPtBr,
  formatShortDateBr,
} from '@votz/shared-types'
import { MetricInfoModal } from './MetricInfoModal'

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
`

/** Barras horizontais (HTML): rótulo à esquerda, barra no meio, valor à direita. */
const HBarList = styled.ul`
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const HBarRow = styled.li`
  display: grid;
  grid-template-columns: minmax(110px, 200px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  @media (max-width: 560px) { grid-template-columns: 90px minmax(0, 1fr) auto; gap: 8px; }
`

const HBarLabel = styled.span`
  color: ${({ theme }) => theme.colors.text};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const HBarTrack = styled.span`
  display: block;
  height: 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  overflow: hidden;
`

const HBarFill = styled.span<{ $pct: number; $muted?: boolean }>`
  display: block;
  height: 100%;
  width: ${({ $pct }) => $pct}%;
  min-width: ${({ $pct }) => ($pct > 0 ? '4px' : '0')};
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $muted, theme }) => ($muted ? theme.colors.border : theme.colors.primary)};
  transition: width 0.4s ease;
`

const HBarValue = styled.span`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;

  small {
    font-size: 0.6875rem;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[2]};
  flex-wrap: wrap;
`

const TitleGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
`

const Title = styled.h3`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Subtitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const TableToggle = styled.button`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 4px 10px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const ChartWrap = styled.div`
  width: 100%;
  overflow-x: auto;
  margin-top: ${({ theme }) => theme.spacing[3]};
`

const SrOnlyTable = styled.table`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`

const VisibleTableWrap = styled.div`
  margin-top: ${({ theme }) => theme.spacing[3]};
  overflow-x: auto;
`

const DataTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.xs};

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    text-align: left;
  }

  th {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.muted};
  }

  td.num {
    font-family: ${({ theme }) => theme.fonts.mono};
    text-align: right;
  }
`

const EmptyNotice = styled.p`
  margin: ${({ theme }) => theme.spacing[4]} 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const LegendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[4]};
  margin-top: ${({ theme }) => theme.spacing[2]};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const LegendItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
`

export interface ChartDatum {
  label: string
  value: number | null
  suppressed?: boolean
  extra?: string
}

interface MetricChartProps {
  title: string
  whatItShows: string
  metricKey: AnalyticsMetricKey
  data: ChartDatum[]
  /** `hbar`: barras horizontais com rótulo legível (bom para categorias). */
  variant?: 'line' | 'bar' | 'hbar'
  unit?: string
  emptyMessage?: string
}

export function MetricChart({
  title,
  whatItShows,
  metricKey,
  data,
  variant = 'line',
  unit = '',
  emptyMessage = 'Poucos relatos para mostrar com segurança.',
}: MetricChartProps) {
  const theme = useTheme()
  const [showTable, setShowTable] = useState(false)

  const numericValues = data
    .map((d) => (d.suppressed ? null : d.value))
    .filter((v): v is number => v !== null && Number.isFinite(v))

  const hasVisibleData = numericValues.length > 0
  const maxVal = hasVisibleData ? Math.max(...numericValues, 1) : 1

  // O gráfico usa a largura real do cartão (sem sobras laterais em telas largas).
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(640)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => {
      setWrapW(Math.max(320, Math.round(entry.contentRect.width)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasVisibleData, variant])

  const svgWidth = wrapW
  const svgHeight = 240
  const padLeft = 46
  const padRight = 16
  const padTop = 16
  const padBottom = 28
  const innerW = svgWidth - padLeft - padRight
  const innerH = svgHeight - padTop - padBottom

  const barCount = Math.max(1, data.length)
  const barStep = innerW / barCount

  const coords = data.map((d, i) => {
    const x = data.length === 1 ? padLeft + innerW / 2 : padLeft + (i / (data.length - 1)) * innerW
    const y = d.suppressed || d.value === null ? null : padTop + innerH - (d.value / maxVal) * innerH
    return { d, i, x, y }
  })

  const solidSegments: Array<Array<{ x: number; y: number }>> = []
  let currentSeg: Array<{ x: number; y: number }> = []
  const dashedBridges: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = []
  let lastVisible: { i: number; x: number; y: number } | null = null

  for (const pt of coords) {
    if (pt.y !== null) {
      currentSeg.push({ x: pt.x, y: pt.y })
      if (lastVisible && pt.i - lastVisible.i > 1) {
        dashedBridges.push({
          key: `bridge-${lastVisible.i}-${pt.i}`,
          x1: lastVisible.x,
          y1: lastVisible.y,
          x2: pt.x,
          y2: pt.y,
        })
      }
      lastVisible = { i: pt.i, x: pt.x, y: pt.y }
    } else if (currentSeg.length > 0) {
      solidSegments.push(currentSeg)
      currentSeg = []
    }
  }
  if (currentSeg.length > 0) solidSegments.push(currentSeg)
  const hasSuppressedPoints = data.some((d) => d.suppressed || d.value === null)
  const formatVal = (val: number | null | undefined, suppressed?: boolean) => {
    if (suppressed || val === null || val === undefined) return 'Suprimido (<10)'
    if (unit === '%') return formatPercentPtBr(val, 2)
    return unit ? `${formatDecimalPtBr(val, 1)}${unit}` : formatDecimalPtBr(val, 1)
  }
  /** Número do eixo: sem casas para valores grandes, uma casa para pequenos, % quando for taxa. */
  const formatAxis = (val: number) => {
    const n = maxVal <= 5 ? formatDecimalPtBr(val, 1) : formatCountPtBr(Math.round(val))
    return unit === '%' ? `${n}%` : n
  }
  const hbarMax = hasVisibleData ? Math.max(...numericValues, 1) : 1

  return (
    <Card>
      <Header>
        <TitleGroup>
          <TitleRow>
            <Title>{title}</Title>
            <MetricInfoModal metricKey={metricKey} />
          </TitleRow>
          <Subtitle>O que isso mostra: {whatItShows}</Subtitle>
        </TitleGroup>
        {data.length > 0 && (
          <TableToggle
            type="button"
            onClick={() => setShowTable((v) => !v)}
            aria-expanded={showTable}
          >
            {showTable ? 'Ocultar tabela' : 'Ver tabela'}
          </TableToggle>
        )}
      </Header>

      {!hasVisibleData ? (
        <EmptyNotice>{emptyMessage}</EmptyNotice>
      ) : variant === 'hbar' ? (
        <HBarList aria-label={title}>
          {data.map((d) => {
            const hidden = d.suppressed || d.value === null
            const pct = hidden ? 0 : Math.round(((d.value ?? 0) / hbarMax) * 100)
            return (
              <HBarRow key={d.label}>
                <HBarLabel title={d.label}>{d.label}</HBarLabel>
                <HBarTrack>
                  <HBarFill $pct={pct} $muted={hidden} />
                </HBarTrack>
                <HBarValue>
                  {hidden ? 'Suprimido (<10)' : formatCountPtBr(d.value ?? 0)}
                  {d.extra && !hidden && <small>{d.extra}</small>}
                </HBarValue>
              </HBarRow>
            )
          })}
        </HBarList>
      ) : (
        <ChartWrap ref={wrapRef}>
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            width={svgWidth}
            height={svgHeight}
            style={{ display: 'block', maxWidth: '100%' }}
            role="img"
            aria-label={`${title}. O que isso mostra: ${whatItShows}`}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padTop + innerH * (1 - frac)
              const val = maxVal * frac
              return (
                <g key={frac}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={svgWidth - padRight}
                    y2={y}
                    stroke={theme.colors.border}
                    strokeDasharray="3 3"
                  />
                  <text
                    x={padLeft - 6}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="11"
                    fill={theme.colors.muted}
                    fontFamily={theme.fonts.mono}
                  >
                    {formatAxis(val)}
                  </text>
                </g>
              )
            })}

            {variant === 'bar'
              ? data.map((d, idx) => {
                  const barW = Math.max(8, Math.min(64, barStep * 0.6))
                  const x = padLeft + idx * barStep + (barStep - barW) / 2
                  const h = d.suppressed || d.value === null ? 0 : (d.value / maxVal) * innerH
                  const y = padTop + innerH - h
                  return (
                    <g key={d.label}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(2, h)}
                        rx={4}
                        fill={d.suppressed ? theme.colors.border : theme.colors.primary}
                      >
                        <title>
                          {formatMonthOrDateBr(d.label)}: {formatVal(d.value, d.suppressed)}
                        </title>
                      </rect>
                      {data.length <= 14 && !d.suppressed && d.value !== null && (
                        <text
                          x={x + barW / 2}
                          y={y - 5}
                          textAnchor="middle"
                          fontSize="11"
                          fill={theme.colors.text}
                          fontFamily={theme.fonts.mono}
                        >
                          {formatCountPtBr(d.value)}
                        </text>
                      )}
                    </g>
                  )
                })
              : null}

            {variant === 'line' && (
              <>
                {dashedBridges.map((b) => (
                  <line
                    key={b.key}
                    x1={b.x1.toFixed(1)}
                    y1={b.y1.toFixed(1)}
                    x2={b.x2.toFixed(1)}
                    y2={b.y2.toFixed(1)}
                    stroke={theme.colors.muted}
                    strokeWidth="1.75"
                    strokeDasharray="5 5"
                  />
                ))}
                {solidSegments.map((seg, idx) =>
                  seg.length >= 2 ? (
                    <polyline
                      key={`seg-${idx}`}
                      fill="none"
                      stroke={theme.colors.primary}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={seg.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
                    />
                  ) : null,
                )}
                {coords.map((pt) =>
                  pt.y !== null ? (
                    <circle key={pt.d.label} cx={pt.x} cy={pt.y} r={3.5} fill={theme.colors.action}>
                      <title>
                        {formatMonthOrDateBr(pt.d.label)}: {formatVal(pt.d.value, pt.d.suppressed)}
                      </title>
                    </circle>
                  ) : (
                    <circle
                      key={`sup-${pt.d.label}`}
                      cx={pt.x}
                      cy={padTop + innerH - 4}
                      r={3.5}
                      fill={theme.colors.white}
                      stroke={theme.colors.muted}
                      strokeWidth="1.5"
                      strokeDasharray="2 2"
                    >
                      <title>{formatMonthOrDateBr(pt.d.label)}: Suprimido (&lt;10 relatos)</title>
                    </circle>
                  ),
                )}
              </>
            )}

            {data.map((d, i) => {
              const showTick =
                data.length <= 8 || i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0
              if (!showTick) return null
              const x =
                variant === 'bar'
                  ? padLeft + i * barStep + barStep / 2
                  : data.length === 1
                    ? padLeft + innerW / 2
                    : padLeft + (i / (data.length - 1)) * innerW
              const tickText = formatShortDateBr(d.label)
              return (
                <text
                  key={`tick-${d.label}`}
                  x={x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill={theme.colors.muted}
                  fontFamily={theme.fonts.mono}
                >
                  {tickText.length > 10 ? tickText.slice(0, 10) : tickText}
                </text>
              )
            })}
          </svg>
          {hasSuppressedPoints && (
            <LegendRow>
              <LegendItem>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: theme.colors.action,
                    display: 'inline-block',
                  }}
                />
                Visível (&ge; 10 relatos)
              </LegendItem>
              <LegendItem>
                <span
                  style={{
                    width: 14,
                    height: 0,
                    borderTop: `2px dashed ${theme.colors.muted}`,
                    display: 'inline-block',
                  }}
                />
                Lacuna tracejada: suprimido (&lt; 10 relatos, privacidade)
              </LegendItem>
            </LegendRow>
          )}
        </ChartWrap>
      )}

      {data.length > 0 && !showTable && (
        <SrOnlyTable>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>Recorte</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <td>{formatMonthOrDateBr(d.label)}</td>
                <td>{formatVal(d.value, d.suppressed)}</td>
              </tr>
            ))}
          </tbody>
        </SrOnlyTable>
      )}

      {data.length > 0 && showTable && (
        <VisibleTableWrap>
          <DataTable>
            <thead>
              <tr>
                <th>Recorte</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                {data.some((d) => d.extra) && <th>Detalhe</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>{formatMonthOrDateBr(d.label)}</td>
                  <td className="num">{formatVal(d.value, d.suppressed)}</td>
                  {data.some((row) => row.extra) && <td>{d.extra ?? '-'}</td>}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </VisibleTableWrap>
      )}
    </Card>
  )
}
