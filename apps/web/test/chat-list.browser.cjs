// Local-only end-to-end UI QA for the conversation list: last-message time, preview and unread badge.
// Creates and removes its own accounts. Real browsers, real encryption.
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
const apiBase = process.env.VOTZ_CHAT_API_URL || 'http://localhost:3000/api/v1'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
let browser, conversationId

async function request(actor, endpoint, method = 'GET', body) {
  const response = await fetch(`${apiBase}/conversations${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  assert.ok(response.ok, `${method} ${endpoint}: HTTP ${response.status}`)
  return response.json()
}
async function open(user, path) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Sao_Paulo' })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  await page.goto(base + '/entrar', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type=email]').fill(user.email)
  await page.locator('input[type=password]').fill(password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.includes('/entrar'))
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  return page
}
// A conversa abre sozinha: sem botão de ativação e sem senha.
const ready = (page) =>
  page
    .getByText(/As mensagens são protegidas com criptografia de ponta a ponta|Identidade confirmada/)
    .waitFor()
// O campo só libera quando a outra pessoa também abriu a conversa.
const composerReady = (page) =>
  page.waitForFunction(() => {
    const field = document.querySelector('textarea[aria-label="Mensagem"]')
    return !!field && !field.disabled
  }, undefined, { timeout: 45000 })
async function send(page, text) {
  await page.getByLabel('Mensagem', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
}
const row = (page) => page.locator(`a[href="/conversas/${conversationId}"]`)
// Dentro do aplicativo (sem recarregar): a memória, e portanto a prévia, continua.
const backToList = async (page) => {
  await page.getByRole('link', { name: 'Voltar às conversas' }).click()
  await row(page).waitFor()
}

;(async () => {
  const hash = await bcrypt.hash(password, 10)
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        email: `qa-chat-browser-list-${run}-${i}@votz.test`,
        name: `QA Lista ${i === 0 ? 'Alice' : 'Bruno'}`,
        password: hash,
        emailVerified: true,
        termsAcceptedAt: new Date(),
        ageConfirmedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
    })
    users.push({ ...user, token: jwt.sign({ sub: user.id, typ: 'access' }, { expiresIn: '15m', algorithm: 'HS256' }) })
  }
  conversationId = (await request(users[0], '/direct', 'POST', { targetUserId: users[1].id })).id
  await request(users[1], `/${conversationId}/respond`, 'POST', { accept: true })
  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const a = await open(users[0], `/conversas/${conversationId}`)
  await ready(a)
  const b = await open(users[1], `/conversas/${conversationId}`)
  await ready(b)
  await composerReady(a)
  await composerReady(b)

  // 1) A escreve; B está com a conversa aberta: lê, e depois volta para a lista.
  const first = `Olá da lista ${run.slice(0, 8)}`
  await send(a, first)
  await b.getByText(first, { exact: true }).waitFor()
  await b.waitForTimeout(2500) // a mensagem fica visível por 500 ms e o "visto" é enviado
  await backToList(b)
  const bRow = row(b)
  assert.ok((await bRow.innerText()).includes(first), 'The opened message is previewed in the list')
  assert.match(await bRow.innerText(), /\d{2}:\d{2}/, 'The list shows the time of the last message')
  assert.equal(await bRow.getAttribute('aria-label'), null, 'No unread label once the conversation was opened')
  await backToList(a)
  assert.ok((await row(a).innerText()).includes(`Você: ${first}`), 'My own last message is previewed with "Você:"')
  console.log('PASS: list shows time and a preview for opened messages, with "Você:" for my own')

  // 2) A escreve de novo; B fica na lista (conversa fechada): não lida, e SEM texto (não foi decifrada).
  await row(a).click()
  await composerReady(a)
  const second = `Segunda da lista ${run.slice(0, 8)}`
  await send(a, second)
  await a.getByText(second, { exact: true }).waitFor()
  await b.waitForFunction(
    (id) => /1 mensagem não lida/.test(document.querySelector(`a[href="/conversas/${id}"]`)?.getAttribute('aria-label') || ''),
    conversationId,
    { timeout: 40000 },
  )
  const closedRow = await row(b).innerText()
  assert.ok(!closedRow.includes(second), 'A message the closed conversation never decrypted is not shown')
  assert.ok(closedRow.includes('Mensagem protegida'), 'The list says the message is protected instead')
  console.log('PASS: unread badge appears for a closed conversation and the list never shows undecrypted text')

  // 3) B abre de novo dentro de /conversas: reutiliza a sessão cifrada sem reativar,
  // lê, o contador zera e a prévia mostra a mensagem.
  let enrollCalls = 0
  const countEnroll = (req) => {
    if (req.method() === 'POST' && req.url().endsWith('/conversations/chat/devices'))
      enrollCalls += 1
  }
  b.on('request', countEnroll)
  await row(b).click()
  await composerReady(b)
  await b.getByText(second, { exact: true }).waitFor()
  b.off('request', countEnroll)
  assert.equal(enrollCalls, 0, 'Reopening a conversation inside /conversas reuses the live web crypto session')
  await b.waitForTimeout(2500)
  await backToList(b)
  await b.waitForFunction(
    (id) => !document.querySelector(`a[href="/conversas/${id}"]`)?.getAttribute('aria-label'),
    conversationId,
    { timeout: 30000 },
  )
  assert.ok((await row(b).innerText()).includes(second))
  console.log('PASS: reopening inside /conversas reuses the live session; opening clears the unread badge and previews the message')

  // 4) Recarregar a página: a prévia (só em memória) some; horário e não lidas continuam do servidor.
  await b.reload({ waitUntil: 'domcontentloaded' })
  await row(b).waitFor()
  const reloaded = await row(b).innerText()
  assert.ok(!reloaded.includes(second), 'Reloading drops the in-memory preview')
  assert.ok(reloaded.includes('Mensagem protegida'))
  assert.match(reloaded, /\d{2}:\d{2}/)
  console.log('PASS: the preview lives only in memory; time and unread come from the server')

  // 5) Responsivo.
  for (const width of [1440, 390, 320]) {
    await b.setViewportSize({ width, height: 950 })
    assert.equal(await b.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  console.log('PASS: list responsive at 1440, 390 and 320 px')
})()
  .catch((error) => {
    console.error(String(error.stack || error).split('\n').slice(0, 7).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (users.length) await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
    await db.$disconnect()
  })
