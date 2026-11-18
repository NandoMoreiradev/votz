import { useRef, useState } from 'react'
import { router } from 'expo-router'
import { uuid } from 'expo-modules-core'
import { View } from 'react-native'
import type { ConversationPerson } from '@votz/shared-types'
import { ConversationGate } from '../../components/conversation-ui'
import { ConversationPicker } from '../../components/conversation-picker'
import { FormScroll, Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Field, Label, TabStrip } from '../../components/ui'
import { useConversationAction, useConversationScope } from '../../hooks/use-conversations'
import { useSession } from '../../lib/session'
import { errorMessage } from '../../lib/api'

function Create() {
  const [mode, setMode] = useState<'direct' | 'group'>('direct')
  const [title, setTitle] = useState('')
  const [people, setPeople] = useState<ConversationPerson[]>([])
  const submission = useRef<{ signature: string; id: string } | null>(null)
  const action = useConversationAction()
  const { user } = useConversationScope()
  async function submit() {
    if (action.isPending || !people.length || (mode === 'group' && !title.trim())) return
    const signature = JSON.stringify([title.trim(), people.map((p) => p.id).sort()])
    if (!submission.current || submission.current.signature !== signature)
      submission.current = { signature, id: uuid.v4() }
    const actor = user!.id
    try {
      const result = await action.mutateAsync({
        path: mode === 'group' ? '/groups' : '/direct',
        body:
          mode === 'group'
            ? {
                clientRequestId: submission.current.id,
                title: title.trim(),
                memberIds: people.map((p) => p.id),
              }
            : { targetUserId: people[0].id },
      })
      if (useSession.getState().user?.id === actor)
        router.replace({ pathname: '/conversation/[id]', params: { id: result.id } })
    } catch {
      /* Preserve the form and idempotency key on a failed request. */
    }
  }
  return (
    <>
      <TabStrip
        value={mode}
        onChange={(value) => {
          if (!action.isPending) {
            setMode(value)
            setPeople([])
            action.reset()
          }
        }}
        tabs={[
          { value: 'direct', label: 'Uma pessoa' },
          { value: 'group', label: 'Criar grupo' },
        ]}
      />
      <FormScroll>
        {mode === 'group' && (
          <Field
            label="Nome do grupo"
            placeholder="Ex.: Comunidade do Centro"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            editable={!action.isPending}
          />
        )}
        <View pointerEvents={action.isPending ? 'none' : 'auto'}>
          <ConversationPicker
            selected={people}
            onChange={setPeople}
            max={mode === 'group' ? 99 : 1}
          />
        </View>
        <Label muted>
          {mode === 'group'
            ? 'As pessoas recebem um convite e escolhem se querem participar.'
            : 'A pessoa receberá uma solicitação de conversa.'}
        </Label>
        <ErrorText message={action.isError ? errorMessage(action.error) : undefined} />
        <Button
          title={mode === 'group' ? 'Criar grupo' : 'Continuar'}
          loading={action.isPending}
          disabled={!people.length || (mode === 'group' && !title.trim())}
          onPress={() => {
            void submit()
          }}
        />
      </FormScroll>
    </>
  )
}
export default function NewConversationScreen() {
  return (
    <Screen>
      <Toolbar title="Nova conversa" back />
      <ConversationGate>
        <Create />
      </ConversationGate>
    </Screen>
  )
}
