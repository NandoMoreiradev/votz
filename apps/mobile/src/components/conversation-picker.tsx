import { useState } from 'react'
import { View } from 'react-native'
import type { ConversationPerson } from '@votz/shared-types'
import { useConversationContacts } from '../hooks/use-conversations'
import { Button, ErrorText, Field, Label } from './ui'
import { ConversationPersonRow } from './conversation-ui'
import { errorMessage } from '../lib/api'

export function ConversationPicker({
  selected,
  onChange,
  exclude = [],
  max = 99,
}: {
  selected: ConversationPerson[]
  onChange: (people: ConversationPerson[]) => void
  exclude?: string[]
  max?: number
}) {
  const [search, setSearch] = useState('')
  const contacts = useConversationContacts(search)
  return (
    <View style={{ gap: 12 }}>
      <Field
        label="Buscar pessoas"
        placeholder="Nome ou @usuário"
        value={search}
        onChangeText={setSearch}
        maxLength={60}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {selected.length > 0 && (
        <View style={{ gap: 8 }}>
          {selected.map((person) => (
            <Button
              key={person.id}
              title={`${person.name} ×`}
              secondary
              onPress={() => onChange(selected.filter((p) => p.id !== person.id))}
            />
          ))}
        </View>
      )}
      {search.trim().length < 2 && <Label muted>Digite pelo menos 2 caracteres.</Label>}
      {contacts.isFetching && <Label muted>Buscando…</Label>}
      {contacts.isError && (
        <>
          <ErrorText message={errorMessage(contacts.error)} />
          <Button
            title="Tentar novamente"
            secondary
            onPress={() => {
              void contacts.refetch()
            }}
          />
        </>
      )}
      {contacts.data
        ?.filter((person) => !exclude.includes(person.id))
        .map((person) => (
          <ConversationPersonRow
            key={person.id}
            person={person}
            subtitle={person.username ? `@${person.username}` : undefined}
          >
            <Button
              title={selected.some((p) => p.id === person.id) ? 'Selecionado' : 'Selecionar'}
              secondary
              disabled={
                selected.some((p) => p.id === person.id) || (max > 1 && selected.length >= max)
              }
              onPress={() => onChange(max === 1 ? [person] : [...selected, person])}
            />
          </ConversationPersonRow>
        ))}
      {contacts.isSuccess && !contacts.data.length && (
        <Label muted>Nenhuma pessoa encontrada.</Label>
      )}
    </View>
  )
}
