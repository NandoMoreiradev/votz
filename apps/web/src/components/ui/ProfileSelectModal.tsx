import { useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { OrgProfile, MyProfilesResponse } from '../../types/api'
import { UserType } from '@votz/shared-types'

const fadeIn = keyframes`from { opacity: 0 } to { opacity: 1 }`
const slideUp = keyframes`from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) }`

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 24px;
  animation: ${fadeIn} 0.18s ease;
`

const Modal = styled.div`
  width: 100%;
  max-width: 440px;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  overflow: hidden;
  animation: ${slideUp} 0.2s ease;
`

const Header = styled.div`
  background: ${({ theme }) => theme.colors.primary};
  padding: 28px 32px 24px;
`

const Logo = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.25rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff;
  margin-bottom: 12px;

  span { color: ${({ theme }) => theme.colors.action}; }
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: #fff;
  margin: 0 0 4px;
`

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.65);
  margin: 0;
`

const List = styled.div`
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
`

const ProfileCard = styled.button<{ $active?: boolean; $isOrg?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1.5px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '08' : theme.colors.white};
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primary + '06'};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const AvatarBox = styled.div<{ $src?: string | null; $color?: string }>`
  width: 44px;
  height: 44px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, $color, theme }) =>
    $src ? `url(${$src}) center/cover` : ($color ?? theme.colors.action)};
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  font-size: 1rem;
`

const ProfileInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const ProfileName = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const ProfileMeta = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const RoleBadge = styled.span<{ $role: string }>`
  display: inline-block;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 0.6875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: ${({ $role, theme }) =>
    $role === 'OWNER' ? theme.colors.positive + '20' : theme.colors.primary + '12'};
  color: ${({ $role, theme }) =>
    $role === 'OWNER' ? theme.colors.positive : theme.colors.primary};
  margin-left: 6px;
`

const Arrow = styled.span`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 1rem;
  flex-shrink: 0;
`

const ErrorBanner = styled.div`
  margin: 0 16px 8px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action + '10'};
  border: 1px solid ${({ theme }) => theme.colors.action + '30'};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
`

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.colors.border};
  margin: 4px 0;
`

const DividerLabel = styled.div`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 4px 0;
`

function orgTypeLabel(type: string) {
  if (type === 'ENTITY') return 'Entidade pública'
  if (type === 'POLITICIAN') return 'Político'
  if (type === 'COMPANY') return 'Empresa'
  return type
}

function userTypeLabel(type: UserType) {
  const map: Record<string, string> = {
    CITIZEN: 'Cidadão',
    ENTITY: 'Entidade',
    POLITICIAN: 'Político',
    PRESS: 'Imprensa',
    NGO: 'ONG',
    RESEARCHER: 'Pesquisador',
    MODERATOR: 'Moderador',
    ADMIN: 'Administrador',
  }
  return map[type] ?? type
}

interface Props {
  profiles: MyProfilesResponse
  loading?: boolean
  error?: boolean
  onSelect: (contextType: string, contextId?: string) => void
}

export function ProfileSelectModal({ profiles, loading, error, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)

  function handleSelect(contextType: string, contextId?: string) {
    const key = contextId ? `${contextType}:${contextId}` : 'personal'
    setSelected(key)
    onSelect(contextType, contextId)
  }

  const personalKey = 'personal'

  return (
    <Overlay>
      <Modal>
        <Header>
          <Logo><span>◆</span> VOTZ</Logo>
          <Title>Como deseja entrar?</Title>
          <Subtitle>Escolha o perfil que vai usar nesta sessão.</Subtitle>
        </Header>

        {error && (
          <ErrorBanner>
            Não foi possível trocar de perfil. Tente novamente.
          </ErrorBanner>
        )}
        <List>
          <DividerLabel>Perfil pessoal</DividerLabel>

          <ProfileCard
            disabled={loading}
            $active={selected === personalKey}
            onClick={() => handleSelect('personal')}
          >
            <AvatarBox $color="#1A1A2E">
              {profiles.personal.name.charAt(0).toUpperCase()}
            </AvatarBox>
            <ProfileInfo>
              <ProfileName>{profiles.personal.name}</ProfileName>
              <ProfileMeta>{userTypeLabel(profiles.personal.type)}</ProfileMeta>
            </ProfileInfo>
            <Arrow>→</Arrow>
          </ProfileCard>

          {profiles.orgs.length > 0 && (
            <>
              <Divider />
              <DividerLabel>Perfis institucionais</DividerLabel>

              {profiles.orgs.map((org) => {
                const key = `${org.type.toLowerCase()}:${org.id}`
                return (
                  <ProfileCard
                    key={org.id}
                    disabled={loading}
                    $active={selected === key}
                    $isOrg
                    onClick={() => handleSelect(org.type.toLowerCase(), org.id)}
                  >
                    <AvatarBox $src={org.logoUrl} $color="#E63946">
                      {!org.logoUrl && org.name.charAt(0).toUpperCase()}
                    </AvatarBox>
                    <ProfileInfo>
                      <ProfileName>
                        {org.name}
                        <RoleBadge $role={org.role}>{org.role === 'OWNER' ? 'Dono' : org.role}</RoleBadge>
                      </ProfileName>
                      <ProfileMeta>
                        {orgTypeLabel(org.type)}
                        {org.verified && ' · Verificado'}
                      </ProfileMeta>
                    </ProfileInfo>
                    <Arrow>→</Arrow>
                  </ProfileCard>
                )
              })}
            </>
          )}
        </List>
      </Modal>
    </Overlay>
  )
}
