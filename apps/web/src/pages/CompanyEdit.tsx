import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PageNavbar } from '../components/layout/StudioEmbed'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { useCompany } from '../hooks/useCompanies'
import { api } from '../lib/api'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 680px;
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
  margin-bottom: 20px;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 24px;
`

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`

const Input = styled.input`
  height: 42px;
  padding: 0 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`

const BranchRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  flex-wrap: wrap;
`

export function CompanyEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { activeContext } = useAuthStore()
  const { data: company, isLoading } = useCompany(id ?? '')

  const logoInputRef = useRef<HTMLInputElement>(null)
  const [tradeName, setTradeName] = useState('')
  const [website, setWebsite] = useState('')
  const [slaHours, setSlaHours] = useState('48')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ msg: string; error?: boolean } | null>(null)

  // Nova filial
  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchCity, setBranchCity] = useState('')
  const [branchState, setBranchState] = useState('')

  useEffect(() => {
    if (!company) return
    setTradeName(company.tradeName ?? '')
    setWebsite(company.website ?? '')
    setSlaHours(String(company.slaHours ?? 48))
    setLogoUrl(company.logoUrl ?? null)
  }, [company])

  const canManage =
    activeContext?.type === 'COMPANY' &&
    activeContext.id === id &&
    activeContext.permissions.includes('MANAGE_PROFILE')

  const uploadLogoMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ url: string }>('/storage/upload/entity-logo', form).then((r) => r.data)
    },
    onSuccess: (res) => {
      setLogoUrl(res.url)
      setFeedback({ msg: 'Logo enviado. Clique em "Salvar alterações" para aplicar.' })
    },
    onError: () => setFeedback({ msg: 'Falha ao enviar logo.', error: true }),
  })

  const updateMut = useMutation({
    mutationFn: (payload: { tradeName?: string; website?: string; slaHours?: number; logoUrl?: string }) =>
      api.patch(`/companies/${id}`, payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company', id] })
      setFeedback({ msg: 'Perfil da empresa atualizado com sucesso.' })
    },
    onError: () => setFeedback({ msg: 'Erro ao salvar perfil da empresa.', error: true }),
  })

  const createBranchMut = useMutation({
    mutationFn: (payload: { name: string; address: string; city: string; state: string }) =>
      api.post(`/companies/${id}/branches`, payload).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company', id] })
      setBranchName('')
      setBranchAddress('')
      setBranchCity('')
      setBranchState('')
      setFeedback({ msg: 'Filial cadastrada com sucesso.' })
    },
    onError: () => setFeedback({ msg: 'Não foi possível cadastrar a filial. Confira os campos.', error: true }),
  })

  const deleteBranchMut = useMutation({
    mutationFn: (branchId: string) => api.delete(`/companies/${id}/branches/${branchId}`).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['company', id] })
      setFeedback({ msg: 'Filial removida.' })
    },
  })

  if (isLoading) {
    return (
      <Page>
        <PageNavbar />
        <Content><Card>Carregando perfil da empresa…</Card></Content>
      </Page>
    )
  }

  if (!canManage) {
    return (
      <Page>
        <PageNavbar />
        <Content>
          <Card>Você precisa estar no contexto desta empresa com permissão de gerenciar perfil.</Card>
        </Content>
      </Page>
    )
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    updateMut.mutate({
      tradeName: tradeName.trim(),
      website: website.trim() || undefined,
      slaHours: Number(slaHours) || 48,
      ...(logoUrl ? { logoUrl } : {}),
    })
  }

  function handleAddBranch(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    createBranchMut.mutate({
      name: branchName.trim(),
      address: branchAddress.trim(),
      city: branchCity.trim(),
      state: branchState.trim().toUpperCase(),
    })
  }

  const branches = company?.branches ?? []

  return (
    <Page>
      <PageNavbar />
      <Content>
        <BackLink to={`/empresa/${id}`}>← Voltar para a página pública da empresa</BackLink>
        <PageTitle>Editar perfil da empresa</PageTitle>

        {feedback && (
          <Card style={{ padding: '14px 18px', borderColor: feedback.error ? '#E63946' : '#2DC653' }}>
            <span style={{ color: feedback.error ? '#E63946' : '#15803D', fontSize: '0.875rem', fontWeight: 600 }}>
              {feedback.msg}
            </span>
          </Card>
        )}

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: 12,
                background: logoUrl ? `url(${logoUrl}) center/cover` : '#E5E5E5',
                border: '1px solid #D1D5DB',
                flexShrink: 0,
              }}
            />
            <div>
              <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()} disabled={uploadLogoMut.isPending}>
                {uploadLogoMut.isPending ? 'Enviando…' : 'Alterar logo'}
              </Button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) uploadLogoMut.mutate(f)
                }}
              />
            </div>
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field>
              <Label htmlFor="tradeName">Nome fantasia</Label>
              <Input id="tradeName" value={tradeName} onChange={(e) => setTradeName(e.target.value)} required maxLength={200} />
            </Field>

            <TwoCol>
              <Field>
                <Label htmlFor="website">Site oficial</Label>
                <Input id="website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://suaempresa.com.br" />
              </Field>
              <Field>
                <Label htmlFor="slaHours">Prazo de resposta comprometido (horas)</Label>
                <Input id="slaHours" type="number" min={1} max={720} value={slaHours} onChange={(e) => setSlaHours(e.target.value)} />
              </Field>
            </TwoCol>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <Button type="button" variant="ghost" onClick={() => navigate(`/empresa/${id}`)}>Cancelar</Button>
              <Button type="submit" disabled={updateMut.isPending}>
                {updateMut.isPending ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Filiais */}
        <Card>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Filiais e unidades físicas ({branches.length})</h2>
          <p style={{ fontSize: '0.875rem', color: '#6B7280', margin: 0 }}>
            Cadastre as unidades da sua empresa para facilitar relatos locais e atendimento regional.
          </p>

          {branches.map((b) => (
            <BranchRow key={b.id}>
              <div>
                <strong>{b.name}</strong>
                <div style={{ fontSize: '0.8125rem', color: '#6B7280' }}>
                  {b.address} — {b.city}/{b.state}
                </div>
              </div>
              <Button type="button" variant="ghost" size="sm" disabled={deleteBranchMut.isPending} onClick={() => deleteBranchMut.mutate(b.id)}>
                Remover
              </Button>
            </BranchRow>
          ))}

          <form onSubmit={handleAddBranch} style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12, borderTop: '1px solid #E5E5E5' }}>
            <strong style={{ fontSize: '0.9375rem' }}>Adicionar nova filial</strong>
            <Field>
              <Label>Nome da unidade *</Label>
              <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} required placeholder="Ex.: Unidade Centro" />
            </Field>
            <Field>
              <Label>Endereço completo *</Label>
              <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} required placeholder="Av. Paulista, 1000" />
            </Field>
            <TwoCol>
              <Field>
                <Label>Cidade *</Label>
                <Input value={branchCity} onChange={(e) => setBranchCity(e.target.value)} required placeholder="São Paulo" />
              </Field>
              <Field>
                <Label>UF (2 letras) *</Label>
                <Input value={branchState} onChange={(e) => setBranchState(e.target.value.toUpperCase())} required maxLength={2} placeholder="SP" />
              </Field>
            </TwoCol>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" disabled={createBranchMut.isPending}>
                {createBranchMut.isPending ? 'Adicionando…' : '+ Adicionar filial'}
              </Button>
            </div>
          </form>
        </Card>
      </Content>
    </Page>
  )
}
