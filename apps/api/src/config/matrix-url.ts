/**
 * Endereço do Synapse numa rede privada. Esse tráfego não sai da rede, então são os únicos casos
 * em que o mensageiro aceita http fora de localhost. Qualquer outro endereço de produção exige https.
 *
 * - Railway: http://synapse.railway.internal:8008
 * - Google Cloud (VPC): http://10.x.x.x:8008, só o bloco privado 10.0.0.0/8, com a porta obrigatória.
 */
const RAILWAY_PRIVATE_URL = /^http:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.railway\.internal:\d{2,5}$/i
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const VPC_PRIVATE_URL = new RegExp(`^http://10\\.${OCTET}\\.${OCTET}\\.${OCTET}:\\d{2,5}$`)

export function isPrivateNetworkMatrixUrl(url: string): boolean {
  const clean = url.trim().replace(/\/$/, '')
  return RAILWAY_PRIVATE_URL.test(clean) || VPC_PRIVATE_URL.test(clean)
}
