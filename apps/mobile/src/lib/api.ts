import * as SecureStore from 'expo-secure-store'

const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '')
export const API_URL = configuredUrl || (__DEV__ ? 'http://127.0.0.1:3000/api/v1' : '')
if (!API_URL || (!__DEV__ && !API_URL.startsWith('https://'))) {
  throw new Error('Configure EXPO_PUBLIC_API_URL com HTTPS para gerar o app de produção.')
}
const REFRESH_KEY = 'votz.refresh-token'
let accessToken: string | null = null
let tokenExpiresAt = 0
let generation = 0
let refreshing: Promise<void> | null = null
let storageQueue: Promise<void> = Promise.resolve()
let onExpired = () => {}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export function setSessionExpiredHandler(handler: () => void) { onExpired = handler }
export async function conversationSocketToken(): Promise<string> {
  if (!accessToken || tokenExpiresAt <= Date.now() + 5_000) await refreshSession()
  if (!accessToken) throw new ApiError('Entre para continuar.', 401)
  return accessToken
}
export async function saveTokens(tokens: { accessToken: string; refreshToken: string }, expectedGeneration = ++generation) {
  const write = storageQueue.then(async () => {
    if (generation !== expectedGeneration) throw new ApiError('Sessão alterada.', 401)
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
    if (generation === expectedGeneration) setAccessToken(tokens.accessToken)
  })
  storageQueue = write.catch(() => {})
  await write
}
export async function clearTokens() {
  generation += 1
  accessToken = null
  tokenExpiresAt = 0
  const clear = storageQueue.then(() => SecureStore.deleteItemAsync(REFRESH_KEY))
  storageQueue = clear.catch(() => {})
  await clear
}
export const getRefreshToken = () => SecureStore.getItemAsync(REFRESH_KEY)
export function setAccessToken(token: string) {
  accessToken = token
  // Only schedule renewal from exp; the API still verifies the JWT signature.
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    tokenExpiresAt = typeof payload.exp === 'number' ? payload.exp * 1000 : 0
  } catch { tokenExpiresAt = 0 }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 20_000)
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options, credentials: 'omit', signal: controller.signal,
      headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string | string[] } | null
      const message = Array.isArray(body?.message) ? body.message.join('\n') : body?.message
      throw new ApiError(message || 'Não foi possível concluir. Tente novamente.', response.status)
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

export function refreshSession(): Promise<void> {
  if (!refreshing) {
    const startedGeneration = generation
    refreshing = (async () => {
      const refreshToken = await getRefreshToken()
      if (!refreshToken) throw new ApiError('Entre para continuar.', 401)
      const tokens = await request<{ accessToken: string; refreshToken: string }>('/auth/mobile/refresh', {
        method: 'POST', body: JSON.stringify({ refreshToken }),
      })
      if (startedGeneration !== generation) throw new ApiError('Sessão encerrada.', 401)
      await saveTokens(tokens, startedGeneration)
    })().catch(async (error: unknown) => {
      // A network outage must not erase a valid persisted session.
      if (error instanceof ApiError && error.status === 401 && startedGeneration === generation) {
        await clearTokens()
        onExpired()
      }
      throw error
    }).finally(() => { refreshing = null })
  }
  return refreshing
}

export async function api<T>(path: string, options: RequestInit = {}, authenticated = true): Promise<T> {
  // Optional-auth feeds can return 200 anonymously with an expired JWT, so
  // renew before sending rather than waiting only for a protected-route 401.
  if (authenticated && accessToken && tokenExpiresAt && tokenExpiresAt <= Date.now() + 5_000) await refreshSession()
  const send = () => request<T>(path, {
    ...options, headers: { ...(authenticated && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
  })
  try { return await send() } catch (error) {
    if (!authenticated || !(error instanceof ApiError) || error.status !== 401) throw error
    await refreshSession()
    return send()
  }
}
export const json = (data: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(data) })
export const errorMessage = (error: unknown) => error instanceof ApiError ? error.message : 'Não foi possível conectar ao Votz. Verifique sua conexão e tente novamente.'
