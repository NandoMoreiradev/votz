/**
 * Endereço do Synapse na rede privada do Railway (ex.: http://synapse.railway.internal:8008).
 * Esse tráfego não sai do projeto, então é o único caso em que o mensageiro aceita http fora de localhost.
 * Qualquer outro endereço de produção continua exigindo https.
 */
const PRIVATE_NETWORK_URL = /^http:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.railway\.internal:\d{2,5}$/i

export function isPrivateNetworkMatrixUrl(url: string): boolean {
  return PRIVATE_NETWORK_URL.test(url.trim().replace(/\/$/, ''))
}
