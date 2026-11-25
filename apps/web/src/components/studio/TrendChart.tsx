import { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'

/**
 * Gráfico de área de uma série por dia, com linha de referência e balão ao passar o mouse (ou tocar).
 * Uma série só: o título do painel diz o que é, sem legenda. A tabela da página traz os mesmos números.
 */

export interface TrendPoint {
  /** "AAAA-MM-DD" */
  day: string
  value: number
}

const Wrap = styled.div`
  position: relative;
  width: 100%;
  user-select: none;
  touch-action: pan-y;
`

const Line = styled.path`
  fill: none;
  stroke: ${({ theme }) => theme.colors.primary};
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
`

const Area = styled.path`
  fill: url(#trend-fill);
`

const Grid = styled.line`
  stroke: ${({ theme }) => theme.colors.border};
  stroke-width: 1;
`

const Axis = styled.text`
  fill: ${({ theme }) => theme.colors.muted};
  font-size: 11px;
  font-family: ${({ theme }) => theme.fonts.mono};
`

const Cross = styled.line`
  stroke: ${({ theme }) => theme.colors.muted};
  stroke-width: 1;
  stroke-dasharray: 3 3;
`

const Dot = styled.circle`
  fill: ${({ theme }) => theme.colors.primary};
  stroke: ${({ theme }) => theme.colors.white};
  stroke-width: 2;
`

const Tip = styled.div`
  position: absolute;
  top: 4px;
  z-index: 2;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.75rem;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: ${({ theme }) => theme.shadows.md};

  strong { display: block; font-family: ${({ theme }) => theme.fonts.mono}; font-size: 0.875rem; }
`

const Stop = styled.stop<{ $opacity: number }>`
  stop-color: ${({ theme }) => theme.colors.primary};
  stop-opacity: ${({ $opacity }) => $opacity};
`

const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })

/** Arredonda o topo do eixo para um número "redondo" (1, 2, 2,5, 5 × 10ⁿ). */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const unit = value / power
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10
  return nice * power
}

export function TrendChart({ points, format, label, height = 240 }: { points: TrendPoint[]; format: (value: number) => string; label: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const max = niceMax(Math.max(0, ...points.map((point) => point.value)))
  // Espaço do eixo do tamanho do maior rótulo (fonte mono de 11 px: ~6,7 px por letra).
  const pad = { top: 16, right: 16, bottom: 28, left: Math.max(40, Math.ceil(format(max).length * 6.7) + 14) }
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const step = points.length > 1 ? innerW / (points.length - 1) : innerW
  const x = (index: number) => pad.left + (points.length > 1 ? index * step : innerW / 2)
  const y = (value: number) => pad.top + innerH - (value / max) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 64))))
  const total = points.reduce((sum, point) => sum + point.value, 0)

  const paths = useMemo(() => {
    if (!points.length) return { line: '', area: '' }
    const coords = points.map((point, index) => [x(index), y(point.value)] as const)
    const line = coords.map(([cx, cy], index) => `${index ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join(' ')
    const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${pad.top + innerH} L${coords[0][0].toFixed(1)},${pad.top + innerH} Z`
    return { line, area }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, width, height, max])

  function pick(clientX: number) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || !points.length) return
    const index = Math.round((clientX - rect.left - pad.left) / (step || 1))
    setHover(Math.min(points.length - 1, Math.max(0, index)))
  }

  const hovered = hover !== null ? points[hover] : null
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) - 70, 0), width - 150) : 0

  return (
    <Wrap
      ref={ref}
      onMouseMove={(event) => pick(event.clientX)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(event) => pick(event.touches[0].clientX)}
      onTouchMove={(event) => pick(event.touches[0].clientX)}
      onTouchEnd={() => setHover(null)}
    >
      <svg role="img" aria-label={`${label} por dia. Total no período: ${format(total)}.`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id="trend-fill" x1="0" x2="0" y1="0" y2="1">
            <Stop offset="0%" $opacity={0.18} />
            <Stop offset="100%" $opacity={0.01} />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <Grid x1={pad.left} x2={width - pad.right} y1={y(max * tick)} y2={y(max * tick)} />
            <Axis x={pad.left - 8} y={y(max * tick) + 4} textAnchor="end">{format(max * tick)}</Axis>
          </g>
        ))}
        {points.map((point, index) => (index === points.length - 1 || (index % labelEvery === 0 && (points.length - 1 - index) * step >= 52)) ? (
          <Axis key={point.day} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}>{shortDay(point.day)}</Axis>
        ) : null)}
        <Area d={paths.area} />
        <Line d={paths.line} />
        {hovered && hover !== null && (
          <g>
            <Cross x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + innerH} />
            <Dot cx={x(hover)} cy={y(hovered.value)} r={5} />
          </g>
        )}
      </svg>
      {hovered && (
        <Tip style={{ left: tipLeft }} role="status">
          {longDay(hovered.day)}
          <strong>{format(hovered.value)}</strong>
        </Tip>
      )}
    </Wrap>
  )
}
