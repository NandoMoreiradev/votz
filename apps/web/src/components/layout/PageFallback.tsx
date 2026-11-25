import { Component, type ErrorInfo, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import { PageNavbar } from './StudioEmbed'

/**
 * O que aparece enquanto o código de uma tela sob demanda chega, quando não há tela anterior
 * para manter na frente (a pessoa abriu o endereço direto, ou recarregou a página).
 * Mantém a barra do topo e desenha blocos cinza no lugar do conteúdo, no mesmo padrão
 * dos esqueletos das outras telas. Dentro do Estúdio, a barra do topo não se repete.
 */

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
`

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Body = styled.div`
  max-width: 1080px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.spacing[8]} ${({ theme }) => theme.spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[4]};
`

const Block = styled.div<{ $h: number; $w?: string }>`
  height: ${({ $h }) => $h}px;
  width: ${({ $w }) => $w ?? '100%'};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.border};
  animation: ${pulse} 1.4s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

export function ContentFallback() {
  return (
    <Body role="status" aria-label="Carregando">
      <Block $h={32} $w="40%" />
      <Block $h={18} $w="65%" />
      <Block $h={140} />
      <Block $h={140} />
    </Body>
  )
}

export function PageFallback() {
  return (
    <Page>
      <PageNavbar />
      <ContentFallback />
    </Page>
  )
}

// ── Quando uma tela não abre ──────────────────────────────────────────────────

const RELOAD_FLAG = 'votz:chunk-reload-at'

/** Erro de "não achei o arquivo da tela": acontece quando sai versão nova com a aba aberta. */
function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(message)
}

/** Recarrega a página uma vez (no máximo a cada 30 s) para pegar a versão nova do site. */
function reloadOnce(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_FLAG) ?? 0)
    if (Date.now() - last < 30_000) return false
    window.sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

const ErrorBox = styled.div`
  max-width: 520px;
  margin: ${({ theme }) => theme.spacing[12]} auto;
  padding: ${({ theme }) => theme.spacing[6]};
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  text-align: center;

  h2 {
    font-family: ${({ theme }) => theme.fonts.heading};
    font-size: ${({ theme }) => theme.fontSizes.xl};
    margin: 0 0 ${({ theme }) => theme.spacing[2]};
  }
  p {
    color: ${({ theme }) => theme.colors.muted};
    margin: 0 0 ${({ theme }) => theme.spacing[4]};
  }
  button {
    font: inherit;
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};
    border-radius: ${({ theme }) => theme.radii.md};
    border: none;
    cursor: pointer;
    color: ${({ theme }) => theme.colors.white};
    background: ${({ theme }) => theme.colors.primary};
  }
`

interface BoundaryProps {
  /** Muda a cada troca de tela: o erro de uma tela não fica preso quando a pessoa vai para outra. */
  resetKey: string
  children: ReactNode
}

export class PageErrorBoundary extends Component<BoundaryProps, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    if (isChunkLoadError(error) && reloadOnce()) return
    console.error('[Votz] Erro ao abrir a tela', error, info.componentStack)
  }

  componentDidUpdate(previous: BoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    const chunk = isChunkLoadError(this.state.error)
    return (
      <>
        <PageNavbar />
        <ErrorBox role="alert">
          <h2>{chunk ? 'O Votz foi atualizado' : 'Esta tela não abriu'}</h2>
          <p>
            {chunk
              ? 'Recarregue a página para usar a versão nova.'
              : 'Algo deu errado do nosso lado. Tente de novo; se continuar, volte mais tarde.'}
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Recarregar
          </button>
        </ErrorBox>
      </>
    )
  }
}
