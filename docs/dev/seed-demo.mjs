// Dados de demonstração do Votz (SOMENTE ambiente local de desenvolvimento).
// Cria contas, organizações com planos diferentes e ~140 relatos em Aracaju, para navegar em todas as telas.
// Uso (com Docker, API em http://127.0.0.1:3000 e Redis no ar):
//   node docs/dev/seed-demo.mjs          -> cria (ou completa) os dados
//   node docs/dev/seed-demo.mjs --reset  -> apaga só os dados "demo" e recria
// Depois rode: npm run db:backfill-sla --workspace=@votz/database && npm run analytics:backfill --workspace=apps/api
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { Session, req, sql, resetThrottle, login, totp, DOCKER } from '../security/qa-scripts/lib.mjs'
import { encodeGeohash7 } from '../../packages/shared-types/src/analytics.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const STATE_FILE = path.join(HERE, 'demo-state.json')
export const DEMO_PASSWORD = 'Demo@Votz2026!x'
const RESET = process.argv.includes('--reset')

const load = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {})
const save = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))
const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const log = (m) => console.log(m)
// comandos grandes vão pela entrada padrão (o limite de argumentos do Windows é ~32 mil caracteres)
const bulk = (text) => execFileSync(DOCKER, ['exec', '-i', 'votz-postgres', 'psql', '-U', 'votz', '-d', 'votz', '-q', '-v', 'ON_ERROR_STOP=1'], { input: text, encoding: 'utf8' })

// ── limpeza dos dados demo ──────────────────────────────────────────────────
function wipeDemo() {
  const U = `(select id from users where email like 'demo.%@votz.test')`
  const O = `((select id from entities where "legalName" like '%(Demo)') union all (select id from politicians where name like '%(Demo)'))`
  const R = `(select id from reports where title like '[Demo]%' or "authorId" in ${U})`
  const stmts = [
    `delete from notifications where "userId" in ${U} or "reportId" in ${R}`,
    `delete from votes where "userId" in ${U} or "reportId" in ${R}`,
    `update comments set "parentId"=null where "reportId" in ${R} or "authorId" in ${U}`,
    `delete from comments where "reportId" in ${R} or "authorId" in ${U}`,
    `delete from report_followers where "reportId" in ${R}`,
    `delete from timeline_events where "reportId" in ${R} or "authorId" in ${U}`,
    `delete from moderation_actions where "actorId" in ${U} or "targetId" in (select id::text from reports where id in ${R})`,
    `delete from reports where id in ${R}`,
    `delete from member_invites where "orgId" in ${O} or email like 'demo.%@votz.test'`,
    `delete from org_memberships where "userId" in ${U} or "orgId" in ${O}`,
    `delete from org_roles where "orgId" in ${O}`,
    `delete from registration_requests where "requesterId" in ${U}`,
    `delete from api_keys where "userId" in ${U}`,
    `delete from refresh_tokens where "userId" in ${U}`,
    `delete from access_logs where "userId" in ${U}`,
    `delete from entities where "legalName" like '%(Demo)'`,
    `delete from politicians where name like '%(Demo)'`,
    `delete from users where email like 'demo.%@votz.test'`,
    `delete from area_metrics_daily`,
    `delete from recipient_metrics_daily`,
    `delete from recurrence_cells`,
  ]
  for (const s of stmts) { try { sql(s) } catch (e) { log(`  (aviso) ${s.slice(0, 60)}… ${String(e.message).split('\n')[0].slice(0, 80)}`) } }
  if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, '{}')
  log('dados demo removidos (rollups do painel zerados; rode o analytics:backfill)')
}

if (RESET) wipeDemo()
const state = load()
state.users ??= {}
state.orgs ??= {}

// ── contas ──────────────────────────────────────────────────────────────────
const USERS = [
  { tag: 'admin', name: 'Demo Administrador', type: 'ADMIN', mfa: 'forced' },
  { tag: 'moderador', name: 'Demo Moderador', type: 'MODERATOR', mfa: 'forced' },
  { tag: 'cidadao1', name: 'Ana Cidadã (Demo)' },
  { tag: 'cidadao2', name: 'Bruno Cidadão (Demo)' },
  { tag: 'cidadao3', name: 'Carla Cidadã (Demo)' },
  { tag: 'prefeitura', name: 'Gestor da Prefeitura (Demo)', mfa: 'org' },
  { tag: 'saude', name: 'Gestor da Saúde (Demo)', mfa: 'org' },
  { tag: 'ouvidoria', name: 'Gestor da Ouvidoria (Demo)', mfa: 'org' },
  { tag: 'vereador', name: 'Vereador Demo', mfa: 'org' },
  { tag: 'prefeito', name: 'Prefeito Demo', mfa: 'org' },
  { tag: 'deputado', name: 'Deputado Demo', mfa: 'org' },
]
resetThrottle()
let n = 31
for (const u of USERS) {
  const email = `demo.${u.tag}@votz.test`
  const cur = state.users[u.tag] ?? {}
  if (cur.created) { n++; continue }
  resetThrottle()
  const s = new Session(u.tag)
  const r = await req(s, 'POST', '/auth/register', {
    auth: false,
    body: {
      name: u.name, email, password: DEMO_PASSWORD, phone: `+55799988${String(n++).padStart(4, '0')}`,
      zipCode: '49000000', streetNumber: '10', acceptedTermsVersion: '2026-11-14', acceptedPrivacyVersion: '2026-11-14', confirmAge18: true,
    },
  })
  if (![200, 201, 409].includes(r.status)) throw new Error(`cadastro ${u.tag}: ${r.status} ${r.text.slice(0, 200)}`)
  state.users[u.tag] = { ...cur, email, created: true }
  log(`conta ${email} ${r.status === 409 ? '(já existia)' : 'criada'}`)
}
sql(`update users set "emailVerified"=true where email like 'demo.%@votz.test'`)
sql(`update users set type='MODERATOR' where email='demo.moderador@votz.test'`)
sql(`update users set type='ADMIN' where email='demo.admin@votz.test'`)
for (const u of USERS) state.users[u.tag].id = sql(`select id from users where email='demo.${u.tag}@votz.test'`)
save(state)

// MFA obrigatório para admin e moderador (fluxo real)
for (const u of USERS.filter((x) => x.mfa === 'forced')) {
  if (state.users[u.tag].mfaSecret) continue
  resetThrottle()
  const s = new Session(u.tag)
  const l = await login(s, `demo.${u.tag}@votz.test`, DEMO_PASSWORD)
  if (!l.needsSetup) throw new Error(`${u.tag}: esperado requiresMfaSetup`)
  const sp = await req(s, 'POST', '/auth/mfa/setup/forced', { token: l.setupToken, auth: false })
  const secret = sp.json?.secret
  const en = await req(s, 'POST', '/auth/mfa/enable/forced', { token: l.setupToken, auth: false, body: { code: await totp(secret) } })
  if (en.status !== 200) throw new Error(`${u.tag}: enable/forced ${en.status} ${en.text.slice(0, 120)}`)
  state.users[u.tag].mfaSecret = secret
  log(`MFA ativado: ${u.tag}`)
}
save(state)

// ── organizações ────────────────────────────────────────────────────────────
const cnpj = (b12) => {
  const calc = (d, w) => { const s = d.split('').reduce((a, c, i) => a + +c * w[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r }
  const d1 = calc(b12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); const d2 = calc(b12 + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return b12 + d1 + d2
}
const entityTypes = sql(`select string_agg(e.enumlabel, ',') from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='EntityType'`).split(',')
const thirdType = entityTypes.find((t) => !['CITY_HALL', 'HOSPITAL'].includes(t)) ?? 'CITY_HALL'
const partyId = sql(`select id from parties where abbreviation='AGIR' limit 1`) || sql(`select id from parties limit 1`)
const ORGS = [
  { tag: 'prefeitura', kind: 'ENTITY', plan: 'INTEGRACAO', name: 'Prefeitura de Aracaju (Demo)', payload: { legalName: 'Prefeitura de Aracaju (Demo)', cnpj: cnpj('990001010001'), entityType: 'CITY_HALL', city: 'Aracaju', state: 'SE' } },
  { tag: 'saude', kind: 'ENTITY', plan: 'GESTAO', name: 'Secretaria de Saúde de Aracaju (Demo)', payload: { legalName: 'Secretaria de Saúde de Aracaju (Demo)', cnpj: cnpj('990001020001'), entityType: 'HOSPITAL', city: 'Aracaju', state: 'SE' } },
  { tag: 'ouvidoria', kind: 'ENTITY', plan: 'BASICO', name: 'Ouvidoria Municipal (Demo)', payload: { legalName: 'Ouvidoria Municipal (Demo)', cnpj: cnpj('990001030001'), entityType: thirdType, city: 'Aracaju', state: 'SE' } },
  { tag: 'vereador', kind: 'POLITICIAN', plan: 'BASICO', name: 'Vereador Demo (Demo)', payload: { fullName: 'Vereador Demo (Demo)', office: 'Vereador', termStart: '2025-01-01', termEnd: '2028-12-31', electoralZone: '001', state: 'SE', city: 'Aracaju', partyId } },
  { tag: 'prefeito', kind: 'POLITICIAN', plan: 'MANDATO', name: 'Prefeito Demo (Demo)', payload: { fullName: 'Prefeito Demo (Demo)', office: 'Prefeito', termStart: '2025-01-01', termEnd: '2028-12-31', electoralZone: '001', state: 'SE', city: 'Aracaju', partyId } },
  { tag: 'deputado', kind: 'POLITICIAN', plan: 'MANDATO_PRO', name: 'Deputado Demo (Demo)', payload: { fullName: 'Deputado Demo (Demo)', office: 'Deputado Estadual', termStart: '2023-02-01', termEnd: '2027-01-31', electoralZone: '001', state: 'SE', partyId } },
]
const mod = new Session('mod')
resetThrottle()
const lm = await login(mod, 'demo.moderador@votz.test', DEMO_PASSWORD, state.users.moderador.mfaSecret)
if (!lm.ok) throw new Error('moderador não conseguiu logar: ' + JSON.stringify(lm.r?.json).slice(0, 150))
for (const o of ORGS) {
  if (state.orgs[o.tag]?.id) continue
  resetThrottle()
  const s = new Session(o.tag)
  const l = await login(s, `demo.${o.tag}@votz.test`, DEMO_PASSWORD, state.users[o.tag].mfaSecret)
  if (!l.ok) throw new Error(`${o.tag}: login ${JSON.stringify(l.r?.json).slice(0, 150)}`)
  const c = await req(s, 'POST', '/registration-requests', { body: { type: o.kind, payload: o.payload } })
  if (c.status !== 201) throw new Error(`${o.tag}: solicitação ${c.status} ${c.text.slice(0, 200)}`)
  const ap = await req(mod, 'POST', `/registration-requests/${c.json.id}/approve`, { body: { reviewNote: 'Dados de demonstração' } })
  if (![200, 201].includes(ap.status)) throw new Error(`${o.tag}: aprovação ${ap.status} ${ap.text.slice(0, 200)}`)
  const id = o.kind === 'ENTITY'
    ? sql(`select id from entities where "legalName"=${q(o.name)} limit 1`)
    : sql(`select id from politicians where name=${q(o.name)} limit 1`)
  state.orgs[o.tag] = { id, kind: o.kind, plan: o.plan, name: o.name }
  // MFA (necessário para trocar de perfil)
  if (!state.users[o.tag].mfaSecret) {
    const sp = await req(s, 'POST', '/auth/mfa/setup')
    const secret = sp.json?.secret
    const en = await req(s, 'POST', '/auth/mfa/enable', { body: { code: await totp(secret) } })
    if (en.status !== 200) throw new Error(`${o.tag}: MFA ${en.status}`)
    state.users[o.tag].mfaSecret = secret
  }
  log(`organização criada: ${o.name} (${o.plan})`)
  save(state)
}
for (const o of ORGS) {
  const tbl = o.kind === 'ENTITY' ? 'entities' : 'politicians'
  sql(`update ${tbl} set plan='${o.plan}' where id='${state.orgs[o.tag].id}'`)
}
// a Prefeitura declara prazos próprios (horas); a Saúde fica sem prazo próprio de propósito
sql(`update entities set "slaHours"='{"INFRASTRUCTURE":72,"MOBILITY":48,"SANITATION":48,"URBAN_SERVICES":72,"ENVIRONMENT":96}'::jsonb where id='${state.orgs.prefeitura.id}'`)
save(state)

// ── relatos, apoios, comentários e linha do tempo ───────────────────────────
const existing = Number(sql(`select count(*) from reports where title like '[Demo]%'`))
if (existing >= 100) {
  log(`já existem ${existing} relatos demo; mantendo.`)
} else {
  let seed = 20261116
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
  const pick = (a) => a[Math.floor(rnd() * a.length)]
  const BAIRROS = [
    ['Centro', -10.9112, -37.0717], ['Atalaia', -11.0069, -37.0550], ['Farolândia', -10.9640, -37.0560],
    ['Jardins', -10.9380, -37.0540], ['Siqueira Campos', -10.9200, -37.0640], ['Santos Dumont', -10.8860, -37.0700],
    ['Getúlio Vargas', -10.9020, -37.0500], ['Luzia', -10.9380, -37.0620],
  ]
  const CATS = {
    INFRASTRUCTURE: ['Buraco grande na rua', 'Calçada quebrada', 'Poste apagado', 'Bueiro entupido'],
    MOBILITY: ['Semáforo apagado no cruzamento', 'Ponto de ônibus sem cobertura', 'Faixa de pedestres apagada'],
    SANITATION: ['Esgoto a céu aberto', 'Lixo acumulado há dias', 'Falta de coleta de lixo'],
    HEALTH: ['Posto de saúde sem médico', 'Falta de remédio na farmácia do posto', 'Fila enorme para consulta'],
    SAFETY: ['Rua sem iluminação e assaltos', 'Praça abandonada e perigosa'],
    EDUCATION: ['Escola sem merenda', 'Escola sem professor de matemática'],
    URBAN_SERVICES: ['Mato alto no terreno público', 'Entulho na calçada'],
    ENVIRONMENT: ['Árvore caída na via', 'Queimada em terreno baldio'],
  }
  const catList = Object.keys(CATS)
  const ent = (t) => state.orgs[t].id
  const politicos = ['vereador', 'prefeito', 'deputado']
  const recipientFor = (cat) => {
    if (['INFRASTRUCTURE', 'MOBILITY', 'SANITATION', 'URBAN_SERVICES', 'ENVIRONMENT'].includes(cat)) return rnd() < 0.85 ? ['ENTITY', ent('prefeitura')] : ['POLITICIAN', ent(pick(politicos))]
    if (cat === 'HEALTH') return ['ENTITY', ent('saude')]
    if (cat === 'EDUCATION') return rnd() < 0.5 ? ['ENTITY', ent('ouvidoria')] : ['POLITICIAN', ent(pick(politicos))]
    return ['POLITICIAN', ent(pick(politicos))]
  }
  const citizens = ['cidadao1', 'cidadao2', 'cidadao3'].map((t) => state.users[t].id)
  const now = Date.now()
  const rows = []; const votes = []; const comments = []; const timeline = []
  const TOTAL = 140
  for (let i = 0; i < TOTAL; i++) {
    const cat = pick(catList)
    const [bairro, blat, blng] = pick(BAIRROS)
    const lat = +(blat + (rnd() - 0.5) * 0.0016).toFixed(5)
    const lng = +(blng + (rnd() - 0.5) * 0.0016).toFixed(5)
    const [rt, rid] = rnd() < 0.06 ? [null, null] : recipientFor(cat)
    const ageH = Math.floor(rnd() * 24 * 75) + 6
    const created = new Date(now - ageH * 3600_000)
    const roll = rnd()
    const status = roll < 0.3 ? 'RESOLVED' : roll < 0.5 ? 'IN_PROGRESS' : roll < 0.65 ? 'UNDER_REVIEW' : roll < 0.95 ? 'OPEN' : 'DISPUTED'
    const respH = status === 'OPEN' ? (rnd() < 0.25 ? Math.floor(rnd() * 90) + 3 : null) : Math.floor(rnd() * 70) + 2
    const first = respH !== null && respH < ageH ? new Date(created.getTime() + respH * 3600_000) : null
    const resolved = status === 'RESOLVED' ? new Date(Math.min(now - 3600_000, (first ?? created).getTime() + (Math.floor(rnd() * 150) + 10) * 3600_000)) : null
    const anonymous = rnd() < 0.3
    const author = anonymous ? null : pick(citizens)
    const id = randomUUID()
    const title = `[Demo] ${pick(CATS[cat])} - ${bairro}`
    const nSup = Math.floor(rnd() * 4)
    const supporters = [...citizens].sort(() => rnd() - 0.5).slice(0, nSup)
    const nCom = rnd() < 0.3 ? 1 + Math.floor(rnd() * 2) : 0
    const pressure = +(nSup * 1.5 + nCom + (status === 'OPEN' ? (ageH / 24) * 2 : 0)).toFixed(1)
    rows.push({ id, title, cat, status, anonymous, lat, lng, bairro, rt, rid, author, created, first, resolved, pressure, cell7: encodeGeohash7(lat, lng) })
    supporters.forEach((u) => votes.push({ id, u, at: new Date(created.getTime() + 3600_000) }))
    for (let k = 0; k < nCom; k++) comments.push({ id, u: pick(citizens), at: new Date(created.getTime() + (k + 2) * 3600_000), text: pick(['Também sofro com isso aqui no bairro.', 'Já faz muito tempo e nada foi feito.', 'Apoiado! Precisamos de uma solução.']) })
    timeline.push({ id, type: 'CREATED', content: 'Relato criado', at: created })
    if (first && status !== 'OPEN') timeline.push({ id, type: 'STATUS_CHANGED', content: `Status alterado para ${status}`, at: first })
    if (resolved) timeline.push({ id, type: 'RESOLVED', content: 'Relato marcado como resolvido', at: resolved })
  }
  const iso = (d) => (d ? q(d.toISOString().replace('T', ' ').replace('Z', '')) : 'null')
  const rowSql = rows.map((r) => `(${q(r.id)}, ${q(r.title)}, ${q('Relato de demonstração criado pelo seed do ambiente local. Descreve um problema recorrente no bairro ' + r.bairro + ' e aguarda providências.')}, '${r.cat}'::"Category", '${r.status}'::"ReportStatus", ${r.anonymous}, ${r.lat}, ${r.lng}, 'Aracaju', 'SE', ${q(r.bairro)}, 'aracaju', ${q(r.bairro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))}, ${q(r.cell7)}, ${r.rt ? `'${r.rt}'::"RecipientType"` : 'null'}, ${q(r.rid)}, ${q(r.author)}, ${iso(r.created)}, ${iso(r.resolved ?? r.first ?? r.created)}, ${iso(r.first)}, ${iso(r.resolved)}, ${r.pressure})`).join(',\n')
  bulk(`insert into reports (id, title, description, category, status, anonymous, latitude, longitude, city, state, neighborhood, city_key, neighborhood_key, cell7, "recipientType", "recipientId", "authorId", "createdAt", "updatedAt", first_response_at, resolved_at, "pressureScore") values\n${rowSql}`)
  if (votes.length) bulk(`insert into votes (id, "reportId", "userId", type, "createdAt") values ${votes.map((v) => `(gen_random_uuid()::text, ${q(v.id)}, ${q(v.u)}, 'SUPPORT'::"VoteType", ${iso(v.at)})`).join(',')}`)
  if (comments.length) bulk(`insert into comments (id, "reportId", "authorId", content, "createdAt", "updatedAt") values ${comments.map((c) => `(gen_random_uuid()::text, ${q(c.id)}, ${q(c.u)}, ${q(c.text)}, ${iso(c.at)}, ${iso(c.at)})`).join(',')}`)
  bulk(`insert into timeline_events (id, "reportId", type, content, "createdAt") values ${timeline.map((t) => `(gen_random_uuid()::text, ${q(t.id)}, '${t.type}'::"EventType", ${q(t.content)}, ${iso(t.at)})`).join(',')}`)
  // SLA da Prefeitura/Saúde/Ouvidoria (prazo padrão de 48 h quando a categoria não tem prazo próprio)
  sql(`update reports r set sla_started_at = r."createdAt",
         sla_due_at = r."createdAt" + make_interval(hours => coalesce((e."slaHours"->>(r.category::text))::int, 48)),
         sla_met_at = r.first_response_at
       from entities e where r."recipientType"='ENTITY' and r."recipientId"=e.id and r.title like '[Demo]%'`)
  sql(`update reports set sla_state = (case
         when first_response_at is not null and first_response_at <= sla_due_at then 'MET'
         when first_response_at is not null then 'MET_LATE'
         when now() > sla_due_at then 'BREACHED'
         when now() > sla_started_at + (sla_due_at - sla_started_at) * 0.75 then 'AT_RISK'
         else 'ON_TIME' end)::"SlaState"
       where title like '[Demo]%' and sla_due_at is not null`)
  // alguns relatos recentes da Prefeitura, para a fila de prazos mostrar "no prazo" e "em risco" além de "vencido"
  const fresh = sql(`with t as (select id, row_number() over (order by id) rn from reports where title like '[Demo]%' and status='OPEN' and first_response_at is null and "recipientId"='${state.orgs.prefeitura.id}' limit 10) update reports r set "createdAt" = now() - (t.rn*6 || ' hours')::interval, sla_started_at = now() - (t.rn*6 || ' hours')::interval from t where r.id=t.id`)
  sql(`update reports r set sla_due_at = r.sla_started_at + make_interval(hours => coalesce((e."slaHours"->>(r.category::text))::int, 48)) from entities e where r."recipientId"=e.id and r.title like '[Demo]%' and r."recipientType"='ENTITY'`)
  sql(`update reports set sla_state = (case when first_response_at is not null and first_response_at <= sla_due_at then 'MET' when first_response_at is not null then 'MET_LATE' when now() > sla_due_at then 'BREACHED' when now() > sla_started_at + (sla_due_at - sla_started_at) * 0.75 then 'AT_RISK' else 'ON_TIME' end)::"SlaState" where title like '[Demo]%' and sla_due_at is not null`)
  log(`relatos demo criados: ${rows.length} (apoios ${votes.length}, comentários ${comments.length}, eventos ${timeline.length})`)
}
save(state)
log('\nPronto. Rode agora: npm run analytics:backfill --workspace=apps/api')
log('Senha de todas as contas demo: ' + DEMO_PASSWORD)
log('Código MFA a qualquer momento: node docs/dev/mfa.mjs <conta>   (ex.: prefeitura)')
