import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { CheckCircle } from '@phosphor-icons/react'
import type { FeedSuggestedProfile, FeedSuggestions } from '@votz/shared-types'
import { useIsFollowingTarget, useToggleFollowTarget } from '../../hooks/useFollow'
import { useAuthStore } from '../../store/auth.store'
import { socialRow } from '../ui/social'

const Box = styled.section`
  ${socialRow}
  padding: 16px;
  background: ${({ theme }) => theme.colors.neutral};
`

const Title = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 15px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 4px;
`

const Hint = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 12px;
`

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
`

const Avatar = styled(Link)<{ $src?: string | null }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, $src }) => ($src ? `url(${$src}) center / cover` : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
  font-weight: 700;
`

const Who = styled(Link)`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;

  strong {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: ${({ theme }) => theme.colors.text};
  }
  span {
    font-size: 12px;
    color: ${({ theme }) => theme.colors.muted};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const FollowBtn = styled.button<{ $on: boolean }>`
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.border : theme.colors.action)};
  background: ${({ theme, $on }) => ($on ? 'transparent' : theme.colors.action)};
  color: ${({ theme, $on }) => ($on ? theme.colors.text : theme.colors.white)};
`

function SuggestedRow({ profile }: { profile: FeedSuggestedProfile }) {
  const user = useAuthStore((s) => s.user)
  const type = profile.kind === 'politicians' ? 'POLITICIAN' : 'ENTITY'
  const href = profile.kind === 'politicians' ? `/politico/${profile.id}` : `/entidade/${profile.id}`
  const { data } = useIsFollowingTarget(type, profile.id)
  const toggle = useToggleFollowTarget(type, profile.id)
  const following = !!data?.following
  return (
    <Row>
      <Avatar to={href} $src={profile.avatarUrl} aria-label={`Ver perfil de ${profile.name}`}>
        {!profile.avatarUrl && profile.name.charAt(0).toUpperCase()}
      </Avatar>
      <Who to={href}>
        <strong>
          {profile.name}
          {profile.verified && <CheckCircle size={14} weight="fill" color="#2DC653" />}
        </strong>
        <span>{[profile.username ? `@${profile.username}` : null, profile.subtitle].filter(Boolean).join(' · ')}</span>
      </Who>
      {user && (
        <FollowBtn type="button" $on={following} disabled={toggle.isPending} onClick={() => toggle.mutate()}>
          {following ? 'Seguindo' : 'Seguir'}
        </FollowBtn>
      )}
    </Row>
  )
}

/** Cartão para quem segue poucas contas: políticos e entidades da cidade. O texto do título vem do servidor. */
export function SuggestedProfilesCard({ suggestions }: { suggestions: FeedSuggestions }) {
  if (suggestions.profiles.length === 0) return null
  return (
    <Box aria-label={suggestions.title}>
      <Title>{suggestions.title}</Title>
      <Hint>Seguir ajuda o seu feed a mostrar o que importa para você.</Hint>
      {suggestions.profiles.map((profile) => (
        <SuggestedRow key={`${profile.kind}-${profile.id}`} profile={profile} />
      ))}
    </Box>
  )
}
