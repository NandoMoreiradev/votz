// Local-only companion for physical Android interoperability QA. Demo accounts only.
// Commands and results stay in ignored .local/chat; no control port is exposed.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')
const { JwtService } = require('@nestjs/jwt')
const { chromium } = require(process.env.VOTZ_PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '../../..')
const directory = path.join(root, '.local/chat')
const commandFile = path.join(directory, 'native-qa-command.json')
const resultFile = path.join(directory, 'native-qa-result.json')
const db = new PrismaClient()
let context
const write = value => fs.writeFileSync(resultFile, JSON.stringify(value, null, 2))
;(async () => {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL).hostname))
  const users = await db.user.findMany({ where: { email: { in: ['demo.cidadao1@votz.test', 'demo.cidadao2@votz.test'] } }, select: { id: true, email: true } })
  const a = users.find(user => user.email === 'demo.cidadao1@votz.test')
  const b = users.find(user => user.email === 'demo.cidadao2@votz.test')
  assert.ok(a && b)
  const token = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: b.id, typ: 'access' }, { expiresIn: '15m', algorithm: 'HS256' })
  const response = await fetch('http://localhost:3000/api/v1/conversations/direct', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: a.id }) })
  assert.ok(response.ok, `Demo direct setup: HTTP ${response.status}`)
  const conversation = await response.json()
  context = await chromium.launchPersistentContext(path.join(directory, 'native-web-profile'), { headless: true, channel: 'chromium', viewport: { width: 1100, height: 850 } })
  const page = context.pages()[0] || await context.newPage()
  page.setDefaultTimeout(20000)
  await page.goto('http://localhost:5173/entrar')
  await page.locator('input[type=email]').fill(b.email)
  await page.locator('input[type=password]').fill('Demo@Votz2026!x')
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await page.waitForURL(url => !url.pathname.includes('/entrar'))
  await page.goto(`http://localhost:5173/conversas/${conversation.id}`)
  const state = async () => ({ conversationId: conversation.id, body: (await page.locator('body').innerText()).slice(-7000), codes: await page.getByLabel('Código de verificação', { exact: true }).allTextContents() })
  write({ ready: true, ...await state() })
  console.log(`Companion ready: ${conversation.id}`)
  let sequence = -1
  let running = true
  while (running) {
    let command
    try { command = JSON.parse(fs.readFileSync(commandFile, 'utf8')) } catch {}
    if (command && command.sequence !== sequence) {
      sequence = command.sequence
      try {
        if (command.action === 'activate') {
          await page.getByLabel('Senha das conversas', { exact: true }).fill('QA native companion keys 2026!')
          const repeat = page.getByLabel('Repita a senha das conversas', { exact: true })
          const initial = await repeat.count() > 0
          if (initial) await repeat.fill('QA native companion keys 2026!')
          await page.getByRole('button', { name: initial ? 'Ativar neste navegador' : 'Desbloquear', exact: true }).click()
        } else if (command.action === 'request') await page.getByRole('button', { name: 'Verificar identidade', exact: true }).click()
        else if (command.action === 'accept') await page.getByRole('button', { name: 'Aceitar verificação', exact: true }).click()
        else if (command.action === 'confirm') await page.getByRole('button', { name: 'Os códigos são iguais', exact: true }).click()
        else if (command.action === 'send') {
          assert.ok(typeof command.text === 'string' && command.text.startsWith('QA '))
          await page.getByLabel('Mensagem', { exact: true }).fill(command.text)
          await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click()
        } else if (command.action === 'read') {
          await page.getByRole('button', { name: 'Mais opções', exact: true }).click()
          await page.getByRole('checkbox', { name: 'Compartilhar quando eu ler' }).click()
        }
        else if (command.action === 'screenshot') await page.screenshot({ path: path.join(directory, 'native-web.png') })
        else if (command.action === 'reload') await page.reload()
        else if (command.action === 'stop') running = false
        else if (command.action !== 'state') throw new Error('Unknown QA command')
        write({ sequence, ok: true, ...await state() })
      } catch (error) { write({ sequence, ok: false, error: error.message, ...await state() }) }
    }
    await new Promise(resolve => setTimeout(resolve, 350))
  }
})().catch(error => { write({ error: error.message }); console.error(error.message); process.exitCode = 1 }).finally(async () => { await context?.close(); await db.$disconnect() })
