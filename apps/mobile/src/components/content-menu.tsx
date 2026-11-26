import { useState } from 'react'
import { router } from 'expo-router'
import Clipboard from 'lucide-react-native/icons/clipboard'
import Flag from 'lucide-react-native/icons/flag'
import HelpCircle from 'lucide-react-native/icons/circle-help'
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal'
import Trash2 from 'lucide-react-native/icons/trash-2'
import UserCheck from 'lucide-react-native/icons/user-check'
import UserPlus from 'lucide-react-native/icons/user-plus'
import { FlagReason } from '@votz/shared-types'
import { ActionSheet, type SheetItem } from './action-sheet'
import { ChoiceSheet } from './choice-sheet'
import { ConfirmModal } from './confirm-modal'
import { IconButton } from './ui'
import { useDeletePost, useFlagContent, useFollowing, useToggleFollow } from '../hooks/use-content'
import { useContextNotesEnabled, useRequestContext } from '../hooks/use-context-notes'
import { errorMessage } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { ProfileKind } from '../lib/types'

export const FLAG_REASONS: readonly { value: FlagReason; label: string }[] = [
  { value: FlagReason.FALSE_INFO, label: 'Informação falsa ou enganosa' },
  { value: FlagReason.OFFENSIVE, label: 'Ofensa, xingamento ou discurso de ódio' },
  { value: FlagReason.PERSONAL_DATA, label: 'Exposição de dados pessoais de alguém' },
  { value: FlagReason.SEXUAL_OR_VIOLENT, label: 'Conteúdo sexual ou violento' },
  { value: FlagReason.SPAM_OR_ADS, label: 'Spam ou propaganda' },
  { value: FlagReason.FAKE_PROFILE, label: 'Perfil falso ou se passando por outro' },
  { value: FlagReason.COPYRIGHT, label: 'Violação de direitos autorais' },
  { value: FlagReason.OTHER, label: 'Outro motivo' },
]

/**
 * Menu "⋯" de uma publicação ou relato. Quem é autor pode excluir a publicação;
 * quem está só vendo pode seguir o autor, copiar o texto e denunciar.
 */
export function ContentMenu({ kind, id, ownerId, author, text }: {
  kind: 'post' | 'report'
  id: string
  /** Id do usuário que escreveu (nulo em relato anônimo). */
  ownerId?: string | null
  /** Perfil a seguir pelo menu (só em publicações). */
  author?: { kind: ProfileKind; id: string; name: string }
  text: string
}) {
  const user = useSession((s) => s.user)
  const { colors } = useAppTheme()
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const own = !!user && !!ownerId && user.id === ownerId
  const followable = !!author && !own && !(author.kind === 'users' && author.id === user?.id)
  const following = useFollowing(author?.kind ?? 'users', author?.id ?? '', open && !!user && followable)
  const toggle = useToggleFollow(author?.kind ?? 'users', author?.id ?? '')
  const remove = useDeletePost(id)
  const flag = useFlagContent()
  const contextEnabled = useContextNotesEnabled()
  const askContext = useRequestContext()

  const icon = { size: 20, color: colors.primary } as const
  const requireUser = (action: () => void) => (user ? action() : router.push('/login'))
  const items: SheetItem[] = [
    { key: 'copy', label: 'Copiar texto', icon: <Clipboard {...icon} />, onPress: () => { void copyText(text).then((done) => { if (!done) setNotice({ title: 'Copiar chega na próxima atualização', message: 'Por enquanto, use Compartilhar para enviar o texto.' }) }) } },
    ...(followable ? [{ key: 'follow', label: following.data?.following ? `Deixar de seguir ${author!.name}` : `Seguir ${author!.name}`, icon: following.data?.following ? <UserCheck {...icon} /> : <UserPlus {...icon} />, onPress: () => requireUser(() => toggle.mutate(undefined, { onError: (error) => setNotice({ title: 'Não foi possível concluir', message: errorMessage(error) }) })) }] : []),
    ...(!own && contextEnabled ? [{ key: 'context', label: 'Pedir contexto', icon: <HelpCircle {...icon} />, onPress: () => requireUser(() => askContext.mutate({ targetType: kind === 'post' ? 'POST' : 'REPORT', targetId: id }, { onSuccess: () => setNotice({ title: 'Pedido enviado', message: 'Quem colabora com contexto vai ver.' }), onError: (error) => setNotice({ title: 'Não foi possível pedir contexto', message: errorMessage(error) }) })) }] : []),
    ...(!own ? [{ key: 'flag', label: kind === 'post' ? 'Denunciar publicação' : 'Denunciar relato', icon: <Flag size={20} color={colors.action} />, danger: true, onPress: () => requireUser(() => setReasons(true)) }] : []),
    ...(own && kind === 'post' ? [{ key: 'delete', label: 'Excluir publicação', icon: <Trash2 size={20} color={colors.action} />, danger: true, onPress: () => setConfirmDelete(true) }] : []),
  ]
  return <>
    <IconButton label={kind === 'post' ? 'Mais opções da publicação' : 'Mais opções do relato'} onPress={() => setOpen(true)}><MoreHorizontal size={20} color={colors.muted} /></IconButton>
    <ActionSheet visible={open} title="Opções" items={items} onClose={() => setOpen(false)} />
    <ChoiceSheet visible={reasons} title="Qual o motivo?" options={FLAG_REASONS} value={null} onClose={() => setReasons(false)}
      onChange={(reason) => flag.mutate({ targetType: kind === 'post' ? 'POST' : 'REPORT', targetId: id, reason }, { onSuccess: () => setNotice({ title: 'Recebemos sua denúncia', message: 'A moderação vai analisar. Ela é confidencial.' }), onError: (error) => setNotice({ title: 'Não foi possível denunciar', message: errorMessage(error) }) })} />
    <ConfirmModal
      visible={confirmDelete}
      title="Excluir esta publicação?"
      message="Ela some para todo mundo e não dá para desfazer."
      cancelLabel="Cancelar"
      confirmLabel="Excluir"
      danger
      loading={remove.isPending}
      onClose={() => setConfirmDelete(false)}
      onConfirm={() =>
        remove.mutate(undefined, {
          onSuccess: () => {
            setConfirmDelete(false)
            if (router.canGoBack()) router.back()
          },
          onError: (error) => {
            setConfirmDelete(false)
            setNotice({ title: 'Não foi possível excluir', message: errorMessage(error) })
          },
        })
      }
    />
    <ConfirmModal
      visible={!!notice}
      title={notice?.title ?? ''}
      message={notice?.message}
      onClose={() => setNotice(null)}
    />
  </>
}
