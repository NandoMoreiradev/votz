import { requireOptionalNativeModule } from 'expo'

/**
 * Copia um texto para a área de transferência. O módulo nativo (`expo-clipboard`)
 * só existe a partir da próxima versão instalada do aplicativo; antes disso,
 * a chamada devolve `false` sem carregar nada e sem derrubar a conversa.
 */
export async function copyText(text: string): Promise<boolean> {
  // Conferir antes de carregar: importar o pacote sem o módulo nativo gera erro.
  if (!requireOptionalNativeModule('ExpoClipboard')) return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const clipboard = require('expo-clipboard') as {
      setStringAsync: (value: string) => Promise<boolean>
    }
    await clipboard.setStringAsync(text)
    return true
  } catch {
    return false
  }
}
