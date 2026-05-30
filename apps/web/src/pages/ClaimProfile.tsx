import { useState, useRef } from 'react'
import styled from 'styled-components'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import { Politician } from '../types/api'

// ── Types ─────────────────────────────────────────────────────────────────────

type OrgType = 'entidade' | 'politico'
type RequestType = 'ENTITY' | 'POLITICIAN'

function toRequestType(orgType: OrgType): RequestType {
  return orgType === 'politico' ? 'POLITICIAN' : 'ENTITY'
}

// ── Styled (padrão MyProfile / RequestRegistration) ───────────────────────────

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
  margin-bottom: 8px;
`

const PageDesc = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin-bottom: 28px;
`

const ProfileCard = styled.div`
  background: ${({ theme }) => theme.colors.primary}08;
  border: 1px solid ${({ theme }) => theme.colors.primary}30;
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-bottom: 24px;
`

const ProfileName = styled.div`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const ProfileMeta = styled.div`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
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

const InfoBox = styled.div<{ $variant: 'info' | 'success' | 'error' }>`
  padding: 14px 18px;
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  line-height: 1.5;
  background: ${({ $variant }) =>
    $variant === 'success' ? '#dcfce7' :
    $variant === 'error'   ? '#fee2e2' : '#eff6ff'};
  color: ${({ $variant }) =>
    $variant === 'success' ? '#14532d' :
    $variant === 'error'   ? '#7f1d1d' : '#1e3a8a'};
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

const Hint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const Textarea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  box-sizing: border-box;
  resize: vertical;
  min-height: 90px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`

const FileDropZone = styled.label<{ $hasFile: boolean; $error?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px 16px;
  border: 2px dashed ${({ $hasFile, $error, theme }) =>
    $error ? theme.colors.action : $hasFile ? theme.colors.positive : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $hasFile }) => $hasFile ? '#f0fdf4' : 'transparent'};
  cursor: pointer;
  text-align: center;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }
`

const FileText = styled.span<{ $muted?: boolean }>`
  font-size: ${({ $muted }) => $muted ? '0.75rem' : '0.875rem'};
  color: ${({ $muted, theme }) => $muted ? theme.colors.muted : theme.colors.text};
  font-weight: ${({ $muted }) => $muted ? 400 : 500};
`

const ErrorMsg = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

// ── DocUpload ─────────────────────────────────────────────────────────────────

interface DocUploadProps {
  label: string
  hint?: string
  required?: boolean
  value: string | null
  onChange: (key: string | null) => void
}

function DocUpload({ label, hint, required, value, onChange }: DocUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  async function handleFile(file: File) {
    setError('')
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) { setError('Use JPEG, PNG, WebP ou PDF'); return }
    if (file.size > 10 * 1024 * 1024) { setError('Arquivo maior que 10 MB'); return }

    setUploading(true)
    setFileName(file.name)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post<{ key: string }>('/storage/upload/verification-doc', form)
      onChange(data.key)
    } catch {
      setError('Erro ao enviar. Tente novamente.')
      setFileName('')
      onChange(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Field>
      <Label>
        {label}
        {required && <span style={{ color: '#E63946' }}> *</span>}
      </Label>
      {hint && <Hint>{hint}</Hint>}
      <FileDropZone $hasFile={!!value} $error={!!error} onClick={() => inputRef.current?.click()}>
        {uploading ? (
          <FileText $muted>Enviando…</FileText>
        ) : value ? (
          <>
            <FileText>✓ {fileName || 'Arquivo enviado'}</FileText>
            <FileText $muted>Clique para substituir</FileText>
          </>
        ) : (
          <>
            <FileText>Clique para selecionar</FileText>
            <FileText $muted>JPEG, PNG, WebP ou PDF · máx. 10 MB</FileText>
          </>
        )}
      </FileDropZone>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />
      {error && <ErrorMsg>{error}</ErrorMsg>}
    </Field>
  )
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ClaimProfile() {
  const { type, id } = useParams<{ type: OrgType; id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  const isPolitician = type === 'politico'
  const requestType  = toRequestType(type!)
  const profilePath  = `/${type}/${id}`

  // Busca dados do perfil para exibir no card
  const { data: profile, isLoading: loadingProfile } = useQuery<any>({
    queryKey: ['profile-for-claim', type, id],
    queryFn: () =>
      api.get(`/${isPolitician ? 'politicians' : 'entities'}/${id}`).then((r) => r.data),
    enabled: !!id,
  })

  const [selfieWithId, setSelfieWithId] = useState<string | null>(null)
  const [secondDoc, setSecondDoc] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/registration-requests', {
        type: requestType,
        claimTargetId: id,
        payload: {
          documents: {
            ...(selfieWithId && { selfieWithId }),
            ...(secondDoc    && { secondDoc }),
          },
        },
        note: note || undefined,
      }).then((r) => r.data),
    onSuccess: () => setSuccess(true),
  })

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to={profilePath}>← Voltar ao perfil</BackLink>
          <InfoBox $variant="error">
            Você precisa estar logado para reivindicar um perfil.{' '}
            <Link to={`/entrar?redirect=/reivindicar/${type}/${id}`}>Entrar</Link>
          </InfoBox>
        </Content>
      </Page>
    )
  }

  if (success) {
    return (
      <Page>
        <Navbar />
        <Content>
          <InfoBox $variant="success">
            ✓ Solicitação enviada! Nossa equipe vai revisar em até 48 horas. Você receberá um e-mail com o resultado.
          </InfoBox>
          <div style={{ marginTop: 16 }}>
            <Button variant="outline" as={Link as any} to="/minhas-solicitacoes">
              Ver minhas solicitações
            </Button>
          </div>
        </Content>
      </Page>
    )
  }

  const profileName = profile
    ? (isPolitician ? profile.name : profile.legalName)
    : '…'

  const profileMeta = profile
    ? isPolitician
      ? `${profile.office} · ${profile.party?.abbreviation} · ${profile.state}`
      : `${profile.type} · ${[profile.city, profile.state].filter(Boolean).join(', ')}`
    : ''

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to={profilePath}>← Voltar ao perfil</BackLink>
        <PageTitle>Reivindicar perfil</PageTitle>
        <PageDesc>
          Comprove que você representa este{isPolitician ? ' político' : 'a entidade'} enviando os documentos abaixo.
          Nossa equipe revisa em até 48 horas. Após aprovação, você terá acesso completo para gerenciar o perfil e responder relatos.
        </PageDesc>

        {/* Card do perfil que está sendo reivindicado */}
        <ProfileCard>
          <ProfileName>{loadingProfile ? '…' : profileName}</ProfileName>
          <ProfileMeta>{loadingProfile ? '' : profileMeta}</ProfileMeta>
        </ProfileCard>

        <Card>
          <InfoBox $variant="info">
            Todos os documentos são armazenados com segurança e visíveis apenas pela equipe de moderação do Votz.
          </InfoBox>

          <SectionTitle>Documentos de verificação</SectionTitle>

          <DocUpload
            label="Selfie segurando o RG ou CNH"
            hint="Foto do rosto + documento aberto ao lado, bem iluminada."
            required
            value={selfieWithId}
            onChange={setSelfieWithId}
          />

          <DocUpload
            label={isPolitician
              ? 'Título de Eleitor ou comprovante de mandato'
              : 'CNPJ na Receita Federal, portaria de nomeação ou credencial oficial'}
            hint={isPolitician
              ? 'Frente do título ou comprovante de situação eleitoral.'
              : 'Documento que comprove sua representação desta entidade.'}
            value={secondDoc}
            onChange={setSecondDoc}
          />

          <Field>
            <Label>Contexto adicional <span style={{ fontWeight: 400, color: '#6B7280' }}>(opcional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Cargo, vínculo, link para página oficial, etc."
            />
          </Field>

          {mutation.isError && (
            <ErrorMsg>
              {(mutation.error as any)?.response?.data?.message ?? 'Erro ao enviar. Tente novamente.'}
            </ErrorMsg>
          )}

          <Button
            variant="action"
            fullWidth
            disabled={!selfieWithId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Enviando…' : 'Enviar solicitação'}
          </Button>
        </Card>
      </Content>
    </Page>
  )
}
