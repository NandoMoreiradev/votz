// Local-only end-to-end UI QA for Etapa 6: Configurações de conversas (privacidade, políticas, fonte e papel de parede).
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

let browser

async function rawRequest(actor, endpoint, method = 'GET', body) {
  return fetch(`${apiBase}/conversations${endpoint}`, {
    method,
    headers: { Authorization: `Bearer ${actor.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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

;(async () => {
  const hash = await bcrypt.hash(password, 4)
  const jwt = new JwtService({ secret: process.env.JWT_SECRET })
  for (const label of ['alice', 'bruno', 'carol']) {
    const user = await db.user.create({
      data: {
        email: `qa-cfg-${label}-${run}@votz.test`,
        username: `qa_cfg_${label}_${run.slice(0, 6)}`,
        name: `QA Cfg ${label[0].toUpperCase()}${label.slice(1)}`,
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
      token: jwt.sign({ sub: user.id, typ: 'access' }, { expiresIn: '15m', algorithm: 'HS256' }),
    })
  }
  const [alice, bruno, carol] = users

  // Cria conversa ativa entre Alice e Bruno para validar fonte e papel de parede no ChatPane.
  const abRes = await rawRequest(alice, '/direct', 'POST', { targetUserId: bruno.id })
  assert.ok(abRes.ok)
  const ab = await abRes.json()
  assert.ok((await rawRequest(bruno, `/${ab.id}/respond`, 'POST', { accept: true })).ok)

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const pageA = await open(alice, '/conversas')

  // 1) Navegar para Configurações de conversas e alterar preferências.
  await pageA.getByRole('link', { name: 'Configurações de conversas' }).click()
  await pageA.waitForURL((u) => u.pathname.endsWith('/conversas/configuracoes'))
  // A marcação confirma ~100 ms depois do clique (pedido ao servidor); .check() confere na hora e falharia.
  await pageA.getByLabel('Confirmação de leitura').click()
  await pageA.waitForFunction(() => document.getElementById('cfg-read-receipts')?.checked === true)
  await pageA.getByLabel('Visto por último').selectOption('NOBODY')
  await pageA.getByLabel('Quem pode me adicionar a grupos').selectOption('NOBODY')
  await pageA.getByLabel('Quem pode me enviar solicitações').selectOption('NOBODY')
  await pageA.getByLabel('Download automático de mídia').selectOption('NEVER')
  await pageA.getByLabel('Tamanho da fonte nas conversas').selectOption('LARGE')
  await pageA.getByLabel('Papel de parede das conversas').selectOption('SOFT')
  await pageA.waitForTimeout(600)

  // 2) Recarregar e confirmar persistência real.
  await pageA.reload({ waitUntil: 'domcontentloaded' })
  assert.equal(await pageA.getByLabel('Confirmação de leitura').isChecked(), true)
  assert.equal(await pageA.getByLabel('Visto por último').inputValue(), 'NOBODY')
  assert.equal(await pageA.getByLabel('Quem pode me enviar solicitações').inputValue(), 'NOBODY')
  assert.equal(await pageA.getByLabel('Tamanho da fonte nas conversas').inputValue(), 'LARGE')
  assert.equal(await pageA.getByLabel('Papel de parede das conversas').inputValue(), 'SOFT')
  console.log('PASS: conversation settings persist across reloads')

  // 3) Políticas reais aplicadas na API: Carol não consegue enviar solicitação direta nem criar grupo com Alice.
  const blockedDirect = await rawRequest(carol, '/direct', 'POST', { targetUserId: alice.id })
  assert.equal(blockedDirect.status, 403, 'directRequestPolicy=NOBODY blocks new direct request')
  const blockedGroup = await rawRequest(carol, '/groups', 'POST', {
    clientRequestId: randomUUID(),
    title: 'Grupo Bloqueado',
    memberIds: [alice.id],
  })
  assert.equal(blockedGroup.status, 403, 'groupInvitePolicy=NOBODY blocks group invite')
  console.log('PASS: privacy policies enforced server-side (direct + group)')

  // 4) Papel de parede SOFT aplicado no ChatPane.
  await pageA.goto(base + `/conversas/${ab.id}`, { waitUntil: 'domcontentloaded' })
  await pageA.locator('[data-wallpaper="SOFT"]').waitFor()
  console.log('PASS: wallpaper preference applied in ChatPane')

  // 5) Responsivo em Configurações.
  await pageA.goto(base + '/conversas/configuracoes', { waitUntil: 'domcontentloaded' })
  for (const width of [1440, 390, 320]) {
    await pageA.setViewportSize({ width, height: 950 })
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  console.log('PASS: Etapa 6 settings UI responsive at 1440, 390 and 320 px')
})()
  .catch((error) => {
    console.error(String(error.stack || error).split('\n').slice(0, 8).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (users.length) {
      await db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } })
    }
    await db.$disconnect()
  })
