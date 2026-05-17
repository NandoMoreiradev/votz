import { useRef, useState } from 'react'
import styled from 'styled-components'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'
import { AuthenticatedUser } from '@votz/shared-types'

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 16px 80px;
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

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<UploadResult>('/storage/upload/avatar', form).then((r) => r.data)
    },
    onSuccess: (result) => {
      setAvatarPreview(result.url)
      setPendingAvatarUrl(result.url)
      setUploadStatus({ msg: 'Imagem enviada com sucesso.', error: false })
    },
    onError: () => {
      setUploadStatus({ msg: 'Falha ao enviar imagem. Tente novamente.', error: true })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; bio?: string; avatarUrl?: string }) =>
      api.patch<AuthenticatedUser>(`/users/${user!.id}`, data).then((r) => r.data),

    onMutate: async (data) => {
      if (!user) return
      await queryClient.cancelQueries({ queryKey: ['user', user.id] })
      const prevCache = queryClient.getQueryData(['user', user.id])
      const prevStore = { ...user }

      // Optimistic: atualiza store e cache antes de ouvir o servidor
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
    const preview = URL.createObjectURL(file)
    setAvatarPreview(preview)
    uploadMutation.mutate(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: { name?: string; bio?: string; avatarUrl?: string } = {}
    if (name.trim() && name.trim() !== currentUser.name) data.name = name.trim()
    if (bio.trim() !== (currentUser.bio ?? '')) data.bio = bio.trim()
    if (pendingAvatarUrl) data.avatarUrl = pendingAvatarUrl
    if (Object.keys(data).length === 0) return navigate(`/perfil/${currentUser.id}`)
    updateMutation.mutate(data)
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <PageTitle>Editar perfil</PageTitle>

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

          {/* Formulário */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
      </Content>
    </Page>
  )
}
