import axios from 'axios'
import { api } from './api'

export interface UploadedReportMedia {
  url: string
}

/** Vídeo e PDF são grandes: vão direto ao armazenamento. Foto passa pela API, que precisa reduzi-la e tirar o GPS. */
const DIRECT_TYPES = new Set(['video/mp4', 'video/quicktime', 'application/pdf'])

interface Presigned {
  key: string
  uploadUrl: string
  headers: Record<string, string>
}

async function uploadThroughApi(file: File, onProgress?: (percent: number) => void): Promise<UploadedReportMedia> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<UploadedReportMedia>('/storage/upload/report-media', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    },
  })
  return data
}

/**
 * Tenta enviar o arquivo direto ao armazenamento (pede o endereço, envia, confirma). Devolve null quando
 * não deu para usar esse caminho (recurso desligado, bucket sem CORS, rede), para o chamador enviar pela API.
 * Se o servidor RECUSAR o arquivo na confirmação (tipo falso, grande demais), o erro sobe: enviar de novo
 * pela API só repetiria a recusa.
 */
async function uploadDirect(file: File, onProgress?: (percent: number) => void): Promise<UploadedReportMedia | null> {
  let presigned: Presigned
  try {
    presigned = (await api.post<Presigned>('/storage/uploads/presign', { mimeType: file.type, sizeBytes: file.size })).data
  } catch {
    return null
  }
  try {
    // axios "puro", sem o token da API nem a URL base: o endereço já vem assinado para o bucket.
    await axios.put(presigned.uploadUrl, file, {
      headers: presigned.headers,
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      },
    })
  } catch {
    return null
  }
  const { data } = await api.post<UploadedReportMedia>('/storage/uploads/complete', { key: presigned.key })
  return data
}

/** Envia um arquivo de relato. Vídeo e PDF tentam o caminho direto e, se não der, usam o envio pela API. */
export async function uploadReportMedia(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadedReportMedia> {
  if (DIRECT_TYPES.has(file.type)) {
    const direct = await uploadDirect(file, onProgress)
    if (direct) return direct
  }
  return uploadThroughApi(file, onProgress)
}
