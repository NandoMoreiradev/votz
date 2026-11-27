import { useState } from 'react'
import styled, { css } from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  CaretDown,
  CaretUp,
  FunnelSimple,
  Hash,
  House,
  Megaphone,
  PencilSimpleLine,
  User,
} from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { useUnreadCount } from '../../hooks/useNotifications'
import { useFollowedTopics } from '../../hooks/useTopics'
import { useMySocialSummary } from '../../hooks/useUser'
import { StateSelect, CitySelect } from '../ui/LocationSelect'

export type PostAuthorFilter = 'CITIZEN' | 'POLITICIAN' | 'ENTITY' | undefined
export type PostKindFilter = 'all' | 'advocacy' | 'polls'

interface FeedLeftSidebarProps {
  reportsTotal?: number
  postAuthorType: PostAuthorFilter
  onChangeAuthorType: (value: PostAuthorFilter) => void
  postFilterKind: PostKindFilter
  onChangeFilterKind: (value: PostKindFilter) => void
  uf: string
  city: string
  onChangeUf: (uf: string) => void
  onChangeCity: (city: string) => void
  onSwitchToRelatos: () => void
  onCompose: () => void
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const AccountAvatar = styled.div<{ $src?: string | null; $org?: boolean }>`
  width: 38px;
  height: 38px;
  border-radius: ${({ $org }) => ($org ? '10px' : '50%')};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center / cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 14px;
`

const AccountInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    font-size: 13.5px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const ProfileCard = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const ProfileHead = styled(Link)`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const StatItem = styled(Link)`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 4px 2px;
  border-radius: 10px;
  transition: background 0.15s;

  strong {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 15px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
  }

  span {
    font-size: 11.5px;
    color: ${({ theme }) => theme.colors.muted};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const UnreadBadge = styled.span`
  margin-left: auto;
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 9999px;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  font-weight: 700;
  text-align: center;
`

const TopicsCard = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const TopicsTitle = styled.h3`
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 12px 14px 6px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

const TopicLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const TopicInfo = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    font-size: 13.5px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const NewDot = styled.span`
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
`

const NavStack = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const navItemCss = css<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 9999px;
  border: none;
  background: ${({ $active, theme }) => ($active ? theme.colors.surfaceHover : 'transparent')};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 15.5px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;

  svg {
    flex-shrink: 0;
    color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  }

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const NavBtn = styled.button<{ $active?: boolean }>`
  ${navItemCss}
`

const NavLinkItem = styled(Link)<{ $active?: boolean }>`
  ${navItemCss}
`

const NavCount = styled.span`
  margin-left: auto;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  padding: 2px 7px;
  border-radius: 9999px;
`

const ComposeBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 44px;
  border-radius: 9999px;
  border: none;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, transform 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.actionHover};
  }

  &:active {
    transform: scale(0.99);
  }
`

const FilterCard = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const FilterToggle = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 14px;
  font-weight: 700;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const FilterTitleGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
`

const ActiveBadge = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 9999px;
  background: ${({ theme }) => `${theme.colors.action}1A`};
  color: ${({ theme }) => theme.colors.action};
`

const FilterBody = styled.div`
  padding: 4px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const FilterSection = styled.div`
  padding-top: 12px;
  &:not(:first-child) {
    padding-top: 0;
  }
`

const SectionLabel = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const ClearLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 11.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.action};
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`

const AuthorGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
`

const AuthorChip = styled.button<{ $active?: boolean }>`
  height: 32px;
  padding: 0 10px;
  border-radius: 9999px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.text : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: 12.5px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    border-color: ${({ theme }) => theme.colors.text};
  }
`

const RadioList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`

const RadioOpt = styled.label<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ $active, theme }) => ($active ? theme.colors.surfaceHover : 'transparent')};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }

  input {
    accent-color: ${({ theme }) => theme.colors.action};
    margin: 0;
  }
`

const LocationStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const selectCss = css`
  width: 100%;
  padding: 7px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.neutral};
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.borderStrong};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const StyledStateSelect = styled(StateSelect)`${selectCss}`
const StyledCitySelect = styled(CitySelect)`${selectCss}`

const ResetAllBtn = styled.button`
  width: 100%;
  height: 32px;
  border-radius: 9999px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
    color: ${({ theme }) => theme.colors.text};
  }
`

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

const compactNumber = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
const DAY_MS = 24 * 60 * 60 * 1000

export function FeedLeftSidebar({
  reportsTotal,
  postAuthorType,
  onChangeAuthorType,
  postFilterKind,
  onChangeFilterKind,
  uf,
  city,
  onChangeUf,
  onChangeCity,
  onSwitchToRelatos,
  onCompose,
}: FeedLeftSidebarProps) {
  const navigate = useNavigate()
  const { user, activeContext } = useAuthStore()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const { data: summary } = useMySocialSummary()
  const { data: unread } = useUnreadCount()
  const { data: myTopics } = useFollowedTopics(5)

  const activeFiltersCount =
    (postAuthorType ? 1 : 0) +
    (postFilterKind !== 'all' ? 1 : 0) +
    (uf || city ? 1 : 0)

  const displayName = activeContext?.name ?? user?.name ?? ''
  const displayAvatar = activeContext ? null : user?.avatarUrl ?? null
  const displaySubtitle = activeContext
    ? 'Perfil organizacional ativo'
    : 'Meu perfil cidadão'

  function clearAllFilters() {
    onChangeAuthorType(undefined)
    onChangeFilterKind('all')
    onChangeUf('')
    onChangeCity('')
  }

  return (
    <Wrap>
      {user && (
        <ProfileCard aria-label="Seu perfil">
          <ProfileHead to="/meu-perfil">
            <AccountAvatar $src={displayAvatar} $org={!!activeContext}>
              {!displayAvatar && getInitials(displayName || 'V')}
            </AccountAvatar>
            <AccountInfo>
              <strong>{displayName}</strong>
              <span>{displaySubtitle}</span>
            </AccountInfo>
          </ProfileHead>
          {!activeContext && summary && (
            <StatsRow>
              <StatItem to="/meu-perfil" aria-label={`${summary.postsCount} publicações`}>
                <strong>{compactNumber.format(summary.postsCount)}</strong>
                <span>Publicações</span>
              </StatItem>
              <StatItem to="/meu-perfil" aria-label={`${summary.followersCount} seguidores`}>
                <strong>{compactNumber.format(summary.followersCount)}</strong>
                <span>Seguidores</span>
              </StatItem>
              <StatItem to="/meu-perfil" aria-label={`${summary.followingCount} seguindo`}>
                <strong>{compactNumber.format(summary.followingCount)}</strong>
                <span>Seguindo</span>
              </StatItem>
            </StatsRow>
          )}
        </ProfileCard>
      )}

      <NavStack aria-label="Navegação rápida do feed">
        <NavBtn
          type="button"
          $active
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <House size={22} weight="fill" />
          <span>Publicações</span>
        </NavBtn>

        <NavBtn type="button" onClick={onSwitchToRelatos}>
          <Megaphone size={22} weight="regular" />
          <span>Relatos</span>
          {typeof reportsTotal === 'number' && reportsTotal > 0 && (
            <NavCount>{reportsTotal.toLocaleString('pt-BR')}</NavCount>
          )}
        </NavBtn>

        {user && (
          <>
            <NavLinkItem to="/notificacoes">
              <Bell size={22} weight="regular" />
              <span>Notificações</span>
              {!!unread && unread > 0 && (
                <UnreadBadge aria-label={`${unread} não lidas`}>{unread > 99 ? '99+' : unread}</UnreadBadge>
              )}
            </NavLinkItem>
            <NavLinkItem to="/meu-perfil">
              <User size={22} weight="regular" />
              <span>Perfil</span>
            </NavLinkItem>
          </>
        )}
      </NavStack>

      <ComposeBtn
        type="button"
        onClick={() => {
          if (!user) {
            navigate('/entrar')
            return
          }
          onCompose()
        }}
      >
        <PencilSimpleLine size={18} weight="bold" />
        Publicar
      </ComposeBtn>

      {user && myTopics && myTopics.length > 0 && (
        <TopicsCard aria-label="Meus assuntos">
          <TopicsTitle>
            <Hash size={16} weight="bold" />
            Meus assuntos
          </TopicsTitle>
          {myTopics.map((t) => {
            const hasNews = Date.now() - new Date(t.lastActivityAt).getTime() < DAY_MS
            return (
              <TopicLink key={t.id} to={`/pautas/${t.slug}`}>
                <TopicInfo>
                  <strong>{t.displayTag}</strong>
                  <span>
                    {t.postsCount.toLocaleString('pt-BR')} {t.postsCount === 1 ? 'publicação' : 'publicações'}
                  </span>
                </TopicInfo>
                {hasNews && <NewDot role="img" aria-label="Novidade nas últimas 24 horas" />}
              </TopicLink>
            )
          })}
        </TopicsCard>
      )}

      <FilterCard aria-label="Filtros de publicações">
        <FilterToggle
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <FilterTitleGroup>
            <FunnelSimple size={16} weight="bold" />
            <span>Filtros</span>
            {activeFiltersCount > 0 && (
              <ActiveBadge>{activeFiltersCount}</ActiveBadge>
            )}
          </FilterTitleGroup>
          {filtersOpen ? <CaretUp size={15} /> : <CaretDown size={15} />}
        </FilterToggle>

        {filtersOpen && (
          <FilterBody>
            <FilterSection>
              <SectionLabel>
                <span>Autor</span>
                {postAuthorType && (
                  <ClearLink type="button" onClick={() => onChangeAuthorType(undefined)}>
                    Limpar
                  </ClearLink>
                )}
              </SectionLabel>
              <AuthorGrid>
                <AuthorChip
                  type="button"
                  $active={!postAuthorType}
                  onClick={() => onChangeAuthorType(undefined)}
                >
                  Todos
                </AuthorChip>
                <AuthorChip
                  type="button"
                  $active={postAuthorType === 'CITIZEN'}
                  onClick={() => onChangeAuthorType('CITIZEN')}
                >
                  Cidadãos
                </AuthorChip>
                <AuthorChip
                  type="button"
                  $active={postAuthorType === 'POLITICIAN'}
                  onClick={() => onChangeAuthorType('POLITICIAN')}
                >
                  Políticos
                </AuthorChip>
                <AuthorChip
                  type="button"
                  $active={postAuthorType === 'ENTITY'}
                  onClick={() => onChangeAuthorType('ENTITY')}
                >
                  Entidades
                </AuthorChip>
              </AuthorGrid>
            </FilterSection>

            <FilterSection>
              <SectionLabel><span>Conteúdo</span></SectionLabel>
              <RadioList>
                <RadioOpt $active={postFilterKind === 'all'}>
                  <input
                    type="radio"
                    name="postFilterKind"
                    checked={postFilterKind === 'all'}
                    onChange={() => onChangeFilterKind('all')}
                  />
                  <span>Tudo</span>
                </RadioOpt>
                <RadioOpt $active={postFilterKind === 'advocacy'}>
                  <input
                    type="radio"
                    name="postFilterKind"
                    checked={postFilterKind === 'advocacy'}
                    onChange={() => onChangeFilterKind('advocacy')}
                  />
                  <span>Avocações oficiais</span>
                </RadioOpt>
                <RadioOpt $active={postFilterKind === 'polls'}>
                  <input
                    type="radio"
                    name="postFilterKind"
                    checked={postFilterKind === 'polls'}
                    onChange={() => onChangeFilterKind('polls')}
                  />
                  <span>Com enquetes</span>
                </RadioOpt>
              </RadioList>
            </FilterSection>

            <FilterSection>
              <SectionLabel>
                <span>Localização</span>
                {(city || uf) && (
                  <ClearLink
                    type="button"
                    onClick={() => {
                      onChangeCity('')
                      onChangeUf('')
                    }}
                  >
                    Limpar
                  </ClearLink>
                )}
              </SectionLabel>
              <LocationStack>
                <StyledStateSelect
                  value={uf}
                  onChange={(v) => {
                    onChangeUf(v)
                    onChangeCity('')
                  }}
                  placeholder="Todos os estados"
                />
                <StyledCitySelect
                  uf={uf}
                  value={city}
                  onChange={onChangeCity}
                  placeholder="Todas as cidades"
                />
              </LocationStack>
            </FilterSection>

            {activeFiltersCount > 0 && (
              <ResetAllBtn type="button" onClick={clearAllFilters}>
                Limpar todos os filtros
              </ResetAllBtn>
            )}
          </FilterBody>
        )}
      </FilterCard>
    </Wrap>
  )
}
