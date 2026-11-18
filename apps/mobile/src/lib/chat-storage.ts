import * as SecureStore from 'expo-secure-store'
import { uuid } from 'expo-modules-core'
import { Platform } from 'react-native'
import type {
  ChatCredentials,
  ChatStorage,
  ChatTransportState,
} from '@votz/chat-core'

export async function nativeChatStorage(userId: string) {
  let filesystem: typeof import('expo-file-system')
  try {
    filesystem = await import('expo-file-system')
  } catch {
    throw new Error(
      'Instale a nova build do Votz para ativar as conversas protegidas.',
    )
  }
  const { Directory, File, Paths } = filesystem
  const key = `votz.chat.${userId}`
  const existing = await SecureStore.getItemAsync(key)
  const local: { credentials: ChatCredentials; passphrase: string } = existing
    ? JSON.parse(existing)
    : {
        credentials: {
          id: uuid.v4(),
          secret: `${uuid.v4()}${uuid.v4()}${uuid.v4()}`,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
        },
        passphrase: `${uuid.v4()}${uuid.v4()}${uuid.v4()}`,
      }
  if (!existing)
    await SecureStore.setItemAsync(key, JSON.stringify(local), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
  const directory = new Directory(
    Paths.document,
    'chat',
    userId,
    local.credentials.id,
  )
  directory.create({ intermediates: true, idempotent: true })
  const slots = [
    new File(directory, 'transport-a.json'),
    new File(directory, 'transport-b.json'),
  ]
  let sequence = 0
  type State = ChatTransportState & { sequence: number }
  // Alternating committed snapshots preserve the last complete encrypted queue
  // if the process dies during a write. Neither slot contains plaintext messages.
  const storage: ChatStorage = {
    load: async () => {
      const candidates: State[] = []
      for (const file of slots) {
        try {
          if (file.exists) {
            const value = JSON.parse(await file.text()) as State
            if (
              Number.isSafeInteger(value.sequence) &&
              Array.isArray(value.pending)
            )
              candidates.push(value)
          }
        } catch {
          /* Keep the last complete slot. */
        }
      }
      const latest = candidates.sort((a, b) => b.sequence - a.sequence)[0]
      sequence = latest?.sequence || 0
      return latest || { pending: [] }
    },
    save: async (value) => {
      const next = sequence + 1
      slots[next % 2].write(JSON.stringify({ ...value, sequence: next }))
      sequence = next
    },
  }
  const keys = new Directory(directory, 'keys')
  return {
    ...local,
    storage,
    existing: keys.exists,
    storePath: keys.uri.replace(/^file:\/\//, ''),
  }
}
