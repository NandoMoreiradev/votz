// Local-only end-to-end UI QA for "Aparelhos conectados". Creates and removes its own accounts.
// Two real browsers of the SAME account: the second asks to join, the first approves,
// then disconnects it from the devices screen.
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

;(async () => {
  const hash = await bcrypt.hash(password, 10)
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  for (let i = 0; i < 2; i++) {
    const user = await db.user.create({
      data: {
        email: `qa-chat-browser-devices-${run}-${i}@votz.test`,
        name: `QA Aparelhos ${i === 0 ? 'Alice' : 'Bruno'}`,
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
  const direct = await request(users[0], '/direct', 'POST', { targetUserId: users[1].id })
  conversationId = direct.id
  await request(users[1], `/${conversationId}/respond`, 'POST', { accept: true })
  browser = await chromium.launch({ headless: true, channel: 'chromium' })

  // Navegador 1: primeiro aparelho, ativa direto.
  const first = await open(users[0], `/conversas/${conversationId}`)
  await ready(first)

  // Antes de ativar, o segundo navegador vê que precisa ativar.
  const second = await open(users[0], '/conversas/aparelhos')
  await second.getByText('Abra uma conversa primeiro').waitFor()
  console.log('PASS: devices screen tells a browser that has not activated chats to activate first')

  // Navegador 2: pede para entrar e mostra o código.
  await second.goto(base + `/conversas/${conversationId}`, { waitUntil: 'domcontentloaded' })
  await second.getByRole('heading', { name: 'Permita no seu outro aparelho' }).waitFor()
  const code = (await second.getByLabel('Código do pedido', { exact: true }).innerText()).trim()
  assert.match(code, /^\d{6}$/)

  // Navegador 1: a tela de aparelhos mostra o pedido com o MESMO código.
  await first.goto(base + '/conversas/aparelhos', { waitUntil: 'domcontentloaded' })
  const request1 = first.getByRole('alert').filter({ hasText: 'Novo aparelho pedindo acesso' })
  await request1.waitFor()
  assert.ok((await request1.innerText()).includes(code), 'The pending request shows the same code as the new device')
  assert.equal(await first.getByText('Este aparelho', { exact: false }).count() > 0, true)
  await request1.getByRole('button', { name: 'Permitir', exact: true }).click()
  console.log('PASS: the second browser asked to join with a code and the first saw the same code to approve')

  // Navegador 2 conclui a ativação depois da aprovação.
  await ready(second)
  await first.getByText('Chrome no', { exact: false }).first().waitFor()
  await first.waitForFunction(() => document.querySelectorAll('button').length > 0)
  await first.reload({ waitUntil: 'domcontentloaded' })
  await first.getByText('Conectado em', { exact: false }).first().waitFor()
  assert.equal(await first.getByRole('button', { name: 'Desconectar', exact: true }).count(), 1)
  assert.equal(await first.getByRole('button', { name: 'Sair', exact: true }).count(), 1)
  console.log('PASS: approval activates the second browser; both appear, with this device marked')

  // Responsivo: sem rolagem horizontal.
  for (const width of [1440, 390, 320]) {
    await first.setViewportSize({ width, height: 950 })
    assert.equal(await first.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }

  // Desconectar o outro navegador (confirmação do navegador).
  first.once('dialog', (dialog) => dialog.accept())
  await first.getByRole('button', { name: 'Desconectar', exact: true }).click()
  await first.getByRole('button', { name: 'Desconectar', exact: true }).waitFor({ state: 'detached' })
  assert.equal(await first.getByRole('button', { name: 'Sair', exact: true }).count(), 1)
  console.log('PASS: disconnecting the other browser removes it from the list')
  // Perdeu o acesso aos outros aparelhos: redefine com a senha da conta e recomeça.
  const third = await open(users[0], `/conversas/${conversationId}`)
  await third.getByRole('heading', { name: 'Permita no seu outro aparelho' }).waitFor()
  await third.getByRole('button', { name: 'Não tenho mais acesso aos outros aparelhos' }).click()
  await third.getByLabel('Senha do Votz', { exact: true }).fill('senha errada')
  await third.getByRole('button', { name: 'Redefinir', exact: true }).click()
  await third.getByText('Senha incorreta.').waitFor()
  await third.getByLabel('Senha do Votz', { exact: true }).fill(password)
  await third.getByRole('button', { name: 'Redefinir', exact: true }).click()
  await ready(third)
  console.log('PASS: after losing the other devices, a wrong password is refused and the right one restarts; the browser then opens by itself')
  console.log('PASS: devices screen responsive at 1440, 390 and 320 px')
})()
  .catch((error) => {
    console.error(String(error.stack || error).split('\n').slice(0, 6).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (users.length) await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
    await db.$disconnect()
  })
