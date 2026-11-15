import { Session, req, sql, resetThrottle, check, note, loadState, login, totp, PASSWORD } from './lib.mjs'
const S = 'bug2'
const st = loadState(); resetThrottle()

async function asEntity() {
  const s = new Session('e')
  const l = await login(s, 'qa.entidade@votz.test', PASSWORD, st.users.entidade.mfaSecret)
  const sw = await req(s, 'POST', '/auth/switch-context', { body: { contextType: 'entity', contextId: st.orgIds.entidade, mfaCode: await totp(st.users.entidade.mfaSecret) } })
  s.token = sw.json.accessToken
  return s
}

// 1) como esta hoje (type = CITIZEN, aprovado pelo fluxo novo)
console.log('type no banco:', sql(`select type from users where email='qa.entidade@votz.test'`))
let s = await asEntity()
let r = await req(s, 'PATCH', `/reports/${st.reports.entidade}/status`, { body: { status: 'IN_PROGRESS', content: 'Equipe enviada ao local.' } })
check(S, 'entidade aprovada (type=CITIZEN) com contexto correto muda o status', r.status === 200, `status ${r.status} ${r.text.slice(0, 100)}`)

// 2) experimento: mesma conta com type=ENTITY (como as contas antigas de seed)
sql(`update users set type='ENTITY' where email='qa.entidade@votz.test'`)
s = await asEntity()
r = await req(s, 'PATCH', `/reports/${st.reports.entidade}/status`, { body: { status: 'IN_PROGRESS', content: 'Equipe enviada ao local para avaliar o reparo.' } })
note(S, `com type=ENTITY o MESMO usuario consegue: status ${r.status} ${r.text.slice(0, 80)}`)
// restaura o estado real do fluxo
sql(`update users set type='CITIZEN' where email='qa.entidade@votz.test'`)
console.log('restaurado type:', sql(`select type from users where email='qa.entidade@votz.test'`))
