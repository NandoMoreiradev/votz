import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import ArrowLeft from 'lucide-react-native/icons/arrow-left'
import EllipsisVertical from 'lucide-react-native/icons/ellipsis-vertical'
import Info from 'lucide-react-native/icons/info'
import Search from 'lucide-react-native/icons/search'
import Users from 'lucide-react-native/icons/users'
import type { ConversationPerson } from '@votz/shared-types'
import { MenuItem, PopoverMenu } from './chat-sheet'
import { Avatar, IconButton } from './ui'
import { theme } from '../theme'

/**
 * Cabeçalho da conversa no estilo dos aplicativos de mensagem: seta, avatar,
 * nome com a linha de estado (digitando, visto por último) e menu de três pontos.
 * Tocar no avatar ou no nome abre os detalhes.
 */
export function ChatHeader({
  title,
  group,
  person,
  status,
  typing,
  onSearch,
  onDetails,
  detailsLabel = 'Detalhes da conversa',
  receipts,
  extraMenu,
}: {
  title: string
  group: boolean
  person?: ConversationPerson
  status: string
  typing: boolean
  onSearch: () => void
  onDetails: () => void
  detailsLabel?: string
  /** Opção de confirmação de leitura, mostrada dentro do menu. */
  receipts?: {
    label: string
    enabled: boolean
    disabled: boolean
    onToggle: () => void
  }
  extraMenu?: (close: () => void) => ReactNode
}) {
  const [menu, setMenu] = useState(false)
  return (
    <View style={styles.bar}>
      <IconButton
        label="Voltar"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      >
        <ArrowLeft size={23} color={theme.colors.primary} />
      </IconButton>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Detalhes da conversa com ${title}`}
        onPress={onDetails}
        style={styles.identity}
      >
        {group ? (
          <View style={styles.groupAvatar}>
            <Users size={20} color={theme.colors.primary} />
          </View>
        ) : (
          <Avatar name={person?.name || title} uri={person?.avatarUrl} size={40} />
        )}
        <View style={styles.names}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.status, typing && { color: theme.colors.positive }]}
          >
            {status}
          </Text>
        </View>
      </Pressable>
      <IconButton label="Buscar na conversa" onPress={onSearch}>
        <Search size={20} color={theme.colors.primary} />
      </IconButton>
      <IconButton label="Mais opções" onPress={() => setMenu(true)}>
        <EllipsisVertical size={21} color={theme.colors.primary} />
      </IconButton>
      <PopoverMenu visible={menu} onClose={() => setMenu(false)}>
        <MenuItem
          label={detailsLabel}
          icon={<Info size={20} color={theme.colors.muted} />}
          onPress={() => {
            setMenu(false)
            onDetails()
          }}
        />
        {extraMenu?.(() => setMenu(false))}
        {receipts && (
          <View style={styles.receipts}>
            <Text style={styles.receiptsText}>{receipts.label}</Text>
            <Switch
              accessibilityLabel={receipts.label}
              value={receipts.enabled}
              disabled={receipts.disabled}
              onValueChange={receipts.onToggle}
              trackColor={{ true: theme.colors.action }}
              thumbColor={theme.colors.surface}
            />
          </View>
        )}
      </PopoverMenu>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 58,
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 50,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.soft,
  },
  names: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontFamily: theme.fonts.heading,
    fontSize: 17,
    color: theme.colors.primary,
  },
  status: {
    fontFamily: theme.fonts.body,
    fontSize: 12,
    color: theme.colors.muted,
  },
  receipts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 18,
  },
  receiptsText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
  },
})
