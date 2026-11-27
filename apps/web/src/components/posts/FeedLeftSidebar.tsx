import { useState } from 'react'
import styled, { css } from 'styled-components'
import { Link } from 'react-router-dom'
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  FunnelSimple,
  Megaphone,
  Newspaper,
  PencilSimpleLine,
} from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'
import { useUser } from '../../hooks/useUser'
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

const ProfileCard = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  overflow: hidden;
`

const ProfileBanner = styled.div<{ $cover?: string | null }>`
  height: 44px;
  background: ${({ $cover, theme }) =>
    $cover
      ? `url("${encodeURI($cover)}") center / cover no-repeat`
      : `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.action}55 100%)`};
`

const ProfileBody = styled.div`
  padding: 0 14px 14px;
`

const ProfileTop = styled(Link)`
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: -20px;
  margin-bottom: 10px;

  &:hover strong {
    text-decoration: underline;
  }
`

const ProfileAvatar = styled.div<{ $src?: string | null; $org?: boolean }>`
  width: 46px;
  height: 46px;
  border-radius: ${({ $org }) => ($org ? '12px' : '50%')};
  border: 3px solid ${({ theme }) => theme.colors.white};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center / cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.onAccent};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: 700;
  font-size: 16px;
`

const ProfileNameWrap = styled.div`
  flex: 1;
  min-width: 0;
  padding-top: 22px;

  strong {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 14px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    max-width: 100%;

    span {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    svg {
      flex-shrink: 0;
    }
  }

  small {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding-top: 10px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const StatItem = styled(Link)`
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }

  strong {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 14px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 11px;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const GuestCard = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 16px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  h3 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: 16px;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
    margin: 0;
  }

  p {
    font-size: 13px;
    line-height: 1.45;
    color: ${({ theme }) => theme.colors.muted};
    margin: 0;
  }
`

const GuestActions = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 4px;
`

const GuestPrimary = styled(Link)`
  flex: 1;
  height: 36px;
  border-radius: 9999px;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.actionHover};
  }
`

const GuestSecondary = styled(Link)`
  flex: 1;
  height: 36px;
  border-radius: 9999px;
  border: 1px solid ${({ theme }) => theme.colors.borderStrong};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const FeedSwitcher = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const SwitchBtn = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  border-radius: 10px;
  border: none;
  background: ${({ $active, theme }) => ($active ? theme.colors.surfaceHover : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.text : theme.colors.muted)};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const SwitchCount = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10.5px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
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
  const { user, activeContext } = useAuthStore()
  const { data: profile } = useUser(user?.id ?? '')
  const [filtersOpen, setFiltersOpen] = useState(true)

  const activeFiltersCount =
    (postAuthorType ? 1 : 0) +
    (postFilterKind !== 'all' ? 1 : 0) +
    (uf || city ? 1 : 0)

  const displayName = activeContext?.name ?? user?.name ?? ''
  const displayAvatar = activeContext ? null : user?.avatarUrl ?? null
  const displayHandle = activeContext
    ? 'Perfil organizacional ativo'
    : profile?.username
      ? `@${profile.username}`
      : 'Perfil cidadão'

  function clearAllFilters() {
    onChangeAuthorType(undefined)
    onChangeFilterKind('all')
    onChangeUf('')
    onChangeCity('')
  }

  return (
    <Wrap>
      {user ? (
        <ProfileCard aria-label="Resumo do seu perfil">
          <ProfileBanner $cover={activeContext ? null : profile?.coverUrl} />
          <ProfileBody>
            <ProfileTop to="/meu-perfil">
              <ProfileAvatar $src={displayAvatar} $org={!!activeContext}>
                {!displayAvatar && getInitials(displayName || 'V')}
              </ProfileAvatar>
              <ProfileNameWrap>
                <strong>
                  <span>{displayName}</span>
                  {!activeContext && user.verified && (
                    <CheckCircle size={14} weight="fill" color="#2DC653" />
                  )}
                </strong>
                <small>{displayHandle}</small>
              </ProfileNameWrap>
            </ProfileTop>

            {!activeContext && profile && (
              <StatsGrid>
                <StatItem to="/meu-perfil">
                  <strong>{profile.followersCount ?? 0}</strong>
                  <span>Seguidores</span>
                </StatItem>
                <StatItem to="/meu-perfil">
                  <strong>{profile._count.reports}</strong>
                  <span>Relatos</span>
                </StatItem>
                <StatItem to="/meu-perfil">
                  <strong>{profile._count.votes}</strong>
                  <span>Apoios</span>
                </StatItem>
              </StatsGrid>
            )}
          </ProfileBody>
        </ProfileCard>
      ) : (
        <GuestCard aria-label="Participe do Votz">
          <h3>Participe do debate público</h3>
          <p>
            Publique cobranças, acompanhe políticos da sua cidade e apoie relatos que fazem diferença.
          </p>
          <GuestActions>
            <GuestPrimary to="/cadastro">Criar conta</GuestPrimary>
            <GuestSecondary to="/entrar">Entrar</GuestSecondary>
          </GuestActions>
        </GuestCard>
      )}

      {user && (
        <ComposeBtn type="button" onClick={onCompose}>
          <PencilSimpleLine size={18} weight="bold" />
          Publicar
        </ComposeBtn>
      )}

      {/* Alternador rápido entre as duas visões da Home (sem repetir itens da Navbar) */}
      <FeedSwitcher role="tablist" aria-label="Alternar feed">
        <SwitchBtn
          type="button"
          role="tab"
          aria-selected
          $active
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <Newspaper size={15} weight="fill" />
          Publicações
        </SwitchBtn>
        <SwitchBtn
          type="button"
          role="tab"
          aria-selected={false}
          onClick={onSwitchToRelatos}
        >
          <Megaphone size={15} weight="regular" />
          Relatos
          {typeof reportsTotal === 'number' && reportsTotal > 0 && (
            <SwitchCount>{reportsTotal}</SwitchCount>
          )}
        </SwitchBtn>
      </FeedSwitcher>

      <FilterCard aria-label="Filtros do feed">
        <FilterToggle
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <FilterTitleGroup>
            <FunnelSimple size={16} weight="bold" />
            <span>Filtros do feed</span>
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
