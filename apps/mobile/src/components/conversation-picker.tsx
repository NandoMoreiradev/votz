import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Check from 'lucide-react-native/icons/check'
import Search from 'lucide-react-native/icons/search'
import type { ConversationPerson } from '@votz/shared-types'
import { router } from 'expo-router'
import { useConversationContacts, useConversationStartOptions } from '../hooks/use-conversations'
import { Button, ErrorText, Field, Label } from './ui'
import { ConversationPersonRow } from './conversation-ui'
import { errorMessage } from '../lib/api'
import { theme } from '../theme'

/**
 * Busca de pessoas. Com `onPick`, tocar numa pessoa já a escolhe (conversa individual).
 * Sem ele, tocar marca e desmarca (grupo e convites), e as escolhidas aparecem no topo.
 */
export function ConversationPicker({
  selected,
  onChange,
  onPick,
  exclude = [],
  max = 99,
}: {
  selected: ConversationPerson[]
  onChange: (people: ConversationPerson[]) => void
  onPick?: (person: ConversationPerson) => void
  exclude?: string[]
  max?: number
}) {
  const [search, setSearch] = useState('')
  const contacts = useConversationContacts(search)
  // Conversa individual: começa por quem a pessoa segue (pessoas, seguidores e páginas).
  const start = useConversationStartOptions(!!onPick)
  const term = search.trim().toLowerCase()
  const typing = term.length >= 2
  const match = (name: string, username: string | null) =>
    !typing || name.toLowerCase().includes(term) || (username ?? '').toLowerCase().includes(term.replace(/^@/, ''))
  const following = (start.data?.following ?? []).filter((p) => !exclude.includes(p.id) && match(p.name, p.username))
  const followers = (start.data?.followers ?? []).filter((p) => !exclude.includes(p.id) && match(p.name, p.username))
  const pages = (start.data?.pages ?? []).filter((p) => match(p.name, p.username))
  const personRow = (person: ConversationPerson) => (
    <ConversationPersonRow key={person.id} person={person} title={person.name} subtitle={person.username ? `@${person.username}` : undefined} onPress={() => onPick?.(person)} />
  )
  const toggle = (person: ConversationPerson) => {
    if (onPick) return onPick(person)
    if (selected.some((p) => p.id === person.id))
      return onChange(selected.filter((p) => p.id !== person.id))
    if (selected.length >= max) return
    onChange(max === 1 ? [person] : [...selected, person])
  }
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.search}>
        <Search size={18} color={theme.colors.muted} />
        <View style={{ flex: 1 }}>
          <Field
            bare
            accessibilityLabel="Buscar pessoas"
            placeholder="Nome ou @usuário"
            value={search}
            onChangeText={setSearch}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ paddingVertical: 12, fontSize: 16, backgroundColor: 'transparent' }}
          />
        </View>
      </View>
      {selected.length > 0 && !onPick && (
        <View style={styles.chips}>
          {selected.map((person) => (
            <Pressable
              key={person.id}
              accessibilityRole="button"
              accessibilityLabel={`Tirar ${person.name}`}
              onPress={() => onChange(selected.filter((p) => p.id !== person.id))}
              style={styles.chip}
            >
              <Text style={styles.chipText} numberOfLines={1}>
                {person.name} ×
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {onPick && following.length > 0 && (
        <View><View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Label muted>Quem você segue</Label></View>{following.map(personRow)}</View>
      )}
      {onPick && followers.length > 0 && (
        <View><View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Label muted>Seguidores</Label></View>{followers.map(personRow)}</View>
      )}
      {onPick && pages.length > 0 && (
        <View>
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Label muted>Páginas que você segue</Label></View>
          {pages.map((page) => (
            <ConversationPersonRow
              key={`${page.orgType}:${page.orgId}`}
              person={{ id: page.orgId, name: page.name, username: page.username, avatarUrl: page.avatarUrl, verified: false }}
              title={page.name}
              subtitle={page.username ? `@${page.username}` : undefined}
              onPress={() => router.push({ pathname: '/conversation/page', params: { orgType: page.orgType, orgId: page.orgId, name: page.name } })}
            />
          ))}
        </View>
      )}
      {onPick && typing && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><Label muted>Mais pessoas do Votz</Label></View>
      )}
      {!typing && !onPick && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Label muted>Digite pelo menos 2 letras do nome ou do @usuário.</Label>
        </View>
      )}
      {!typing && onPick && start.isSuccess && !following.length && !followers.length && !pages.length && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Label muted>Você ainda não segue ninguém. Digite pelo menos 2 letras do nome ou do @usuário para buscar.</Label>
        </View>
      )}
      {contacts.isFetching && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Label muted>Buscando…</Label>
        </View>
      )}
      {contacts.isError && (
        <View style={{ padding: 16, gap: 10 }}>
          <ErrorText message={errorMessage(contacts.error)} />
          <Button
            title="Tentar novamente"
            secondary
            onPress={() => {
              void contacts.refetch()
            }}
          />
        </View>
      )}
      {contacts.data
        ?.filter((person) => !exclude.includes(person.id))
        .map((person) => {
          const chosen = selected.some((p) => p.id === person.id)
          return (
            <ConversationPersonRow
              key={person.id}
              person={person}
              title={person.name}
              subtitle={person.username ? `@${person.username}` : undefined}
              onPress={() => toggle(person)}
              trailing={
                !onPick ? (
                  <View style={[styles.mark, chosen && styles.markOn]}>
                    {chosen && <Check size={15} color={theme.colors.surface} />}
                  </View>
                ) : undefined
              }
            />
          )
        })}
      {contacts.isSuccess && !contacts.data.length && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Label muted>Nenhuma pessoa encontrada.</Label>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: theme.colors.soft,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  chip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: theme.colors.tint,
  },
  chipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.action,
  },
  mark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markOn: {
    borderColor: theme.colors.action,
    backgroundColor: theme.colors.action,
  },
})
