// Mostra o código MFA (TOTP) atual de uma conta demo. Uso: node docs/dev/mfa.mjs prefeitura
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { totp } from '../security/qa-scripts/lib.mjs'

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-state.json')
if (!existsSync(file)) { console.error('Rode antes: node docs/dev/seed-demo.mjs'); process.exit(1) }
const st = JSON.parse(readFileSync(file, 'utf8'))
const tag = process.argv[2]
const u = st.users?.[tag]
if (!u?.mfaSecret) {
  console.log('Contas com MFA:', Object.entries(st.users ?? {}).filter(([, v]) => v.mfaSecret).map(([k]) => k).join(', '))
  process.exit(tag ? 1 : 0)
}
const left = 30 - (Math.floor(Date.now() / 1000) % 30)
console.log(`${u.email}\ncódigo: ${await totp(u.mfaSecret)}   (vale mais ${left}s)`)
