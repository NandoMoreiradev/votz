import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { usePolitician, useUpdatePolitician, useParties, type Party } from '../hooks/usePoliticians'
import { api } from '../lib/api'

// ── Styled (mesma linguagem de MyProfile) ────────────────────────────────────

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

const Hint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: -2px;
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

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 480px) { grid-template-columns: 1fr; }
`

const CharCount = styled.span`
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  align-self: flex-end;
  font-family: ${({ theme }) => theme.fonts.mono};
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

// ── Avatar ────────────────────────────────────────────────────────────────────

const AvatarSection = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
`

const AvatarPreview = styled.div<{ $src: string | null }>`
  width: 80px;
  height: 80px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) =>
    $src ? `url(${$src}) center/cover no-repeat` : theme.colors.primary + '14'};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.75rem;
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

// ── Party selector ────────────────────────────────────────────────────────────

const DropdownWrapper = styled.div`
  position: relative;
`

const DropdownList = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  list-style: none;
  padding: 4px 0;
  z-index: 50;
  max-height: 200px;
  overflow-y: auto;
`

const DropdownItem = styled.li`
  padding: 8px 14px;
  cursor: pointer;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  transition: background 0.1s;
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

const DropdownSub = styled.span`
  display: block;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
`

function PartySelector({
  parties,
  selectedId,
  onSelect,
}: {
  parties: Party[]
  selectedId: string
  onSelect: (p: Party) => void
}) {
  const current = parties.find((p) => p.id === selectedId)
  const [search, setSearch] = useState(current?.abbreviation ?? '')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (current) setSearch(current.abbreviation)
  }, [current?.id])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (current) setSearch(current.abbreviation)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, current])

  const filtered = search.trim()
    ? parties.filter(
        (p) =>
          p.abbreviation.toLowerCase().includes(search.toLowerCase()) ||
          p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : parties

  return (
    <DropdownWrapper ref={wrapperRef}>
      <Input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar partido..."
      />
      {open && filtered.length > 0 && (
        <DropdownList>
          {filtered.map((p) => (
            <DropdownItem
              key={p.id}
              onMouseDown={() => {
                onSelect(p)
                setSearch(p.abbreviation)
                setOpen(false)
              }}
            >
              {p.abbreviation} — Nº {p.number}
              <DropdownSub>{p.name}</DropdownSub>
            </DropdownItem>
          ))}
        </DropdownList>
      )}
    </DropdownWrapper>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PoliticianEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { activeContext } = useAuthStore()

  const { data: politician, isLoading } = usePolitician(id!)
  const { data: parties = [] } = useParties()
  const updateMut = useUpdatePolitician(id!)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<{ msg: string; error: boolean } | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [pendingAvatarUrl, setPendingAvatarUrl] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [office, setOffice] = useState('')
  const [electoralZone, setElectoralZone] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [termStart, setTermStart] = useState('')
  const [termEnd, setTermEnd] = useState('')
  const [partyId, setPartyId] = useState('')
  const [website, setWebsite] = useState('')

  // Hydrate form when data arrives
  useEffect(() => {
    if (!politician) return
    setName(politician.name)
    setOffice(politician.office)
    setElectoralZone(politician.electoralZone)
    setState(politician.state)
    setCity(politician.city ?? '')
    setTermStart(politician.termStart.slice(0, 10))
    setTermEnd(politician.termEnd.slice(0, 10))
    setPartyId(politician.party.id)
    setWebsite(politician.website ?? '')
    setAvatarPreview(politician.avatarUrl)
  }, [politician])

  const uploadMut = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api.post<{ url: string }>('/storage/upload/avatar', form).then((r) => r.data)
    },
    onSuccess: ({ url }) => {
      setPendingAvatarUrl(url)
      setAvatarPreview(url)
      setUploadStatus({ msg: 'Foto enviada.', error: false })
    },
    onError: () => setUploadStatus({ msg: 'Falha ao enviar foto. Tente novamente.', error: true }),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus(null)
    setAvatarPreview(URL.createObjectURL(file))
    uploadMut.mutate(file)
  }

  const canEdit =
    !!activeContext &&
    activeContext.type === 'POLITICIAN' &&
    activeContext.id === id

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!politician) return

    const payload: Record<string, unknown> = {}
    if (name.trim() && name.trim() !== politician.name) payload.name = name.trim()
    if (office.trim() !== politician.office) payload.office = office.trim()
    if (electoralZone.trim() !== politician.electoralZone) payload.electoralZone = electoralZone.trim()
    if (state.trim() !== politician.state) payload.state = state.trim().toUpperCase()
    if (city.trim() !== (politician.city ?? '')) payload.city = city.trim() || undefined
    if (termStart && termStart !== politician.termStart.slice(0, 10)) payload.termStart = termStart
    if (termEnd && termEnd !== politician.termEnd.slice(0, 10)) payload.termEnd = termEnd
    if (partyId && partyId !== politician.party.id) payload.partyId = partyId
    if (website.trim() !== (politician.website ?? '')) payload.website = website.trim() || undefined
    if (pendingAvatarUrl) payload.avatarUrl = pendingAvatarUrl

    if (Object.keys(payload).length === 0) {
      navigate(`/politico/${id}`)
      return
    }

    updateMut.mutate(payload as any, {
      onSuccess: () => navigate(`/politico/${id}`),
    })
  }

  if (isLoading) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to={`/politico/${id}`}>← Voltar</BackLink>
        </Content>
      </Page>
    )
  }

  if (!politician || !canEdit) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to={`/politico/${id}`}>← Voltar</BackLink>
          <ForbiddenBox>
            {!politician
              ? 'Político não encontrado.'
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
        <BackLink to={`/politico/${id}`}>← Voltar ao perfil</BackLink>
        <PageTitle>Editar perfil</PageTitle>

        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'contents' }}>

            {/* Foto */}
            <AvatarSection>
              <AvatarPreview $src={avatarPreview}>
                {!avatarPreview && politician.name.charAt(0).toUpperCase()}
              </AvatarPreview>
              <AvatarActions>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadMut.isPending}
                >
                  {uploadMut.isPending ? 'Enviando...' : 'Alterar foto'}
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

            {/* Dados pessoais */}
            <SectionTitle>Dados pessoais</SectionTitle>

            <Field>
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
              <CharCount>{name.length}/120</CharCount>
            </Field>

            <TwoCol>
              <Field>
                <Label htmlFor="office">Cargo</Label>
                <Input
                  id="office"
                  value={office}
                  onChange={(e) => setOffice(e.target.value)}
                  placeholder="Vereador, Deputado..."
                  maxLength={80}
                />
              </Field>
              <Field>
                <Label htmlFor="electoralZone">Zona eleitoral</Label>
                <Input
                  id="electoralZone"
                  value={electoralZone}
                  onChange={(e) => setElectoralZone(e.target.value)}
                  placeholder="Zona Norte"
                  maxLength={80}
                />
              </Field>
            </TwoCol>

            {/* Mandato */}
            <SectionTitle>Mandato</SectionTitle>

            <Field>
              <Label>Partido</Label>
              <Hint>Digite a sigla ou nome para buscar.</Hint>
              {parties.length > 0 && (
                <PartySelector
                  parties={parties}
                  selectedId={partyId}
                  onSelect={(p) => setPartyId(p.id)}
                />
              )}
            </Field>

            <TwoCol>
              <Field>
                <Label htmlFor="termStart">Início do mandato</Label>
                <Input
                  id="termStart"
                  type="date"
                  value={termStart}
                  onChange={(e) => setTermStart(e.target.value)}
                />
              </Field>
              <Field>
                <Label htmlFor="termEnd">Fim do mandato</Label>
                <Input
                  id="termEnd"
                  type="date"
                  value={termEnd}
                  onChange={(e) => setTermEnd(e.target.value)}
                />
              </Field>
            </TwoCol>

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
              <Label htmlFor="website">Site ou perfil oficial</Label>
              <Input
                id="website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://..."
              />
            </Field>

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
