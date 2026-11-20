import * as FileSystem from 'expo-file-system/legacy'
import { api, json, putFile, uploadFile } from './api'
import { uploadTimeoutMs, type MediaItem } from './report-media'

interface Presigned {
  key: string
  uploadUrl: string
  headers: Record<string, string>
}

/** Vídeo e PDF são grandes: vão direto ao armazenamento. Foto passa pela API, que precisa reduzi-la e tirar o GPS. */
const isDirect = (item: MediaItem) => item.kind === 'video' || item.kind === 'pdf'

async function sizeOf(item: MediaItem): Promise<number | null> {
  if (typeof item.size === 'number' && item.size > 0) return item.size
  try {
    const info = await FileSystem.getInfoAsync(item.uri)
    return info.exists && typeof info.size === 'number' && info.size > 0 ? info.size : null
  } catch {
    return null
  }
}

/**
 * Tenta enviar direto ao armazenamento (pede o endereço, envia o arquivo do disco, confirma). Devolve null
 * quando esse caminho não está disponível (recurso desligado, sem tamanho, rede), para enviar pela API.
 * Se o servidor RECUSAR o arquivo na confirmação, o erro sobe: repetir pela API só repetiria a recusa.
 */
async function uploadDirect(item: MediaItem, signal?: AbortSignal): Promise<{ url: string } | null> {
  const sizeBytes = await sizeOf(item)
  if (!sizeBytes) return null
  let presigned: Presigned
  try {
    presigned = await api<Presigned>('/storage/uploads/presign', json({ mimeType: item.mimeType, sizeBytes }))
  } catch {
    return null
  }
  try {
    await putFile(presigned.uploadUrl, { uri: item.uri }, presigned.headers, { timeoutMs: uploadTimeoutMs(item.kind), signal })
  } catch (error) {
    // Cancelado pela pessoa: não tenta de novo por outro caminho.
    if (error instanceof Error && error.name === 'AbortError' && signal?.aborted) throw error
    return null
  }
  return api<{ url: string }>('/storage/uploads/complete', json({ key: presigned.key }))
}

/** Envia um arquivo de relato. Vídeo e PDF tentam o caminho direto e, se não der, usam o envio pela API. */
export async function uploadReportMedia(item: MediaItem, signal?: AbortSignal): Promise<{ url: string }> {
  if (isDirect(item)) {
    const direct = await uploadDirect(item, signal)
    if (direct) return direct
  }
  return uploadFile<{ url: string }>(
    '/storage/upload/report-media',
    { uri: item.uri, mimeType: item.mimeType },
    { timeoutMs: uploadTimeoutMs(item.kind), signal },
  )
}
