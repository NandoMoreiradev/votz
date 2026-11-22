// Data de nascimento no celular: campo com máscara DD/MM/AAAA (sem seletor nativo, para não exigir build nova).
import { MIN_AGE, ageOn } from '@votz/shared-types'

/** Formata o que a pessoa digita: só números, com as barras no lugar. */
export function maskBirthDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** "17/05/1990" → "1990-05-17" (a API usa AAAA-MM-DD). Null se a data não existe. */
export function birthDateToIso(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display.trim())
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

/** "1990-05-17" (ou data ISO completa) → "17/05/1990". */
export function birthDateFromIso(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

/** Motivo para recusar, em português simples, ou null (vazio vale: o campo é opcional). */
export function birthDateError(display: string, today: Date = new Date()): string | null {
  if (!display.trim()) return null
  const iso = birthDateToIso(display)
  if (!iso) return 'Digite a data completa, como 17/05/1990.'
  const age = ageOn(iso, today)
  if (age === null || age > 120) return 'Confira a data de nascimento.'
  if (age < MIN_AGE) return `É preciso ter ${MIN_AGE} anos ou mais para usar o Votz.`
  return null
}
