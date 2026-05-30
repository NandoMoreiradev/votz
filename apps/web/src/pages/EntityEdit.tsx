import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { EntityType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { useEntity, useUpdateEntity } from '../hooks/useEntities'
import { api } from '../lib/api'

// ── Styled (mesmo padrão de PoliticianEdit / MyProfile) ──────────────────────

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

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
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
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.15s;

  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
  &:disabled { background: ${({ theme }) => theme.colors.neutral}; color: ${({ theme }) => theme.colors.muted}; }
`

const Select = styled.select`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  outline: none;
  cursor: pointer;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 480px) { grid-template-columns: 1fr; }
`

const SlaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
`

const SlaField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const SlaLabel = styled.label`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-weight: ${({ theme }) => theme.fontWeights.medium};
`

const SlaInput = styled.input`
  padding: 8px 10px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.mono};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`

const LogoPreview = styled.div<{ $src: string | null }>`
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radii.lg};
  flex-shrink: 0;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover no-repeat` : theme.colors.primary + '14'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.5rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  border: 2px solid ${({ theme }) => theme.colors.border};
`

const AvatarActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const UploadStatus = styled.span<{ $error: boolean }>`
  font-size: 0.8125rem;
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.positive)};
`

const ErrorMsg = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const ForbiddenBox = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 48px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

// ── Constantes ────────────────────────────────────────────────────────────────

const ENTITY_TYPE_OPTIONS = [
  { value: EntityType.CITY_HALL,      label: 'Prefeitura' },
  { value: EntityType.HOSPITAL,       label: 'Hospital / UBS' },
  { value: EntityType.CONCESSIONAIRE, label: 'Concessionária' },
  { value: EntityType.AUTARCHY,       label: 'Autarquia' },
  { value: EntityType.SECRETARIAT,    label: 'Secretaria' },
  { value: EntityType.OTHER,          label: 'Órgão público' },
]

const SLA_CATEGORIES = [
  { key: 'HEALTH',         label: 'Saúde' },
  { key: 'MOBILITY',       label: 'Mobilidade' },
  { key: 'SAFETY',         label: 'Segurança' },
  { key: 'EDUCATION',      label: 'Educação' },
  { key: 'SANITATION',     label: 'Saneamento' },
  { key: 'HOUSING',        label: 'Habitação' },
  { key: 'INFRASTRUCTURE', label: 'Infraestrutura' },
  { key: 'OTHER',          label: 'Outros' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export function EntityEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeContext } = useAuthStore()

  const { data: entity, isLoading } = useEntity(id!)
  const updateMut = useUpdateEntity(id!)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{ msg: string; error: boolean } | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [pendingLogoUrl, setPendingLogoUrl] = useState<string | null>(null)

  const [legalName, setLegalName] = useState('')
  const [type, setType] = useState<EntityType>(EntityType.CITY_HALL)
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [website, setWebsite] = useState('')
  const [slaHours, setSlaHours] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!entity) return
    setLegalName(entity.legalName)
    setType(entity.type as EntityType)
    setCity(entity.city ?? '')
    setState(entity.state ?? '')
    setWebsite(entity.website ?? '')
    setLogoPreview(entity.logoUrl)
    if (entity.slaHours) {
      const hours = entity.slaHours as Record<string, number>
      setSlaHours(Object.fromEntries(Object.entries(hours).map(([k, v]) => [k, String(v)])))
    }
  }, [entity])

  const uploadMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ url: string }>('/storage/upload/entities', form).then((r) => r.data)
    },
    onSuccess: ({ url }) => {
      setPendingLogoUrl(url)
      setLogoPreview(url)
      setUploadStatus({ msg: 'Logo enviada.', error: false })
    },
    onError: () => setUploadStatus({ msg: 'Falha ao enviar logo. Tente novamente.', error: true }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus(null)
    setLogoPreview(URL.createObjectURL(file))
    uploadMut.mutate(file)
  }

  const canEdit =
    !!activeContext &&
    activeContext.type === 'ENTITY' &&
    activeContext.id === id

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!entity) return

    const payload: Record<string, unknown> = {}
    if (legalName.trim() !== entity.legalName) payload.legalName = legalName.trim()
    if (type !== entity.type) payload.type = type
    if (city.trim() !== (entity.city ?? '')) payload.city = city.trim() || undefined
    if (state.trim() !== (entity.state ?? '')) payload.state = state.trim().toUpperCase()
    if (website.trim() !== (entity.website ?? '')) payload.website = website.trim() || undefined
    if (pendingLogoUrl) payload.logoUrl = pendingLogoUrl

    const parsedSla: Record<string, number> = {}
    for (const [k, v] of Object.entries(slaHours)) {
      const n = parseInt(v, 10)
      if (!isNaN(n) && n > 0) parsedSla[k] = n
    }
    if (Object.keys(parsedSla).length > 0) payload.slaHours = parsedSla

    if (Object.keys(payload).length === 0) {
      navigate(`/entidade/${id}`)
      return
    }

    updateMut.mutate(payload as any, {
      onSuccess: () => navigate(`/entidade/${id}`),
    })
  }

  if (isLoading) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to={`/entidade/${id}`}>← Voltar</BackLink>
        </Content>
      </Page>
    )
  }

  if (!entity || !canEdit) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to={`/entidade/${id}`}>← Voltar</BackLink>
          <ForbiddenBox>
            {!entity
              ? 'Entidade não encontrada.'
              : 'Você não tem permissão para editar este perfil.'}
          </ForbiddenBox>
        </Content>
      </Page>
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to={`/entidade/${id}`}>← Voltar ao perfil</BackLink>
        <PageTitle>Editar perfil</PageTitle>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>

            {/* Logo */}
            <AvatarSection>
              <LogoPreview $src={logoPreview}>
                {!logoPreview && entity.legalName.charAt(0).toUpperCase()}
              </LogoPreview>
              <AvatarActions>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending}
                >
                  {uploadMut.isPending ? 'Enviando...' : 'Alterar logo'}
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

            {/* Dados da entidade */}
            <SectionTitle>Dados da entidade</SectionTitle>

            <Field>
              <Label htmlFor="legalName">Razão social</Label>
              <Input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                maxLength={120}
                minLength={3}
                required
              />
            </Field>

            <Field>
              <Label htmlFor="type">Tipo</Label>
              <Select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as EntityType)}
              >
                {ENTITY_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>

            {/* Localização */}
            <SectionTitle>Localização</SectionTitle>

            <TwoCol>
              <Field>
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="São Paulo"
                  maxLength={80}
                />
              </Field>
              <Field>
                <Label htmlFor="state">Estado (UF)</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                  style={{ textTransform: 'uppercase' }}
                />
              </Field>
            </TwoCol>

            {/* Online */}
            <SectionTitle>Online</SectionTitle>

            <Field>
              <Label htmlFor="website">Site oficial</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />
            </Field>

            {/* SLA */}
            <SectionTitle>Prazo de resposta (horas por categoria)</SectionTitle>

            <SlaGrid>
              {SLA_CATEGORIES.map(({ key, label }) => (
                <SlaField key={key}>
                  <SlaLabel>{label}</SlaLabel>
                  <SlaInput
                    type="number"
                    min="1"
                    max="8760"
                    placeholder="48"
                    value={slaHours[key] ?? ''}
                    onChange={(e) =>
                      setSlaHours((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  />
                </SlaField>
              ))}
            </SlaGrid>

            {updateMut.isError && (
              <ErrorMsg>Erro ao salvar. Verifique os campos e tente novamente.</ErrorMsg>
            )}

            <Button
              type="submit"
              variant="action"
              fullWidth
              disabled={updateMut.isPending || uploadMut.isPending}
            >
              {updateMut.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </form>
        </Card>
      </Content>
    </Page>
  )
}
