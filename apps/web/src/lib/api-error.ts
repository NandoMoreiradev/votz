/** Mensagem que a API devolveu (já em português simples), ou o texto padrão quando não houver. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } } | null)?.response?.data?.message
  if (Array.isArray(msg)) return msg[0] ?? fallback
  return typeof msg === 'string' && msg.trim() ? msg : fallback
}
