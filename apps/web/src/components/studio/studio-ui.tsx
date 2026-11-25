import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styled, { css, keyframes } from 'styled-components'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowDownRight, ArrowUpRight, CaretRight, MagnifyingGlass, X, type Icon } from '@phosphor-icons/react'

/**
 * Peças do painel do Estúdio (cabeçalho de página, painéis, números, tabela, abas, gaveta lateral).
 * Inspiradas nos gerenciadores de anúncios no jeito de organizar, com a identidade do Votz. Cores sempre do tema.
 */

// ─── Página ──────────────────────────────────────────────────────────────────────────────────────

/** Raiz de toda tela nova do Estúdio (a casca deixa de mexer nos espaços dela). */
const StudioPageRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`

export function StudioPage({ children }: { children: ReactNode }) {
  return <StudioPageRoot data-studio-page="">{children}</StudioPageRoot>
}

// ─── Cabeçalho da página ────────────────────────────────────────────────────────────────────────

const HeaderWrap = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 20px;
`

const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 6px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};

  a { color: ${({ theme }) => theme.colors.muted}; }
  a:hover { color: ${({ theme }) => theme.colors.text}; text-decoration: underline; }
  svg { flex-shrink: 0; }
`

export const PageTitle = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.625rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: ${({ theme }) => theme.colors.text};

  @media (max-width: 600px) { font-size: 1.375rem; }
`

const PageDescription = styled.p`
  margin: 6px 0 0;
  max-width: 720px;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

export interface Crumb { label: string; to?: string }

export function PageHeader({ crumbs, title, description, actions }: { crumbs?: Crumb[]; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <HeaderWrap>
      <div style={{ minWidth: 0 }}>
        {crumbs && crumbs.length > 0 && (
          <Crumbs aria-label="Você está em">
            {crumbs.map((crumb, index) => (
              <span key={crumb.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {index > 0 && <CaretRight size={11} aria-hidden="true" />}
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
              </span>
            ))}
          </Crumbs>
        )}
        <PageTitle>{title}</PageTitle>
        {description && <PageDescription>{description}</PageDescription>}
      </div>
      {actions && <HeaderActions>{actions}</HeaderActions>}
    </HeaderWrap>
  )
}

// ─── Botões ─────────────────────────────────────────────────────────────────────────────────────

const btn = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, opacity 0.15s;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

/** A ação principal da página (no máximo uma por tela): "Criar campanha", "Recarregar". */
export const CtaButton = styled.button`
  ${btn}
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  box-shadow: 0 1px 2px ${({ theme }) => theme.colors.action}40;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.action}E6; }
`

export const DarkButton = styled.button`
  ${btn}
  border: none;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.primary}E0; }
`

export const GhostButton = styled.button`
  ${btn}
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.surfaceHover}; border-color: ${({ theme }) => theme.colors.muted}66; }
`

export const IconButton = styled.button`
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid transparent;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover:not(:disabled) { background: ${({ theme }) => theme.colors.neutral}; color: ${({ theme }) => theme.colors.text}; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 1px; }
`

// ─── Painéis ────────────────────────────────────────────────────────────────────────────────────

export const Panel = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  min-width: 0;
`

const PanelHeadWrap = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  h2 {
    margin: 0;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 1rem;
    font-weight: ${({ theme }) => theme.fontWeights.bold};
    color: ${({ theme }) => theme.colors.text};
  }
  p { margin: 2px 0 0; font-size: 0.8125rem; color: ${({ theme }) => theme.colors.muted}; line-height: 1.45; }
`

export function PanelHead({ title, hint, actions }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode }) {
  return (
    <PanelHeadWrap>
      <div style={{ minWidth: 0 }}>
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </div>
      {actions && <HeaderActions>{actions}</HeaderActions>}
    </PanelHeadWrap>
  )
}

export const PanelBody = styled.div<{ $flush?: boolean }>`
  padding: ${({ $flush }) => ($flush ? '0' : '16px 18px')};
`

export const PanelFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 18px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};

  a { flex-shrink: 0; white-space: nowrap; font-weight: ${({ theme }) => theme.fontWeights.semibold}; color: ${({ theme }) => theme.colors.text}; }
  a:hover { text-decoration: underline; }
`

/** Duas colunas: principal e lateral. No celular vira uma só. */
export const SplitLayout = styled.div<{ $side?: number }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) ${({ $side }) => $side ?? 340}px;
  gap: 16px;
  align-items: start;

  @media (max-width: 1180px) { grid-template-columns: minmax(0, 1fr); }
`

export const Stack = styled.div<{ $gap?: number }>`
  display: flex;
  flex-direction: column;
  gap: ${({ $gap }) => $gap ?? 16}px;
  min-width: 0;
`

// ─── Números (KPI) ──────────────────────────────────────────────────────────────────────────────

export const StatGrid = styled.div<{ $min?: number }>`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(${({ $min }) => $min ?? 170}px, 1fr));
  gap: 12px;
`

const StatBox = styled.div<{ $active?: boolean; $clickable?: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px 16px 12px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ $active, theme }) => ($active ? `inset 0 3px 0 ${theme.colors.primary}` : '0 1px 2px rgba(16, 24, 40, 0.04)')};
  text-align: left;
  font: inherit;
  color: inherit;
  ${({ $clickable, theme }) => $clickable && css`
    cursor: pointer;
    transition: border-color 0.15s;
    &:hover { border-color: ${theme.colors.muted}88; }
    &:focus-visible { outline: 2px solid ${theme.colors.primary}; outline-offset: 2px; }
  `}
`

const StatLabel = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  letter-spacing: 0.02em;
  color: ${({ theme }) => theme.colors.muted};

  svg { flex-shrink: 0; }
`

const StatValue = styled.span<{ $tone?: Tone }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  letter-spacing: -0.02em;
  line-height: 1.15;
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const StatFoot = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 22px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

const DeltaChip = styled.span<{ $good: boolean | null }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  white-space: nowrap;
  color: ${({ $good, theme }) => ($good === null ? theme.colors.muted : $good ? theme.colors.positiveText : theme.colors.action)};
  background: ${({ $good, theme }) => ($good === null ? theme.colors.neutral : $good ? `${theme.colors.positive}1F` : `${theme.colors.action}14`)};

  svg { flex-shrink: 0; }
`

export interface StatDelta {
  /** Variação em % sobre o período anterior. Nulo: não há base para comparar. */
  percent: number | null
  /** Subir é bom (cliques) ou ruim (custo por clique)? */
  upIsGood?: boolean
}

export function StatCard({
  label, value, hint, icon: IconCmp, delta, spark, active, onClick,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: Icon
  delta?: StatDelta
  spark?: number[]
  active?: boolean
  onClick?: () => void
}) {
  const good = delta && delta.percent !== null && delta.percent !== 0 ? (delta.percent > 0) === (delta.upIsGood ?? true) : null
  return (
    <StatBox as={onClick ? 'button' : 'div'} type={onClick ? 'button' : undefined} onClick={onClick} $active={active} $clickable={!!onClick} aria-pressed={onClick ? !!active : undefined}>
      <StatLabel>{IconCmp && <IconCmp size={14} weight="bold" aria-hidden="true" />}{label}</StatLabel>
      <StatValue>{value}</StatValue>
      <StatFoot>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
          {delta && delta.percent !== null && (
            <DeltaChip $good={good} title="Comparado com o período anterior de mesmo tamanho">
              {delta.percent > 0 ? <ArrowUpRight size={11} weight="bold" aria-hidden="true" /> : delta.percent < 0 ? <ArrowDownRight size={11} weight="bold" aria-hidden="true" /> : null}
              {delta.percent > 0 ? '+' : ''}{delta.percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
            </DeltaChip>
          )}
          {hint && <span>{hint}</span>}
        </span>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </StatFoot>
    </StatBox>
  )
}

const SparkPath = styled.path`
  fill: none;
  stroke: ${({ theme }) => theme.colors.primary};
  stroke-width: 1.5;
  stroke-linejoin: round;
  stroke-linecap: round;
`

const SparkArea = styled.path`
  fill: ${({ theme }) => theme.colors.primary}14;
`

/** Linha pequena de tendência, só de enfeite informativo (o número ao lado é o que vale). */
export function Sparkline({ values, width = 72, height = 22 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const points = values.map((value, index) => [index * step, height - 2 - ((value - min) / span) * (height - 4)] as const)
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ flexShrink: 0 }}>
      <SparkArea d={`${line} L${width},${height} L0,${height} Z`} />
      <SparkPath d={line} />
    </svg>
  )
}

/** Variação percentual entre dois valores (nulo quando não há base). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

// ─── Situação (pílula com bolinha) ──────────────────────────────────────────────────────────────

export type Tone = 'positive' | 'action' | 'warning' | 'info' | 'muted'

const toneColor = (tone: Tone, theme: { colors: Record<string, string> }) =>
  tone === 'positive' ? theme.colors.positiveText : tone === 'action' ? theme.colors.action : tone === 'warning' ? theme.colors.warning : tone === 'info' ? theme.colors.info : theme.colors.muted

const toneDot = (tone: Tone, theme: { colors: Record<string, string> }) =>
  tone === 'positive' ? theme.colors.positive : toneColor(tone, theme)

export const StatusPill = styled.span<{ $tone: Tone }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  line-height: 1.5;
  letter-spacing: normal;
  text-transform: none;
  white-space: nowrap;
  color: ${({ $tone, theme }) => toneColor($tone, theme)};
  background: ${({ $tone, theme }) => ($tone === 'muted' ? theme.colors.neutral : `${toneDot($tone, theme)}17`)};

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${({ $tone, theme }) => toneDot($tone, theme)};
  }
`

// ─── Liga/desliga ───────────────────────────────────────────────────────────────────────────────

const SwitchTrack = styled.button<{ $on: boolean }>`
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: ${({ $on, theme }) => ($on ? theme.colors.positive : theme.colors.borderStrong)};
  cursor: pointer;
  transition: background 0.15s;

  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: ${({ $on }) => ($on ? '18px' : '2px')};
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.white};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: left 0.15s;
  }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 2px; }
`

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return <SwitchTrack type="button" role="switch" aria-checked={checked} aria-label={label} title={label} $on={checked} disabled={disabled} onClick={() => onChange(!checked)} />
}

// ─── Abas e controle segmentado ─────────────────────────────────────────────────────────────────

export const TabBar = styled.div`
  display: flex;
  gap: 2px;
  overflow-x: auto;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`

const TabBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  margin-bottom: -1px;
  border: none;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  background: transparent;
  font: inherit;
  font-size: 0.875rem;
  font-weight: ${({ $active, theme }) => ($active ? theme.fontWeights.bold : theme.fontWeights.medium)};
  color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  white-space: nowrap;
  cursor: pointer;

  &:hover { color: ${({ theme }) => theme.colors.text}; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: -2px; }
  svg { flex-shrink: 0; }
`

const TabCount = styled.span`
  min-width: 20px;
  padding: 0 6px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.6875rem;
  line-height: 18px;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
`

export function Tab({ active, onClick, icon: IconCmp, count, children }: { active: boolean; onClick: () => void; icon?: Icon; count?: number; children: ReactNode }) {
  return (
    <TabBtn type="button" role="tab" aria-selected={active} $active={active} onClick={onClick}>
      {IconCmp && <IconCmp size={16} weight={active ? 'bold' : 'regular'} aria-hidden="true" />}
      {children}
      {count !== undefined && <TabCount>{count}</TabCount>}
    </TabBtn>
  )
}

const SegWrap = styled.div`
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const SegBtn = styled.button<{ $active: boolean }>`
  height: 28px;
  padding: 0 12px;
  border: none;
  border-radius: 6px;
  background: ${({ $active, theme }) => ($active ? theme.colors.white : 'transparent')};
  box-shadow: ${({ $active }) => ($active ? '0 1px 2px rgba(16, 24, 40, 0.12)' : 'none')};
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ $active, theme }) => ($active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  white-space: nowrap;
  cursor: pointer;
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 1px; }
`

export function Segmented<T extends string | number>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <SegWrap role="group" aria-label={label}>
      {options.map((option) => (
        <SegBtn key={String(option.value)} type="button" $active={option.value === value} aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </SegBtn>
      ))}
    </SegWrap>
  )
}

// ─── Barra de filtros ───────────────────────────────────────────────────────────────────────────

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const SearchBox = styled.label`
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 1 1 220px;
  max-width: 320px;

  svg { position: absolute; left: 10px; color: ${({ theme }) => theme.colors.muted}; pointer-events: none; }
  input {
    width: 100%;
    height: 34px;
    padding: 0 10px 0 32px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: ${({ theme }) => theme.radii.md};
    background: ${({ theme }) => theme.colors.white};
    font: inherit;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
  }
  input:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}1A; }

  @media (max-width: 600px) { max-width: none; }
`

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (value: string) => void; placeholder: string; label: string }) {
  return (
    <SearchBox>
      <MagnifyingGlass size={15} aria-hidden="true" />
      <input type="search" value={value} placeholder={placeholder} aria-label={label} onChange={(event) => onChange(event.target.value)} />
    </SearchBox>
  )
}

/** Fileira de filtros: quebra linha no computador e rola para o lado no celular. */
export const FilterRow = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;

  @media (max-width: 600px) {
    flex-wrap: nowrap;
    overflow-x: auto;
    width: 100%;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
`

export const FilterChip = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 11px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}0F` : theme.colors.white)};
  font: inherit;
  font-size: 0.8125rem;
  font-weight: ${({ $active, theme }) => ($active ? theme.fontWeights.semibold : theme.fontWeights.medium)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.text)};
  white-space: nowrap;
  cursor: pointer;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}88; }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 1px; }
`

// ─── Tabela de dados ────────────────────────────────────────────────────────────────────────────

export const TableScroll = styled.div`
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`

export const DataTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8125rem;

  th, td {
    padding: 10px 12px;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: middle;
  }
  th:first-child, td:first-child { padding-left: 18px; }
  th:last-child, td:last-child { padding-right: 18px; }
  .left { text-align: left; }
  .center { text-align: center; }
  .wrap { white-space: normal; }

  thead th {
    position: sticky;
    white-space: normal;
    line-height: 1.3;
    min-width: 72px;
    top: 0;
    z-index: 1;
    padding-top: 9px;
    padding-bottom: 9px;
    background: ${({ theme }) => theme.colors.surfaceHover};
    font-size: 0.6875rem;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.muted};
  }

  tbody tr { transition: background 0.1s; }
  tbody tr:hover td { background: ${({ theme }) => theme.colors.surfaceHover}; }
  tbody tr[aria-selected='true'] td { background: ${({ theme }) => theme.colors.primary}08; }
  td.num { font-family: ${({ theme }) => theme.fonts.mono}; font-size: 0.8125rem; color: ${({ theme }) => theme.colors.text}; }
  td.dim { color: ${({ theme }) => theme.colors.muted}; }

  tfoot td {
    border-bottom: none;
    background: ${({ theme }) => theme.colors.surfaceHover};
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
  }

  /* Primeira coluna presa ao rolar para o lado (tabela larga no celular). */
  .sticky {
    position: sticky;
    left: 0;
    z-index: 1;
    background: ${({ theme }) => theme.colors.white};
  }
  thead .sticky { z-index: 2; background: ${({ theme }) => theme.colors.surfaceHover}; }
  tfoot .sticky { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

export const Muted = styled.span`
  color: ${({ theme }) => theme.colors.muted};
`

// ─── Vazio, carregando, aviso ───────────────────────────────────────────────────────────────────

const EmptyWrap = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 20px;
  text-align: center;

  .ico {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: ${({ theme }) => theme.colors.primary}0D;
    color: ${({ theme }) => theme.colors.primary};
  }
  strong { font-family: ${({ theme }) => theme.fonts.heading}; font-size: 1rem; color: ${({ theme }) => theme.colors.text}; }
  p { margin: 0; max-width: 420px; font-size: 0.875rem; line-height: 1.5; color: ${({ theme }) => theme.colors.muted}; }
`

export function EmptyState({ icon: IconCmp, title, text, action }: { icon?: Icon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <EmptyWrap>
      {IconCmp && <span className="ico"><IconCmp size={24} aria-hidden="true" /></span>}
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </EmptyWrap>
  )
}

const shimmer = keyframes`
  0% { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
`

export const Skeleton = styled.span<{ $w?: string; $h?: number }>`
  display: block;
  width: ${({ $w }) => $w ?? '100%'};
  height: ${({ $h }) => $h ?? 14}px;
  border-radius: 6px;
  background: ${({ theme }) => `linear-gradient(90deg, ${theme.colors.neutral} 0px, ${theme.colors.border} 80px, ${theme.colors.neutral} 160px)`};
  background-size: 200px 100%;
  animation: ${shimmer} 1.2s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) { animation: none; }
`

export function StatSkeletons({ count = 4 }: { count?: number }) {
  return (
    <StatGrid aria-busy="true" aria-label="Carregando números">
      {Array.from({ length: count }, (_, index) => (
        <StatBox key={index}>
          <Skeleton $w="50%" $h={10} />
          <Skeleton $w="70%" $h={24} />
          <Skeleton $w="40%" $h={10} />
        </StatBox>
      ))}
    </StatGrid>
  )
}

const CalloutBox = styled.div<{ $tone: Tone }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ $tone, theme }) => `${toneDot($tone, theme)}40`};
  background: ${({ $tone, theme }) => ($tone === 'muted' ? theme.colors.neutral : `${toneDot($tone, theme)}0F`)};
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};

  > svg { flex-shrink: 0; margin-top: 2px; color: ${({ $tone, theme }) => toneColor($tone, theme)}; }
`

export function Callout({ tone, icon: IconCmp, children, role }: { tone: Tone; icon: Icon; children: ReactNode; role?: 'alert' | 'note' | 'status' }) {
  return (
    <CalloutBox $tone={tone} role={role}>
      <IconCmp size={18} weight="fill" aria-hidden="true" />
      <div style={{ minWidth: 0 }}>{children}</div>
    </CalloutBox>
  )
}

// ─── Lista de tarefas ("precisa da sua atenção") ────────────────────────────────────────────────

export const TaskList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`

const TaskLink = styled(Link)`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  color: inherit;
  transition: background 0.1s;

  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
  li:last-child > & { border-bottom: none; }

  .ico {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    border-radius: 10px;
  }
  .txt { flex: 1; min-width: 0; }
  strong { display: block; font-size: 0.875rem; font-weight: ${({ theme }) => theme.fontWeights.semibold}; color: ${({ theme }) => theme.colors.text}; }
  small { display: block; font-size: 0.75rem; line-height: 1.4; color: ${({ theme }) => theme.colors.muted}; }
  > svg:last-child { flex-shrink: 0; color: ${({ theme }) => theme.colors.muted}; }
`

const TaskIcon = styled.span<{ $tone: Tone }>`
  color: ${({ $tone, theme }) => toneColor($tone, theme)};
  background: ${({ $tone, theme }) => ($tone === 'muted' ? theme.colors.neutral : `${toneDot($tone, theme)}17`)};
`

export function TaskItem({ to, tone, icon: IconCmp, title, text }: { to: string; tone: Tone; icon: Icon; title: string; text?: string }) {
  return (
    <li>
      <TaskLink to={to}>
        <TaskIcon className="ico" $tone={tone}><IconCmp size={17} weight="bold" aria-hidden="true" /></TaskIcon>
        <span className="txt"><strong>{title}</strong>{text && <small>{text}</small>}</span>
        <CaretRight size={14} aria-hidden="true" />
      </TaskLink>
    </li>
  )
}

// ─── Gaveta lateral (detalhes sem sair da tabela) ───────────────────────────────────────────────

const fade = keyframes`from { opacity: 0 } to { opacity: 1 }`
const slide = keyframes`from { transform: translateX(24px); opacity: 0.6 } to { transform: translateX(0); opacity: 1 }`

const DrawerOverlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(13, 13, 13, 0.4);
  animation: ${fade} 0.15s ease;
`

const DrawerPanel = styled(Dialog.Content)`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  width: min(640px, 100vw);
  background: ${({ theme }) => theme.colors.neutral};
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.16);
  animation: ${slide} 0.18s ease;
  &:focus { outline: none; }

  @media (prefers-reduced-motion: reduce) { animation: none; }
`

const DrawerHead = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  background: ${({ theme }) => theme.colors.white};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const DrawerTitle = styled(Dialog.Title)`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.125rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  overflow-wrap: anywhere;
`

const DrawerSub = styled(Dialog.Description)`
  margin: 4px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const DrawerBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 32px;
`

export function Drawer({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <Dialog.Portal>
        <DrawerOverlay />
        <DrawerPanel>
          <DrawerHead>
            <div style={{ minWidth: 0 }}>
              <DrawerTitle>{title}</DrawerTitle>
              {subtitle ? <DrawerSub>{subtitle}</DrawerSub> : <Dialog.Description style={{ display: 'none' }}>Detalhes</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton aria-label="Fechar"><X size={18} aria-hidden="true" /></IconButton>
            </Dialog.Close>
          </DrawerHead>
          <DrawerBody>{children}</DrawerBody>
        </DrawerPanel>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// ─── Lista de definições (resumo) ───────────────────────────────────────────────────────────────

export const DefList = styled.dl`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px 16px;
  margin: 0;
  font-size: 0.875rem;

  dt { color: ${({ theme }) => theme.colors.muted}; }
  dd { margin: 0; color: ${({ theme }) => theme.colors.text}; overflow-wrap: anywhere; }

  @media (max-width: 520px) { grid-template-columns: 1fr; gap: 2px; dd { margin-bottom: 8px; } }
`
