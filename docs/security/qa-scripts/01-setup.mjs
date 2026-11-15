import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp, PASSWORD } from './lib.mjs'

const S = 'setup'
const state = loadState()
state.users ??= {}
const TAGS = ['cidadao_a', 'cidadao_b', 'moderador', 'admin', 'entidade', 'entidade2', 'politico', 'empresa', 'sem_vinculo']
console.log('throttle keys removidas:', resetThrottle())

let n = 11
for (const tag of TAGS) {
  const email = `qa.${tag}@votz.test`
  const s = new Session(tag)
  const r = await req(s, 'POST', '/auth/register', {
    auth: false,
    body: {
      name: `QA ${tag.replace('_', ' ')}`, email, password: PASSWORD,
      phone: `+55799999900${n++}`, zipCode: '49000000', streetNumber: '10',
      acceptedTermsVersion: '2026-11-14', acceptedPrivacyVersion: '2026-11-14', confirmAge18: true,
    },
  })
  if (r.status === 409) note(S, `${tag}: já existia`)
  else check(S, `cadastro ${tag}`, r.status === 201 || r.status === 200, `status ${r.status} ${r.text.slice(0, 160)}`)
  state.users[tag] = { email, id: r.json?.user?.id ?? state.users[tag]?.id }
  if (r.status === 201 || r.status === 200) {
    check(S, `${tag}: cadastro devolve cookie de refresh e NÃO devolve o hash da senha`, s.cookies.has('votz_refresh_token') && !/"password"/.test(r.text))
  }
}

// e-mails verificados direto no banco (SMTP não configurado neste ambiente)
console.log(sql(`update users set "emailVerified"=true where email like 'qa.%@votz.test'; `))
console.log(sql(`update users set type='MODERATOR' where email='qa.moderador@votz.test'`))
console.log(sql(`update users set type='ADMIN' where email='qa.admin@votz.test'`))
const ids = sql(`select email, id, type from users where email like 'qa.%@votz.test' order by email`).split('\n').map((l) => l.split('|'))
for (const [email, id, type] of ids) { const tag = email.slice(3, -10); state.users[tag] = { ...(state.users[tag] ?? {}), email, id, type } }
check(S, 'contas qa criadas no banco', ids.length === TAGS.length, `${ids.length} contas`)

// MFA obrigatório para MODERATOR e ADMIN: fluxo real (setup/forced -> enable/forced)
for (const tag of ['moderador', 'admin']) {
  resetThrottle()
  const s = new Session(tag)
  const l = await login(s, `qa.${tag}@votz.test`)
  check(S, `${tag}: login sem MFA ativo exige configurar MFA (requiresMfaSetup)`, l.needsSetup === true, JSON.stringify(l.r?.json ?? {}).slice(0, 120))
  if (!l.needsSetup) continue
  const sp = await req(s, 'POST', '/auth/mfa/setup/forced', { token: l.setupToken, auth: false })
  const secret = sp.json?.secret
  check(S, `${tag}: setup/forced devolve segredo e QR`, !!secret && !!sp.json?.qrCode, `status ${sp.status}`)
  const en = await req(s, 'POST', '/auth/mfa/enable/forced', { token: l.setupToken, auth: false, body: { code: await totp(secret) } })
  check(S, `${tag}: enable/forced conclui e devolve sessão + códigos de backup`, en.status === 200 && !!en.json?.accessToken && en.json?.backupCodes?.length === 8, `status ${en.status} ${en.text.slice(0, 120)}`)
  state.users[tag].mfaSecret = secret
  state.users[tag].backupCodes = en.json?.backupCodes
  // o segredo agora deve estar CIFRADO no banco (v1:...)
  const stored = sql(`select "mfaSecret" from users where email='qa.${tag}@votz.test'`)
  check(S, `${tag}: segredo MFA está cifrado no banco (prefixo v1:)`, stored.startsWith('v1:'), stored.slice(0, 20))
}
saveState(state)
console.log('\nestado salvo.')
