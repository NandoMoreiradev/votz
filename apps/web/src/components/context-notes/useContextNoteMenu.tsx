import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { NotePencil, Question } from '@phosphor-icons/react'
import { ContextNoteTargetType } from '@votz/shared-types'
import {
  errorText,
  useContextNotesEnabled,
  useContributorStatus,
  useRequestContext,
} from '../../hooks/useContextNotes'
import { useAuthStore } from '../../store/auth.store'
import type { MenuItem } from '../ui/OptionsMenu'
import { WriteContextNoteModal } from './WriteContextNoteModal'

const Toast = styled.div`
  position: fixed;
  left: 50%;
  bottom: ${({ theme }) => theme.spacing[6]};
  transform: translateX(-50%);
  z-index: 1300;
  max-width: calc(100vw - 32px);
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

/**
 * Itens do menu "⋯" do Contexto da Comunidade para uma publicação ou relato, mais o que precisa ser desenhado
 * (janela de escrever e aviso curto). Fica tudo aqui para o card só somar os itens e desenhar `node`.
 * Com o recurso desligado, não devolve item nenhum.
 */
export function useContextNoteMenu(
  targetType: ContextNoteTargetType,
  targetId: string,
  isOwner: boolean,
): { items: MenuItem[]; node: ReactNode } {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const enabled = useContextNotesEnabled()
  const { data: status } = useContributorStatus()
  const request = useRequestContext()
  const [writeOpen, setWriteOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(t)
  }, [toast])

  if (!enabled) return { items: [], node: null }

  const items: MenuItem[] = []
  if (!isOwner) {
    items.push({
      key: 'ask-context',
      label: 'Pedir contexto',
      icon: <Question size={18} />,
      onSelect: () => {
        if (!user) {
          navigate('/entrar')
          return
        }
        request.mutate(
          { targetType, targetId },
          {
            onSuccess: () => setToast('Pedido enviado. Quem colabora com contexto vai ver.'),
            onError: (err) => {
              const status409 = (err as { response?: { status?: number } })?.response?.status === 409
              setToast(status409 ? 'Você já pediu contexto aqui.' : errorText(err))
            },
          },
        )
      },
    })
    if (user && status?.canWrite) {
      items.push({ key: 'write-context', label: 'Escrever contexto', icon: <NotePencil size={18} />, onSelect: () => setWriteOpen(true) })
    } else if (user && status && !status.joined && !status.blockedReason) {
      items.push({ key: 'join-context', label: 'Colaborar com contexto', icon: <NotePencil size={18} />, onSelect: () => navigate('/contexto') })
    }
  }

  const node = (
    <>
      <WriteContextNoteModal isOpen={writeOpen} targetType={targetType} targetId={targetId} onClose={() => setWriteOpen(false)} />
      {toast && <Toast role="status">{toast}</Toast>}
    </>
  )
  return { items, node }
}

/**
 * Para telas que montam o menu "⋯" no meio do JSX (sem lugar seguro para um hook): entrega os itens do Contexto
 * como função-filha e desenha a janela e o aviso ao lado.
 */
export function ContextNoteMenuScope({
  targetType,
  targetId,
  isOwner,
  children,
}: {
  targetType: ContextNoteTargetType
  targetId: string
  isOwner: boolean
  children: (items: MenuItem[]) => ReactNode
}) {
  const { items, node } = useContextNoteMenu(targetType, targetId, isOwner)
  return (
    <>
      {children(items)}
      {node}
    </>
  )
}
