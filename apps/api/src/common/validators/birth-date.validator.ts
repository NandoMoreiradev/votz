import { registerDecorator, type ValidationOptions } from 'class-validator'
import { MIN_AGE, ageOn } from '@votz/shared-types'

/** Idade máxima aceita (evita data digitada errada, ex.: 1026). */
export const MAX_AGE = 120

/** Motivo da recusa em português simples, ou null se a data é válida. */
export function birthDateProblem(value: unknown, today: Date = new Date()): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Data de nascimento inválida. Use o formato AAAA-MM-DD.'
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return 'Data de nascimento inválida.'
  const age = ageOn(value, today)
  if (age === null || age > MAX_AGE) return 'Confira a data de nascimento.'
  if (age < MIN_AGE) return `É preciso ter ${MIN_AGE} anos ou mais para usar o Votz.`
  return null
}

/** Data de nascimento (AAAA-MM-DD) de quem tem pelo menos 18 anos. */
export function IsAdultBirthDate(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAdultBirthDate',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => birthDateProblem(value) === null,
        defaultMessage: (args) => birthDateProblem(args?.value) ?? 'Data de nascimento inválida.',
      },
    })
  }
}
