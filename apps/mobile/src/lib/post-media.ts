// Envio de fotos e vídeos de publicação no padrão de formatos (docs/dev/padrao-de-midia-plano-2026-11-21.md).
// O arquivo sobe assim que é escolhido; o formato e o enquadramento vão depois, ao publicar.
import * as FileSystem from 'expo-file-system/legacy'
import type { UploadedMediaAssetDto } from '@votz/shared-types'
import { api, json, putFile, uploadFile } from './api'
import { uploadTimeoutMs, type MediaItem } from './report-media'

interface Presigned {
  id: string
  uploadUrl: string
  headers: Record<string, string>
}

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
 * Vídeo vai direto ao armazenamento (pede o endereço, envia do disco, confirma). Devolve null quando esse caminho
 * não está disponível (recurso desligado, sem tamanho, rede), para enviar pela API. Se o servidor RECUSAR o vídeo
 * na confirmação, o erro sobe: repetir pela API só repetiria a recusa.
 */
async function uploadDirect(item: MediaItem, signal?: AbortSignal): Promise<UploadedMediaAssetDto | null> {
  const sizeBytes = await sizeOf(item)
  if (!sizeBytes) return null
  let presigned: Presigned
  try {
    presigned = await api<Presigned>('/media/uploads/presign', json({ mimeType: item.mimeType, sizeBytes }))
  } catch {
    return null
  }
  try {
    await putFile(presigned.uploadUrl, { uri: item.uri }, presigned.headers, { timeoutMs: uploadTimeoutMs(item.kind), signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError' && signal?.aborted) throw error
    return null
  }
  return api<UploadedMediaAssetDto>(`/media/uploads/${presigned.id}/complete`, { method: 'POST' })
}

export async function uploadPostMedia(item: MediaItem, signal?: AbortSignal): Promise<UploadedMediaAssetDto> {
  if (item.kind === 'video') {
    const direct = await uploadDirect(item, signal)
    if (direct) return direct
  }
  return uploadFile<UploadedMediaAssetDto>('/media/uploads', { uri: item.uri, mimeType: item.mimeType }, { timeoutMs: uploadTimeoutMs(item.kind), signal })
}

/** A pessoa tirou o arquivo antes de publicar: apaga no servidor (sem travar a tela se falhar). */
export function discardPostMedia(id: string): void {
  void api(`/media/uploads/${id}`, { method: 'DELETE' }).catch(() => undefined)
}
