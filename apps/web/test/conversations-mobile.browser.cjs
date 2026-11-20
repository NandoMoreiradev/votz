// Manual Android companion QA: leaves the explicitly named demo group for review.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.VOTZ_PLAYWRIGHT_MODULE || 'playwright')
let browser
;(async () => {
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 390, height: 950 } })
  await page.goto('http://localhost:5173/entrar')
  await page.locator('input[type=email]').fill('demo.cidadao2@votz.test')
  await page.locator('input[type=password]').fill('Demo@Votz2026!x')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL(url => !url.pathname.includes('/entrar'))
  await page.goto('http://localhost:5173/conversas')
  await page.getByRole('link', { name: /^Solicitações de conversa/ }).click()
  const title = process.env.VOTZ_MOBILE_QA_GROUP || 'QA Mobile 20261118'
  const invitation = page.locator('div').filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Aceitar', exact: true }) }).last()
  await invitation.getByRole('button', { name: 'Aceitar', exact: true }).click()
  await page.getByRole('link', { name: 'Voltar às conversas', exact: true }).click()
  await page.getByRole('link').filter({ has: page.getByText(title, { exact: true }) }).click()
  await page.getByText('2 participantes', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Encerrar grupo', exact: true }).count(), 0)
  await page.screenshot({ path: `${process.env.TEMP}/votz-web-qa/conversations-native-invitation.png` })
  console.log('PASS: accepted the Android-created group through the web; both real accounts are active, and the invited account has no owner controls.')
})().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(async () => { await browser?.close() })
