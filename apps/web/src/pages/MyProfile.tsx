import { useRef, useState, useCallback } from 'react'
import styled from 'styled-components'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { CepInput, ManualAddressFields, EditLink, type CepAddressResult } from '../components/ui/CepInput'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { useUser } from '../hooks/useUser'
import { AuthenticatedUser } from '@votz/shared-types'

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
  const { user, setUser } = useAuthStore()
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
  const { data: profile } = useUser(user.id)

  return (
    <Page>
      <Navbar />
      <Content>
        <PageTitle>Editar perfil</PageTitle>

        {profile?.entity && (
          <InstitutionalBanner>
            <span>Gerencie sua equipe e relatos no</span>
            <Link to={`/entidade/${profile.entity.id}`}>perfil da entidade →</Link>
          </InstitutionalBanner>
        )}
        {profile?.politician && (
          <InstitutionalBanner>
            <span>Gerencie sua equipe e relatos no</span>
            <Link to={`/politico/${profile.politician.id}`}>perfil do político →</Link>
          </InstitutionalBanner>
        )}

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

        <PrivacySection />
      </Content>
    </Page>
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
