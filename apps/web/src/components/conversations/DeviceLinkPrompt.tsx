import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import styled from 'styled-components'
import { ShieldCheck, X } from '@phosphor-icons/react'
import { ENROLL_WAITING, deviceRequestText } from '@votz/chat-core'
import {
  useChatDeviceAction,
  useChatDeviceStatus,
  useChatDevices,
} from '../../hooks/useChatDevices'

const Dock = styled.aside`
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 60;
  width: min(380px, calc(100vw - 24px));
  padding: 16px 18px;
  border-radius: 14px;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  display: grid;
  gap: 10px;
  color: ${({ theme }) => theme.colors.text};
`
const Head = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
`
const IconWrap = styled.span`
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.primary};
`
const Title = styled.strong`
  display: block;
  font-size: 14px;
  line-height: 1.3;
`
const Body = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.muted};
`
const Close = styled.button`
  margin-left: auto;
  border: 0;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`
const Actions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`
const Primary = styled.button`
  flex: 1;
  min-width: 110px;
  height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`
const Secondary = styled.button`
  flex: 1;
  min-width: 100px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 9px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`

/**
 * Aviso global fora das conversas:
 * 1) Se este navegador já é um aparelho ativo e outro aparelho pede acesso,
 *    mostra o pedido em tempo real para Permitir/Negar em qualquer tela.
 * 2) Se este navegador é novo e a conta já usa mensagens em outro aparelho,
 *    oferece um atalho discreto para conectar agora ou depois.
 */
export function DeviceLinkPrompt() {
  const location = useLocation()
  const status = useChatDeviceStatus()
  const isActive = status.data?.status === 'active'
  const devices = useChatDevices(isActive)
  const action = useChatDeviceAction()
  const [dismissedLinkIds, setDismissedLinkIds] = useState<string[]>([])
  const [dismissedBanner, setDismissedBanner] = useState(false)

  const inDevicesPage = location.pathname.startsWith('/conversas/aparelhos')
  const inConversations = location.pathname.startsWith('/conversas')

  if (!status.data?.enabled) return null

  const pendingLink = isActive
    ? (devices.data?.links || []).find(
        (link) => !dismissedLinkIds.includes(link.id),
      )
    : undefined

  if (pendingLink && !inDevicesPage) {
    const request = deviceRequestText(pendingLink)
    return (
      <Dock role="alert" aria-label={request.title}>
        <Head>
          <IconWrap aria-hidden="true">
            <ShieldCheck size={20} weight="duotone" />
          </IconWrap>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title>{request.title}</Title>
          </div>
          <Close
            type="button"
            aria-label="Fechar aviso"
            onClick={() =>
              setDismissedLinkIds((prev) => [...prev, pendingLink.id])
            }
          >
            <X size={16} />
          </Close>
        </Head>
        <Body>{request.text}</Body>
        <Actions>
          <Primary
            type="button"
            disabled={action.isPending}
            onClick={() =>
              action.mutate({ type: 'approve', id: pendingLink.id })
            }
          >
            {request.allow}
          </Primary>
          <Secondary
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate({ type: 'deny', id: pendingLink.id })}
          >
            {request.deny}
          </Secondary>
        </Actions>
      </Dock>
    )
  }

  if (
    status.data.status === 'needs_approval' &&
    !inConversations &&
    !dismissedBanner
  ) {
    return (
      <Dock role="status" aria-label={ENROLL_WAITING.bannerTitle}>
        <Head>
          <IconWrap aria-hidden="true">
            <ShieldCheck size={20} weight="duotone" />
          </IconWrap>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Title>{ENROLL_WAITING.bannerTitle}</Title>
          </div>
          <Close
            type="button"
            aria-label="Fechar aviso"
            onClick={() => setDismissedBanner(true)}
          >
            <X size={16} />
          </Close>
        </Head>
        <Body>{ENROLL_WAITING.bannerText}</Body>
        <Actions>
          <Primary as={Link} to="/conversas">
            {ENROLL_WAITING.bannerAction}
          </Primary>
          <Secondary type="button" onClick={() => setDismissedBanner(true)}>
            {ENROLL_WAITING.bannerDismiss}
          </Secondary>
        </Actions>
      </Dock>
    )
  }

  return null
}
