/**
 * Utilitários de CSV para a exportação da imprensa.
 *
 * O texto do relato é livre (escrito por qualquer cidadão) e o jornalista abre o arquivo no Excel.
 * Por isso todo texto vai entre aspas e células que começariam com `=`, `+`, `-`, `@`, tab ou retorno
 * de carro ganham um apóstrofo na frente, para o Excel não tratar como fórmula (injeção de CSV).
 */

const FORMULA_START = /^[=+\-@\t\r]/

export function csvText(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  // Quebras de linha viram espaço: uma linha do CSV é um relato.
  let text = raw.replace(/\r\n|\r|\n/g, ' ')
  // Confere o original (antes de trocar quebra por espaço) e o texto sem espaço à esquerda.
  if (FORMULA_START.test(raw) || FORMULA_START.test(text.trimStart())) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function csvNumber(value: number | null | undefined, digits?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return digits === undefined ? String(value) : value.toFixed(digits)
}

export function csvDate(value: Date | string | null | undefined): string {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

/** BOM para o Excel reconhecer UTF-8 (acentos) ao abrir o arquivo. */
export const CSV_BOM = '﻿'

/** Pedaço seguro para nome de arquivo: sem acento, só letras minúsculas, números e hífen. */
export function filenamePart(raw: string | undefined | null): string {
  if (!raw) return ''
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
