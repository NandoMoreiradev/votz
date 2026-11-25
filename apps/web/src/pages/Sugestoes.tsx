import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { ArrowUp, Lightbulb, Plus, Trash, X } from '@phosphor-icons/react'
import { SuggestionCategory, SuggestionStatus, UserType } from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import {
  useCreateSuggestion,
  useDeleteSuggestion,
  useSuggestions,
  useToggleSuggestionVote,
} from '../hooks/useSuggestions'
import { SkeletonRows } from '../components/ui/Skeleton'

function extractApiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(msg)) return msg.join(' ')
  if (typeof msg === 'string' && msg.trim()) return msg
  return fallback
}

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
  display: flex;
  flex-direction: column;
`

const Content = styled.main`
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 64px;
  flex: 1;
`

const Hero = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  margin-bottom: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
`

const HeroText = styled.div`
  max-width: 600px;
`

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.action};
  margin-bottom: 8px;
`

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.55;
`

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
`

const FilterGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`

const Select = styled.select`
  padding: 8px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-family: ${({ theme }) => theme.fonts.body};
  cursor: pointer;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const Card = styled.article`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
  display: flex;
  gap: 18px;
  align-items: flex-start;

  @media (max-width: 560px) {
    flex-direction: column;
  }
`

const VoteBox = styled.button<{ $active: boolean }>`
  min-width: 64px;
  padding: 10px 8px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $active, theme }) => ($active ? theme.colors.action : theme.colors.border)};
  background: ${({ $active }) => ($active ? 'rgba(230, 57, 70, 0.08)' : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.action : theme.colors.text)};
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.action};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 560px) {
    flex-direction: row;
    padding: 8px 14px;
    gap: 8px;
  }
`

const VoteCount = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

const VoteLabel = styled.span`
  font-size: 0.6875rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const CardBody = styled.div`
  flex: 1;
  min-width: 0;
`

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
`

const Badge = styled.span<{ $bg?: string; $color?: string }>`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  padding: 2px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ $bg, theme }) => $bg ?? theme.colors.neutral};
  color: ${({ $color, theme }) => $color ?? theme.colors.text};
`

const CardTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const CardDesc = styled.p`
  font-size: 0.925rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.55;
  white-space: pre-wrap;
  margin-bottom: 12px;
`

const AdminNote = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border-left: 3px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};

  strong {
    display: block;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: ${({ theme }) => theme.colors.primary};
    margin-bottom: 4px;
  }
`

const MetaRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
`

const DeleteBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  font-size: 0.8125rem;
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.colors.action};
  }
`

const EmptyBox = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 48px 24px;
  text-align: center;
  color: ${({ theme }) => theme.colors.muted};
`

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 15, 26, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
  padding: 20px;
`

const Modal = styled.div`
  width: 100%;
  max-width: 520px;
  background: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: 28px;
  position: relative;
`

const CloseBtn = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
`

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 16px;
`

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
`

const Textarea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.9375rem;
  resize: vertical;
`

const ErrorBox = styled.div`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(230, 57, 70, 0.1);
  color: ${({ theme }) => theme.colors.action};
  font-size: 0.875rem;
`

const Pagination = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
`

export const SUGGESTION_CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  FEATURE: 'Nova funcionalidade',
  IMPROVEMENT: 'Melhoria',
  BUG: 'Correção de bug',
  UX: 'Experiência / Design',
  OTHER: 'Outro',
}

export const SUGGESTION_STATUS_META: Record<
  SuggestionStatus,
  { label: string; bg: string; color: string }
> = {
  OPEN: { label: 'Aberta', bg: '#F3F4F6', color: '#374151' },
  UNDER_REVIEW: { label: 'Em análise', bg: '#DBEAFE', color: '#1E40AF' },
  PLANNED: { label: 'Planejada', bg: '#EDE9FE', color: '#5B21B6' },
  IN_PROGRESS: { label: 'Em desenvolvimento', bg: '#FEF3C7', color: '#92400E' },
  COMPLETED: { label: 'Concluída', bg: '#DCFCE7', color: '#166534' },
  DECLINED: { label: 'Não prevista', bg: '#FEE2E2', color: '#991B1B' },
}

export function Sugestoes() {
  const user = useAuthStore((s) => s.user)
  const [statusFilter, setStatusFilter] = useState<SuggestionStatus | ''>('')
  const [categoryFilter, setCategoryFilter] = useState<SuggestionCategory | ''>('')
  const [sort, setSort] = useState<'top' | 'recent'>('top')
  const [page, setPage] = useState(1)

  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SuggestionCategory>(SuggestionCategory.IMPROVEMENT)
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading } = useSuggestions({
    status: statusFilter || undefined,
    category: categoryFilter || undefined,
    sort,
    page,
  })
  const createMutation = useCreateSuggestion()
  const voteMutation = useToggleSuggestionVote()
  const deleteMutation = useDeleteSuggestion()

  const isStaff = user?.type === UserType.ADMIN || user?.type === UserType.MODERATOR

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (title.trim().length < 5) {
      setFormError('O título deve ter pelo menos 5 caracteres.')
      return
    }
    if (description.trim().length < 15) {
      setFormError('Descreva a sugestão com pelo menos 15 caracteres.')
      return
    }
    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim(),
        category,
      })
      setTitle('')
      setDescription('')
      setCategory(SuggestionCategory.IMPROVEMENT)
      setShowModal(false)
    } catch (err) {
      setFormError(extractApiError(err, 'Não foi possível enviar sua sugestão.'))
    }
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <Hero>
          <HeroText>
            <Eyebrow>
              <Lightbulb size={15} weight="bold" />
              Construindo o Votz juntos
            </Eyebrow>
            <Title>Sugestões e Melhorias da Plataforma</Title>
            <Subtitle>
              Tem uma ideia para tornar o Votz mais útil, transparente ou fácil de usar? Envie sua sugestão e apoie as ideias da comunidade para ajudarmos a priorizar o que vem a seguir.
            </Subtitle>
          </HeroText>
          {user ? (
            <Button onClick={() => { setFormError(null); setShowModal(true) }}>
              <Plus size={16} weight="bold" />
              Enviar sugestão
            </Button>
          ) : (
            <Button as={Link as any} to="/entrar?redirect=/sugestoes">
              Entrar para sugerir
            </Button>
          )}
        </Hero>

        <Controls>
          <FilterGroup>
            <Select
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as SuggestionStatus | '')
                setPage(1)
              }}
            >
              <option value="">Todos os status</option>
              {Object.entries(SUGGESTION_STATUS_META).map(([key, meta]) => (
                <option key={key} value={key}>{meta.label}</option>
              ))}
            </Select>

            <Select
              aria-label="Filtrar por categoria"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value as SuggestionCategory | '')
                setPage(1)
              }}
            >
              <option value="">Todas as categorias</option>
              {Object.entries(SUGGESTION_CATEGORY_LABEL).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </Select>
          </FilterGroup>

          <Select
            aria-label="Ordenar sugestões"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as 'top' | 'recent')
              setPage(1)
            }}
          >
            <option value="top">Mais apoiadas</option>
            <option value="recent">Mais recentes</option>
          </Select>
        </Controls>

        {isLoading ? (
          <SkeletonRows rows={4} height={110} label="Carregando sugestões" />
        ) : !data?.data?.length ? (
          <EmptyBox>
            Nenhuma sugestão encontrada neste filtro. Que tal enviar a primeira?
          </EmptyBox>
        ) : (
          <List>
            {data.data.map((item) => {
              const statusMeta = SUGGESTION_STATUS_META[item.status]
              const canDelete =
                isStaff || (user?.id === item.authorId && item.status === SuggestionStatus.OPEN)

              return (
                <Card key={item.id}>
                  <VoteBox
                    type="button"
                    $active={item.hasVoted}
                    disabled={!user || voteMutation.isPending}
                    title={user ? 'Apoiar sugestão' : 'Entre para apoiar esta sugestão'}
                    onClick={() => voteMutation.mutate(item.id)}
                  >
                    <ArrowUp size={18} weight="bold" />
                    <VoteCount>{item.votesCount}</VoteCount>
                    <VoteLabel>Apoios</VoteLabel>
                  </VoteBox>

                  <CardBody>
                    <Badges>
                      <Badge $bg={statusMeta.bg} $color={statusMeta.color}>
                        {statusMeta.label}
                      </Badge>
                      <Badge>{SUGGESTION_CATEGORY_LABEL[item.category]}</Badge>
                    </Badges>

                    <CardTitle>{item.title}</CardTitle>
                    <CardDesc>{item.description}</CardDesc>

                    {item.adminNote && (
                      <AdminNote>
                        <strong>Resposta da equipe Votz</strong>
                        {item.adminNote}
                      </AdminNote>
                    )}

                    <MetaRow>
                      <span>
                        Por <strong>{item.author.name}</strong> ·{' '}
                        {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      {canDelete && (
                        <DeleteBtn
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(item.id)}
                        >
                          <Trash size={14} />
                          Excluir
                        </DeleteBtn>
                      )}
                    </MetaRow>
                  </CardBody>
                </Card>
              )
            })}
          </List>
        )}

        {data && data.meta.totalPages > 1 && (
          <Pagination>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>
              Página {data.meta.page} de {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </Pagination>
        )}
      </Content>

      {showModal && (
        <Overlay onClick={() => setShowModal(false)}>
          <Modal onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <CloseBtn type="button" onClick={() => setShowModal(false)} aria-label="Fechar">
              <X size={20} weight="bold" />
            </CloseBtn>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Nova sugestão para o Votz</h2>
            <p style={{ fontSize: '0.875rem', color: '#6B7280', marginTop: 4 }}>
              Compartilhe ideias de melhorias, novos recursos ou reporte problemas na plataforma.
            </p>
            <Form onSubmit={handleCreate}>
              <div>
                <Label htmlFor="sug-category">Categoria</Label>
                <Select
                  id="sug-category"
                  style={{ width: '100%' }}
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
                >
                  {Object.entries(SUGGESTION_CATEGORY_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="sug-title">Título</Label>
                <Input
                  id="sug-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  placeholder="Ex.: Filtro por bairro no mapa de relatos"
                  required
                />
              </div>
              <div>
                <Label htmlFor="sug-desc">Descrição</Label>
                <Textarea
                  id="sug-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  placeholder="Explique o que gostaria de ver e como isso ajuda quem usa o Votz..."
                  required
                />
              </div>
              {formError && <ErrorBox>{formError}</ErrorBox>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Enviando...' : 'Publicar sugestão'}
                </Button>
              </div>
            </Form>
          </Modal>
        </Overlay>
      )}
    </Page>
  )
}
