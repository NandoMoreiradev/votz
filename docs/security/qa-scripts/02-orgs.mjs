import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp } from './lib.mjs'

const S = 'orgs'
const state = loadState()
resetThrottle()

// CNPJ com dígitos verificadores válidos
function cnpj(base12) {
  const calc = (d, w) => { const s = d.split('').reduce((a, c, i) => a + +c * w[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
  const d1 = calc(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = calc(base12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return base12 + d1 + d2
}
const partyId = sql(`select id from parties where abbreviation='AGIR' limit 1`)

note(S, 'BUG-1: POST /registration-requests com o campo opcional note devolve 500 (coluna note nao existe no modelo)')
const mod = new Session('mod')
const lm = await login(mod, 'qa.moderador@votz.test')
check(S, 'moderador loga (sem MFA, ver achado F1)', lm.ok, JSON.stringify(lm.r?.json ?? {}).slice(0, 100))

const defs = {
  entidade: { type: 'ENTITY', payload: { legalName: 'QA Prefeitura Teste Um', cnpj: cnpj('990000010001'), entityType: 'CITY_HALL', city: 'Aracaju', state: 'SE' } },
  entidade2: { type: 'ENTITY', payload: { legalName: 'QA Hospital Teste Dois', cnpj: cnpj('990000020001'), entityType: 'HOSPITAL', city: 'Aracaju', state: 'SE' } },
  politico: { type: 'POLITICIAN', payload: { fullName: 'QA Vereador Teste', office: 'Vereador', termStart: '2025-01-01', termEnd: '2028-12-31', electoralZone: '001', state: 'SE', city: 'Aracaju', partyId } },
  empresa: { type: 'COMPANY', payload: { legalName: 'QA Telecom Teste LTDA', tradeName: 'QA Telecom', cnpj: cnpj('990000030001'), sector: 'TELECOM', size: 'MEDIUM' } },
}

state.orgs ??= {}
for (const [tag, def] of Object.entries(defs)) {
  const s = new Session(tag)
  const l = await login(s, `qa.${tag}@votz.test`)
  if (!l.ok) { check(S, `${tag}: login`, false, JSON.stringify(l.r?.json)); continue }
  const c = await req(s, 'POST', '/registration-requests', { body: { type: def.type, payload: def.payload } })
  check(S, `${tag}: cria solicitação de cadastro (${def.type})`, c.status === 201, `status ${c.status} ${c.text.slice(0, 200)}`)
  const rid = c.json?.id
  if (!rid) continue
  // cidadão comum NÃO pode aprovar (papel)
  const bad = await req(s, 'POST', `/registration-requests/${rid}/approve`, { body: { reviewNote: 'tentando me auto-aprovar' } })
  check(S, `${tag}: auto-aprovação é negada (403)`, bad.status === 403, `status ${bad.status}`)
  const ap = await req(mod, 'POST', `/registration-requests/${rid}/approve`, { body: { reviewNote: 'QA ok' } })
  check(S, `${tag}: moderador aprova a solicitação`, ap.status === 201 || ap.status === 200, `status ${ap.status} ${ap.text.slice(0, 200)}`)
  state.orgs[tag] = { requestId: rid, def: def.type, approve: ap.json }
}

// o que o banco registrou
console.log(sql(`select u.email, u.type from users u where email like 'qa.%@votz.test' order by 1`))
console.log('orgs:', sql(`select 'entity', id, "legalName", plan::text from entities where "legalName" like 'QA %' union all select 'politician', id, name, plan::text from politicians where name like 'QA %' union all select 'company', id, "legalName", plan::text from companies where "legalName" like 'QA %'`))
saveState(state)
