import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { Check, Copy, ShareNetwork, UsersThree, X } from '@phosphor-icons/react'
import { useAuthStore } from '../../store/auth.store'

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

const Dialog = styled.div`
  width: 100%;
  max-width: 460px;
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
  border-radius: ${({ theme }) => theme.radii.sm};
  display: inline-flex;

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background: ${({ theme }) => theme.colors.neutral};
  }
`

const HeaderIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(230, 57, 70, 0.1);
  color: ${({ theme }) => theme.colors.action};
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Subtitle = styled.p`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin-bottom: 20px;
`

const LinkBox = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 6px 8px 6px 12px;
  margin-bottom: 16px;
`

const LinkInput = styled.input`
  flex: 1;
  border: none;
  background: transparent;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8rem;
  color: ${({ theme }) => theme.colors.text};
  outline: none;
  min-width: 0;
`

const CopyBtn = styled.button<{ $copied?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $copied, theme }) => ($copied ? theme.colors.positive : theme.colors.primary)};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.9;
  }
`

const ShareLabel = styled.div`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
`

const ShareGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const ShareLink = styled.a<{ $bg: string }>`
  flex: 1;
  min-width: 110px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ $bg }) => $bg};
  color: #fff;
  font-size: 0.85rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.9;
  }
`

const NativeShareBtn = styled.button`
  width: 100%;
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.neutral};
  }
`

interface InviteVotzModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InviteVotzModal({ isOpen, onClose }: InviteVotzModalProps) {
  const user = useAuthStore((s) => s.user)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://votz.com.br'
  const inviteUrl = user ? `${origin}/cadastro?convite=${user.id}` : `${origin}/cadastro`
  const shareText = 'Estou usando o Votz para registrar problemas da nossa cidade e cobrar soluções de órgãos públicos e políticos. Entre também:'
  const fullMessage = `${shareText} ${inviteUrl}`

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(fullMessage)}`
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(shareText)}`
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(inviteUrl)}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback silencioso caso clipboard esteja bloqueado
    }
  }

  async function handleNativeShare() {
    if (!navigator.share) return
    try {
      await navigator.share({
        title: 'Convite para o Votz',
        text: shareText,
        url: inviteUrl,
      })
    } catch {
      // Usuário cancelou o compartilhamento
    }
  }

  return (
    <Overlay onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
      <Dialog onClick={(e) => e.stopPropagation()}>
        <CloseBtn type="button" onClick={onClose} aria-label="Fechar">
          <X size={20} weight="bold" />
        </CloseBtn>

        <HeaderIcon>
          <UsersThree size={24} weight="bold" />
        </HeaderIcon>

        <Title id="invite-modal-title">Convidar pessoas para o Votz</Title>
        <Subtitle>
          Quanto mais cidadãos participando, maior a pressão coletiva por respostas e soluções reais. Compartilhe seu link de convite:
        </Subtitle>

        <LinkBox>
          <LinkInput type="text" readOnly value={inviteUrl} onClick={(e) => e.currentTarget.select()} />
          <CopyBtn type="button" $copied={copied} onClick={handleCopy}>
            {copied ? <Check size={15} weight="bold" /> : <Copy size={15} weight="bold" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </CopyBtn>
        </LinkBox>

        <ShareLabel>Enviar por</ShareLabel>
        <ShareGrid>
          <ShareLink href={whatsappUrl} target="_blank" rel="noopener noreferrer" $bg="#25D366">
            WhatsApp
          </ShareLink>
          <ShareLink href={telegramUrl} target="_blank" rel="noopener noreferrer" $bg="#229ED9">
            Telegram
          </ShareLink>
          <ShareLink href={xUrl} target="_blank" rel="noopener noreferrer" $bg="#0F1419">
            X / Twitter
          </ShareLink>
        </ShareGrid>

        {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
          <NativeShareBtn type="button" onClick={handleNativeShare}>
            <ShareNetwork size={16} weight="bold" />
            Mais opções de compartilhamento
          </NativeShareBtn>
        )}
      </Dialog>
    </Overlay>
  )
}
