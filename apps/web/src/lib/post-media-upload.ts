import axios from 'axios'
import type { UploadedMediaAssetDto } from '@votz/shared-types'
import { api } from './api'

/** Vídeo é grande: vai direto ao armazenamento. Foto e GIF passam pela API (a foto perde os metadados lá). */
const DIRECT_TYPES = new Set(['video/mp4', 'video/quicktime'])

interface Presigned {
  id: string
  uploadUrl: string
  headers: Record<string, string>
}

type Progress = (percent: number) => void

const percent = (onProgress?: Progress) => (event: { loaded: number; total?: number }) => {
  if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
}

async function uploadThroughApi(file: File, onProgress?: Progress): Promise<UploadedMediaAssetDto> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<UploadedMediaAssetDto>('/media/uploads', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: percent(onProgress),
  })
  return data
}

/**
 * Envio direto do vídeo ao armazenamento (pede o endereço, envia, confirma). Devolve null quando o caminho
 * não está disponível (recurso desligado, bucket sem CORS, rede), para o chamador enviar pela API. Se o
 * servidor RECUSAR o vídeo na confirmação, o erro sobe: enviar de novo só repetiria a recusa.
 */
async function uploadDirect(file: File, onProgress?: Progress): Promise<UploadedMediaAssetDto | null> {
  let presigned: Presigned
  try {
    presigned = (await api.post<Presigned>('/media/uploads/presign', { mimeType: file.type, sizeBytes: file.size })).data
  } catch {
    return null
  }
  try {
    // axios "puro", sem o token da API nem a URL base: o endereço já vem assinado para o bucket.
    await axios.put(presigned.uploadUrl, file, { headers: presigned.headers, onUploadProgress: percent(onProgress) })
  } catch {
    return null
  }
  const { data } = await api.post<UploadedMediaAssetDto>(`/media/uploads/${presigned.id}/complete`)
  return data
}

/** Envia uma foto, GIF ou vídeo de publicação. O formato e o enquadramento vão depois, ao publicar. */
export async function uploadPostMedia(file: File, onProgress?: Progress): Promise<UploadedMediaAssetDto> {
  if (DIRECT_TYPES.has(file.type)) {
    const direct = await uploadDirect(file, onProgress)
    if (direct) return direct
  }
  return uploadThroughApi(file, onProgress)
}

/** A pessoa tirou o arquivo antes de publicar: apaga no servidor (sem travar a tela se falhar). */
export function discardPostMedia(id: string): void {
  void api.delete(`/media/uploads/${id}`).catch(() => undefined)
}
