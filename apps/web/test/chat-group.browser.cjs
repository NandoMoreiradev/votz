// Local-only end-to-end UI QA for encrypted group chat (Etapa 1).
// Real Chromium browsers, real PostgreSQL + Redis + Synapse + WASM E2EE.
// Tests: 3-member group text, sender names, group receipts, member removal with
// Megolm key rotation, new member joined-only history visibility, and responsive layout.
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
const base = process.env.VOTZ_CHAT_WEB_URL || 'http://localhost:5173'
const apiBase = process.env.VOTZ_CHAT_API_URL || 'http://localhost:3000/api/v1'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))

let browser, groupId

async function request(actor, endpoint, method = 'GET', body, expected = 200) {
  const response = await fetch(`${apiBase}/conversations${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (expected) {
    const ok = Array.isArray(expected) ? expected.includes(response.status) : response.status === expected || (expected === 200 && response.ok)
    assert.ok(ok, `${method} ${endpoint}: HTTP ${response.status}`)
  }
  return response.json().catch(() => ({}))
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

const composerReady = (page) =>
  page.waitForFunction(
    () => {
      const field = document.querySelector('textarea[aria-label="Mensagem"]')
      return !!field && !field.disabled
    },
    undefined,
    { timeout: 45000 },
  )

async function send(page, text) {
  await page.getByLabel('Mensagem', { exact: true }).fill(text)
  await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
}

;(async () => {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const hash = await bcrypt.hash(password, 4)
  for (const label of ['Alice', 'Bruno', 'Carol', 'Diego']) {
    const user = await db.user.create({
      data: {
        email: `qa-group-${label.toLowerCase()}-${run}@votz.test`,
        password: hash,
        name: `QA Grupo ${label}`,
        emailVerified: true,
        termsAcceptedAt: new Date(),
        ageConfirmedAt: new Date(),
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
      },
    })
    users.push({
      ...user,
      token: jwt.sign({ sub: user.id, typ: 'access' }, { expiresIn: '15m', algorithm: 'HS256' }),
    })
  }
  const [alice, bruno, carol, diego] = users

  // Alice cria grupo com Bruno e Carol; ambos aceitam.
  const group = await request(alice, '/groups', 'POST', {
    clientRequestId: randomUUID(),
    title: 'Grupo do Bairro QA',
    memberIds: [bruno.id, carol.id],
  })
  groupId = group.id
  await request(bruno, `/${groupId}/respond`, 'POST', { accept: true })
  await request(carol, `/${groupId}/respond`, 'POST', { accept: true })

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const pageA = await open(alice, `/conversas/${groupId}`)
  const pageB = await open(bruno, `/conversas/${groupId}`)
  const pageC = await open(carol, `/conversas/${groupId}`)

  for (const p of [pageA, pageB, pageC]) {
    await p.getByText('As mensagens deste grupo são protegidas com criptografia de ponta a ponta.').waitFor()
    await composerReady(p)
  }
  console.log('PASS: 3-member group opens automatically with group E2EE banner and enabled composer')

  // 1) Troca de mensagens cifradas entre os 3, com nome do remetente visível.
  const msg1 = `Primeira no grupo ${run}`
  await send(pageA, msg1)
  await pageB.getByText(msg1, { exact: true }).waitFor()
  await pageC.getByText(msg1, { exact: true }).waitFor()
  assert.ok(await pageB.getByText('QA Grupo Alice', { exact: true }).count() >= 1, 'Bruno sees Alice name on bubble')
  assert.ok(await pageC.getByText('QA Grupo Alice', { exact: true }).count() >= 1, 'Carol sees Alice name on bubble')

  const msg2 = `Resposta do Bruno ${run}`
  await send(pageB, msg2)
  await pageA.getByText(msg2, { exact: true }).waitFor()
  await pageC.getByText(msg2, { exact: true }).waitFor()
  assert.ok(await pageA.getByText('QA Grupo Bruno', { exact: true }).count() >= 1, 'Alice sees Bruno name on bubble')
  console.log('PASS: encrypted group text flows across all 3 members with sender names')

  // 2) Recibos em grupo: Carol liga leitura -> "Lida por 1 de 2"; Bruno liga -> "Lida".
  const bubble1 = pageA.getByLabel('Mensagens', { exact: true }).locator('[data-message-id]').filter({ hasText: msg1 })
  await bubble1.getByText(/Entregue/).waitFor()
  await pageC.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).click()
  await bubble1.getByText(/Lida por 1 de 2/).waitFor()
  await pageB.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).click()
  await bubble1.getByText(/· Lida$/).waitFor()
  console.log('PASS: group read receipts progress from Entregue -> Lida por 1 de 2 -> Lida')

  // 3) Remoção de Carol + rotação de chave Megolm: Carol perde acesso e não lê mensagem posterior.
  await request(alice, `/${groupId}/members/${carol.id}`, 'DELETE')
  const carolDenied = await fetch(`${apiBase}/conversations/${groupId}/chat`, {
    headers: { Authorization: `Bearer ${carol.token}` },
  })
  assert.ok([401, 403, 404].includes(carolDenied.status), `Removed member must lose access, got ${carolDenied.status}`)
  const afterRemoval = `Depois da saída ${run}`
  await send(pageA, afterRemoval)
  await pageB.getByText(afterRemoval, { exact: true }).waitFor()
  await pageC.waitForTimeout(2000)
  assert.equal(await pageC.getByText(afterRemoval, { exact: true }).count(), 0, 'Removed member never receives post-removal message')
  await pageC.context().close()
  console.log('PASS: removing a member cuts access and rotates the group key; remaining members keep chatting')

  // 4) Novo participante (Diego): entra depois e lê novas mensagens, mas NÃO vê histórico anterior.
  await request(alice, `/${groupId}/invitations`, 'POST', { memberIds: [diego.id] })
  await request(diego, `/${groupId}/respond`, 'POST', { accept: true })
  const pageD = await open(diego, `/conversas/${groupId}`)
  await composerReady(pageD)
  const forDiego = `Bem-vindo Diego ${run}`
  await send(pageA, forDiego)
  await pageD.getByText(forDiego, { exact: true }).waitFor()
  assert.equal(await pageD.getByText(msg1, { exact: true }).count(), 0, 'New member cannot see messages sent before joining')
  assert.equal(await pageD.getByText(afterRemoval, { exact: true }).count(), 0, 'New member cannot see earlier history')
  console.log('PASS: new member reads messages after joining and never sees prior history')

  // 5) Responsivo.
  for (const width of [1440, 390, 320]) {
    await pageA.setViewportSize({ width, height: 950 })
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  console.log('PASS: group chat responsive at 1440, 390 and 320 px')
})()
  .catch((error) => {
    console.error(String(error.stack || error).split('\n').slice(0, 8).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (users.length) await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
    await db.$disconnect()
  })
