import * as Dialog from '@radix-ui/react-dialog'
import styled from 'styled-components'
import { AD_WHATSAPP_COPY } from '@votz/shared-types'

const Overlay = styled(Dialog.Overlay)`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => `${theme.colors.primary}80`};
  z-index: 900;
`

const Content = styled(Dialog.Content)`
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(420px, calc(100vw - 32px));
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  z-index: 901;
`

const Title = styled(Dialog.Title)`
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
`

const Body = styled(Dialog.Description)`
  margin: 0 0 ${({ theme }) => theme.spacing[5]};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.md};
  line-height: 1.5;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing[2]};
`

const Primary = styled.button`
  min-height: 44px;
  padding: 0 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font: inherit;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:hover { opacity: 0.9; }
`

const Secondary = styled.button`
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:hover { background: ${({ theme }) => theme.colors.neutral}; }
`

/**
 * Aviso antes de abrir o WhatsApp de um anúncio: a empresa vai ver o número de telefone da pessoa. Só depois de
 * "Abrir o WhatsApp" o clique é contado (e cobrado); "Agora não" não custa nada ao anunciante.
 */
export function WhatsAppConfirm({ open, advertiserName, onConfirm, onCancel }: { open: boolean; advertiserName: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <Dialog.Portal>
        <Overlay />
        <Content>
          <Title>{AD_WHATSAPP_COPY.title}</Title>
          <Body>{AD_WHATSAPP_COPY.body(advertiserName)}</Body>
          <Actions>
            <Secondary type="button" onClick={onCancel}>{AD_WHATSAPP_COPY.cancel}</Secondary>
            <Primary type="button" onClick={onConfirm}>{AD_WHATSAPP_COPY.continue}</Primary>
          </Actions>
        </Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
