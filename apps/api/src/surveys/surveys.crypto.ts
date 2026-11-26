import { createHmac, randomBytes, randomInt } from 'crypto'
import { ageOn } from '@votz/shared-types'

const SURVEY_SALT_BYTES = 32

/** Gera um salt criptográfico de 32 bytes (64 hex chars) exclusivo de uma pesquisa. */
export function generateSurveySaltHex(): string {
  return randomBytes(SURVEY_SALT_BYTES).toString('hex')
}

/**
 * Remove qualquer caractere não numérico do CPF para normalização do nullifier.
 * Retorna string vazia se não tiver 11 dígitos.
 */
export function normalizeCpfDigits(cpf: string | null | undefined): string {
  if (!cpf) return ''
  const digits = cpf.replace(/\D/g, '')
  return digits.length === 11 ? digits : ''
}

/**
 * Calcula o nullifierHash irreversível (HMAC-SHA256 de dois estágios):
 * 1) subkey = HMAC-SHA256(masterNullifierKey, surveySalt)
 * 2) nullifier = HMAC-SHA256(subkey, `${surveyId}:${subjectKey}`)
 *
 * Ao destruir `surveySalt` no encerramento (crypto-shredding), nem quem possui
 * `masterNullifierKey` e o dump do banco consegue verificar se um usuário participou.
 */
export function computeNullifierHash(
  masterKey: Buffer,
  surveySaltHex: string,
  surveyId: string,
  subjectKey: string,
): string {
  const saltBuf = Buffer.from(surveySaltHex, 'hex')
  const surveyKey = createHmac('sha256', masterKey).update(saltBuf).digest()
  return createHmac('sha256', surveyKey).update(`${surveyId}:${subjectKey}`).digest('hex')
}

/**
 * Arredonda uma data para o início da hora UTC cheia (zera minutos, segundos e milissegundos).
 * Impede correlação temporal (timing attack) entre participação e cédula.
 */
export function roundToHourBucket(date: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      0,
      0,
      0,
    ),
  )
}

/** Embaralhamento Fisher-Yates com entropia criptográfica (`crypto.randomInt`). */
export function cryptoShuffle<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Embaralha as opções de uma pergunta evitando viés de posição, mantendo sempre
 * no final as opções marcadas com `isPinnedBottom = true` (ex.: "Branco / Nulo", "Indeciso").
 */
export function shuffleSurveyOptions<T extends { isPinnedBottom: boolean }>(
  options: readonly T[],
  randomize: boolean,
): T[] {
  const regular = options.filter((o) => !o.isPinnedBottom)
  const pinned = options.filter((o) => o.isPinnedBottom)
  return [...(randomize ? cryptoShuffle(regular) : regular), ...pinned]
}

/** Faixas etárias grosseiras para cédulas anônimas (inclui 16-24 para voto facultativo no Brasil). */
export function surveyAgeBandOf(
  birthDate: string | Date | null | undefined,
  today: Date = new Date(),
): string | null {
  if (!birthDate) return null
  const age = ageOn(birthDate, today)
  if (age === null || age < 16) return null
  if (age <= 24) return '16-24'
  if (age <= 34) return '25-34'
  if (age <= 44) return '35-44'
  if (age <= 59) return '45-59'
  return '60+'
}
