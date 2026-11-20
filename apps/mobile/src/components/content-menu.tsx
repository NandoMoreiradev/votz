import { useState } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import Clipboard from 'lucide-react-native/icons/clipboard'
import Flag from 'lucide-react-native/icons/flag'
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal'
import Trash2 from 'lucide-react-native/icons/trash-2'
import UserCheck from 'lucide-react-native/icons/user-check'
import UserPlus from 'lucide-react-native/icons/user-plus'
import { FlagReason } from '@votz/shared-types'
import { ActionSheet, type SheetItem } from './action-sheet'
import { ChoiceSheet } from './choice-sheet'
import { IconButton } from './ui'
import { useDeletePost, useFlagContent, useFollowing, useToggleFollow } from '../hooks/use-content'
import { errorMessage } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { useSession } from '../lib/session'
import type { ProfileKind } from '../lib/types'
import { theme } from '../theme'

const REASONS: readonly { value: FlagReason; label: string }[] = [
  { value: FlagReason.FALSE_INFO, label: 'Informação falsa ou enganosa' },
  { value: FlagReason.OFFENSIVE, label: 'Ofensa, xingamento ou discurso de ódio' },
  { value: FlagReason.PERSONAL_DATA, label: 'Exposição de dados pessoais de alguém' },
  { value: FlagReason.SEXUAL_OR_VIOLENT, label: 'Conteúdo sexual ou violento' },
  { value: FlagReason.SPAM_OR_ADS, label: 'Spam ou propaganda' },
  { value: FlagReason.FAKE_PROFILE, label: 'Perfil falso ou se passando por outro' },
  { value: FlagReason.COPYRIGHT, label: 'Violação de direitos autorais' },
  { value: FlagReason.OTHER, label: 'Outro motivo' },
]
const icon = { size: 20, color: theme.colors.primary } as const

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
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState(false)
  const own = !!user && !!ownerId && user.id === ownerId
  const followable = !!author && !own && !(author.kind === 'users' && author.id === user?.id)
  const following = useFollowing(author?.kind ?? 'users', author?.id ?? '', open && !!user && followable)
  const toggle = useToggleFollow(author?.kind ?? 'users', author?.id ?? '')
  const remove = useDeletePost(id)
  const flag = useFlagContent()

  const requireUser = (action: () => void) => (user ? action() : router.push('/login'))
  const items: SheetItem[] = [
    { key: 'copy', label: 'Copiar texto', icon: <Clipboard {...icon} />, onPress: () => { void copyText(text).then((done) => { if (!done) Alert.alert('Copiar chega na próxima atualização', 'Por enquanto, use Compartilhar para enviar o texto.') }) } },
    ...(followable ? [{ key: 'follow', label: following.data?.following ? `Deixar de seguir ${author!.name}` : `Seguir ${author!.name}`, icon: following.data?.following ? <UserCheck {...icon} /> : <UserPlus {...icon} />, onPress: () => requireUser(() => toggle.mutate(undefined, { onError: (error) => Alert.alert('Não foi possível concluir', errorMessage(error)) })) }] : []),
    ...(!own ? [{ key: 'flag', label: kind === 'post' ? 'Denunciar publicação' : 'Denunciar relato', icon: <Flag {...icon} color={theme.colors.action} />, danger: true, onPress: () => requireUser(() => setReasons(true)) }] : []),
    ...(own && kind === 'post' ? [{ key: 'delete', label: 'Excluir publicação', icon: <Trash2 {...icon} color={theme.colors.action} />, danger: true, onPress: () => Alert.alert('Excluir esta publicação?', 'Ela some para todo mundo e não dá para desfazer.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate(undefined, { onSuccess: () => { if (router.canGoBack()) router.back() }, onError: (error) => Alert.alert('Não foi possível excluir', errorMessage(error)) }) }]) }] : []),
  ]
  return <>
    <IconButton label={kind === 'post' ? 'Mais opções da publicação' : 'Mais opções do relato'} onPress={() => setOpen(true)}><MoreHorizontal size={20} color={theme.colors.muted} /></IconButton>
    <ActionSheet visible={open} title="Opções" items={items} onClose={() => setOpen(false)} />
    <ChoiceSheet visible={reasons} title="Qual o motivo?" options={REASONS} value={null} onClose={() => setReasons(false)}
      onChange={(reason) => flag.mutate({ targetType: kind === 'post' ? 'POST' : 'REPORT', targetId: id, reason }, { onSuccess: () => Alert.alert('Recebemos sua denúncia', 'A moderação vai analisar. Ela é confidencial.'), onError: (error) => Alert.alert('Não foi possível denunciar', errorMessage(error)) })} />
  </>
}
