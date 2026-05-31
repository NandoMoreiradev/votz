import { useRef, useState, useCallback } from 'react'
import styled from 'styled-components'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { CepInput, ManualAddressFields, EditLink, type CepAddressResult } from '../components/ui/CepInput'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { useMe, useMyProfiles, useMfaSetup, useMfaEnable, useMfaDisable, useMfaResetDevice, useMfaRegenerateBackupCodes } from '../hooks/useAuth'
import { AuthenticatedUser } from '@votz/shared-types'
import { MfaSetupResponse } from '../types/api'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 24px 80px;

  @media (max-width: 640px) { padding: 16px 16px 64px; }
`

const InstitutionalBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  background: ${({ theme }) => theme.colors.primary}0D;
  border: 1px solid ${({ theme }) => theme.colors.primary}30;
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 10px 16px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 20px;

  a {
    font-weight: 600;
    color: ${({ theme }) => theme.colors.primary};
    &:hover { text-decoration: underline; }
  }
`

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 32px;
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const SectionTitle = styled.p`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

// ── Avatar ─────────────────────────────────────────────────────────────────

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`

const AvatarPreview = styled.div<{ $src: string | null }>`
  width: 80px;
  height: 80px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover` : theme.colors.border};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  color: ${({ theme }) => theme.colors.muted};
  border: 2px solid ${({ theme }) => theme.colors.border};
`

const AvatarActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const UploadStatus = styled.p<{ $error?: boolean }>`
  font-size: 0.8125rem;
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.positive)};
`

// ── Form ───────────────────────────────────────────────────────────────────

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  height: 44px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  transition: border-color 0.15s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const Textarea = styled.textarea`
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  resize: vertical;
  min-height: 96px;
  font-family: ${({ theme }) => theme.fonts.body};
  transition: border-color 0.15s;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`

const CharCount = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  align-self: flex-end;
`

const FormActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const ErrorMsg = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
`

// ── Tipos ──────────────────────────────────────────────────────────────────

interface UploadResult {
  key: string
  url: string
  mimeType: string
  size: number
}

// ── Componente ─────────────────────────────────────────────────────────────

export function MyProfile() {
  const { user, setUser, sessionReady } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(user?.name ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null)
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<{ msg: string; error: boolean } | null>(null)

  // Phone
  const [phone, setPhone] = useState(user?.phone ?? '')

  // CEP / endereço
  const [zipCode, setZipCode] = useState(user?.zipCode ?? '')
  const [cepError, setCepError] = useState('')
  const [address, setAddress] = useState<CepAddressResult | null>(
    user?.city ? {
      zipCode: user.zipCode ?? '',
      street: user.street ?? '',
      neighborhood: user.neighborhood ?? '',
      city: user.city ?? '',
      state: user.state ?? '',
      latitude: user.latitude ?? undefined,
      longitude: user.longitude ?? undefined,
    } : null
  )
  const [showManual, setShowManual] = useState(false)
  const [street, setStreet] = useState(user?.street ?? '')
  const [neighborhood, setNeighborhood] = useState(user?.neighborhood ?? '')
  const [streetNumber, setStreetNumber] = useState(user?.streetNumber ?? '')
  const [complement, setComplement] = useState(user?.complement ?? '')

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<UploadResult>('/storage/upload/avatar', form).then((r) => r.data)
    },
    onSuccess: (result) => {
      setPendingAvatarUrl(result.url)
      setUploadStatus({ msg: 'Imagem enviada com sucesso.', error: false })
    },
    onError: () => {
      setUploadStatus({ msg: 'Falha ao enviar imagem. Tente novamente.', error: true })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<AuthenticatedUser>) =>
      api.patch<AuthenticatedUser>(`/users/${user!.id}`, data).then((r) => r.data),

    onMutate: async (data) => {
      if (!user) return
      await queryClient.cancelQueries({ queryKey: ['user', user.id] })
      const prevCache = queryClient.getQueryData(['user', user.id])
      const prevStore = { ...user }
      setUser({ ...user, ...data })
      queryClient.setQueryData(['user', user.id], (old: unknown) =>
        old && typeof old === 'object' ? { ...old, ...data } : old,
      )
      return { prevCache, prevStore }
    },

    onError: (_err, _data, ctx) => {
      if (ctx?.prevStore) setUser(ctx.prevStore)
      if (ctx?.prevCache !== undefined) {
        queryClient.setQueryData(['user', user!.id], ctx.prevCache)
      }
    },

    onSuccess: (updated) => {
      setUser(updated)
      navigate(`/perfil/${updated.id}`)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user', user!.id] })
    },
  })

  const uploading = uploadMutation.isPending
  const saving = updateMutation.isPending

  if (!user) {
    navigate('/entrar')
    return null
  }

  const currentUser = user

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus(null)
    setAvatarPreview(URL.createObjectURL(file))
    uploadMutation.mutate(file)
  }

  function handleCepChange(digits: string) {
    setZipCode(digits)
    if (digits.length === 8) setCepError('')
  }

  function handleAddressFetched(data: CepAddressResult) {
    setAddress(data)
    setStreet(data.street)
    setNeighborhood(data.neighborhood)
    setCepError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const data: Record<string, unknown> = {}

    if (name.trim() && name.trim() !== currentUser.name) data.name = name.trim()
    if (bio.trim() !== (currentUser.bio ?? '')) data.bio = bio.trim()
    if (pendingAvatarUrl) data.avatarUrl = pendingAvatarUrl

    // Telefone — envia mesmo que só dígitos mudem
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits && phone !== currentUser.phone) data.phone = phone

    // Endereço — só envia se CEP preenchido
    if (address) {
      data.zipCode = address.zipCode
      data.street = street || address.street
      data.neighborhood = neighborhood || address.neighborhood
      data.city = address.city
      data.state = address.state
      if (address.latitude != null) data.latitude = address.latitude
      if (address.longitude != null) data.longitude = address.longitude
    }
    if (streetNumber) data.streetNumber = streetNumber
    if (complement !== (currentUser.complement ?? '')) data.complement = complement

    if (Object.keys(data).length === 0) return navigate(`/perfil/${currentUser.id}`)
    updateMutation.mutate(data as Partial<AuthenticatedUser>)
  }

  const hasAddress = !!address?.city
  const { data: profiles } = useMyProfiles(!!user && sessionReady)

  return (
    <Page>
      <Navbar />
      <Content>
        <PageTitle>Editar perfil</PageTitle>

        {profiles?.orgs.filter(o => o.type === 'ENTITY').map(org => (
          <InstitutionalBanner key={org.id}>
            <span>Gerencie sua equipe e relatos no</span>
            <Link to={`/entidade/${org.id}`}>perfil da entidade →</Link>
          </InstitutionalBanner>
        ))}
        {profiles?.orgs.filter(o => o.type === 'POLITICIAN').map(org => (
          <InstitutionalBanner key={org.id}>
            <span>Gerencie sua equipe e relatos no</span>
            <Link to={`/politico/${org.id}`}>perfil do político →</Link>
          </InstitutionalBanner>
        ))}

        <Card>
          {/* Avatar */}
          <AvatarSection>
            <AvatarPreview $src={avatarPreview}>
              {!avatarPreview && user.name.charAt(0).toUpperCase()}
            </AvatarPreview>
            <AvatarActions>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Enviando...' : 'Alterar foto'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              {uploadStatus && (
                <UploadStatus $error={uploadStatus.error}>{uploadStatus.msg}</UploadStatus>
              )}
            </AvatarActions>
          </AvatarSection>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* ── Dados pessoais ── */}
            <Field>
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                minLength={2}
                required
              />
            </Field>

            <Field>
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={300}
                placeholder="Conte um pouco sobre você..."
              />
              <CharCount>{bio.length}/300</CharCount>
            </Field>

            <Field>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                maxLength={15}
              />
            </Field>

            {/* ── Localização ── */}
            <SectionTitle>Localização</SectionTitle>

            <Field>
              <Label>CEP</Label>
              <CepInput
                value={zipCode}
                onChange={handleCepChange}
                onAddressFetched={handleAddressFetched}
                error={cepError}
              />
              {hasAddress && !showManual && (
                <EditLink type="button" onClick={() => setShowManual(true)}>
                  Editar endereço manualmente
                </EditLink>
              )}
            </Field>

            {(showManual || (!address && user.street)) && (
              <ManualAddressFields
                street={street}
                neighborhood={neighborhood}
                onStreetChange={setStreet}
                onNeighborhoodChange={setNeighborhood}
                city={address?.city ?? user.city ?? ''}
                state={address?.state ?? user.state ?? ''}
              />
            )}

            <TwoCol>
              <Field>
                <Label htmlFor="streetNumber">Número</Label>
                <Input
                  id="streetNumber"
                  type="text"
                  value={streetNumber}
                  onChange={(e) => setStreetNumber(e.target.value)}
                  placeholder="1000"
                  maxLength={20}
                />
              </Field>

              <Field>
                <Label htmlFor="complement">Complemento</Label>
                <Input
                  id="complement"
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="Apto 42"
                  maxLength={60}
                />
              </Field>
            </TwoCol>

            {updateMutation.isError && (
              <ErrorMsg>Erro ao salvar. Tente novamente.</ErrorMsg>
            )}

            <FormActions>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/perfil/${user.id}`)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || uploading}>
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </FormActions>
          </form>
        </Card>

        <MfaSection />
        <PrivacySection />
      </Content>
    </Page>
  )
}

// ── MFA Section ───────────────────────────────────────────────────────────

const MfaCard = styled.div`
  margin-top: 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px 32px;
`

const MfaTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const MfaDesc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 20px;
  line-height: 1.5;
`

const MfaStatusBadge = styled.span<{ $enabled: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  background: ${({ $enabled, theme }) => $enabled ? theme.colors.positive + '18' : theme.colors.border};
  color: ${({ $enabled, theme }) => $enabled ? theme.colors.positive : theme.colors.muted};
  margin-bottom: 20px;

  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
`

const MfaRowGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`

const MfaRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const MfaRowInfo = styled.div`
  flex: 1;
`

const MfaRowLabel = styled.div`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const MfaRowHint = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.4;
`

const MfaQrBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
`

const MfaQrImg = styled.img`
  width: 180px;
  height: 180px;
  border-radius: ${({ theme }) => theme.radii.sm};
`

const MfaSecretBox = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.border};
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.radii.sm};
  word-break: break-all;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
`

const BackupGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 16px;
  background: ${({ theme }) => theme.colors.neutral};
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const BackupCode = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  text-align: center;
  padding: 6px;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.sm};
`

type MfaModal =
  | null
  | { type: 'setup'; step: 'qr'; data: MfaSetupResponse }
  | { type: 'setup'; step: 'code' }
  | { type: 'setup'; step: 'backup'; codes: string[] }
  | { type: 'reset'; step: 'code' }
  | { type: 'reset'; step: 'qr'; data: MfaSetupResponse }
  | { type: 'disable'; step: 'code' }
  | { type: 'regen'; step: 'code' }
  | { type: 'regen'; step: 'codes'; codes: string[] }

function MfaSection() {
  const { data: me, refetch: refetchMe } = useMe()
  const [modal, setModal] = useState<MfaModal>(null)
  const [code, setCode] = useState('')
  const [feedback, setFeedback] = useState<{ msg: string; error: boolean } | null>(null)

  const { mutate: setup, isPending: setupPending } = useMfaSetup()
  const { mutate: enable, isPending: enablePending } = useMfaEnable()
  const { mutate: disable, isPending: disablePending } = useMfaDisable()
  const { mutate: resetDevice, isPending: resetPending } = useMfaResetDevice()
  const { mutate: regenCodes, isPending: regenPending } = useMfaRegenerateBackupCodes()

  const mfaEnabled = me?.mfaEnabled ?? false

  function openModal(m: MfaModal) {
    setModal(m)
    setCode('')
    setFeedback(null)
  }

  function closeModal() {
    setModal(null)
    setCode('')
    setFeedback(null)
  }

  function handleSetupStart() {
    setup(undefined, {
      onSuccess: (data) => openModal({ type: 'setup', step: 'qr', data }),
      onError: () => setFeedback({ msg: 'Erro ao iniciar configuração. MFA pode já estar ativo.', error: true }),
    })
  }

  function handleSetupConfirm() {
    enable(code, {
      onSuccess: (data) => setModal({ type: 'setup', step: 'backup', codes: data.backupCodes }),
      onError: () => setFeedback({ msg: 'Código inválido. Tente novamente.', error: true }),
    })
  }

  function handleDisable() {
    disable(code, {
      onSuccess: () => { closeModal(); refetchMe() },
      onError: () => setFeedback({ msg: 'Código inválido ou expirado.', error: true }),
    })
  }

  function handleResetStart() {
    openModal({ type: 'reset', step: 'code' })
  }

  function handleResetValidate() {
    resetDevice(code, {
      onSuccess: (data) => setModal({ type: 'reset', step: 'qr', data }),
      onError: () => setFeedback({ msg: 'Código inválido. Use TOTP ou um código de backup.', error: true }),
    })
  }

  function handleResetConfirm() {
    enable(code, {
      onSuccess: (data) => { setModal({ type: 'setup', step: 'backup', codes: data.backupCodes }); refetchMe() },
      onError: () => setFeedback({ msg: 'Código inválido. Verifique se escaneou o QR corretamente.', error: true }),
    })
  }

  function handleRegenStart() {
    openModal({ type: 'regen', step: 'code' })
  }

  function handleRegen() {
    regenCodes(code, {
      onSuccess: (data) => setModal({ type: 'regen', step: 'codes', codes: data.backupCodes }),
      onError: () => setFeedback({ msg: 'Código TOTP inválido.', error: true }),
    })
  }

  const anyPending = setupPending || enablePending || disablePending || resetPending || regenPending

  return (
    <MfaCard>
      <MfaTitle>Autenticação em dois fatores</MfaTitle>
      <MfaDesc>
        O autenticador protege sua conta e é obrigatório para acessar perfis institucionais (político, entidade, empresa).
      </MfaDesc>

      <MfaStatusBadge $enabled={mfaEnabled}>
        {mfaEnabled ? 'Ativo' : 'Inativo'}
      </MfaStatusBadge>

      {feedback && !modal && (
        <FeedbackMsg $error={feedback.error}>{feedback.msg}</FeedbackMsg>
      )}

      <MfaRowGrid>
        {!mfaEnabled ? (
          <MfaRow>
            <MfaRowInfo>
              <MfaRowLabel>Ativar autenticador</MfaRowLabel>
              <MfaRowHint>Use Google Authenticator, Authy ou qualquer app TOTP compatível.</MfaRowHint>
            </MfaRowInfo>
            <PrivacyBtn onClick={handleSetupStart} disabled={anyPending}>
              {setupPending ? 'Aguarde…' : 'Configurar'}
            </PrivacyBtn>
          </MfaRow>
        ) : (
          <>
            <MfaRow>
              <MfaRowInfo>
                <MfaRowLabel>Trocar dispositivo</MfaRowLabel>
                <MfaRowHint>Trocou de celular ou perdeu o app autenticador? Vincule um novo dispositivo usando seu código atual ou um código de backup.</MfaRowHint>
              </MfaRowInfo>
              <PrivacyBtn onClick={handleResetStart} disabled={anyPending}>
                Trocar dispositivo
              </PrivacyBtn>
            </MfaRow>

            <MfaRow>
              <MfaRowInfo>
                <MfaRowLabel>Regenerar códigos de backup</MfaRowLabel>
                <MfaRowHint>Gera 8 novos códigos de emergência e invalida os anteriores. Requer o código TOTP atual.</MfaRowHint>
              </MfaRowInfo>
              <PrivacyBtn onClick={handleRegenStart} disabled={anyPending}>
                Regenerar
              </PrivacyBtn>
            </MfaRow>

            <MfaRow>
              <MfaRowInfo>
                <MfaRowLabel>Desativar autenticador</MfaRowLabel>
                <MfaRowHint>Você não poderá mais acessar perfis institucionais sem reativar. Aceita código TOTP ou de backup.</MfaRowHint>
              </MfaRowInfo>
              <PrivacyBtn $danger onClick={() => openModal({ type: 'disable', step: 'code' })} disabled={anyPending}>
                Desativar
              </PrivacyBtn>
            </MfaRow>
          </>
        )}
      </MfaRowGrid>

      {/* ── Modals ── */}

      {modal && (
        <ModalOverlay onClick={closeModal}>
          <Modal onClick={(e) => e.stopPropagation()}>

            {/* Setup: QR */}
            {modal.type === 'setup' && modal.step === 'qr' && (
              <>
                <ModalTitle>Escaneie o QR code</ModalTitle>
                <ModalText>Abra seu app autenticador e escaneie o código abaixo. Não consegue escanear? Use o código manual.</ModalText>
                <MfaQrBox>
                  <MfaQrImg src={modal.data.qrCode} alt="QR Code MFA" />
                  <MfaSecretBox>{modal.data.secret}</MfaSecretBox>
                </MfaQrBox>
                <ModalActions style={{ marginTop: 20 }}>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={() => { setModal({ type: 'setup', step: 'code' }); setCode('') }}>
                    Já escaniei →
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Setup: código de confirmação */}
            {modal.type === 'setup' && modal.step === 'code' && (
              <>
                <ModalTitle>Confirme o código</ModalTitle>
                <ModalText>Digite o código de 6 dígitos que aparece no app autenticador para ativar o MFA.</ModalText>
                <ModalInput
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleSetupConfirm()}
                  autoFocus
                />
                {feedback && <FeedbackMsg $error>{feedback.msg}</FeedbackMsg>}
                <ModalActions>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={handleSetupConfirm} disabled={anyPending || code.length < 6}>
                    {enablePending ? 'Verificando…' : 'Ativar MFA'}
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Setup / Reset: backup codes */}
            {modal.type === 'setup' && modal.step === 'backup' && (
              <>
                <ModalTitle>Guarde seus códigos de backup</ModalTitle>
                <ModalText>Estes 8 códigos servem de emergência se você perder o acesso ao autenticador. Cada código pode ser usado uma única vez. Eles também foram enviados por e-mail.</ModalText>
                <BackupGrid>
                  {modal.codes.map((c) => <BackupCode key={c}>{c}</BackupCode>)}
                </BackupGrid>
                <ModalActions style={{ marginTop: 20 }}>
                  <ModalConfirmBtn onClick={() => { closeModal(); refetchMe() }}>
                    Entendi, já guardei
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Reset: validar código atual */}
            {modal.type === 'reset' && modal.step === 'code' && (
              <>
                <ModalTitle>Trocar dispositivo</ModalTitle>
                <ModalText>Para vincular um novo dispositivo, confirme sua identidade com o código TOTP atual ou um código de backup.</ModalText>
                <ModalInput
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="000000 ou código de backup"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetValidate()}
                  autoFocus
                />
                {feedback && <FeedbackMsg $error>{feedback.msg}</FeedbackMsg>}
                <ModalActions>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={handleResetValidate} disabled={anyPending || code.length < 6}>
                    {resetPending ? 'Verificando…' : 'Continuar'}
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Reset: novo QR */}
            {modal.type === 'reset' && modal.step === 'qr' && (
              <>
                <ModalTitle>Escaneie com o novo dispositivo</ModalTitle>
                <ModalText>Abra o app autenticador no seu novo celular e escaneie o QR abaixo. Depois confirme com o código gerado.</ModalText>
                <MfaQrBox>
                  <MfaQrImg src={modal.data.qrCode} alt="Novo QR Code MFA" />
                  <MfaSecretBox>{modal.data.secret}</MfaSecretBox>
                </MfaQrBox>
                <ModalInput
                  style={{ marginTop: 16 }}
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Código do novo dispositivo"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetConfirm()}
                  autoFocus
                />
                {feedback && <FeedbackMsg $error>{feedback.msg}</FeedbackMsg>}
                <ModalActions>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={handleResetConfirm} disabled={anyPending || code.length < 6}>
                    {enablePending ? 'Confirmando…' : 'Confirmar novo dispositivo'}
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Disable */}
            {modal.type === 'disable' && modal.step === 'code' && (
              <>
                <ModalTitle>Desativar autenticador</ModalTitle>
                <ModalText>
                  Você não poderá acessar perfis institucionais sem o MFA ativo.
                  <br /><br />
                  Digite seu código TOTP atual ou um código de backup para confirmar.
                </ModalText>
                <ModalInput
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="000000 ou código de backup"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^A-Fa-f0-9]/g, '').toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && handleDisable()}
                  autoFocus
                />
                {feedback && <FeedbackMsg $error>{feedback.msg}</FeedbackMsg>}
                <ModalActions>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={handleDisable} disabled={anyPending || code.length < 6}>
                    {disablePending ? 'Desativando…' : 'Confirmar desativação'}
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Regen: código TOTP */}
            {modal.type === 'regen' && modal.step === 'code' && (
              <>
                <ModalTitle>Regenerar códigos de backup</ModalTitle>
                <ModalText>Os códigos atuais serão invalidados. Confirme com seu código TOTP (não aceita código de backup).</ModalText>
                <ModalInput
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => e.key === 'Enter' && handleRegen()}
                  autoFocus
                />
                {feedback && <FeedbackMsg $error>{feedback.msg}</FeedbackMsg>}
                <ModalActions>
                  <ModalCancelBtn onClick={closeModal}>Cancelar</ModalCancelBtn>
                  <ModalConfirmBtn onClick={handleRegen} disabled={anyPending || code.length < 6}>
                    {regenPending ? 'Gerando…' : 'Regenerar'}
                  </ModalConfirmBtn>
                </ModalActions>
              </>
            )}

            {/* Regen: novos códigos */}
            {modal.type === 'regen' && modal.step === 'codes' && (
              <>
                <ModalTitle>Novos códigos de backup</ModalTitle>
                <ModalText>Guarde-os em lugar seguro. Os códigos anteriores não funcionam mais. Eles também foram enviados por e-mail.</ModalText>
                <BackupGrid>
                  {modal.codes.map((c) => <BackupCode key={c}>{c}</BackupCode>)}
                </BackupGrid>
                <ModalActions style={{ marginTop: 20 }}>
                  <ModalConfirmBtn onClick={closeModal}>Entendi, já guardei</ModalConfirmBtn>
                </ModalActions>
              </>
            )}

          </Modal>
        </ModalOverlay>
      )}
    </MfaCard>
  )
}

// ── Privacy section ────────────────────────────────────────────────────────

const PrivacyCard = styled.div`
  margin-top: 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px 32px;
`

const PrivacyTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const PrivacyDesc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 20px;
  line-height: 1.5;
`

const PrivacyRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  &:first-of-type { border-top: none; padding-top: 0; }
`

const PrivacyRowInfo = styled.div`
  flex: 1;
`

const PrivacyRowLabel = styled.div`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const PrivacyRowHint = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.4;
`

const PrivacyBtn = styled.button<{ $danger?: boolean }>`
  padding: 9px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  white-space: nowrap;
  border: 1.5px solid ${({ $danger, theme }) => $danger ? theme.colors.action : theme.colors.primary};
  color: ${({ $danger, theme }) => $danger ? theme.colors.action : theme.colors.primary};
  background: transparent;
  transition: all 0.15s;
  flex-shrink: 0;

  &:hover {
    background: ${({ $danger, theme }) => $danger ? theme.colors.action : theme.colors.primary};
    color: #fff;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
`

const Modal = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
  width: 100%;
  max-width: 440px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
`

const ModalTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const ModalText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin-bottom: 20px;
`

const ModalInput = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  margin-bottom: 16px;
  box-sizing: border-box;
  color: ${({ theme }) => theme.colors.text};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.action}; }
`

const ModalActions = styled.div`
  display: flex;
  gap: 12px;
  justify-content: flex-end;
`

const ModalCancelBtn = styled.button`
  padding: 9px 18px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
`

const ModalConfirmBtn = styled.button`
  padding: 9px 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.action};
  color: #fff;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const FeedbackMsg = styled.p<{ $error?: boolean }>`
  font-size: 0.875rem;
  color: ${({ $error, theme }) => $error ? theme.colors.action : theme.colors.positive};
  margin-top: 8px;
`

function PrivacySection() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  const [exportStatus, setExportStatus] = useState<{ msg: string; error: boolean } | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const handleExport = useCallback(async () => {
    setExportLoading(true)
    setExportStatus(null)
    try {
      await api.post('/users/me/data-export')
      setExportStatus({ msg: 'Solicitação enviada! Você receberá um e-mail em breve com o link de download.', error: false })
    } catch {
      setExportStatus({ msg: 'Erro ao solicitar exportação. Tente novamente.', error: true })
    } finally {
      setExportLoading(false)
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!password) { setDeleteError('Digite sua senha para confirmar.'); return }
    setDeleteLoading(true)
    setDeleteError('')
    try {
      await api.delete('/users/me', { data: { password } })
      logout()
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setDeleteError(msg ?? 'Erro ao encerrar conta. Verifique sua senha e tente novamente.')
    } finally {
      setDeleteLoading(false)
    }
  }, [password, logout, navigate])

  return (
    <PrivacyCard>
      <PrivacyTitle>Privacidade e dados</PrivacyTitle>
      <PrivacyDesc>
        Você tem o direito de acessar, portar e apagar seus dados pessoais conforme a LGPD (Lei nº 13.709/2018).
      </PrivacyDesc>

      <PrivacyRow>
        <PrivacyRowInfo>
          <PrivacyRowLabel>Exportar meus dados</PrivacyRowLabel>
          <PrivacyRowHint>
            Receba um arquivo JSON com todos os seus dados: perfil, relatos, comentários, votos e notificações. O link chega por e-mail em até 5 minutos.
          </PrivacyRowHint>
          {exportStatus && <FeedbackMsg $error={exportStatus.error}>{exportStatus.msg}</FeedbackMsg>}
        </PrivacyRowInfo>
        <PrivacyBtn onClick={handleExport} disabled={exportLoading}>
          {exportLoading ? 'Aguarde…' : 'Solicitar exportação'}
        </PrivacyBtn>
      </PrivacyRow>

      <PrivacyRow>
        <PrivacyRowInfo>
          <PrivacyRowLabel>Encerrar minha conta</PrivacyRowLabel>
          <PrivacyRowHint>
            Remove seus dados pessoais permanentemente. Seus relatos públicos serão anonimizados — o registro cívico é preservado, sua identidade não. Essa ação não pode ser desfeita.
          </PrivacyRowHint>
        </PrivacyRowInfo>
        <PrivacyBtn $danger onClick={() => setDeleteOpen(true)}>
          Encerrar conta
        </PrivacyBtn>
      </PrivacyRow>

      {deleteOpen && (
        <ModalOverlay onClick={() => { setDeleteOpen(false); setPassword(''); setDeleteError('') }}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalTitle>Encerrar conta</ModalTitle>
            <ModalText>
              Esta ação é permanente e irreversível. Seus dados pessoais serão removidos e seus relatos serão anonimizados.
              <br /><br />
              Digite sua senha para confirmar.
            </ModalText>
            <ModalInput
              type="password"
              placeholder="Sua senha atual"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDelete()}
              autoFocus
            />
            {deleteError && <FeedbackMsg $error>{deleteError}</FeedbackMsg>}
            <ModalActions>
              <ModalCancelBtn onClick={() => { setDeleteOpen(false); setPassword(''); setDeleteError('') }}>
                Cancelar
              </ModalCancelBtn>
              <ModalConfirmBtn onClick={handleDelete} disabled={deleteLoading || !password}>
                {deleteLoading ? 'Encerrando…' : 'Confirmar encerramento'}
              </ModalConfirmBtn>
            </ModalActions>
          </Modal>
        </ModalOverlay>
      )}
    </PrivacyCard>
  )
}
