// Regra do "Download automático de mídia" das conversas. O tipo de rede vem do expo-network
// ("WIFI", "CELLULAR", "ETHERNET", "UNKNOWN"...). Sem certeza de que é Wi-Fi, não gasta o plano de dados.
export type MediaAutoDownload = 'WIFI_ONLY' | 'ALWAYS' | 'NEVER'

const UNMETERED = new Set(['WIFI', 'ETHERNET'])

export function shouldAutoDownload(setting: MediaAutoDownload, networkType?: string | null): boolean {
  if (setting === 'NEVER') return false
  if (setting === 'ALWAYS') return true
  return !!networkType && UNMETERED.has(networkType)
}
