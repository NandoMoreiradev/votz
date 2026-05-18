import { useState } from 'react'
import type { MouseEvent } from 'react'
import styled, { keyframes, css } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Category, ReportStatus, VoteType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useReports } from '../hooks/useReports'
import { useAlerts } from '../hooks/useAlerts'
import { usePoliticians } from '../hooks/usePoliticians'
import { api } from '../lib/api'
import type { Report, Politician } from '../types/api'

// ─── Config ──────────────────────────────────────────────────────────────────
type Sort = 'pressure' | 'recent' | 'votes'
type Period = '24h' | '7d' | '30d' | 'all'

const STATUS_CFG: Record<ReportStatus, { label: string; bg: string; color: string; dot: string }> = {
  OPEN:         { label: 'Aberto',       bg: '#FFE4E6', color: '#8a1c25', dot: '#E63946' },
  UNDER_REVIEW: { label: 'Em análise',   bg: '#FEF3C7', color: '#7a4d00', dot: '#D97706' },
  IN_PROGRESS:  { label: 'Em andamento', bg: '#DBEAFE', color: '#1e3a8a', dot: '#2563EB' },
  RESOLVED:     { label: 'Resolvido',    bg: '#DCFCE7', color: '#14532D', dot: '#2DC653' },
  DISPUTED:     { label: 'Contestado',   bg: '#1D1D35', color: '#fff',    dot: '#E63946' },
  ARCHIVED:     { label: 'Arquivado',    bg: '#F4F4F4', color: '#6B6B7A', dot: '#9494A0' },
}

const CAT_CFG: Record<Category, { label: string; gradient: string }> = {
  HEALTH:         { label: 'Saúde',              gradient: 'linear-gradient(135deg,#3a2530,#6a3540)' },
  MOBILITY:       { label: 'Mobilidade',         gradient: 'linear-gradient(135deg,#1f2a3a,#324a6b)' },
  SAFETY:         { label: 'Segurança',          gradient: 'linear-gradient(135deg,#2a1f1f,#5a3232)' },
  EDUCATION:      { label: 'Educação',           gradient: 'linear-gradient(135deg,#1f2a25,#325a4a)' },
  SANITATION:     { label: 'Saneamento',         gradient: 'linear-gradient(135deg,#2a2a1f,#4a4a32)' },
  HOUSING:        { label: 'Habitação',          gradient: 'linear-gradient(135deg,#2a251f,#5a4a32)' },
  ENVIRONMENT:    { label: 'Meio Ambiente',      gradient: 'linear-gradient(135deg,#1a2e1f,#2d5a38)' },
  INFRASTRUCTURE: { label: 'Infraestrutura',     gradient: 'linear-gradient(135deg,#2a2520,#4a4038)' },
  URBAN_SERVICES: { label: 'Serviços Urbanos',   gradient: 'linear-gradient(135deg,#1a2a30,#2a4a5a)' },
  CORRUPTION:     { label: 'Corrupção',          gradient: 'linear-gradient(135deg,#2a1020,#5a1030)' },
  ACCESSIBILITY:  { label: 'Acessibilidade',     gradient: 'linear-gradient(135deg,#20152a,#3a2560)' },
  SOCIAL_WELFARE: { label: 'Assistência Social', gradient: 'linear-gradient(135deg,#2a1525,#5a2050)' },
  OTHER:          { label: 'Outra',              gradient: 'linear-gradient(135deg,#2a2a44,#45456b)' },
}

const STATUS_LIST = [
  { value: ReportStatus.OPEN,         label: 'Aberto',       dot: '#E63946' },
  { value: ReportStatus.UNDER_REVIEW, label: 'Em análise',   dot: '#D97706' },
  { value: ReportStatus.IN_PROGRESS,  label: 'Em andamento', dot: '#2563EB' },
  { value: ReportStatus.RESOLVED,     label: 'Resolvido',    dot: '#2DC653' },
  { value: ReportStatus.DISPUTED,     label: 'Contestado',   dot: '#0D0D0D' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (h < 1) return 'agora'
  if (h < 24) return `há ${h}h`
  if (d === 1) return 'há 1 dia'
  if (d < 7) return `há ${d} dias`
  return `há ${Math.floor(d / 7)}sem`
}

function fmtCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + 'k'
  return String(n)
}

function periodCutoff(p: Period): number {
  if (p === '24h') return Date.now() - 86_400_000
  if (p === '7d')  return Date.now() - 7 * 86_400_000
  if (p === '30d') return Date.now() - 30 * 86_400_000
  return 0
}

function polScore(p: Politician): number {
  const m = p.mandatometer
  if (!m || m.total === 0) return 0
  return Math.round((m.resolved / m.total) * 100)
}

const AVATAR_COLORS = ['#4a5568', '#553c9a', '#285e61', '#744210', '#742a2a', '#2c4a2d']
function avatarColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

// ─── Animations ──────────────────────────────────────────────────────────────
const livePulse = keyframes`
  0%,100% { box-shadow: 0 0 0 3px rgba(45,198,83,.20); }
  50%      { box-shadow: 0 0 0 6px rgba(45,198,83,.04); }
`
const surtoBlink = keyframes`
  0%,100% { opacity: 1; }
  50%      { opacity: .6; }
`
const skelPulse = keyframes`
  0%,100% { opacity: 1; }
  50%      { opacity: .5; }
`

// ─── Styled: Page shell ───────────────────────────────────────────────────────
const Page = styled.div`
  min-height: 100vh;
  background: #FAFAF7;
`

// ─── Styled: Subheader ────────────────────────────────────────────────────────
const Subheader = styled.div`
  background: #fff;
  border-bottom: 1px solid #E5E5E0;
  position: sticky;
  top: 64px;
  z-index: 40;
`
const SubInner = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 14px 32px;
  display: flex;
  align-items: center;
  gap: 16px;
  @media (max-width: 820px) { flex-wrap: wrap; padding: 12px 16px; }
`
const SubCrumb = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  display: flex;
  align-items: center;
  gap: 6px;
  b { color: ${({ theme }) => theme.colors.text}; }
`
const SubTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
  margin-top: 4px;
`
const SubMeta = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin-left: 14px;
  b { color: ${({ theme }) => theme.colors.text}; }
`
const SubSpacer = styled.div`flex: 1;`
const SubTools = styled.div`display: flex; align-items: center; gap: 10px;`

const ToolBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  transition: border-color 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.text}; }
`
const SegControl = styled.div`
  display: inline-flex;
  height: 34px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: 7px;
  padding: 3px;
`
const SegBtn = styled.button<{ $active?: boolean }>`
  border: none;
  background: ${({ $active }) => $active ? '#fff' : 'transparent'};
  height: 100%;
  padding: 0 12px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ $active, theme }) => $active ? theme.colors.text : theme.colors.muted};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.15s, color 0.15s;
  box-shadow: ${({ $active }) => $active ? '0 1px 2px rgba(0,0,0,.06)' : 'none'};
`

// ─── Styled: 3-column layout ──────────────────────────────────────────────────
const Main = styled.main`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  gap: 32px;
  align-items: start;
  @media (max-width: 1180px) { grid-template-columns: 220px 1fr; }
  @media (max-width: 820px)  { grid-template-columns: 1fr; padding: 16px; gap: 16px; }
`

// ─── Styled: Sidebar ──────────────────────────────────────────────────────────
const Sidebar = styled.aside`
  position: sticky;
  top: 134px;
  @media (max-width: 820px) { display: none; }
`
const FilterBlock = styled.div`margin-bottom: 28px;`
const FilterLabel = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`
const ClearBtn = styled.button`
  text-transform: none;
  letter-spacing: 0;
  color: ${({ theme }) => theme.colors.text};
  font-size: 11px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  border-bottom: 1px dashed #9494A0;
  padding-bottom: 1px;
`
const ChipsWrap = styled.div`display: flex; flex-wrap: wrap;`
const Chip = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: ${({ $active }) => $active ? '#0D0D0D' : '#fff'};
  border: 1px solid ${({ $active }) => $active ? '#0D0D0D' : '#E5E5E0'};
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ $active }) => $active ? '#fff' : '#0D0D0D'};
  cursor: pointer;
  margin: 0 4px 6px 0;
  transition: all 0.15s;
  user-select: none;
  &:hover { border-color: #0D0D0D; }
`
const StatusList = styled.div`display: flex; flex-direction: column; gap: 4px;`
const StatusOpt = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
  input { margin: 0; accent-color: #0D0D0D; }
  .lbl { flex: 1; }
`
const SDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $color }) => $color};
`
const PeriodSeg = styled.div`
  display: grid;
  grid-template-columns: repeat(4,1fr);
  height: 32px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: 7px;
  padding: 3px;
  width: 100%;
`
const PeriodBtn = styled.button<{ $active?: boolean }>`
  border: none;
  background: ${({ $active }) => $active ? '#fff' : 'transparent'};
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  color: ${({ $active, theme }) => $active ? theme.colors.text : theme.colors.muted};
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: ${({ $active }) => $active ? '0 1px 2px rgba(0,0,0,.06)' : 'none'};
`
const RadioList = styled.div`display: flex; flex-direction: column; gap: 2px;`
const RadioOpt = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
  input { accent-color: #0D0D0D; margin: 0; }
  .lbl { flex: 1; }
`

// ─── Styled: Feed ─────────────────────────────────────────────────────────────
const FeedSection = styled.section``
const FeedHead = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
`
const FeedCount = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  b { color: ${({ theme }) => theme.colors.text}; font-weight: 600; }
`
const LiveIndicator = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.positive};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`
const LiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.positive};
  box-shadow: 0 0 0 3px rgba(45,198,83,.20);
  animation: ${livePulse} 2s infinite;
`

// Surto banner
const SurtoBannerWrap = styled.div`
  background: #0D0D0D;
  color: #fff;
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 0% 50%, rgba(230,57,70,.30), transparent 50%);
    pointer-events: none;
  }
  > * { position: relative; }
`
const SurtoTag = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: #fff;
  background: ${({ theme }) => theme.colors.action};
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  flex-shrink: 0;
  animation: ${surtoBlink} 2.4s infinite;
`
const SurtoText = styled.div`
  flex: 1;
  font-size: 14px;
  line-height: 1.45;
  b { font-weight: 600; }
  small {
    display: block;
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 11px;
    color: rgba(255,255,255,.5);
    margin-top: 4px;
  }
`
const SurtoAnchor = styled.button`
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid rgba(255,255,255,.4);
  padding-bottom: 1px;
  cursor: pointer;
  white-space: nowrap;
`

const Feed = styled.div`display: flex; flex-direction: column; gap: 12px;`

// ─── Styled: Horizontal card ──────────────────────────────────────────────────
const CardWrap = styled.article<{ $highPressure?: boolean }>`
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  ${({ $highPressure }) => $highPressure && css`border-left: 3px solid #E63946;`}
  &:hover {
    border-color: #0D0D0D;
    box-shadow: 0 4px 14px rgba(0,0,0,.04);
  }
`
const CardImg = styled.div<{ $category: Category }>`
  width: 168px;
  flex-shrink: 0;
  position: relative;
  background: ${({ $category }) => CAT_CFG[$category].gradient};
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(45deg, rgba(255,255,255,.03) 25%, transparent 25%),
      linear-gradient(-45deg, rgba(255,255,255,.03) 25%, transparent 25%);
    background-size: 14px 14px;
    pointer-events: none;
  }
  @media (max-width: 620px) { display: none; }
`
const CatTag = styled.span`
  position: absolute;
  top: 10px;
  left: 10px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(0,0,0,.55);
  padding: 4px 7px;
  border-radius: 4px;
  text-transform: uppercase;
  font-weight: 500;
  z-index: 1;
`
const PhotoCount = styled.span`
  position: absolute;
  bottom: 10px;
  right: 10px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: rgba(255,255,255,.85);
  background: rgba(0,0,0,.55);
  padding: 3px 7px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  z-index: 1;
`
const CardBody = styled.div`
  flex: 1;
  padding: 14px 18px 12px;
  display: flex;
  flex-direction: column;
  min-width: 0;
`
const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
  flex-wrap: wrap;
`
const MetaDot = styled.span`
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #9494A0;
  flex-shrink: 0;
`
const CardTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 600;
  font-size: 17px;
  line-height: 1.25;
  color: ${({ theme }) => theme.colors.text};
  letter-spacing: -0.01em;
  margin-bottom: 6px;
`
const CardDesc = styled.p`
  font-size: 13.5px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`
const SBadge = styled.span<{ $status: ReportStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: ${({ $status }) => STATUS_CFG[$status].bg};
  color: ${({ $status }) => STATUS_CFG[$status].color};
`
const SBadgeDot = styled.span<{ $status: ReportStatus }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${({ $status }) => STATUS_CFG[$status].dot};
`
const Pill = styled.span<{ $high?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  color: #6B6B7A;
  padding: 4px 8px;
  border: 1px solid #E5E5E0;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  b { color: ${({ $high }) => $high ? '#E63946' : '#0D0D0D'}; }
`
const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed #E5E5E0;
`
const ActBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background: ${({ $active, theme }) => $active ? `${theme.colors.primary}12` : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : '#6B6B7A'};
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:hover { background: #F4F4F4; color: #0D0D0D; }
  .ct { font-family: ${({ theme }) => theme.fonts.mono}; font-size: 11.5px; font-weight: 600; }
`
const ActSpacer = styled.div`flex: 1;`

const FeedAvocBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  border-radius: 6px;
  padding: 7px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #1E40AF;
  line-height: 1.4;
  b { font-weight: 600; }
`

const SkeletonCard = styled.div`
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 12px;
  height: 160px;
  animation: ${skelPulse} 1.5s ease-in-out infinite;
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

// ─── Styled: Right rail ───────────────────────────────────────────────────────
const Rail = styled.aside`
  position: sticky;
  top: 134px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  @media (max-width: 1180px) { display: none; }
`
const RailCard = styled.div`
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 12px;
  overflow: hidden;
`
const RailHead = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid #EDEDE8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  h3 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    margin: 0;
  }
`
const RailViewAll = styled(Link)`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`
const MiniMapBox = styled(Link)`
  display: block;
  height: 200px;
  background:
    radial-gradient(circle at 30% 40%, rgba(230,57,70,.20), transparent 30%),
    radial-gradient(circle at 60% 60%, rgba(230,57,70,.28), transparent 25%),
    radial-gradient(circle at 70% 30%, rgba(230,57,70,.14), transparent 28%),
    radial-gradient(circle at 25% 75%, rgba(45,198,83,.16), transparent 26%),
    #262648;
  position: relative;
`
const MiniMapGrid = styled.div`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgba(255,255,255,.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255,255,255,.04) 1px, transparent 1px);
  background-size: 24px 24px;
`
const MapPin = styled.div<{ $x: number; $y: number; $green?: boolean }>`
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  left: ${({ $x }) => $x}%;
  top: ${({ $y }) => $y}%;
  background: ${({ $green }) => $green ? '#2DC653' : '#E63946'};
  box-shadow: ${({ $green }) =>
    $green ? '0 0 0 3px rgba(45,198,83,.25)' : '0 0 0 3px rgba(230,57,70,.25)'};
`
const MiniMapFoot = styled.div`
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.muted};
  a {
    color: ${({ theme }) => theme.colors.text};
    font-weight: 600;
    border-bottom: 1px solid #0D0D0D;
    padding-bottom: 1px;
  }
`
const AltaList = styled.div`padding: 6px 0;`
const AltaItem = styled(Link)`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 16px;
  transition: background 0.15s;
  &:hover { background: #F4F4F4; }
`
const AltaRank = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 22px;
  color: #9494A0;
  letter-spacing: -0.02em;
  width: 24px;
  flex-shrink: 0;
  line-height: 1;
  padding-top: 2px;
`
const AltaContent = styled.div`flex: 1; min-width: 0;`
const AltaTitle = styled.div`
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: #0D0D0D;
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
const AltaMeta = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  gap: 8px;
  .pr b { color: #E63946; }
`
const MandList = styled.div`padding: 6px 0;`
const MandItem = styled(Link)`
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  transition: background 0.15s;
  &:hover { background: #F4F4F4; }
`
const MandAvatar = styled.div<{ $bg: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 12px;
  color: #fff;
  background: ${({ $bg }) => $bg};
`
const MandContent = styled.div`flex: 1; min-width: 0;`
const MandName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: #0D0D0D;
  margin-bottom: 2px;
`
const MandRole = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: #6B6B7A;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`
const MandPct = styled.div<{ $score: number }>`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.02em;
  line-height: 1;
  text-align: right;
  color: ${({ $score }) => $score >= 70 ? '#2DC653' : $score >= 40 ? '#D97706' : '#E63946'};
`
const MandPctLabel = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 9px;
  color: #9494A0;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 2px;
  text-align: right;
`
const ImprensaCTA = styled.div`
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  padding: 18px;
  border-radius: 12px;
`
const ImprensaKicker = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: rgba(255,255,255,.5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
`
const ImprensaH3 = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 17px;
  color: #fff;
  margin: 0 0 8px;
`
const ImprensaP = styled.p`
  font-size: 12.5px;
  color: rgba(255,255,255,.7);
  line-height: 1.5;
  margin: 0 0 14px;
`
const ImprensaBtn = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  color: ${({ theme }) => theme.colors.primary};
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
`

// ─── FeedCard ─────────────────────────────────────────────────────────────────
function FeedCard({ report }: { report: Report }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [voted, setVoted] = useState({ support: false, meToo: false })
  const [meTooCount, setMeTooCount] = useState(report._count.meTooVotes)

  const vote = useMutation({
    mutationFn: (type: VoteType) =>
      api.post(`/reports/${report.id}/votes`, { type }).then(r => r.data),
    onMutate: async (type) => {
      await qc.cancelQueries({ queryKey: ['reports'] })
      const prevData = qc.getQueriesData<{ data: Report[] }>({ queryKey: ['reports'] })
      const prevVoted = { ...voted }
      const prevMeToo = meTooCount

      if (type === VoteType.SUPPORT) {
        const delta = voted.support ? -1 : 1
        qc.setQueriesData<{ data: Report[]; meta: unknown }>({ queryKey: ['reports'] }, (old) => {
          if (!old) return old
          return {
            ...old,
            data: old.data.map(r =>
              r.id === report.id
                ? { ...r, _count: { ...r._count, votes: Math.max(0, r._count.votes + delta) } }
                : r
            ),
          }
        })
        setVoted(v => ({ ...v, support: !v.support }))
      } else {
        const delta = voted.meToo ? -1 : 1
        setMeTooCount(c => Math.max(0, c + delta))
        setVoted(v => ({ ...v, meToo: !v.meToo }))
      }

      return { prevData, prevVoted, prevMeToo }
    },
    onError: (_, __, ctx) => {
      ctx?.prevData.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx) { setVoted(ctx.prevVoted); setMeTooCount(ctx.prevMeToo) }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['reports'] }),
  })

  const handleCard = () => navigate(`/relatos/${report.id}`)
  const handleVote = (e: MouseEvent, type: VoteType) => {
    e.stopPropagation()
    vote.mutate(type)
  }
  const handleComment = (e: MouseEvent) => {
    e.stopPropagation()
    navigate(`/relatos/${report.id}`)
  }
  const handleShare = (e: MouseEvent) => {
    e.stopPropagation()
    const url = `${window.location.origin}/relatos/${report.id}`
    if (navigator.share) {
      navigator.share({ title: report.title, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).catch(() => {})
    }
  }

  const location = [
    report.normalizedAddress,
    [report.city, report.state].filter(Boolean).join(' · '),
  ].filter(Boolean)

  return (
    <CardWrap onClick={handleCard} $highPressure={report.pressureScore >= 8}>
      <CardImg $category={report.category}>
        <CatTag>{CAT_CFG[report.category].label}</CatTag>
        {report.media.length > 0 && (
          <PhotoCount>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" />
            </svg>
            {report.media.length} {report.media.length === 1 ? 'foto' : 'fotos'}
          </PhotoCount>
        )}
      </CardImg>

      <CardBody>
        <CardMeta>
          {location.map((loc, i) => (
            <span key={i}>
              {loc}
              {i < location.length - 1 && <MetaDot />}
            </span>
          ))}
          {location.length > 0 && <MetaDot />}
          <span>{timeAgo(report.createdAt)}</span>
        </CardMeta>

        <CardTitle>{report.title}</CardTitle>
        <CardDesc>{report.description}</CardDesc>

        <StatusRow>
          <SBadge $status={report.status}>
            <SBadgeDot $status={report.status} />
            {STATUS_CFG[report.status].label}
          </SBadge>
          <Pill $high={report.pressureScore >= 7}>
            Pressão <b>{report.pressureScore.toFixed(1)}</b>
          </Pill>
          {report.advocacy && (
            <Pill style={{ background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF' }}>
              🤝 Avocado
            </Pill>
          )}
        </StatusRow>

        {report.advocacy && (
          <FeedAvocBanner>
            🤝 <span><b>{report.advocacy.author?.name ?? 'Político'}</b> avocou este relato</span>
          </FeedAvocBanner>
        )}

        <Actions>
          <ActBtn $active={voted.support} onClick={e => handleVote(e, VoteType.SUPPORT)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 22h10V11l-5-9-1.5 2.5L8 9H4l3 13z" />
            </svg>
            Apoiar <span className="ct">{fmtCount(report._count.votes)}</span>
          </ActBtn>

          <ActBtn $active={voted.meToo} onClick={e => handleVote(e, VoteType.ME_TOO)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="7" r="3" /><path d="M5 20c0-4 3-7 7-7s7 3 7 7" />
            </svg>
            Eu também <span className="ct">{fmtCount(meTooCount)}</span>
          </ActBtn>

          <ActBtn onClick={handleComment}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12c0 4.5-4 8-9 8-1.5 0-3-.3-4.3-1L3 20l1.2-4.5C3.5 14.2 3 12.7 3 12c0-4.5 4-8 9-8s9 3.5 9 8z" />
            </svg>
            <span className="ct">{report._count.comments}</span>
          </ActBtn>

          <ActSpacer />

          <ActBtn onClick={handleShare} title="Compartilhar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
          </ActBtn>
        </Actions>
      </CardBody>
    </CardWrap>
  )
}

// ─── Home ─────────────────────────────────────────────────────────────────────
const ALL_ACTIVE = new Set([
  ReportStatus.OPEN,
  ReportStatus.UNDER_REVIEW,
  ReportStatus.IN_PROGRESS,
  ReportStatus.RESOLVED,
  ReportStatus.DISPUTED,
])

export function Home() {
  const navigate = useNavigate()
  const [category, setCategory]             = useState<Category | undefined>()
  const [statuses, setStatuses]             = useState<Set<ReportStatus>>(new Set(ALL_ACTIVE))
  const [sort, setSort]                     = useState<Sort>('pressure')
  const [period, setPeriod]                 = useState<Period>('30d')
  const [avoc, setAvoc]                     = useState<'all' | 'avocated' | 'none'>('all')
  const [view, setView]                     = useState<'list' | 'map'>('list')

  const { data, isLoading, isError } = useReports({ category, limit: 50 })
  const { data: polData }            = usePoliticians()
  const { data: alerts }             = useAlerts()

  const cutoff   = periodCutoff(period)
  const filtered = (data?.data ?? [])
    .filter(r => statuses.size === 0 || statuses.has(r.status))
    .filter(r => cutoff === 0 || new Date(r.createdAt).getTime() >= cutoff)
    .sort((a, b) => {
      if (sort === 'pressure') return b.pressureScore - a.pressureScore
      if (sort === 'votes')    return b._count.votes - a._count.votes
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })

  const topByPressure = [...(data?.data ?? [])]
    .sort((a, b) => b.pressureScore - a.pressureScore)
    .slice(0, 5)
  const politicians  = (polData?.data ?? []).slice(0, 3)
  const activeSurto  = alerts?.[0] ?? null

  function toggleStatus(s: ReportStatus) {
    setStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const sortLabel = sort === 'pressure' ? 'Pressão' : sort === 'recent' ? 'Recentes' : 'Votos'
  const nextSort: Sort = sort === 'pressure' ? 'recent' : sort === 'recent' ? 'votes' : 'pressure'

  return (
    <Page>
      <Navbar />

      {/* ── Subheader ── */}
      <Subheader>
        <SubInner>
          <div>
            <SubCrumb>Feed <span>/</span> <b>Todos os relatos</b></SubCrumb>
            <div style={{ display: 'flex', alignItems: 'baseline' }}>
              <SubTitle>
                {data ? `${data.meta.total.toLocaleString('pt-BR')} relatos` : 'Carregando…'}
              </SubTitle>
              <SubMeta>últimos <b>{period === 'all' ? 'todos os tempos' : period}</b></SubMeta>
            </div>
          </div>
          <SubSpacer />
          <SubTools>
            <ToolBtn onClick={() => setSort(nextSort)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M6 12h12M10 18h4" />
              </svg>
              Ordenar:{' '}
              <span style={{ color: '#9494A0' }}>{sortLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </ToolBtn>
            <SegControl>
              <SegBtn $active={view === 'list'} onClick={() => setView('list')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
                Lista
              </SegBtn>
              <SegBtn $active={view === 'map'} onClick={() => { setView('map'); navigate('/mapa') }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 4l-6 3v13l6-3M9 4v13M9 4l6 3m0 0l6-3v13l-6 3m0-13v13m-6-3l6 3" />
                </svg>
                Mapa
              </SegBtn>
            </SegControl>
          </SubTools>
        </SubInner>
      </Subheader>

      <Main>
        {/* ── Sidebar ── */}
        <Sidebar>
          <FilterBlock>
            <FilterLabel>
              <span>Categoria</span>
              {category && <ClearBtn onClick={() => setCategory(undefined)}>Limpar</ClearBtn>}
            </FilterLabel>
            <ChipsWrap>
              <Chip $active={!category} onClick={() => setCategory(undefined)}>Todas</Chip>
              {Object.values(Category).map(cat => (
                <Chip key={cat} $active={category === cat} onClick={() => setCategory(cat === category ? undefined : cat)}>
                  {CAT_CFG[cat].label}
                </Chip>
              ))}
            </ChipsWrap>
          </FilterBlock>

          <FilterBlock>
            <FilterLabel><span>Status</span></FilterLabel>
            <StatusList>
              {STATUS_LIST.map(({ value, label, dot }) => (
                <StatusOpt key={value}>
                  <input type="checkbox" checked={statuses.has(value)} onChange={() => toggleStatus(value)} />
                  <SDot $color={dot} />
                  <span className="lbl">{label}</span>
                </StatusOpt>
              ))}
            </StatusList>
          </FilterBlock>

          <FilterBlock>
            <FilterLabel><span>Período</span></FilterLabel>
            <PeriodSeg>
              {(['24h', '7d', '30d', 'all'] as Period[]).map(p => (
                <PeriodBtn key={p} $active={period === p} onClick={() => setPeriod(p)}>
                  {p === 'all' ? 'Tudo' : p}
                </PeriodBtn>
              ))}
            </PeriodSeg>
          </FilterBlock>

          <FilterBlock>
            <FilterLabel><span>Avocação política</span></FilterLabel>
            <RadioList>
              <RadioOpt>
                <input type="radio" name="avoc" checked={avoc === 'all'} onChange={() => setAvoc('all')} />
                <span className="lbl">Tudo</span>
              </RadioOpt>
              <RadioOpt>
                <input type="radio" name="avoc" checked={avoc === 'avocated'} onChange={() => setAvoc('avocated')} />
                <span className="lbl">Avocados</span>
              </RadioOpt>
              <RadioOpt>
                <input type="radio" name="avoc" checked={avoc === 'none'} onChange={() => setAvoc('none')} />
                <span className="lbl">Sem avocação</span>
              </RadioOpt>
            </RadioList>
          </FilterBlock>
        </Sidebar>

        {/* ── Feed ── */}
        <FeedSection>
          <FeedHead>
            <FeedCount><b>{filtered.length}</b> resultados</FeedCount>
            <LiveIndicator><LiveDot /> Atualizando</LiveIndicator>
          </FeedHead>

          {activeSurto && (
            <SurtoBannerWrap>
              <SurtoTag>⚡ Surto</SurtoTag>
              <SurtoText>
                <b>{activeSurto.city}{activeSurto.state ? ` · ${activeSurto.state}` : ''}</b>
                {' '}— <b>{activeSurto.count} relatos</b> de{' '}
                {CAT_CFG[activeSurto.category as keyof typeof CAT_CFG]?.label ?? activeSurto.category}{' '}
                nas últimas 24h.
                <small>Detectado {timeAgo(activeSurto.detectedAt)} · Entidades notificadas</small>
              </SurtoText>
              <SurtoAnchor onClick={() => navigate(`/?categoria=${activeSurto.category}&cidade=${encodeURIComponent(activeSurto.city)}`)}>
                Ver relatos →
              </SurtoAnchor>
            </SurtoBannerWrap>
          )}

          <Feed>
            {isLoading && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

            {isError && (
              <EmptyState>
                <h3>Não foi possível carregar</h3>
                <p>Verifique sua conexão e tente novamente.</p>
              </EmptyState>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <EmptyState>
                <h3>Nenhum relato encontrado</h3>
                <p>Tente ajustar os filtros ou seja o primeiro a registrar um problema.</p>
              </EmptyState>
            )}

            {filtered.map(report => (
              <FeedCard key={report.id} report={report} />
            ))}
          </Feed>
        </FeedSection>

        {/* ── Rail ── */}
        <Rail>
          <RailCard>
            <MiniMapBox to="/mapa">
              <MiniMapGrid />
              <MapPin $x={30} $y={38} />
              <MapPin $x={58} $y={55} />
              <MapPin $x={68} $y={28} />
              <MapPin $x={24} $y={70} $green />
              <MapPin $x={48} $y={18} />
            </MiniMapBox>
            <MiniMapFoot>
              <span>Relatos no mapa</span>
              <Link to="/mapa">Ver mapa completo</Link>
            </MiniMapFoot>
          </RailCard>

          {topByPressure.length > 0 && (
            <RailCard>
              <RailHead>
                <h3>Em alta</h3>
                <RailViewAll to="/">Ver tudo</RailViewAll>
              </RailHead>
              <AltaList>
                {topByPressure.map((r, i) => (
                  <AltaItem key={r.id} to={`/relatos/${r.id}`}>
                    <AltaRank>{i + 1}</AltaRank>
                    <AltaContent>
                      <AltaTitle>{r.title}</AltaTitle>
                      <AltaMeta>
                        <span>{CAT_CFG[r.category].label}</span>
                        <span className="pr">Pressão <b>{r.pressureScore.toFixed(1)}</b></span>
                      </AltaMeta>
                    </AltaContent>
                  </AltaItem>
                ))}
              </AltaList>
            </RailCard>
          )}

          {politicians.length > 0 && (
            <RailCard>
              <RailHead>
                <h3>Mandatômetro</h3>
                <RailViewAll to="/politicos">Ver todos</RailViewAll>
              </RailHead>
              <MandList>
                {politicians.map(pol => {
                  const score = polScore(pol)
                  return (
                    <MandItem key={pol.id} to={`/politicos/${pol.id}`}>
                      <MandAvatar $bg={avatarColor(pol.user.name)}>
                        {initials(pol.user.name)}
                      </MandAvatar>
                      <MandContent>
                        <MandName>{pol.user.name}</MandName>
                        <MandRole>{pol.party.abbreviation} · {pol.office}</MandRole>
                      </MandContent>
                      <div>
                        <MandPct $score={score}>{score}%</MandPct>
                        <MandPctLabel>resolução</MandPctLabel>
                      </div>
                    </MandItem>
                  )
                })}
              </MandList>
            </RailCard>
          )}

          <ImprensaCTA>
            <ImprensaKicker>Para a imprensa</ImprensaKicker>
            <ImprensaH3>Dados abertos sobre problemas urbanos</ImprensaH3>
            <ImprensaP>
              Acesse relatórios, tendências e alertas em tempo real para reportagens baseadas em dados.
            </ImprensaP>
            <ImprensaBtn to="/entidades">Acessar dados →</ImprensaBtn>
          </ImprensaCTA>
        </Rail>
      </Main>
    </Page>
  )
}
