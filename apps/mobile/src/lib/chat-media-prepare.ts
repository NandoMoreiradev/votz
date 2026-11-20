import { requireOptionalNativeModule } from 'expo'
import { CHAT_QUALITY_PROFILES, CHAT_THUMB_MAX_EDGE, fitWithin, safeThumbnail, type ChatMediaQuality } from '@votz/chat-core'

/** O módulo nativo de imagem só existe a partir da próxima versão instalada do app. */
export const imageManipulatorAvailable = () => !!requireOptionalNativeModule('ExpoImageManipulator')

export interface PreparedImage {
  uri: string
  width: number
  height: number
  mimeType: 'image/jpeg'
  /** `data:image/jpeg;base64,...` de poucos KB. */
  thumbnail?: string
}

/**
 * Reduz a foto para o tamanho da qualidade escolhida ANTES de cifrar (o servidor não vê o conteúdo e não consegue
 * comprimir) e gera a miniatura que vai dentro da mensagem. Refazer a imagem apaga os metadados da câmera.
 *
 * Sem o módulo nativo (aplicativo ainda na versão antiga), ou se der qualquer erro, devolve null e o chamador
 * envia a foto como foi escolhida: o envio nunca falha por causa disso.
 */
export async function prepareChatImage(
  asset: { uri: string; width: number; height: number },
  quality: ChatMediaQuality,
): Promise<PreparedImage | null> {
  // Conferir antes de carregar: importar o pacote sem o módulo nativo gera erro (até tela vermelha no app de desenvolvimento).
  if (!imageManipulatorAvailable()) return null
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator')
    const profile = CHAT_QUALITY_PROFILES[quality]
    const fit = fitWithin(asset.width, asset.height, profile.imageMaxEdge)
    const resized = await manipulateAsync(
      asset.uri,
      fit.scaled ? [{ resize: asset.width >= asset.height ? { width: fit.width } : { height: fit.height } }] : [],
      { compress: profile.imageQuality, format: SaveFormat.JPEG },
    )
    let thumbnail: string | undefined
    try {
      const small = fitWithin(resized.width, resized.height, CHAT_THUMB_MAX_EDGE)
      for (const compress of [0.6, 0.4, 0.25]) {
        const thumb = await manipulateAsync(
          resized.uri,
          [{ resize: resized.width >= resized.height ? { width: small.width } : { height: small.height } }],
          { compress, format: SaveFormat.JPEG, base64: true },
        )
        thumbnail = safeThumbnail(`data:image/jpeg;base64,${thumb.base64 ?? ''}`)
        if (thumbnail) break
      }
    } catch {
      /* Sem miniatura: a mensagem vai do mesmo jeito. */
    }
    return { uri: resized.uri, width: resized.width, height: resized.height, mimeType: 'image/jpeg', ...(thumbnail ? { thumbnail } : {}) }
  } catch {
    return null
  }
}
