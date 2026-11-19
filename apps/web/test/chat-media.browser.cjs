// Local-only end-to-end UI QA for encrypted media attachments (Etapa 2A, 90-day retention).
// Real Chromium browsers, real PostgreSQL + Redis + MinIO + Synapse + official Matrix v2 attachment encryption.
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

// Valid 1x1 red PNG image.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

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

const composerReady = (page) =>
  page.waitForFunction(
    () => {
      const field = document.querySelector('textarea[aria-label="Mensagem"]')
      return !!field && !field.disabled
    },
    undefined,
    { timeout: 45000 },
  )

;(async () => {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  const hash = await bcrypt.hash(password, 4)
  for (const label of ['Alice', 'Bruno', 'Carol']) {
    const user = await db.user.create({
      data: {
        email: `qa-media-${label.toLowerCase()}-${run}@votz.test`,
        password: hash,
        name: `QA Midia ${label}`,
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
  const [alice, bruno, carol] = users

  const direct = await request(alice, '/direct', 'POST', { targetUserId: bruno.id })
  conversationId = direct.id
  await request(bruno, `/${conversationId}/respond`, 'POST', { accept: true })

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const pageA = await open(alice, `/conversas/${conversationId}`)
  const pageB = await open(bruno, `/conversas/${conversationId}`)
  await composerReady(pageA)
  await composerReady(pageB)

  // 1) Alice envia uma imagem cifrada com legenda; Bruno decifra e renderiza o <img>.
  const caption = `Foto protegida ${run}`
  await pageA.getByLabel('Mensagem', { exact: true }).fill(caption)
  await pageA.locator('input[type="file"][aria-label="Escolher arquivo"]').setInputFiles({
    name: 'ponto.png',
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  await pageB.getByText(caption, { exact: true }).waitFor()
  const imgB = pageB.locator('img[alt="ponto.png"]')
  await imgB.waitFor()
  await pageB.waitForFunction(() => {
    const img = document.querySelector('img[alt="ponto.png"]')
    return !!img && img.complete && img.naturalWidth === 1 && img.naturalHeight === 1
  })
  console.log('PASS: encrypted image uploaded, decrypted in memory via Matrix v2, and rendered inline')

  // 2) Bruno envia um arquivo cifrado; Alice vê o botão de download com nome e tamanho.
  const secretText = `Relatorio confidencial ${run}`
  await pageB.locator('input[type="file"][aria-label="Escolher arquivo"]').setInputFiles({
    name: 'relatorio.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(secretText, 'utf8'),
  })
  await pageA.getByRole('button', { name: /Baixar arquivo \(relatorio\.txt/ }).waitFor()
  console.log('PASS: encrypted file sent and received with download control')

  // 3) Metadados no banco: retenção de 90 dias e isolamento de acesso para terceiros (Carol).
  const attachments = await db.chatAttachment.findMany({ where: { conversationId } })
  assert.equal(attachments.length, 2, 'Two encrypted attachments persisted in chat_attachments')
  for (const row of attachments) {
    const days = (row.expiresAt.getTime() - row.createdAt.getTime()) / (24 * 60 * 60 * 1000)
    assert.ok(days >= 89.9 && days <= 90.1, `Expected 90-day retention, got ${days}`)
  }
  const outsider = await fetch(`${apiBase}/conversations/${conversationId}/chat/media/${attachments[0].id}`, {
    headers: { Authorization: `Bearer ${carol.token}` },
  })
  assert.ok([401, 403, 404].includes(outsider.status), `Outsider must be denied, got ${outsider.status}`)
  console.log('PASS: 90-day retention recorded and outsider denied access to encrypted media')

  // 4) Responsivo.
  for (const width of [1440, 390, 320]) {
    await pageB.setViewportSize({ width, height: 950 })
    assert.equal(await pageB.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  console.log('PASS: media bubbles responsive at 1440, 390 and 320 px')
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
