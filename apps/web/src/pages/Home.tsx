import { useState } from 'react'
import type { MouseEvent } from 'react'
import styled, { keyframes, css } from 'styled-components'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Fire, HandsClapping, Megaphone, Newspaper, UsersThree } from '@phosphor-icons/react'
import { Category, PostKind, RecipientType, ReportStatus, UserType, VoteType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { useMediaViewer } from '../components/ui/MediaViewer'
import { StateSelect, CitySelect } from '../components/ui/LocationSelect'
import { AdvocacyBanner, ShieldCheckIcon } from '../components/ui/AdvocacyBanner'
import { PostComposer } from '../components/posts/PostComposer'
import { PostCard } from '../components/posts/PostCard'
import { AdvocateConfirmModal } from '../components/posts/AdvocateConfirmModal'
import { useReports } from '../hooks/useReports'
import { usePostsFeed } from '../hooks/usePosts'
import { useTrendingTopics } from '../hooks/useTopics'
import { useAlerts } from '../hooks/useAlerts'
import { usePoliticians } from '../hooks/usePoliticians'
import { useMyVotes } from '../hooks/useVote'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import type { FeedSortMode, PostDto, Report, Politician } from '../types/api'

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
  padding: 8px 32px;
  display: flex;
  align-items: center;
  gap: 14px;
  @media (max-width: 820px) { flex-wrap: wrap; padding: 8px 16px; gap: 10px; }
`
const SubTitleRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
`
const SubTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: ${({ theme }) => theme.colors.text};
`
const SubMeta = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
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
  top: 120px;
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
const CardImg = styled.div<{ $category: Category; $coverUrl?: string }>`
  width: 168px;
  flex-shrink: 0;
  position: relative;
  background: ${({ $category, $coverUrl }) =>
    $coverUrl
      ? `url('${$coverUrl}') center / cover no-repeat`
      : CAT_CFG[$category].gradient};
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: ${({ $coverUrl }) => ($coverUrl ? 'rgba(0,0,0,0.48)' : 'transparent')};
    pointer-events: none;
    z-index: 0;
  }
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: ${({ $coverUrl }) =>
      $coverUrl
        ? 'none'
        : `linear-gradient(45deg, rgba(255,255,255,.03) 25%, transparent 25%),
           linear-gradient(-45deg, rgba(255,255,255,.03) 25%, transparent 25%)`};
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
const PhotoCount = styled.button`
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
  border: none;
  cursor: pointer;
  transition: background 0.15s;

  &:hover { background: rgba(0,0,0,.75); }
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


const AvocBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #BFDBFE;
  background: #EFF6FF;
  color: #1E40AF;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  &:hover { background: #DBEAFE; }
  &:disabled { opacity: 0.6; cursor: default; }
`
const LocationRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`
const filterSelectCss = `
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #E5E5E0;
  border-radius: 6px;
  font-size: 12.5px;
  color: #0D0D0D;
  background: #fff;
  cursor: pointer;
  &:focus { outline: none; border-color: #1A1A2E; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`
const FilterStateSelect = styled(StateSelect)`${filterSelectCss}`
const FilterCitySelect  = styled(CitySelect)`${filterSelectCss}`

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
function FeedCard({
  report,
  politicianId,
  entityId,
  onAdvocateClick,
}: {
  report: Report
  politicianId?: string
  entityId?: string
  onAdvocateClick?: (report: Report, actorType: 'POLITICIAN' | 'ENTITY', actorId: string) => void
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: myVotes } = useMyVotes(report.id)
  const { open: openMedia } = useMediaViewer()

  const isSupport = myVotes?.SUPPORT ?? false
  const isMeToo   = myVotes?.ME_TOO   ?? false

  const vote = useMutation({
    mutationFn: (type: VoteType) =>
      api.post(`/reports/${report.id}/votes`, { type }).then(r => r.data),
    onMutate: async (type) => {
      await qc.cancelQueries({ queryKey: ['reports'] })
      await qc.cancelQueries({ queryKey: ['my-votes', report.id] })

      const prevReports  = qc.getQueriesData<{ data: Report[] }>({ queryKey: ['reports'] })
      const prevMyVotes  = qc.getQueryData<{ SUPPORT: boolean; ME_TOO: boolean }>(['my-votes', report.id])

      const wasVoted  = prevMyVotes?.[type] ?? false
      const delta     = wasVoted ? -1 : 1
      const countKey  = type === VoteType.SUPPORT ? 'votes' : 'meTooVotes'

      qc.setQueriesData<{ data: Report[]; meta: unknown }>({ queryKey: ['reports'] }, (old) => {
        if (!old) return old
        return {
          ...old,
          data: old.data.map(r =>
            r.id === report.id
              ? { ...r, _count: { ...r._count, [countKey]: Math.max(0, r._count[countKey as keyof typeof r._count] + delta) } }
              : r
          ),
        }
      })

      qc.setQueryData(['my-votes', report.id], {
        SUPPORT: prevMyVotes?.SUPPORT ?? false,
        ME_TOO:  prevMyVotes?.ME_TOO  ?? false,
        [type]: !wasVoted,
      })

      return { prevReports, prevMyVotes }
    },
    onError: (_, __, ctx) => {
      ctx?.prevReports.forEach(([key, data]) => qc.setQueryData(key, data))
      if (ctx?.prevMyVotes) qc.setQueryData(['my-votes', report.id], ctx.prevMyVotes)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['my-votes', report.id] })
    },
  })

  const canAdvocateAsPol =
    !!politicianId &&
    !report.advocacy &&
    (report.recipientType === RecipientType.POLITICIAN ? report.recipientId === politicianId : true) &&
    (report.status === ReportStatus.OPEN || report.status === ReportStatus.UNDER_REVIEW)

  const canAdvocateAsEnt =
    !!entityId &&
    !report.advocacy &&
    (report.status === ReportStatus.OPEN || report.status === ReportStatus.UNDER_REVIEW)

  const canAdvocate = canAdvocateAsPol || canAdvocateAsEnt

  const handleCard    = () => navigate(`/relatos/${report.id}`)
  const handleVote    = (e: MouseEvent, type: VoteType) => { e.stopPropagation(); vote.mutate(type) }
  const handleComment = (e: MouseEvent) => { e.stopPropagation(); navigate(`/relatos/${report.id}`) }
  const handleAdvocate = (e: MouseEvent) => {
    e.stopPropagation()
    if (canAdvocateAsPol && politicianId) {
      onAdvocateClick?.(report, 'POLITICIAN', politicianId)
    } else if (canAdvocateAsEnt && entityId) {
      onAdvocateClick?.(report, 'ENTITY', entityId)
    }
  }
  const handleShare   = (e: MouseEvent) => {
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

  const coverUrl = report.media.find(
    (url) => !/\.(mp4|mov|webm|pdf)$/i.test(url)
  )

  return (
    <CardWrap onClick={handleCard} $highPressure={report.pressureScore >= 8}>
      <CardImg $category={report.category} $coverUrl={coverUrl}>
        <CatTag>{CAT_CFG[report.category].label}</CatTag>
        {report.media.length > 0 && (
          <PhotoCount
            onClick={(e) => {
              e.stopPropagation()
              openMedia(report.media.map((url) => ({ url })))
            }}
            aria-label={`Ver ${report.media.length} ${report.media.length === 1 ? 'foto' : 'fotos'}`}
          >
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
            <Pill style={{ background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1E40AF', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <ShieldCheckIcon size={12} />
              Avocado
            </Pill>
          )}
        </StatusRow>

        {report.advocacy && (
          <AdvocacyBanner
            author={report.advocacy.author}
            recipientType={report.recipientType}
            compact
          />
        )}

        <Actions>
          <ActBtn $active={isSupport} onClick={e => handleVote(e, VoteType.SUPPORT)}>
            <HandsClapping size={16} weight="duotone" />
            Apoiar <span className="ct">{fmtCount(report._count.votes)}</span>
          </ActBtn>

          <ActBtn $active={isMeToo} onClick={e => handleVote(e, VoteType.ME_TOO)}>
            <UsersThree size={16} weight="duotone" />
            Eu também <span className="ct">{fmtCount(report._count.meTooVotes)}</span>
          </ActBtn>

          <ActBtn onClick={handleComment}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12c0 4.5-4 8-9 8-1.5 0-3-.3-4.3-1L3 20l1.2-4.5C3.5 14.2 3 12.7 3 12c0-4.5 4-8 9-8s9 3.5 9 8z" />
            </svg>
            <span className="ct">{report._count.comments}</span>
          </ActBtn>

          <ActSpacer />

          {canAdvocate && (
            <AvocBtn onClick={handleAdvocate} title="Avocar este relato">
              <ShieldCheckIcon size={13} style={{ marginRight: 4 }} />Avocar
            </AvocBtn>
          )}

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

const HOME_TAB_STORAGE_KEY = 'votz:home_feed_tab'

function resolveInitialTab(params: URLSearchParams): 'publicacoes' | 'relatos' {
  const urlTab = params.get('tab')
  if (urlTab === 'publicacoes' || urlTab === 'relatos') return urlTab
  if (params.get('categoria') || params.get('cidade')) return 'relatos'
  try {
    const saved = localStorage.getItem(HOME_TAB_STORAGE_KEY)
    if (saved === 'publicacoes' || saved === 'relatos') return saved
  } catch {
    // ignore storage errors
  }
  return 'relatos'
}

const FeedModeWrap = styled.div`
  display: inline-flex;
  align-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 9px;
  padding: 3px;
  gap: 3px;
`

const FeedModeBtn = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.muted)};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  }
`

const AlgoTabs = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  flex-wrap: wrap;
`

const AlgoTabBtn = styled.button<{ $active: boolean }>`
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.white)};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
`

const TopicRow = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 16px;
  transition: background 0.15s;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
`

const TopicTag = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 13.5px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

const TopicMeta = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  color: ${({ theme }) => theme.colors.muted};
`

export function Home() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, activeContext } = useAuthStore()

  const [feedTab, setFeedTab] = useState<'publicacoes' | 'relatos'>(() =>
    resolveInitialTab(searchParams),
  )
  const [postSort, setPostSort] = useState<FeedSortMode>('for_you')
  const [postAuthorType, setPostAuthorType] = useState<'CITIZEN' | 'POLITICIAN' | 'ENTITY' | undefined>()
  const [postFilterKind, setPostFilterKind] = useState<'all' | 'advocacy' | 'polls'>('all')
  const [quoteTarget, setQuoteTarget] = useState<PostDto | null>(null)
  const [recentPostId, setRecentPostId] = useState<string | null>(null)
  const [advocateTarget, setAdvocateTarget] = useState<{
    report: Report
    actorType: 'POLITICIAN' | 'ENTITY'
    actorId: string
  } | null>(null)

  const [category, setCategory]             = useState<Category | undefined>(() => {
    const c = searchParams.get('categoria')
    return c && Object.values(Category).includes(c as Category) ? (c as Category) : undefined
  })
  const [statuses, setStatuses]             = useState<Set<ReportStatus>>(new Set(ALL_ACTIVE))
  const [sort, setSort]                     = useState<Sort>('pressure')
  const [period, setPeriod]                 = useState<Period>('30d')
  const [avoc, setAvoc]                     = useState<'all' | 'avocated' | 'none'>('all')
  const [view, setView]                     = useState<'list' | 'map'>('list')
  const [city, setCity]                     = useState(() => searchParams.get('cidade') ?? '')
  const [uf, setUf]                         = useState('')

  const politicianId = activeContext?.type === 'POLITICIAN' ? activeContext.id : undefined
  const entityId = activeContext?.type === 'ENTITY' ? activeContext.id : undefined

  function switchFeedTab(next: 'publicacoes' | 'relatos') {
    setFeedTab(next)
    try {
      localStorage.setItem(HOME_TAB_STORAGE_KEY, next)
    } catch {
      // ignore storage errors
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }

  const { data, isLoading, isError } = useReports({
    category,
    city:  city  || undefined,
    state: uf    || undefined,
    limit: 50,
  })
  const {
    data: postsData,
    isLoading: loadingPosts,
    isError: errorPosts,
  } = usePostsFeed({
    sort: postSort,
    city: city || undefined,
    state: uf || undefined,
    authorType: postAuthorType,
    kind: postFilterKind === 'advocacy' ? PostKind.ADVOCACY : undefined,
    hasPoll: postFilterKind === 'polls' ? true : undefined,
    limit: 25,
    enabled: feedTab === 'publicacoes',
  })
  const { data: trendingTopics } = useTrendingTopics({
    state: uf || undefined,
    city: city || undefined,
    limit: 6,
  })
  const { data: polData }            = usePoliticians()
  const { data: alerts }             = useAlerts()

  const cutoff   = periodCutoff(period)
  const filtered = (data?.data ?? [])
    .filter(r => statuses.size === 0 || statuses.has(r.status))
    .filter(r => cutoff === 0 || new Date(r.createdAt).getTime() >= cutoff)
    .filter(r => avoc === 'all' ? true : avoc === 'avocated' ? !!r.advocacy : !r.advocacy)
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
          <FeedModeWrap role="tablist" aria-label="Alternar tipo de feed">
            <FeedModeBtn
              type="button"
              role="tab"
              aria-selected={feedTab === 'publicacoes'}
              $active={feedTab === 'publicacoes'}
              onClick={() => switchFeedTab('publicacoes')}
            >
              <Newspaper size={16} weight="duotone" />
              Publicações
            </FeedModeBtn>
            <FeedModeBtn
              type="button"
              role="tab"
              aria-selected={feedTab === 'relatos'}
              $active={feedTab === 'relatos'}
              onClick={() => switchFeedTab('relatos')}
            >
              <Megaphone size={16} weight="duotone" />
              Relatos
            </FeedModeBtn>
          </FeedModeWrap>

          <SubTitleRow>
            <SubTitle>
              {feedTab === 'publicacoes' ? 'Publicações da comunidade' : 'Todos os relatos'}
            </SubTitle>
            <SubMeta>
              {feedTab === 'publicacoes'
                ? postsData
                  ? `${postsData.meta.total.toLocaleString('pt-BR')} ${postsData.meta.total === 1 ? 'publicação' : 'publicações'}`
                  : 'Carregando…'
                : data
                  ? `${data.meta.total.toLocaleString('pt-BR')} ${data.meta.total === 1 ? 'relato' : 'relatos'} · últimos ${period === 'all' ? 'todos os tempos' : period}`
                  : 'Carregando…'}
            </SubMeta>
          </SubTitleRow>
          <SubSpacer />
          {feedTab === 'relatos' && (
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
          )}
        </SubInner>
      </Subheader>

      <Main>
        {/* ── Sidebar ── */}
        <Sidebar>
          {feedTab === 'publicacoes' ? (
            <>
              <FilterBlock>
                <FilterLabel><span>Autor</span></FilterLabel>
                <ChipsWrap>
                  <Chip $active={!postAuthorType} onClick={() => setPostAuthorType(undefined)}>Todos</Chip>
                  <Chip $active={postAuthorType === 'CITIZEN'} onClick={() => setPostAuthorType('CITIZEN')}>Cidadãos</Chip>
                  <Chip $active={postAuthorType === 'POLITICIAN'} onClick={() => setPostAuthorType('POLITICIAN')}>Políticos</Chip>
                  <Chip $active={postAuthorType === 'ENTITY'} onClick={() => setPostAuthorType('ENTITY')}>Entidades</Chip>
                </ChipsWrap>
              </FilterBlock>

              <FilterBlock>
                <FilterLabel><span>Conteúdo</span></FilterLabel>
                <RadioList>
                  <RadioOpt>
                    <input type="radio" name="postFilterKind" checked={postFilterKind === 'all'} onChange={() => setPostFilterKind('all')} />
                    <span className="lbl">Tudo</span>
                  </RadioOpt>
                  <RadioOpt>
                    <input type="radio" name="postFilterKind" checked={postFilterKind === 'advocacy'} onChange={() => setPostFilterKind('advocacy')} />
                    <span className="lbl">Avocações oficiais</span>
                  </RadioOpt>
                  <RadioOpt>
                    <input type="radio" name="postFilterKind" checked={postFilterKind === 'polls'} onChange={() => setPostFilterKind('polls')} />
                    <span className="lbl">Com enquetes</span>
                  </RadioOpt>
                </RadioList>
              </FilterBlock>

              <FilterBlock>
                <FilterLabel>
                  <span>Localização</span>
                  {(city || uf) && <ClearBtn onClick={() => { setCity(''); setUf('') }}>Limpar</ClearBtn>}
                </FilterLabel>
                <LocationRow>
                  <FilterStateSelect
                    value={uf}
                    onChange={(v) => { setUf(v); setCity('') }}
                    placeholder="Todos os estados"
                  />
                  <FilterCitySelect
                    uf={uf}
                    value={city}
                    onChange={setCity}
                    placeholder="Todas as cidades"
                  />
                </LocationRow>
              </FilterBlock>
            </>
          ) : (
            <>
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
                <FilterLabel>
                  <span>Localização</span>
                  {(city || uf) && <ClearBtn onClick={() => { setCity(''); setUf('') }}>Limpar</ClearBtn>}
                </FilterLabel>
                <LocationRow>
                  <FilterStateSelect
                    value={uf}
                    onChange={(v) => { setUf(v); setCity('') }}
                    placeholder="Todos os estados"
                  />
                  <FilterCitySelect
                    uf={uf}
                    value={city}
                    onChange={setCity}
                    placeholder="Todas as cidades"
                  />
                </LocationRow>
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
            </>
          )}
        </Sidebar>

        {/* ── Feed ── */}
        {feedTab === 'publicacoes' ? (
          <FeedSection>
            <AlgoTabs>
              <AlgoTabBtn type="button" $active={postSort === 'for_you'} onClick={() => setPostSort('for_you')}>
                Para você
              </AlgoTabBtn>
              <AlgoTabBtn type="button" $active={postSort === 'trending'} onClick={() => setPostSort('trending')}>
                Em alta
              </AlgoTabBtn>
              {user && (
                <AlgoTabBtn type="button" $active={postSort === 'following'} onClick={() => setPostSort('following')}>
                  Seguindo
                </AlgoTabBtn>
              )}
              <AlgoTabBtn type="button" $active={postSort === 'recent'} onClick={() => setPostSort('recent')}>
                Recentes
              </AlgoTabBtn>
            </AlgoTabs>

            <PostComposer
              quotePost={quoteTarget}
              onClearQuote={() => setQuoteTarget(null)}
              onCreated={(created) => {
                setRecentPostId(created.id)
                setTimeout(() => {
                  setRecentPostId((curr) => (curr === created.id ? null : curr))
                }, 3000)
              }}
            />

            <Feed>
              {loadingPosts && Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}

              {errorPosts && (
                <EmptyState>
                  <h3>Não foi possível carregar as publicações</h3>
                  <p>Verifique sua conexão e tente novamente.</p>
                </EmptyState>
              )}

              {!loadingPosts && !errorPosts && (postsData?.data ?? []).length === 0 && (
                <EmptyState>
                  <h3>Nenhuma publicação encontrada</h3>
                  <p>
                    {postSort === 'following'
                      ? 'Siga cidadãos, políticos, entidades ou #pautas para ver suas publicações aqui.'
                      : 'Seja o primeiro a publicar uma atualização, foto, vídeo ou enquete!'}
                  </p>
                </EmptyState>
              )}

              {(postsData?.data ?? []).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  isNew={post.id === recentPostId}
                  onQuote={(p) => {
                    setQuoteTarget(p)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                />
              ))}
            </Feed>
          </FeedSection>
        ) : (
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
                <SurtoAnchor onClick={() => navigate(`/?tab=relatos&categoria=${activeSurto.category}&cidade=${encodeURIComponent(activeSurto.city)}`)}>
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
                <FeedCard
                  key={report.id}
                  report={report}
                  politicianId={politicianId}
                  entityId={entityId}
                  onAdvocateClick={(rep, actorType, actorId) =>
                    setAdvocateTarget({ report: rep, actorType, actorId })
                  }
                />
              ))}
            </Feed>
          </FeedSection>
        )}

        {/* ── Rail ── */}
        <Rail>
          {trendingTopics && trendingTopics.length > 0 && (
            <RailCard>
              <RailHead>
                <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Fire size={15} weight="fill" color="#E63946" /> Pautas em Alta
                </h3>
              </RailHead>
              <div>
                {trendingTopics.map((t) => (
                  <TopicRow key={t.id} to={`/pautas/${t.slug}`}>
                    <div>
                      <TopicTag>{t.displayTag}</TopicTag>
                      <TopicMeta>
                        {t.postsCount} posts · {t.reportsCount} relatos · {t.debatesCount} debates
                      </TopicMeta>
                    </div>
                    <TopicMeta>→</TopicMeta>
                  </TopicRow>
                ))}
              </div>
            </RailCard>
          )}

          {feedTab === 'publicacoes' ? (
            <RailCard>
              <RailHead>
                <h3>Acompanhe também</h3>
              </RailHead>
              <div>
                <TopicRow to="/?tab=relatos" onClick={(e) => { e.preventDefault(); switchFeedTab('relatos') }}>
                  <div>
                    <TopicTag style={{ color: '#1A1A2E' }}>Relatos da comunidade</TopicTag>
                    <TopicMeta>
                      {data ? `${data.meta.total.toLocaleString('pt-BR')} relatos ativos` : 'Problemas e cobranças'}
                    </TopicMeta>
                  </div>
                  <TopicMeta>→</TopicMeta>
                </TopicRow>
                <TopicRow to="/mapa">
                  <div>
                    <TopicTag style={{ color: '#1A1A2E' }}>Mapa de relatos</TopicTag>
                    <TopicMeta>Visualizar ocorrências por região</TopicMeta>
                  </div>
                  <TopicMeta>→</TopicMeta>
                </TopicRow>
                <TopicRow to="/politicos">
                  <div>
                    <TopicTag style={{ color: '#1A1A2E' }}>Mandatômetro</TopicTag>
                    <TopicMeta>Desempenho de políticos</TopicMeta>
                  </div>
                  <TopicMeta>→</TopicMeta>
                </TopicRow>
              </div>
            </RailCard>
          ) : (
            <>
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
                          <MandAvatar $bg={avatarColor(pol.name)}>
                            {initials(pol.name)}
                          </MandAvatar>
                          <MandContent>
                            <MandName>{pol.name}</MandName>
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
            </>
          )}
        </Rail>
      </Main>

      {advocateTarget && (
        <AdvocateConfirmModal
          isOpen={!!advocateTarget}
          reportId={advocateTarget.report.id}
          reportTitle={advocateTarget.report.title}
          actorType={advocateTarget.actorType}
          actorId={advocateTarget.actorId}
          onClose={() => setAdvocateTarget(null)}
          onSuccess={(res) => {
            if (res.postId) {
              switchFeedTab('publicacoes')
            }
          }}
        />
      )}
    </Page>
  )
}

