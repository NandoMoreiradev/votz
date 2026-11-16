export const LAST_ORG_CONTEXT_KEY = 'votz.lastOrgContext'

export type SavedOrgType = 'entity' | 'politician' | 'company'

export interface SavedOrgContextHint {
  type: SavedOrgType
  id: string
  returnTo: string
  userId: string
}

const VALID_ORG_TYPES = new Set<SavedOrgType>(['entity', 'politician', 'company'])

export const AUTH_OR_PUBLIC_LEGAL_ROUTES = new Set([
  '/entrar',
  '/cadastro',
  '/verificar-email',
  '/auth/google/callback',
  '/termos',
  '/privacidade',
  '/cookies',
  '/diretrizes',
  '/descadastro-resumo',
])

/**
 * Garante que `returnTo` seja exclusivamente um caminho interno da aplicação.
 * Rejeita URLs absolutas (`https://`), protocol-relative (`//evil.com`), backslashes e esquemas (`javascript:`).
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '/'
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return '/'
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return '/'
  if (/[\x00-\x1f\\]/.test(trimmed)) return '/'
  try {
    const parsed = new URL(trimmed, 'https://votz.internal')
    if (parsed.origin !== 'https://votz.internal') return '/'
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
    if (AUTH_OR_PUBLIC_LEGAL_ROUTES.has(parsed.pathname)) return '/'
    return normalized || '/'
  } catch {
    return '/'
  }
}

function normalizeOrgType(raw: string | null | undefined): SavedOrgType | null {
  if (typeof raw !== 'string') return null
  const lower = raw.trim().toLowerCase() as SavedOrgType
  return VALID_ORG_TYPES.has(lower) ? lower : null
}

function getSessionStorageSafe(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Grava em `sessionStorage` apenas o indicador não sensível da última organização ativa (`type`, `id`, `returnTo`, `userId`).
 * Nunca persiste token institucional, papel ou permissões.
 */
export function saveLastOrgContext(input: {
  type: string
  id: string
  returnTo?: string | null
  userId: string
}): void {
  const storage = getSessionStorageSafe()
  if (!storage) return
  const normalizedType = normalizeOrgType(input.type)
  if (!normalizedType || !input.id || !input.userId) return

  const payload: SavedOrgContextHint = {
    type: normalizedType,
    id: input.id,
    returnTo: sanitizeReturnTo(input.returnTo),
    userId: input.userId,
  }
  try {
    storage.setItem(LAST_ORG_CONTEXT_KEY, JSON.stringify(payload))
  } catch {
    // Armazenamento pode falhar em navegação privada / cota excedida
  }
}

export function readLastOrgContext(): SavedOrgContextHint | null {
  const storage = getSessionStorageSafe()
  if (!storage) return null
  try {
    const raw = storage.getItem(LAST_ORG_CONTEXT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedOrgContextHint> | null
    if (!parsed || typeof parsed !== 'object') return null
    const normalizedType = normalizeOrgType(parsed.type)
    if (
      !normalizedType ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      typeof parsed.userId !== 'string' ||
      !parsed.userId
    ) {
      return null
    }
    return {
      type: normalizedType,
      id: parsed.id,
      returnTo: sanitizeReturnTo(parsed.returnTo),
      userId: parsed.userId,
    }
  } catch {
    return null
  }
}

export function updateLastOrgContextReturnTo(returnTo: string): void {
  const current = readLastOrgContext()
  if (!current) return
  const nextPath = sanitizeReturnTo(returnTo)
  if (nextPath === current.returnTo) return
  saveLastOrgContext({
    type: current.type,
    id: current.id,
    returnTo: nextPath,
    userId: current.userId,
  })
}

export function clearLastOrgContext(): void {
  const storage = getSessionStorageSafe()
  if (!storage) return
  try {
    storage.removeItem(LAST_ORG_CONTEXT_KEY)
  } catch {
    // Silencioso se storage indisponível
  }
}
