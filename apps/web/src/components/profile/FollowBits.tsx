import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { profileActionOutline, profileActionSolid } from './profile-actions'
import { useIsFollowingTarget, useToggleFollowTarget, type FollowTargetType } from '../../hooks/useFollow'

/** "1.234 seguidores", "1 seguidor". */
export function followersText(count: number): string {
  return `${count.toLocaleString('pt-BR')} ${count === 1 ? 'seguidor' : 'seguidores'}`
}

const Count = styled.span`
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.muted};
  b {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 14px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.text};
  }
`
export function FollowersCount({ count }: { count?: number }) {
  if (typeof count !== 'number') return null
  return (
    <Count aria-label={followersText(count)}>
      <b>{count.toLocaleString('pt-BR')}</b>
      {count === 1 ? 'seguidor' : 'seguidores'}
    </Count>
  )
}

const Btn = styled.button<{ $following: boolean }>`
  ${({ $following }) => ($following ? profileActionOutline : profileActionSolid)}
`
/** Seguir / Seguindo. Quem não entrou vai para o login. */
export function FollowButton({ targetType, targetId }: { targetType: FollowTargetType; targetId: string }) {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const status = useIsFollowingTarget(targetType, targetId)
  const toggle = useToggleFollowTarget(targetType, targetId)
  const following = status.data?.following ?? false
  return (
    <Btn
      type="button"
      $following={following}
      aria-pressed={following}
      disabled={!!user && status.isLoading}
      onClick={() => (user ? !toggle.isPending && toggle.mutate() : navigate('/entrar'))}
    >
      {following ? '✓ Seguindo' : 'Seguir'}
    </Btn>
  )
}
