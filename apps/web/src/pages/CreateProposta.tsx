import { useState } from 'react'
import styled from 'styled-components'
import { Link, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { OrgContextPrompt } from '../components/ui/OrgContextPrompt'
import { useCriarProposta } from '../hooks/usePropostas'
import { useMyProfiles } from '../hooks/useAuth'
import { useAuthStore } from '../store/auth.store'
import { Category } from '@votz/shared-types'

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Content = styled.div`
  max-width: 1480px;
  margin: 0 auto;
  padding: 24px 32px 64px;

  @media (max-width: 640px) { padding: 16px 16px 48px; }
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

const FormGrid = styled.form`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;

  @media (max-width: 1000px) { grid-template-columns: minmax(0, 1fr); }
`

const Panel = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  min-width: 0;

  @media (max-width: 640px) { padding: 20px 16px; }
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
`

const StepBadge = styled.span`
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8125rem;
  display: flex;
  align-items: center;
  justify-content: center;
`

const PanelTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const PanelSub = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin: 2px 0 0;
`

const SubmitBar = styled.div`
  padding-top: 20px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const PageTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const PageSubtitle = styled.p`
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 24px;
`

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Hint = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-bottom: 8px;
  margin-top: -2px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

const TextArea = styled.textarea`
  width: 100%;
  padding: 10px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  resize: vertical;
  min-height: 220px;
  font-family: ${({ theme }) => theme.fonts.body};
  line-height: 1.6;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`

const CharCount = styled.span<{ $warn: boolean }>`
  font-size: 0.75rem;
  color: ${({ $warn, theme }) => $warn ? theme.colors.action : theme.colors.muted};
  float: right;
  margin-top: 4px;
`

const Field = styled.div` margin-bottom: 22px; `

const CatGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const CatToggle = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.border};
  background: ${({ $active, theme }) => $active ? theme.colors.primary + '12' : 'transparent'};
  color: ${({ $active, theme }) => $active ? theme.colors.primary : theme.colors.muted};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  transition: all 0.15s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; color: ${({ theme }) => theme.colors.primary}; }
`

const ErrorMsg = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.action};
  margin-top: 16px;
`

const AccessDenied = styled.div`
  text-align: center;
  padding: 60px 0;
  color: ${({ theme }) => theme.colors.muted};
`

const CAT_LABELS: Record<string, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança', EDUCATION: 'Educação',
  SANITATION: 'Saneamento', HOUSING: 'Habitação', ENVIRONMENT: 'Meio Ambiente',
  INFRASTRUCTURE: 'Infraestrutura', URBAN_SERVICES: 'Serviços Urbanos',
  CORRUPTION: 'Corrupção', ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência Social', OTHER: 'Outro',
}

export function CreateProposta() {
  const navigate = useNavigate()
  const { user, activeContext, sessionReady } = useAuthStore()
  const { data: profiles } = useMyProfiles(!!user && sessionReady)
  const { mutate, isPending, error } = useCriarProposta()

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categorias, setCategorias] = useState<string[]>([])
  const [linkExterno, setLinkExterno] = useState('')

  const isPolitician = activeContext?.type === 'POLITICIAN'
  const politicianOrg = profiles?.orgs.find((o) => o.type === 'POLITICIAN')

  function toggleCat(cat: string) {
    setCategorias(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : prev.length < 5 ? [...prev, cat] : prev,
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !descricao.trim() || categorias.length === 0) return

    mutate(
      {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        categorias,
        ...(linkExterno.trim() && { linkExterno: linkExterno.trim() }),
      },
      {
        onSuccess: (proposta) => {
          navigate(`/propostas/${proposta.id}`)
        },
      },
    )
  }

  if (!user) {
    return (
      <Page>
        <Navbar />
        <Content>
          <AccessDenied>
            <p>Você precisa estar logado para criar uma proposta.</p>
            <Link to="/entrar" style={{ color: '#1A1A2E', fontWeight: 600, marginTop: 12, display: 'inline-block' }}>
              Entrar
            </Link>
          </AccessDenied>
        </Content>
      </Page>
    )
  }

  if (!isPolitician) {
    return (
      <Page>
        <Navbar />
        <Content>
          <AccessDenied>
            {politicianOrg ? (
              <OrgContextPrompt orgName={politicianOrg.name} actionLabel="criar propostas" />
            ) : (
              <p>Apenas políticos podem criar propostas.</p>
            )}
            <Link to="/propostas" style={{ fontWeight: 600, marginTop: 12, display: 'inline-block' }}>
              Ver propostas
            </Link>
          </AccessDenied>
        </Content>
      </Page>
    )
  }

  return (
    <Page>
      <Navbar />
      <Content>
        <BackLink to="/propostas">← Propostas</BackLink>
        <PageTitle>Nova Proposta</PageTitle>
        <PageSubtitle>
          Apresente sua proposta de forma clara. Ela ficará em rascunho até você publicar.
        </PageSubtitle>

        <FormGrid onSubmit={handleSubmit}>
          <Panel>
            <PanelHeader>
              <StepBadge>1</StepBadge>
              <div>
                <PanelTitle>Qual é a proposta?</PanelTitle>
                <PanelSub>Diga o que quer fazer, por quê e como.</PanelSub>
              </div>
            </PanelHeader>
            <Field>
              <Label htmlFor="titulo">Título da proposta *</Label>
              <Hint>Seja direto e objetivo (ex: "Criação de faixas exclusivas de ônibus no centro")</Hint>
              <Input
                id="titulo"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Título da proposta"
                maxLength={200}
              />
              <CharCount $warn={titulo.length > 180}>{titulo.length}/200</CharCount>
            </Field>

            <Field>
              <Label htmlFor="descricao">Descrição completa *</Label>
              <Hint>Explique o problema, a solução proposta e os benefícios. Markdown é suportado.</Hint>
              <TextArea
                id="descricao"
                value={descricao}
                onChange={e => setDescricao(e.target.value)}
                placeholder="## Problema&#10;&#10;Descreva o problema que a proposta resolve...&#10;&#10;## Solução&#10;&#10;..."
                maxLength={10000}
              />
              <CharCount $warn={descricao.length > 9000}>{descricao.length}/10.000</CharCount>
            </Field>
          </Panel>

          <Panel>
            <PanelHeader>
              <StepBadge>2</StepBadge>
              <div>
                <PanelTitle>Para quem e onde?</PanelTitle>
                <PanelSub>Escolha as áreas e, se já existir, o documento oficial.</PanelSub>
              </div>
            </PanelHeader>
            <Field>
              <Label>Categorias * (até 5)</Label>
              <Hint>Selecione as áreas temáticas da proposta.</Hint>
              <CatGrid>
                {Object.values(Category).map(cat => (
                  <CatToggle
                    key={cat}
                    type="button"
                    $active={categorias.includes(cat)}
                    onClick={() => toggleCat(cat)}
                  >
                    {CAT_LABELS[cat] ?? cat}
                  </CatToggle>
                ))}
              </CatGrid>
            </Field>

            <Field>
              <Label htmlFor="link">Link para documento oficial (opcional)</Label>
              <Hint>Se a proposta já foi protocolada, cole o link aqui.</Hint>
              <Input
                id="link"
                type="url"
                value={linkExterno}
                onChange={e => setLinkExterno(e.target.value)}
                placeholder="https://camara.leg.br/proposicoes/..."
              />
            </Field>

            <SubmitBar>
              {error && (
                <ErrorMsg style={{ marginTop: 0, marginBottom: 12 }}>
                  {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erro ao criar proposta. Tente novamente.'}
                </ErrorMsg>
              )}

              <Button
                type="submit"
                fullWidth
                disabled={
                  isPending ||
                  titulo.trim().length < 10 ||
                  descricao.trim().length < 30 ||
                  categorias.length === 0
                }
              >
                {isPending ? 'Criando…' : 'Criar Proposta (Rascunho)'}
              </Button>
            </SubmitBar>
          </Panel>
        </FormGrid>
      </Content>
    </Page>
  )
}
