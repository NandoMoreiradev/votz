import { test } from 'node:test'
import assert from 'node:assert/strict'
import { birthDateError, birthDateFromIso, birthDateToIso, maskBirthDate } from '../src/lib/birth-date.ts'

const today = new Date('2026-11-21T12:00:00Z')

test('máscara DD/MM/AAAA enquanto digita', () => {
  assert.equal(maskBirthDate('1'), '1')
  assert.equal(maskBirthDate('1705'), '17/05')
  assert.equal(maskBirthDate('17051990'), '17/05/1990')
  assert.equal(maskBirthDate('17/05/1990999'), '17/05/1990')
  assert.equal(maskBirthDate('ab17'), '17')
})

test('converte para o formato da API e de volta', () => {
  assert.equal(birthDateToIso('17/05/1990'), '1990-05-17')
  assert.equal(birthDateToIso('30/02/1990'), null)
  assert.equal(birthDateToIso('17/05'), null)
  assert.equal(birthDateFromIso('1990-05-17T00:00:00.000Z'), '17/05/1990')
  assert.equal(birthDateFromIso(null), '')
})

test('vazio vale (opcional); menor de 18 e data incompleta não', () => {
  assert.equal(birthDateError('', today), null)
  assert.equal(birthDateError('21/11/2008', today), null)
  assert.match(birthDateError('22/11/2008', today), /18 anos/)
  assert.match(birthDateError('17/05', today), /data completa/)
  assert.match(birthDateError('01/01/1850', today), /Confira/)
})
