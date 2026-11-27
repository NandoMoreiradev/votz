import { useState, type FormEvent } from 'react'
import styled, { keyframes } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import {
  Broadcast,
  ChatCircle,
  CheckCircle,
  Fire,
  Heart,
  Lightning,
  MagnifyingGlass,
  Scales,
  TrendUp,
  X,
} from '@phosphor-icons/react'
import type { Category, CivicTopicSummaryDto, FeedSuggestedProfile, FeedSuggestions, PostDto } from '@votz/shared-types'
import { useIsFollowingTarget, useToggleFollowTarget, type FollowTargetType } from '../../hooks/useFollow'
import { useDebates } from '../../hooks/useDebates'
import { usePropostas } from '../../hooks/usePropostas'
import { usePostsFeed, useWhoToFollow } from '../../hooks/usePosts'
import { SponsoredSlot } from '../ads/SponsoredSlot'
import { FeedPollCard } from './FeedPollCard'
import { useAuthStore } from '../../store/auth.store'
import type { Politician, Report } from '../../types/api'

const CATEGORY_LABELS: Record<Category, string> = {
  HEALTH: 'Saúde',
  MOBILITY: 'Mobilidade',
  SAFETY: 'Segurança',
  EDUCATION: 'Educação',
  SANITATION: 'Saneamento',
  HOUSING: 'Habitação',
  ENVIRONMENT: 'Meio Ambiente',
  INFRASTRUCTURE: 'Infraestrutura',
  URBAN_SERVICES: 'Serviços Urbanos',
  CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade',
  SOCIAL_WELFARE: 'Assistência Social',
  OTHER: 'Outra',
}

const AVATAR_COLORS = ['#4a5568', '#553c9a', '#285e61', '#744210', '#742a2a', '#2c4a2d']

function avatarColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function formatDebateDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface ActiveSurtoSummary {
  id: string
  city: string
  state?: string | null
  category: string
  count: number
}

interface FeedRightSidebarProps {
  trendingTopics?: CivicTopicSummaryDto[]
  topReports: Report[]
  politicians: Politician[]
  suggestions?: FeedSuggestions | null
  activeSurto?: ActiveSurtoSummary | null
  city?: string
  uf?: string
  onSwitchToRelatos: () => void
}

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const SearchForm = styled.form`
  position: relative;
  display: flex;
  align-items: center;
`

const SearchIcon = styled(MagnifyingGlass)`
  position: absolute;
  left: 14px;
  color: ${({ theme }) => theme.colors.muted};
  pointer-events: none;
`

const SearchInput = styled.input`
  width: 100%;
  height: 44px;
  padding: 0 38px 0 42px;
  border-radius: 9999px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 14px;
  transition: border-color 0.15s, box-shadow 0.15s;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.action};
    box-shadow: 0 0 0 2px ${({ theme }) => `${theme.colors.action}22`};
  }
`

const SearchClear = styled.button`
  position: absolute;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: ${({ theme }) => theme.colors.surfaceHover};
  color: ${({ theme }) => theme.colors.muted};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
  }
`

const SurtoCard = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 16px;
  background: #12131d;
  border: 1px solid rgba(230, 57, 70, 0.35);
  color: #ffffff;
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s, transform 0.12s;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 0% 0%, rgba(230, 57, 70, 0.28), transparent 60%);
    pointer-events: none;
  }

  > * {
    position: relative;
  }

  &:hover {
    border-color: #e63946;
  }
`

const SurtoBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  padding: 3px 8px;
  border-radius: 9999px;
  background: #e63946;
  color: #ffffff;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`

const SurtoTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.3;
`

const SurtoMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const CardTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
  padding: 14px 16px 6px;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
`

const TrendRow = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 16px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const TrendEyebrow = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  display: inline-flex;
  align-items: center;
  gap: 5px;
`

const LivePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  font-weight: 700;
  color: #e63946;
  text-transform: uppercase;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #e63946;
    animation: ${pulse} 1.6s infinite;
  }
`

const TrendTitle = styled.span`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.3;
  color: ${({ theme }) => theme.colors.text};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`

const TrendMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;
`

const VoteBar = styled.div`
  height: 4px;
  border-radius: 9999px;
  background: ${({ theme }) => theme.colors.border};
  overflow: hidden;
  margin-top: 4px;
`

const VoteFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  background: ${({ theme }) => theme.colors.positive};
  border-radius: 9999px;
`

const EmptyHint = styled.div`
  padding: 8px 16px 14px;
  font-size: 13px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.muted};

  a {
    color: ${({ theme }) => theme.colors.action};
    font-weight: 600;
    &:hover {
      text-decoration: underline;
    }
  }
`

const ShowMoreLink = styled(Link)`
  display: block;
  padding: 12px 16px;
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.action};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const ShowMoreBtn = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 12px 16px;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 13.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.action};
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const FollowRowWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const FollowAvatar = styled(Link)<{ $src?: string | null; $bg: string }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $src, $bg }) => ($src ? `url(${$src}) center / cover` : $bg)};
  color: #ffffff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 13px;
  font-weight: 700;
`

const FollowInfo = styled(Link)`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    min-width: 0;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    svg {
      flex-shrink: 0;
    }
  }

  small {
    font-size: 12.5px;
    color: ${({ theme }) => theme.colors.muted};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover strong span {
    text-decoration: underline;
  }
`

const FollowBtn = styled.button<{ $following: boolean }>`
  flex-shrink: 0;
  height: 32px;
  padding: 0 14px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s;
  border: 1px solid ${({ $following, theme }) => ($following ? theme.colors.borderStrong : theme.colors.text)};
  background: ${({ $following, theme }) => ($following ? 'transparent' : theme.colors.text)};
  color: ${({ $following, theme }) => ($following ? theme.colors.text : theme.colors.white)};

  &:hover {
    opacity: 0.88;
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`

/** O anúncio traz o próprio cartão; aqui só o enquadramos como os outros cards da lateral. */
const AdBox = styled.div`
  article {
    border: 1px solid ${({ theme }) => theme.colors.border};
    border-radius: 16px;
  }
`

const HotPostRow = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 16px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const HotPostAuthor = styled.span`
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};

  span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const HotPostAvatar = styled.span<{ $src?: string | null }>`
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center / cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 10px;
  font-weight: 700;
`

const HotPostText = styled.span`
  font-size: 13.5px;
  line-height: 1.4;
  color: ${({ theme }) => theme.colors.text};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
`

const HotPostMeta = styled.span`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.muted};
  font-variant-numeric: tabular-nums;

  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
`

function hotPostExcerpt(post: PostDto): string {
  const text = post.content.replace(/\s+/g, ' ').trim()
  if (text) return text.length > 140 ? `${text.slice(0, 137)}...` : text
  if (post.poll) return post.poll.question?.trim() || 'Enquete aberta para votação'
  if (post.mediaItems.length > 0 || post.media.length > 0) return 'Publicação com foto ou vídeo'
  return 'Ver publicação'
}

const RailFooter = styled.footer`
  padding: 2px 12px 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};

  a {
    color: ${({ theme }) => theme.colors.muted};
    &:hover {
      text-decoration: underline;
      color: ${({ theme }) => theme.colors.text};
    }
  }
`

interface FollowableItem {
  id: string
  targetType: FollowTargetType
  href: string
  name: string
  subtitle: string
  avatarUrl: string | null
  verified: boolean
  /** "Seguido por Maria e mais 4": quem do círculo da pessoa já segue. */
  circleNote?: string
}

function WhoToFollowRow({ item }: { item: FollowableItem }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { data } = useIsFollowingTarget(item.targetType, item.id)
  const toggle = useToggleFollowTarget(item.targetType, item.id)
  const following = !!data?.following

  return (
    <FollowRowWrap>
      <FollowAvatar
        to={item.href}
        $src={item.avatarUrl}
        $bg={avatarColor(item.name)}
        aria-label={`Ver perfil de ${item.name}`}
      >
        {!item.avatarUrl && getInitials(item.name)}
      </FollowAvatar>

      <FollowInfo to={item.href}>
        <strong>
          <span>{item.name}</span>
          {item.verified && <CheckCircle size={14} weight="fill" color="#2DC653" />}
        </strong>
        <small>{item.circleNote ?? item.subtitle}</small>
      </FollowInfo>

      <FollowBtn
        type="button"
        $following={following}
        disabled={toggle.isPending}
        onClick={() => {
          if (!user) {
            navigate('/entrar')
            return
          }
          toggle.mutate()
        }}
      >
        {following ? 'Seguindo' : 'Seguir'}
      </FollowBtn>
    </FollowRowWrap>
  )
}

function formatTopicMeta(t: CivicTopicSummaryDto): string {
  const parts: string[] = []
  if (t.postsCount > 0) parts.push(`${t.postsCount} ${t.postsCount === 1 ? 'publicação' : 'publicações'}`)
  if (t.reportsCount > 0) parts.push(`${t.reportsCount} ${t.reportsCount === 1 ? 'relato' : 'relatos'}`)
  if (t.debatesCount > 0) parts.push(`${t.debatesCount} ${t.debatesCount === 1 ? 'debate' : 'debates'}`)
  return parts.length > 0 ? parts.join(' · ') : 'Pauta em destaque'
}

function circleNote(p: FeedSuggestedProfile): string | undefined {
  const by = p.followedBy
  if (!by || by.total === 0 || by.names.length === 0) return undefined
  const first = by.names[0].split(' ')[0]
  if (by.total === 1) return `Seguido por ${first}`
  if (by.names.length >= 2 && by.total === 2) return `Seguido por ${first} e ${by.names[1].split(' ')[0]}`
  return `Seguido por ${first} e mais ${by.total - 1}`
}

function buildFollowItems(
  suggestions: FeedSuggestions | null | undefined,
  politicians: Politician[],
): FollowableItem[] {
  if (suggestions && suggestions.profiles.length > 0) {
    return suggestions.profiles.slice(0, 4).map((p: FeedSuggestedProfile) => ({
      id: p.id,
      targetType: p.kind === 'politicians' ? 'POLITICIAN' : 'ENTITY',
      href: p.kind === 'politicians' ? `/politico/${p.id}` : `/entidade/${p.id}`,
      name: p.name,
      subtitle: [p.username ? `@${p.username}` : null, p.subtitle].filter(Boolean).join(' · '),
      avatarUrl: p.avatarUrl,
      verified: p.verified,
      circleNote: circleNote(p),
    }))
  }

  return politicians.slice(0, 3).map((pol) => ({
    id: pol.id,
    targetType: 'POLITICIAN' as const,
    href: `/politico/${pol.id}`,
    name: pol.name,
    subtitle: [pol.party?.abbreviation, pol.office, pol.city ?? pol.state].filter(Boolean).join(' · '),
    avatarUrl: pol.avatarUrl,
    verified: pol.verified,
  }))
}

export function FeedRightSidebar({
  trendingTopics,
  topReports,
  politicians,
  suggestions,
  activeSurto,
  city,
  uf,
  onSwitchToRelatos,
}: FeedRightSidebarProps) {
  const navigate = useNavigate()
  const viewer = useAuthStore((s) => s.user)
  const [query, setQuery] = useState('')
  const { data: debatesData } = useDebates({ upcoming: true })
  const { data: propostasData } = usePropostas({ limit: 2 })

  const hasTopics = !!trendingTopics && trendingTopics.length > 0
  const hasRegion = !!(city || uf)
  // Publicações em alta: primeiro da região escolhida; se a região não tiver nenhuma, as do Brasil.
  const { data: regionalHot, isFetched: regionalFetched } = usePostsFeed({
    sort: 'trending',
    city,
    state: uf,
    limit: 3,
    enabled: hasRegion,
  })
  const regionalEmpty = hasRegion && regionalFetched && (regionalHot?.data.length ?? 0) === 0
  const { data: nationalHot } = usePostsFeed({
    sort: 'trending',
    limit: 3,
    enabled: !hasRegion || regionalEmpty,
  })
  const hotPosts = ((hasRegion && !regionalEmpty ? regionalHot : nationalHot)?.data ?? []).slice(0, 3)
  const hotLabel = hasRegion && !regionalEmpty ? city || uf : 'Brasil'
  const regionLabel = city || uf || 'Brasil'
  const { data: whoToFollow } = useWhoToFollow()
  const followItems = buildFollowItems(
    whoToFollow && whoToFollow.length > 0 ? { title: '', profiles: whoToFollow } : suggestions,
    politicians,
  )
  const featuredDebates = (debatesData?.data ?? []).slice(0, 2)
  const featuredPropostas = (propostasData?.data ?? []).slice(0, 2)

  function handleSearch(e: FormEvent) {
    e.preventDefault()
    const trimmed = query.trim()
    navigate(trimmed ? `/buscar?q=${encodeURIComponent(trimmed)}` : '/buscar')
  }

  return (
    <Wrap>
      <SearchForm role="search" onSubmit={handleSearch}>
        <SearchIcon size={17} weight="bold" aria-hidden="true" />
        <SearchInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no Votz"
          aria-label="Buscar no Votz"
          maxLength={120}
        />
        {query && (
          <SearchClear type="button" aria-label="Limpar busca" onClick={() => setQuery('')}>
            <X size={13} weight="bold" />
          </SearchClear>
        )}
      </SearchForm>

      {/* Alerta de surto ativo (quando existir) */}
      {activeSurto && (
        <SurtoCard
          to={`/?tab=relatos&categoria=${activeSurto.category}&cidade=${encodeURIComponent(activeSurto.city)}`}
        >
          <SurtoBadge>
            <Lightning size={11} weight="fill" /> Surto ativo
          </SurtoBadge>
          <SurtoTitle>
            {activeSurto.count} relatos de{' '}
            {CATEGORY_LABELS[activeSurto.category as Category] ?? activeSurto.category}
          </SurtoTitle>
          <SurtoMeta>
            {activeSurto.city}
            {activeSurto.state ? ` · ${activeSurto.state}` : ''} · últimas 24h
          </SurtoMeta>
        </SurtoCard>
      )}

      {/* O que está acontecendo (Pautas em alta ou Relatos sob pressão) */}
      <Card aria-label="O que está acontecendo">
        <CardTitle>
          <Fire size={18} weight="fill" color="#E63946" />
          O que está acontecendo
        </CardTitle>

        {hasTopics ? (
          <>
            {trendingTopics!.slice(0, 5).map((t, index) => (
              <TrendRow key={t.id} to={`/pautas/${t.slug}`}>
                <TrendEyebrow>{index + 1} · Pauta em alta · {regionLabel}</TrendEyebrow>
                <TrendTitle>{t.displayTag}</TrendTitle>
                <TrendMeta>{formatTopicMeta(t)}</TrendMeta>
              </TrendRow>
            ))}
            <ShowMoreLink to="/buscar">Mostrar mais</ShowMoreLink>
          </>
        ) : topReports.length > 0 ? (
          <>
            {topReports.slice(0, 4).map((r) => (
              <TrendRow key={r.id} to={`/relatos/${r.id}`}>
                <TrendEyebrow>
                  {CATEGORY_LABELS[r.category]} · Pressão {r.pressureScore.toFixed(1)}
                </TrendEyebrow>
                <TrendTitle>{r.title}</TrendTitle>
                <TrendMeta>
                  {[r.city, r.state].filter(Boolean).join('/') || 'Brasil'} ·{' '}
                  {r._count.votes} {r._count.votes === 1 ? 'apoio' : 'apoios'}
                </TrendMeta>
              </TrendRow>
            ))}
            <ShowMoreBtn type="button" onClick={onSwitchToRelatos}>
              Ver todos os relatos
            </ShowMoreBtn>
          </>
        ) : (
          <EmptyHint>
            Nenhuma pauta em alta ainda. Use <b>#Pauta</b> nas suas publicações ou{' '}
            <Link to="/novo">registre um relato</Link> para mobilizar sua cidade.
          </EmptyHint>
        )}
      </Card>

      {/* Debates ao vivo / próximos (conteúdo vivo, não link estático) */}
      {featuredDebates.length > 0 && (
        <Card aria-label="Debates em destaque">
          <CardTitle>
            <Broadcast size={18} weight="fill" color="#E63946" />
            Debates
          </CardTitle>
          {featuredDebates.map((debate) => {
            const isLive = debate.status === 'LIVE'
            return (
              <TrendRow key={debate.id} to={`/debates/${debate.id}`}>
                <TrendEyebrow>
                  {isLive ? <LivePill>Ao vivo</LivePill> : formatDebateDate(debate.scheduledFor)}
                </TrendEyebrow>
                <TrendTitle>{debate.title}</TrendTitle>
                <TrendMeta>
                  {isLive && debate.viewerCount > 0
                    ? `${debate.viewerCount} assistindo`
                    : debate.creator?.name ?? 'Debate público'}
                </TrendMeta>
              </TrendRow>
            )
          })}
          <ShowMoreLink to="/debates">Ver agenda de debates</ShowMoreLink>
        </Card>
      )}

      {/* Propostas em votação (mostra quando não há debates ativos para manter a coluna equilibrada) */}
      {featuredDebates.length === 0 && featuredPropostas.length > 0 && (
        <Card aria-label="Propostas em votação">
          <CardTitle>
            <Scales size={18} weight="fill" color="#2563EB" />
            Propostas em pauta
          </CardTitle>
          {featuredPropostas.map((prop) => {
            const total = prop.totalApoios + prop.totalRejeicoes
            const pct = total > 0 ? Math.round((prop.totalApoios / total) * 100) : 0
            return (
              <TrendRow key={prop.id} to={`/propostas/${prop.id}`}>
                <TrendEyebrow>
                  {prop.politico
                    ? `${prop.politico.name} (${prop.politico.party.abbreviation})`
                    : 'Proposta legislativa'}
                </TrendEyebrow>
                <TrendTitle>{prop.titulo}</TrendTitle>
                <TrendMeta>
                  {total > 0 ? `${pct}% de apoio · ${total} votos` : 'Seja o primeiro a opinar'}
                </TrendMeta>
                {total > 0 && (
                  <VoteBar>
                    <VoteFill $pct={pct} />
                  </VoteBar>
                )}
              </TrendRow>
            )
          })}
          <ShowMoreLink to="/propostas">Ver propostas</ShowMoreLink>
        </Card>
      )}

      {/* Quem acompanhar (Who to follow) */}
      {followItems.length > 0 && (
        <Card aria-label="Quem acompanhar">
          <CardTitle>Quem acompanhar</CardTitle>
          {followItems.map((item) => (
            <WhoToFollowRow key={`${item.targetType}-${item.id}`} item={item} />
          ))}
          <ShowMoreLink to="/politicos">Mostrar mais</ShowMoreLink>
        </Card>
      )}

      {/* Publicações em alta: as mais curtidas e comentadas do momento */}
      {hotPosts.length > 0 && (
        <Card aria-label="Publicações em alta">
          <CardTitle>
            <TrendUp size={18} weight="bold" />
            Publicações em alta
          </CardTitle>
          {hotPosts.map((post) => {
            const authorName = post.author.orgName ?? post.author.name
            const authorAvatar = post.author.orgType ? post.author.orgAvatarUrl : post.author.avatarUrl
            return (
              <HotPostRow key={post.id} to={`/publicacoes/${post.id}`}>
                <HotPostAuthor>
                  <HotPostAvatar $src={authorAvatar} aria-hidden="true">
                    {!authorAvatar && authorName.trim().charAt(0).toUpperCase()}
                  </HotPostAvatar>
                  <span>{authorName}</span>
                </HotPostAuthor>
                <HotPostText>{hotPostExcerpt(post)}</HotPostText>
                <HotPostMeta>
                  <span>
                    <Heart size={13} weight="fill" aria-hidden="true" />
                    {post.likesCount.toLocaleString('pt-BR')}
                  </span>
                  <span>
                    <ChatCircle size={13} weight="fill" aria-hidden="true" />
                    {post.commentsCount.toLocaleString('pt-BR')}
                  </span>
                  <span>{hotLabel}</span>
                </HotPostMeta>
              </HotPostRow>
            )
          })}
        </Card>
      )}

      {/* Enquete em alta: vota direto na lateral */}
      <FeedPollCard city={city} uf={uf} />

      {/* Anúncio patrocinado (só para quem entrou, como no feed) */}
      {viewer && (
        <AdBox>
          <SponsoredSlot surface="FEED_SIDEBAR" position={0} state={uf} city={city} />
        </AdBox>
      )}

      {/* Rodapé compacto estilo X */}
      <RailFooter aria-label="Links institucionais">
        <Link to="/sobre">Sobre</Link>
        <Link to="/termos">Termos</Link>
        <Link to="/privacidade">Privacidade</Link>
        <Link to="/diretrizes">Diretrizes</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/sugestoes">Sugestões</Link>
        <span>© {new Date().getFullYear()} Votz</span>
      </RailFooter>
    </Wrap>
  )
}
