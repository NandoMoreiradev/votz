import styled from 'styled-components'

/**
 * Peças de layout das telas de conversas que não são o chat (configurações, nova
 * conversa, detalhes, aparelhos, bloqueadas). Escala de espaço: 4, 8, 12, 16, 24, 32.
 * Texto de 14 a 15 px, títulos em Space Grotesk, cartões brancos de borda fina e cantos de 12 px
 * sobre o fundo cinza, como no resto do Votz Web.
 */

/** Coluna centralizada que preenche a tela sem esticar demais o conteúdo. */
export const Page = styled.div`
  box-sizing: border-box;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 24px 56px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  @media (max-width: 959px) {
    padding: 16px 16px 40px;
  }
`

/** Cartão da tela: use `$flush` quando o conteúdo trouxer o próprio espaçamento (listas e linhas). */
export const Panel = styled.section<{ $flush?: boolean }>`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 12px;
  padding: ${({ $flush }) => ($flush ? '0' : '20px 24px')};
  overflow: hidden;
  h2 {
    margin: 0 0 4px;
    font-size: 16px;
  }
`
