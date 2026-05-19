import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Category } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { CATEGORY_CONFIG } from '../components/ui/Badge'
import { CepInput, ManualAddressFields, type CepAddressResult } from '../components/ui/CepInput'
import { useCreateReport } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import { EntitiesResponse, EntityListItem, PoliticiansResponse, Politician } from '../types/api'

// ── Media upload ───────────────────────────────────────────────────────────

const MediaZone = styled.div<{ $dragging: boolean }>`
  border: 2px dashed ${({ $dragging, theme }) => $dragging ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s;
  background: ${({ $dragging, theme }) => $dragging ? theme.colors.primary + '08' : 'transparent'};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background: ${({ theme }) => theme.colors.primary}08;
  }
`

const MediaZoneText = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 0;

  strong { color: ${({ theme }) => theme.colors.primary}; }
`

const MediaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
  margin-top: 10px;
`

const MediaThumb = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};
`

const ThumbImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const ThumbVideo = styled.video`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const ThumbLabel = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
`

const RemoveThumb = styled.button`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 0.625rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
`

const UploadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: ${({ theme }) => theme.colors.muted};
`

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime'])
const ACCEPTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES]
const IMAGE_MAX = 10 * 1024 * 1024   // 10 MB
const VIDEO_MAX = 100 * 1024 * 1024  // 100 MB
const MAX_FILES = 5

interface MediaFile {
  id: string
  file: File
  previewUrl: string
  uploadedUrl?: string
  uploading: boolean
  error?: string
}

function validateFile(f: File): string | null {
  if (!ACCEPTED_TYPES.includes(f.type)) return 'Tipo não suportado'
  if (IMAGE_TYPES.has(f.type) && f.size > IMAGE_MAX) return 'Imagem acima de 10 MB'
  if (VIDEO_TYPES.has(f.type) && f.size > VIDEO_MAX) return 'Vídeo acima de 100 MB'
  return null
}

function useMediaUpload() {
  const [files, setFiles] = useState<MediaFile[]>([])

  function addFiles(incoming: File[]) {
    const slots = MAX_FILES - files.length
    if (slots <= 0) return

    const toAdd = incoming.slice(0, slots).map((f) => {
      const validationError = validateFile(f)
      return {
        id: crypto.randomUUID(),
        file: f,
        previewUrl: URL.createObjectURL(f),
        uploading: !validationError,
        error: validationError ?? undefined,
      } satisfies MediaFile
    })

    if (!toAdd.length) return

    setFiles((prev) => [...prev, ...toAdd])

    toAdd.filter((e) => !e.error).forEach((entry) => {
      const form = new FormData()
      form.append('file', entry.file)
      api
        .post<{ url: string }>('/storage/upload/report-media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(({ data }) => {
          setFiles((prev) =>
            prev.map((f) => f.id === entry.id ? { ...f, uploading: false, uploadedUrl: data.url } : f),
          )
        })
        .catch(() => {
          setFiles((prev) =>
            prev.map((f) => f.id === entry.id ? { ...f, uploading: false, error: 'Falha no upload' } : f),
          )
        })
    })
  }

  function remove(id: string) {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((f) => f.id !== id)
    })
  }

  const uploadedUrls = files
    .filter((f) => !f.uploading && !f.error && f.uploadedUrl)
    .map((f) => f.uploadedUrl!)

  const isUploading = files.some((f) => f.uploading)

  return { files, addFiles, remove, uploadedUrls, isUploading }
}

function MediaUploader({ onChange }: { onChange: (urls: string[]) => void }) {
  const { files, addFiles, remove, uploadedUrls, isUploading } = useMediaUpload()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!isUploading) onChange(uploadedUrls)
  }, [isUploading, uploadedUrls.join(',')])

  function handleFiles(incoming: FileList | null) {
    if (!incoming) return
    addFiles(Array.from(incoming))
  }

  return (
    <div>
      <MediaZone
        $dragging={dragging}
        onClick={() => files.length < MAX_FILES && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        <MediaZoneText>
          <strong>Clique ou arraste</strong> fotos/vídeos aqui<br />
          Imagens (JPEG, PNG, WebP, GIF) até 10 MB · Vídeos (MP4, MOV) até 100 MB · máx. {MAX_FILES} arquivos
        </MediaZoneText>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </MediaZone>

      {files.length > 0 && (
        <MediaGrid>
          {files.map((f) => (
            <MediaThumb key={f.id}>
              {f.file.type.startsWith('image/') ? (
                <ThumbImg src={f.previewUrl} alt="" />
              ) : f.file.type.startsWith('video/') ? (
                <ThumbVideo src={f.previewUrl} muted />
              ) : (
                <ThumbLabel>📄</ThumbLabel>
              )}
              {f.uploading && <UploadingOverlay>enviando…</UploadingOverlay>}
              {f.error && (
                <UploadingOverlay
                  style={{ color: '#E63946', fontSize: '0.65rem', textAlign: 'center', padding: '4px' }}
                  title={f.error}
                >
                  {f.error}
                </UploadingOverlay>
              )}
              <RemoveThumb type="button" onClick={() => remove(f.id)}>✕</RemoveThumb>
            </MediaThumb>
          ))}
        </MediaGrid>
      )}
    </div>
  )
}

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
  margin-bottom: 24px;
  transition: color 0.15s;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

const Card = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
`

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const PageDesc = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 32px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 24px;
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Label = styled.label`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Hint = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: -4px;
`

const Input = styled.input<{ $error?: boolean }>`
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid ${({ $error, theme }) => $error ? theme.colors.action : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const Textarea = styled.textarea<{ $error?: boolean }>`
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid ${({ $error, theme }) => $error ? theme.colors.action : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  resize: vertical;
  min-height: 140px;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const CategoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
`

interface CategoryPillProps {
  $active: boolean
  $color: string
}

const CategoryPill = styled.button<CategoryPillProps>`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $active, $color, theme }) => $active ? $color : theme.colors.border};
  background: ${({ $active, $color }) => $active ? `${$color}18` : 'transparent'};
  color: ${({ $active, $color, theme }) => $active ? $color : theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;

  &:hover {
    border-color: ${({ $color }) => $color};
    color: ${({ $color }) => $color};
  }
`

const CheckboxRow = styled.label`
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};

  input { width: 16px; height: 16px; cursor: pointer; }
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const LocationBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const LocationClear = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  align-self: flex-start;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

// ── Entity search ──────────────────────────────────────────────────────────

const SearchWrapper = styled.div`
  position: relative;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  transition: border-color 0.15s;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
  &::placeholder { color: ${({ theme }) => theme.colors.muted}; }
`

const Dropdown = styled.ul`
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
  max-height: 220px;
  overflow-y: auto;
`

const DropdownItem = styled.li`
  padding: 10px 14px;
  cursor: pointer;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  transition: background 0.1s;
  &:hover { background: ${({ theme }) => theme.colors.surfaceHover}; }
`

const DropdownSub = styled.span`
  display: block;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const SelectedEntity = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1.5px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary}0a;
`

const SelectedName = styled.span`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.primary};
`

const ClearBtn = styled.button`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  &:hover { color: ${({ theme }) => theme.colors.text}; }
`

function EntitySearch({
  onSelect,
}: {
  onSelect: (entity: EntityListItem | null) => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<EntityListItem | null>(null)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['entities-search', search],
    queryFn: () =>
      api
        .get<EntitiesResponse>('/entities', { params: { search, limit: 8 } })
        .then((r) => r.data),
    enabled: search.length >= 2,
    staleTime: 30_000,
  })

  function select(entity: EntityListItem) {
    setSelected(entity)
    setSearch('')
    setOpen(false)
    onSelect(entity)
  }

  function clear() {
    setSelected(null)
    onSelect(null)
  }

  if (selected) {
    return (
      <SelectedEntity>
        <SelectedName>{selected.legalName}</SelectedName>
        <ClearBtn type="button" onClick={clear}>✕ remover</ClearBtn>
      </SelectedEntity>
    )
  }

  return (
    <SearchWrapper ref={wrapperRef}>
      <SearchInput
        type="text"
        placeholder="Buscar por nome (ex: Prefeitura de…)"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && data && data.data.length > 0 && (
        <Dropdown>
          {data.data.map((e) => (
            <DropdownItem key={e.id} onMouseDown={() => select(e)}>
              {e.legalName}
              <DropdownSub>
                {[e.city, e.state].filter(Boolean).join(', ')}
              </DropdownSub>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </SearchWrapper>
  )
}

// ── Politician search ──────────────────────────────────────────────────────

function PoliticianSearch({
  onSelect,
}: {
  onSelect: (p: Politician | null) => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Politician | null>(null)
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['politicians-search', search],
    queryFn: () =>
      api
        .get<PoliticiansResponse>('/politicians', { params: { search, limit: 8 } })
        .then((r) => r.data),
    enabled: search.length >= 2,
    staleTime: 30_000,
  })

  function select(p: Politician) {
    setSelected(p)
    setSearch('')
    setOpen(false)
    onSelect(p)
  }

  function clear() {
    setSelected(null)
    onSelect(null)
  }

  if (selected) {
    return (
      <SelectedEntity>
        <SelectedName>{selected.user.name} — {selected.party.abbreviation}</SelectedName>
        <ClearBtn type="button" onClick={clear}>✕ remover</ClearBtn>
      </SelectedEntity>
    )
  }

  return (
    <SearchWrapper>
      <SearchInput
        type="text"
        placeholder="Buscar por nome do político..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && data && data.data.length > 0 && (
        <Dropdown>
          {data.data.map((p) => (
            <DropdownItem key={p.id} onMouseDown={() => select(p)}>
              {p.user.name}
              <DropdownSub>{p.office} — {p.party.abbreviation} — {p.state}</DropdownSub>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </SearchWrapper>
  )
}

// ── Seletor de destinatário ────────────────────────────────────────────────

const RecipientTabs = styled.div`
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
`

const RecipientTab = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1.5px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '12' : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.muted};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
`

const CharCount = styled.span<{ $warn: boolean }>`
  font-size: 0.75rem;
  color: ${({ $warn, theme }) => $warn ? theme.colors.action : theme.colors.muted};
  align-self: flex-end;
  font-family: ${({ theme }) => theme.fonts.mono};
`

interface FormValues {
  title: string
  description: string
  category: Category
  anonymous: boolean
}

export function CreateReport() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { mutate: createReport, isPending, error } = useCreateReport()
  const [recipientTab, setRecipientTab] = useState<'entity' | 'politician'>('entity')
  const [selectedEntity, setSelectedEntity] = useState<EntityListItem | null>(null)
  const [selectedPolitician, setSelectedPolitician] = useState<Politician | null>(null)
  const [mediaUrls, setMediaUrls] = useState<string[]>([])

  // ── Location state ─────────────────────────────────────────────────────────
  const [cep, setCep] = useState('')
  const [address, setAddress] = useState<CepAddressResult | null>(null)
  const [street, setStreet] = useState('')
  const [neighborhood, setNeighborhood] = useState('')

  function handleAddressFetched(result: CepAddressResult) {
    setAddress(result)
    setStreet(result.street)
    setNeighborhood(result.neighborhood)
  }

  function clearLocation() {
    setCep('')
    setAddress(null)
    setStreet('')
    setNeighborhood('')
  }

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    defaultValues: { anonymous: false },
  })

  const selectedCategory = watch('category')
  const description = watch('description') ?? ''
  const title = watch('title') ?? ''

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to="/">← Voltar</BackLink>
          <Card style={{ textAlign: 'center', padding: '48px' }}>
            <PageTitle>Entre para relatar</PageTitle>
            <PageDesc>Você precisa de uma conta para criar relatos.</PageDesc>
            <Button variant="action" as={Link as any} to="/entrar">
              Entrar agora
            </Button>
          </Card>
        </Content>
      </Page>
    )
  }

  if (!user.emailVerified) {
    return (
      <Page>
        <Navbar />
        <Content>
          <BackLink to="/">← Voltar</BackLink>
          <Card style={{ textAlign: 'center', padding: '48px' }}>
            <PageTitle>Verifique seu e-mail</PageTitle>
            <PageDesc>
              Para criar relatos, você precisa confirmar seu e-mail.<br />
              Verifique a caixa de entrada de <strong>{user.email}</strong>.
            </PageDesc>
            <Button variant="action" as={Link as any} to="/verificar-email">
              Ir para verificação
            </Button>
          </Card>
        </Content>
      </Page>
    )
  }

  function onSubmit(data: FormValues) {
    const recipient =
      recipientTab === 'entity' && selectedEntity
        ? { recipientType: 'ENTITY', recipientId: selectedEntity.id }
        : recipientTab === 'politician' && selectedPolitician
          ? { recipientType: 'POLITICIAN', recipientId: selectedPolitician.id }
          : {}

    const location = address
      ? {
          city: address.city,
          state: address.state,
          neighborhood: neighborhood || address.neighborhood,
          latitude: address.latitude,
          longitude: address.longitude,
          typedAddress: [
            street || address.street,
            neighborhood || address.neighborhood,
            address.city,
            address.state,
          ].filter(Boolean).join(', '),
        }
      : {}

    createReport(
      { ...data, ...recipient, ...location, media: mediaUrls } as any,
      { onSuccess: (report: any) => navigate(`/relatos/${report.id}`) },
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/">← Voltar</BackLink>

        <Card>
          <PageTitle>Novo relato</PageTitle>
          <PageDesc>Registre um problema público. Seja direto e específico.</PageDesc>

          <Form onSubmit={handleSubmit(onSubmit)}>
            <Field>
              <Label>Título do problema</Label>
              <Hint>Descreva em uma frase — mín. 10, máx. 120 caracteres.</Hint>
              <Input
                type="text"
                placeholder="Ex: Buraco na Rua XV de Novembro há 2 meses"
                $error={!!errors.title}
                {...register('title', {
                  required: 'Obrigatório',
                  minLength: { value: 10, message: 'Mínimo 10 caracteres' },
                  maxLength: { value: 120, message: 'Máximo 120 caracteres' },
                })}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {errors.title
                  ? <ErrorMsg>{errors.title.message}</ErrorMsg>
                  : <span />
                }
                <CharCount $warn={title.length > 110}>{title.length}/120</CharCount>
              </div>
            </Field>

            <Field>
              <Label>Categoria</Label>
              {errors.category && <ErrorMsg>Selecione uma categoria</ErrorMsg>}
              <CategoryGrid>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                  <CategoryPill
                    key={key}
                    type="button"
                    $active={selectedCategory === key}
                    $color={config.color}
                    onClick={() => setValue('category', key as Category, { shouldValidate: true })}
                  >
                    {config.label}
                  </CategoryPill>
                ))}
              </CategoryGrid>
              <input type="hidden" {...register('category', { required: true })} />
            </Field>

            <Field>
              <Label>Direcionar para <span style={{ fontWeight: 400, color: '#6B7280' }}>(opcional)</span></Label>
              <Hint>Quem deve responder por isso.</Hint>
              <RecipientTabs>
                <RecipientTab
                  type="button"
                  $active={recipientTab === 'entity'}
                  onClick={() => { setRecipientTab('entity'); setSelectedPolitician(null) }}
                >
                  Entidade pública
                </RecipientTab>
                <RecipientTab
                  type="button"
                  $active={recipientTab === 'politician'}
                  onClick={() => { setRecipientTab('politician'); setSelectedEntity(null) }}
                >
                  Político
                </RecipientTab>
              </RecipientTabs>
              {recipientTab === 'entity'
                ? <EntitySearch onSelect={setSelectedEntity} />
                : <PoliticianSearch onSelect={setSelectedPolitician} />
              }
            </Field>

            <Field>
              <Label>Descrição detalhada</Label>
              <Hint>Mínimo 30 caracteres. Inclua contexto: frequência, impacto, localização.</Hint>
              <Textarea
                placeholder="Descreva o problema com detalhes..."
                $error={!!errors.description}
                {...register('description', {
                  required: 'Obrigatório',
                  minLength: { value: 30, message: 'Mínimo 30 caracteres' },
                  maxLength: { value: 2000, message: 'Máximo 2000 caracteres' },
                })}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {errors.description
                  ? <ErrorMsg>{errors.description.message}</ErrorMsg>
                  : <span />
                }
                <CharCount $warn={description.length > 1900}>{description.length}/2000</CharCount>
              </div>
            </Field>

            <Field>
              <Label>Fotos ou vídeos <span style={{ fontWeight: 400, color: '#6B7280' }}>(opcional)</span></Label>
              <Hint>Evidências visuais aumentam a credibilidade do relato.</Hint>
              <MediaUploader onChange={setMediaUrls} />
            </Field>

            <Field>
              <Label>
                Localização do problema{' '}
                <span style={{ fontWeight: 400, color: '#6B7280' }}>(opcional)</span>
              </Label>
              <Hint>
                Informe o CEP do local — o relato aparecerá no mapa e ativará alertas de surto.
              </Hint>
              <LocationBox>
                <CepInput
                  value={cep}
                  onChange={setCep}
                  onAddressFetched={handleAddressFetched}
                />
                {address && (
                  <>
                    <ManualAddressFields
                      street={street}
                      neighborhood={neighborhood}
                      onStreetChange={setStreet}
                      onNeighborhoodChange={setNeighborhood}
                      city={address.city}
                      state={address.state}
                    />
                    <LocationClear type="button" onClick={clearLocation}>
                      Remover localização
                    </LocationClear>
                  </>
                )}
              </LocationBox>
            </Field>

            <Field>
              <CheckboxRow>
                <input type="checkbox" {...register('anonymous')} />
                Relatar anonimamente (seu nome não aparece publicamente)
              </CheckboxRow>
            </Field>

            {error && (
              <ErrorMsg>
                {(() => {
                  const msg = (error as any)?.response?.data?.message
                  if (!msg) return 'Erro ao criar relato. Tente novamente.'
                  if (Array.isArray(msg)) return msg.join(' • ')
                  if (msg === 'Email verification required to create reports')
                    return 'Você precisa verificar seu e-mail antes de criar relatos.'
                  return msg
                })()}
              </ErrorMsg>
            )}

            <Button variant="action" fullWidth disabled={isPending}>
              {isPending ? 'Publicando...' : 'Publicar relato'}
            </Button>
          </Form>
        </Card>
      </Content>
    </Page>
  )
}
