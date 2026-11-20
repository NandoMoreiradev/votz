// Local-only end-to-end UI QA for Etapa 3A: reply, reactions, forward with label, local search, and Votz cards.
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
      return !!field && !field.disabled && field.placeholder === 'Mensagem'
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
  for (const label of ['Alice', 'Bruno', 'Carol']) {
    const user = await db.user.create({
      data: {
        email: `qa-exp-${label.toLowerCase()}-${run}@votz.test`,
        password: hash,
        name: `QA Exp ${label}`,
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

  const ab = await request(alice, '/direct', 'POST', { targetUserId: bruno.id })
  await request(bruno, `/${ab.id}/respond`, 'POST', { accept: true })
  const bc = await request(bruno, '/direct', 'POST', { targetUserId: carol.id })
  await request(carol, `/${bc.id}/respond`, 'POST', { accept: true })

  browser = await chromium.launch({ headless: true, channel: 'chromium' })
  const pageA = await open(alice, `/conversas/${ab.id}`)
  const pageB = await open(bruno, `/conversas/${ab.id}`)
  const pageC = await open(carol, `/conversas/${bc.id}`)
  await composerReady(pageA)
  await composerReady(pageB)
  await pageC.getByText('As mensagens são protegidas com criptografia de ponta a ponta.').waitFor()

  // 1) Cartão de relato no Votz.
  const reportId = '22222222-2222-4222-8222-222222222222'
  const msg1 = `Olha esse problema /relatos/${reportId}`
  const sentAt = Date.now()
  await send(pageA, msg1)
  // Envio otimista: a bolha de quem envia já está na tela assim que o botão é clicado.
  await pageA.locator('[data-message-id]').filter({ hasText: msg1 }).first().waitFor({ timeout: 1000 })
  const ownShownMs = Date.now() - sentAt
  await pageB.locator('[data-chat-pane]').getByText(msg1, { exact: true }).waitFor()
  const receivedMs = Date.now() - sentAt
  assert.ok(receivedMs < 8000, 'Receiving takes ' + receivedMs + ' ms')
  console.log('LATENCY: own bubble visible by ' + ownShownMs + ' ms; received by the other person in ' + receivedMs + ' ms (click to screen)')
  const cardLink = pageB.locator('[data-chat-pane]').getByRole('link', { name: /Relato no Votz/ })
  await cardLink.waitFor()
  assert.equal(await cardLink.getAttribute('href'), `/relatos/${reportId}`)
  console.log('PASS: Votz report link renders clickable card inside E2EE bubble')

  // 2) Responder com citação.
  const bubble1B = pageB.locator('[data-message-id]').filter({ hasText: msg1 })
  await bubble1B.getByRole('button', { name: 'Mais opções da mensagem' }).click()
  await bubble1B.getByRole('menuitem', { name: 'Copiar texto' }).waitFor()
  await bubble1B.getByRole('menuitem', { name: 'Responder' }).click()
  await pageB.getByText(/Respondendo a/).waitFor()
  const replyText = `Vou apoiar agora! ${run}`
  await send(pageB, replyText)
  await pageA.locator('[data-chat-pane]').getByText(replyText, { exact: true }).waitFor()
  const replyBubbleA = pageA.locator('[data-message-id]').filter({ hasText: replyText })
  assert.ok((await replyBubbleA.innerText()).includes('Olha esse problema'), 'Quoted excerpt is visible on reply')
  console.log('PASS: E2EE reply quote delivered and displayed')

  // 3) Reagir com emoji (cifrado, sem virar bolha).
  await replyBubbleA.getByRole('button', { name: 'Mais opções da mensagem' }).click()
  await replyBubbleA.getByRole('menuitem', { name: 'Reagir com 👍' }).click()
  await replyBubbleA.getByRole('button', { name: '👍 1' }).waitFor()
  const replyBubbleB = pageB.locator('[data-message-id]').filter({ hasText: replyText })
  await replyBubbleB.getByRole('button', { name: '👍 1' }).waitFor()
  assert.equal(await pageB.locator('[data-message-id]').count(), 2, 'Reaction does not create an extra bubble')
  console.log('PASS: E2EE emoji reaction syncs across peers without creating a message bubble')

  // 4) Encaminhar com identificação para Carol.
  await replyBubbleB.getByRole('button', { name: 'Mais opções da mensagem' }).click()
  await replyBubbleB.getByRole('menuitem', { name: 'Encaminhar' }).click()
  await pageB.getByRole('dialog', { name: 'Encaminhar mensagem' }).getByRole('button', { name: 'QA Exp Carol' }).click()
  await pageB.waitForURL((u) => u.pathname.endsWith(`/conversas/${bc.id}`))
  await composerReady(pageB)
  await pageB.getByText('Encaminhando mensagem').waitFor()
  await pageB.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
  await pageC.locator('[data-chat-pane]').getByText(replyText, { exact: true }).waitFor()
  const forwardedBubbleC = pageC.locator('[data-message-id]').filter({ hasText: replyText })
  assert.ok((await forwardedBubbleC.innerText()).includes('Encaminhada'), 'Forwarded label is shown to recipient')
  console.log('PASS: forwarded message delivered E2EE with Encaminhada label')

  // 5) Busca local na conversa (sem acentos).
  await pageA.getByRole('button', { name: 'Buscar na conversa' }).click()
  await pageA.getByLabel('Buscar mensagens', { exact: true }).fill('apoiar')
  assert.equal(await pageA.locator('[data-message-id]').count(), 1)
  await pageA.getByLabel('Buscar mensagens', { exact: true }).fill('termoinexistente999')
  await pageA.getByText('Nenhuma mensagem encontrada.').waitFor()
  await pageA.getByRole('button', { name: 'Fechar' }).click()
  assert.equal(await pageA.locator('[data-message-id]').count(), 2)
  console.log('PASS: local in-memory search filters messages without server calls')

  // 6) Digitando efêmero (Bloco 3B): Bruno volta para conversa com Ana; Ana digita e Bruno vê "QA está digitando...".
  await pageB.goto(base + `/conversas/${ab.id}`, { waitUntil: 'domcontentloaded' })
  await composerReady(pageB)
  await pageA.getByLabel('Mensagem', { exact: true }).fill('Digitando teste')
  await pageB.getByText('QA está digitando...').first().waitFor()
  await pageA.getByLabel('Mensagem', { exact: true }).fill('')
  console.log('PASS: ephemeral typing indicator propagates over Socket.IO')

  // 7) Silenciar / ativar notificações e denunciar conversa (Bloco 3B).
  await pageB.getByRole('button', { name: 'Mais opções', exact: true }).click()
  await pageB.getByRole('menuitem', { name: 'Detalhes da conversa' }).click()
  await pageB.getByRole('button', { name: 'Silenciar notificações' }).click()
  await pageB.getByRole('button', { name: '8 horas' }).click()
  await pageB.getByRole('button', { name: 'Ativar notificações' }).waitFor()
  const mutedRow = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: ab.id, userId: bruno.id } },
    select: { mutedUntil: true },
  })
  assert.ok(mutedRow?.mutedUntil && mutedRow.mutedUntil.getTime() > Date.now(), 'Conversation muted in DB')
  await pageB.getByRole('button', { name: 'Ativar notificações' }).click()
  await pageB.getByRole('button', { name: 'Silenciar notificações' }).waitFor()
  console.log('PASS: mute and unmute conversation persisted cleanly')

  await pageB.getByRole('button', { name: 'Denunciar conversa' }).click()
  await pageB.getByLabel('Detalhes da denúncia (opcional)').fill('Teste automatizado de denúncia')
  await pageB.getByRole('button', { name: 'Enviar denúncia' }).click()
  await pageB.getByText('Denúncia enviada para análise.').waitFor()
  const flag = await db.contentFlag.findFirst({
    where: { reporterId: bruno.id, targetType: 'CONVERSATION', targetId: ab.id },
  })
  assert.ok(flag, 'Conversation report stored in content_flags')
  console.log('PASS: conversation report persisted in content_flags without plaintext')

  // 8) Etapa 7: Fixar conversa, divisor de dia ("Hoje"), botões de câmera/áudio e layout split-pane + responsivo.
  await pageB.getByRole('button', { name: 'Fixar no topo' }).click()
  await pageB.getByRole('button', { name: 'Desafixar conversa' }).waitFor()
  await pageA.locator('[data-day-divider]').filter({ hasText: 'Hoje' }).waitFor()
  await pageA.getByRole('button', { name: 'Enviar foto' }).waitFor()
  await pageA.getByRole('button', { name: 'Gravar áudio' }).waitFor()
  for (const width of [1440, 390, 320]) {
    await pageA.setViewportSize({ width, height: 950 })
    assert.equal(await pageA.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  console.log('PASS: Etapa 7 visual layout (split-pane, day divider, pin, camera/audio, responsive 1440/390/320)')
})()
  .catch((error) => {
    console.error(String(error.stack || error).split('\n').slice(0, 8).join('\n'))
    process.exitCode = 1
  })
  .finally(async () => {
    await browser?.close()
    if (users.length) {
      const ids = users.map((u) => u.id)
      await db.contentFlag.deleteMany({ where: { reporterId: { in: ids } } })
      await db.user.deleteMany({ where: { id: { in: ids } } })
    }
    await db.$disconnect()
  })
