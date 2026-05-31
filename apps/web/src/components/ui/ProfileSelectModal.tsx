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

// ── MFA Step ────────────────────────────────────────────────────────────────

const MfaBody = styled.div`
  padding: 28px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`

const MfaOrgRow = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
`

const MfaHint = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin: 0;
`

const MfaInput = styled.input`
  width: 100%;
  height: 52px;
  padding: 0 16px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 1.5rem;
  font-family: ${({ theme }) => theme.fonts.mono};
  letter-spacing: 0.25em;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const MfaActions = styled.div`
  display: flex;
  gap: 10px;
`

const MfaBackBtn = styled.button`
  flex: 1;
  height: 44px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;

  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`

const MfaConfirmBtn = styled.button`
  flex: 2;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: opacity 0.15s;

  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const MfaSetupWarning = styled.div`
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action + '10'};
  border: 1px solid ${({ theme }) => theme.colors.action + '30'};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
  line-height: 1.5;
`

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  profiles: MyProfilesResponse
  loading?: boolean
  error?: boolean
  mfaSetupRequired?: boolean
  onSelect: (contextType: string, contextId?: string, mfaCode?: string) => void
}

// ── Componente ───────────────────────────────────────────────────────────────

export function ProfileSelectModal({ profiles, loading, error, mfaSetupRequired, onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingOrg, setPendingOrg] = useState<OrgProfile | null>(null)
  const [mfaCode, setMfaCode] = useState('')

  function handlePersonal() {
    setSelected('personal')
    onSelect('personal')
  }

  function handleOrgClick(org: OrgProfile) {
    setPendingOrg(org)
    setMfaCode('')
  }

  function handleMfaBack() {
    setPendingOrg(null)
    setMfaCode('')
  }

  function handleMfaConfirm() {
    if (!pendingOrg || mfaCode.length < 6) return
    const key = `${pendingOrg.type.toLowerCase()}:${pendingOrg.id}`
    setSelected(key)
    onSelect(pendingOrg.type.toLowerCase(), pendingOrg.id, mfaCode)
  }

  // ── Passo MFA ──────────────────────────────────────────────────────────────

  if (pendingOrg) {
    return (
      <Overlay>
        <Modal>
          <Header>
            <Logo><span>◆</span> VOTZ</Logo>
            <Title>Confirme sua identidade</Title>
            <Subtitle>Para acessar este perfil, você precisa do autenticador.</Subtitle>
          </Header>

          <MfaBody>
            <MfaOrgRow>
              <AvatarBox $src={pendingOrg.logoUrl} $color="#E63946">
                {!pendingOrg.logoUrl && pendingOrg.name.charAt(0).toUpperCase()}
              </AvatarBox>
              <ProfileInfo>
                <ProfileName>{pendingOrg.name}</ProfileName>
                <ProfileMeta>{orgTypeLabel(pendingOrg.type)}</ProfileMeta>
              </ProfileInfo>
            </MfaOrgRow>

            {mfaSetupRequired ? (
              <MfaSetupWarning>
                Você ainda não configurou o autenticador de dois fatores.
                Acesse <strong>Editar perfil → Segurança</strong> para ativar antes de usar este perfil.
              </MfaSetupWarning>
            ) : (
              <>
                <MfaHint>
                  Digite o código de 6 dígitos do seu app autenticador (Google Authenticator, Authy, etc.).
                </MfaHint>

                {error && (
                  <ErrorBanner>Código inválido ou expirado. Tente novamente.</ErrorBanner>
                )}

                <MfaInput
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleMfaConfirm()}
                  autoFocus
                />
              </>
            )}

            <MfaActions>
              <MfaBackBtn onClick={handleMfaBack} disabled={loading}>
                Voltar
              </MfaBackBtn>
              {!mfaSetupRequired && (
                <MfaConfirmBtn
                  onClick={handleMfaConfirm}
                  disabled={loading || mfaCode.length < 6}
                >
                  {loading ? 'Verificando…' : 'Confirmar'}
                </MfaConfirmBtn>
              )}
            </MfaActions>
          </MfaBody>
        </Modal>
      </Overlay>
    )
  }

  // ── Lista de perfis ────────────────────────────────────────────────────────

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
            onClick={handlePersonal}
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
                    onClick={() => handleOrgClick(org)}
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
