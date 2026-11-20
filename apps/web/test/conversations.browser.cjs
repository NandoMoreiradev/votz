// Local QA only. Requires demo citizens 1/2, the API pilot enabled, and Playwright.
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { chromium } = require(process.env.VOTZ_PLAYWRIGHT_MODULE || 'playwright')

const base = 'http://localhost:5173'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
const db = new PrismaClient()
const created = new Set()
const prefix = `QA Conversas Web ${Date.now()}`
let browser
async function account(number) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('dialog', dialog => dialog.accept())
  await page.goto(base + '/entrar')
  await page.locator('input[type=email]').fill(`demo.cidadao${number}@votz.test`)
  await page.locator('input[type=password]').fill('Demo@Votz2026!x')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL(url => !url.pathname.includes('/entrar'))
  return page
}
function rowWith(page, text, button) {
  return page.locator('div').filter({ has: page.getByText(text, { exact: true }) }).filter({ has: page.getByRole('button', { name: button, exact: true }) }).last()
}
;(async () => {
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const errors = []
  const a = await account(1)
  const b = await account(2)
  for (const page of [a, b]) page.on('pageerror', error => errors.push(error.message))
  await a.goto(base + '/conversas/nova')
  await a.getByRole('tab', { name: 'Criar grupo', exact: true }).click()
  await a.getByLabel('Nome do grupo', { exact: true }).fill(prefix)
  await a.getByLabel('Buscar pessoas', { exact: true }).fill('Bruno')
  await rowWith(a, 'Bruno Cidadão (Demo)', 'Selecionar').getByRole('button', { name: 'Selecionar', exact: true }).click()
  await a.getByRole('button', { name: 'Criar grupo', exact: true }).click()
  await a.waitForURL(url => /^\/conversas\/[0-9a-f-]{36}$/.test(url.pathname))
  const id = a.url().split('/').pop()
  created.add(id)
  // Grupos agora abrem direto no chat; a administração fica na tela de detalhes.
  await a.goto(base + `/conversas/${id}?detalhes=1`)
  await a.getByText('Convite pendente', { exact: true }).waitFor()
  await b.goto(base + '/conversas')
  await b.getByRole('tab', { name: 'Solicitações', exact: true }).click()
  await rowWith(b, prefix, 'Aceitar').getByRole('button', { name: 'Aceitar', exact: true }).click()
  await b.getByRole('tab', { name: 'Conversas', exact: true }).click()
  await b.goto(base + `/conversas/${id}?detalhes=1`)
  await b.getByText('2 participantes', { exact: true }).last().waitFor()
  await a.getByText('2 participantes', { exact: true }).last().waitFor({ timeout: 20000 })
  assert.equal(await b.getByRole('button', { name: 'Convidar pessoas', exact: true }).count(), 0)
  await a.getByRole('button', { name: 'Tornar administrador', exact: true }).click()
  await b.getByRole('button', { name: 'Convidar pessoas', exact: true }).waitFor({ timeout: 20000 })
  for (const width of [1440, 390, 320]) {
    await a.setViewportSize({ width, height: 950 })
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `No horizontal overflow at ${width}px`)
    await a.screenshot({ path: `${process.env.TEMP}/votz-web-qa/conversations-${width}.png` })
  }
  await a.getByRole('button', { name: 'Transferir grupo', exact: true }).click()
  await b.getByRole('button', { name: 'Encerrar grupo', exact: true }).waitFor({ timeout: 20000 })
  await a.getByRole('button', { name: 'Sair do grupo', exact: true }).click()
  await a.waitForURL(base + '/conversas')
  await b.getByRole('button', { name: 'Encerrar grupo', exact: true }).click()
  await b.getByText('Grupo encerrado', { exact: true }).last().waitFor()
  assert.equal(await b.getByRole('button', { name: 'Convidar pessoas', exact: true }).count(), 0)
  await a.goto(base + '/conversas/bloqueios')
  await a.getByRole('heading', { name: 'Pessoas bloqueadas', exact: true }).waitFor()
  // An unauthenticated session must not expose the prior account's cached roster.
  const anonymous = await browser.newPage()
  await anonymous.goto(base + `/conversas/${id}`)
  await anonymous.getByText('Suas conversas começam aqui', { exact: true }).first().waitFor()
  assert.equal(await anonymous.getByText(prefix, { exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS: two real browser sessions; creation, consent, sync, admin promotion, owner transfer, leave, archive, block settings, anonymous privacy and 1440/390/320px layouts.')
})().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => {
  await browser?.close()
  await db.conversation.deleteMany({ where: { id: { in: [...created] }, title: prefix, createdBy: { email: 'demo.cidadao1@votz.test' } } })
  await db.$disconnect()
})
