// Local-only end-to-end UI QA. Creates and removes its own accounts.
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const { JwtService } = require('@nestjs/jwt')
const bcrypt = require('bcrypt')
const { chromium } = require(process.env.VOTZ_PLAYWRIGHT_MODULE || 'playwright')
const { TERMS_VERSION, PRIVACY_VERSION } = require('@votz/shared-types')
const db = new PrismaClient()
const users = []
const run = randomUUID()
const password = `Qa!${randomUUID()}`
const passphrase = 'QA encrypted browser keys 2026!'
const base = process.env.VOTZ_CHAT_WEB_URL || 'http://localhost:5173'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
assert.ok(
  ['localhost', '127.0.0.1'].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
)
let browser, conversationId
const pages = []
const pageErrors = []
async function account(user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    timezoneId: 'America/Sao_Paulo',
  })
  const page = await context.newPage()
  pages.push(page)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.setDefaultTimeout(45000)
  await page.goto(base + '/entrar')
  await page.locator('input[type=email]').fill(user.email)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.includes('/entrar'))
  await page.goto(base + `/conversas/${conversationId}`)
  return page
}
async function unlock(page, initial = true, key = passphrase) {
  await page.getByLabel('Senha das conversas', { exact: true }).fill(key)
  if (initial)
    await page
      .getByLabel('Repita a senha das conversas', { exact: true })
      .fill(key)
  await page
    .getByRole('button', {
      name: initial ? 'Ativar neste navegador' : 'Desbloquear',
      exact: true,
    })
    .click()
  if (key === passphrase)
    await page
      .getByText(
        'Identidade verificada neste dispositivo. Mensagens protegidas de ponta a ponta.',
        { exact: true },
      )
      .or(
        page.getByText('Verifique a identidade antes de trocar mensagens.', {
          exact: true,
        }),
      )
      .waitFor()
}
async function request(actor, endpoint, method = 'GET', body) {
  const response = await fetch(
    `http://localhost:3000/api/v1/conversations${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${actor.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  )
  const data = await response.json()
  assert.ok(response.ok, `${method} ${endpoint}: HTTP ${response.status}`)
  return data
}
;(async () => {
  const hash = await bcrypt.hash(password, 10)
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        email: `qa-chat-browser-${run}-${i}@votz.test`,
        name: `QA Chat ${i === 0 ? 'Alice' : 'Bruno'}`,
        password: hash,
        emailVerified: true,
        termsAcceptedAt: new Date(),
        ageConfirmedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
    })
    users.push({
      ...user,
      token: jwt.sign(
        { sub: user.id, typ: 'access' },
        { expiresIn: '15m', algorithm: 'HS256' },
      ),
    })
  }
  const direct = await request(users[0], '/direct', 'POST', {
    targetUserId: users[1].id,
  })
  conversationId = direct.id
  await request(users[1], `/${conversationId}/respond`, 'POST', {
    accept: true,
  })
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const errors = []
  const a = await account(users[0])
  const b = await account(users[1])
  for (const page of [a, b])
    page.on('pageerror', (error) => errors.push(error.message))
  await unlock(a)
  await unlock(b)
  await a
    .getByRole('button', { name: 'Verificar identidade', exact: true })
    .waitFor()
  assert.equal(
    await a
      .getByRole('button', { name: 'Enviar mensagem', exact: true })
      .isDisabled(),
    true,
  )
  await a
    .getByRole('button', { name: 'Verificar identidade', exact: true })
    .click()
  await b
    .getByRole('button', { name: 'Aceitar verificação', exact: true })
    .click()
  const codeA = a.getByLabel('Código de verificação', { exact: true })
  const codeB = b.getByLabel('Código de verificação', { exact: true })
  await codeA.waitFor()
  await codeB.waitFor()
  assert.equal(await codeA.innerText(), await codeB.innerText())
  await a
    .getByRole('button', { name: 'Os códigos são iguais', exact: true })
    .click()
  await b
    .getByRole('button', { name: 'Os códigos são iguais', exact: true })
    .click()
  for (const page of [a, b])
    await page
      .getByText(
        'Identidade verificada neste dispositivo. Mensagens protegidas de ponta a ponta.',
        { exact: true },
      )
      .waitFor()
  console.log(
    'PASS: real browser activation, encrypted IndexedDB and mutual SAS verification',
  )
  const text = `Texto protegido ${run} 🙂 çã`
  await a.getByLabel('Mensagem', { exact: true }).fill(text)
  await a.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
  await b.getByText(text, { exact: true }).waitFor()
  const reply = `Resposta protegida ${run}`
  await b.getByLabel('Mensagem', { exact: true }).fill(reply)
  await b.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
  await a.getByText(reply, { exact: true }).waitFor()
  const receipt = a.getByLabel('Mensagens', { exact: true }).locator('[data-message-id]').filter({ hasText: text })
  await receipt.getByText(/Entregue/).waitFor()
  assert.equal(await b.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).isChecked(), false)
  await b.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).click()
  await b.waitForFunction(() => document.querySelector('input[type="checkbox"]').checked)
  await receipt.getByText(/Lida/).waitFor()
  await b.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).click()
  await b.waitForFunction(() => !document.querySelector('input[type="checkbox"]').checked)
  console.log('PASS: optional visible-message read receipts through the actual browser UI')
  for (const width of [1440, 390, 320]) {
    await a.setViewportSize({ width, height: 950 })
    assert.equal(
      await a.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    )
    await a.screenshot({
      path: `${process.env.TEMP}/votz-web-qa/chat-text-${width}.png`,
    })
  }
  // A second tab cannot concurrently open the same crypto database.
  const tab = await a.context().newPage()
  await tab.goto(base + `/conversas/${conversationId}`)
  await tab.getByLabel('Senha das conversas', { exact: true }).fill(passphrase)
  await tab.getByRole('button', { name: 'Desbloquear', exact: true }).click()
  await tab
    .getByText(
      'O mensageiro já está aberto em outra aba. Feche a outra aba e tente novamente.',
      { exact: true },
    )
    .waitFor()
  await tab.close()
  console.log(
    'PASS: encrypted text in both directions, Unicode, responsive layout and one crypto writer per browser',
  )
  let offline = true
  const sendPattern = `**/api/v1/conversations/${conversationId}/chat/messages/*`
  await a.route(sendPattern, (route) =>
    offline && route.request().method() === 'PUT'
      ? route.abort('failed')
      : route.continue(),
  )
  const pending = `Fila protegida ${run}`
  await a.getByLabel('Mensagem', { exact: true }).fill(pending)
  await a.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
  await a
    .getByLabel('Mensagens', { exact: true })
    .getByText(pending, { exact: true })
    .waitFor()
  await a.waitForFunction(
    () =>
      document.querySelector('textarea[aria-label="Mensagem"]').value === '',
  )
  const persisted = await a.evaluate(
    (userId) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(`votz-chat-${userId}`, 1)
        open.onsuccess = () => {
          const request = open.result
            .transaction('state')
            .objectStore('state')
            .get('transport')
          request.onsuccess = () => {
            resolve(JSON.stringify(request.result))
            open.result.close()
          }
          request.onerror = reject
        }
        open.onerror = reject
      }),
    users[0].id,
  )
  assert.equal(persisted.includes(pending), false)
  assert.ok(
    JSON.parse(persisted).pending.length > 0,
    'An encrypted outbox entry survives a transport failure',
  )
  await a.reload()
  await unlock(a, false, 'An incorrect passphrase 2026!')
  await a
    .getByText(
      'Não foi possível abrir as chaves. Confira a senha das conversas.',
      { exact: true },
    )
    .waitFor()
  await unlock(a, false)
  await a.getByText(pending, { exact: true }).waitFor()
  offline = false
  await b.getByText(pending, { exact: true }).waitFor()
  assert.equal(await b.getByText(pending, { exact: true }).count(), 1)
  console.log(
    'PASS: encrypted offline outbox, browser restart, wrong-passphrase refusal and automatic retry without duplicates',
  )
  assert.deepEqual(errors, [])
})()
  .catch(async (error) => {
    console.error(error.message)
    console.error(pageErrors.join('\n'))
    for (let i = 0; i < pages.length; i++) {
      console.error(
        `Browser ${i}:`,
        (await pages[i].locator('body').innerText()).slice(-2000),
      )
      await pages[i].screenshot({
        path: `${process.env.TEMP}/votz-web-qa/chat-text-failure-${i}.png`,
      })
    }
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (conversationId)
      await db.conversation.deleteMany({
        where: { id: conversationId, createdById: users[0]?.id },
      })
    await db.user.deleteMany({
      where: {
        id: { in: users.map((user) => user.id) },
        email: { startsWith: `qa-chat-browser-${run}-` },
      },
    })
    await db.$disconnect()
  })
