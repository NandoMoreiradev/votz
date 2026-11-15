import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp, PASSWORD } from './lib.mjs'
const S = 'planos'
const st = loadState(); resetThrottle()

async function ctxSession(tag, ctxType) {
  resetThrottle()
  const s = new Session(tag)
  const l = await login(s, `qa.${tag}@votz.test`, PASSWORD, st.users[tag].mfaSecret)
  if (!l.ok) throw new Error(`login ${tag}: ${JSON.stringify(l.r?.json).slice(0, 100)}`)
  const sw = await req(s, 'POST', '/auth/switch-context', { body: { contextType: ctxType, contextId: st.orgIds[tag], mfaCode: await totp(st.users[tag].mfaSecret) } })
  s.token = sw.json.accessToken
  return s
}

// admin com MFA
const adm = new Session('adm')
const la = await login(adm, 'qa.admin@votz.test', PASSWORD, st.users.admin.mfaSecret)
check(S, 'admin loga com MFA (TOTP)', la.ok, JSON.stringify(la.r?.json).slice(0, 100))
const setPlan = (kind, id, plan) => req(adm, 'PATCH', `/admin/${kind}/${id}/plan`, { body: { plan } })

// ================= ENTIDADE =================
const E = await ctxSession('entidade', 'entity')
const E2 = await ctxSession('entidade2', 'entity')
const eid = st.orgIds.entidade
const exp = (s) => req(s, 'GET', `/entities/${eid}/export`)
for (const [plan, want] of [['BASICO', 403], ['GESTAO', 200], ['PRO', 200], ['ENTERPRISE', 200]]) {
  const p = await setPlan('entities', eid, plan)
  check(S, `admin define plano ${plan} da entidade`, p.status === 200, `status ${p.status} ${p.text.slice(0, 80)}`)
  const r = await exp(E)
  check(S, `ENTIDADE ${plan}: exportação de relatórios → ${want}`, r.status === want, `status ${r.status}`)
}
await setPlan('entities', eid, 'GESTAO')
const x = await exp(E2)
check(S, 'IDOR: dono de OUTRA entidade não exporta (403)', x.status === 403, `status ${x.status}`)
const xc = await exp((() => { const c = new Session('c'); return c })())
check(S, 'anônimo não exporta (401)', xc.status === 401, `status ${xc.status}`)

if (!st.teamDone) {
// ---- equipe: o plano BASICO promete "até 2 membros"
await setPlan('entities', eid, 'BASICO')
const roles = await req(E, 'GET', `/org-memberships/ENTITY/${eid}/roles`)
const agent = (roles.json ?? []).find((r) => /AGENT/i.test(r.name)) ?? (roles.json ?? [])[0]
check(S, 'ENTIDADE: lista as roles da organização', roles.status === 200 && !!agent, `status ${roles.status} ${roles.text.slice(0, 100)}`)
resetThrottle()
const members = [['cidadao_a', 'qa.cidadao_a@votz.test'], ['cidadao_b', 'qa.cidadao_b@votz.test'], ['sem_vinculo', 'qa.sem_vinculo@votz.test']]
let accepted = 0
for (const [tag, email] of members) {
  const inv = await req(E, 'POST', '/org-memberships/invites', { body: { orgType: 'ENTITY', orgId: eid, email, roleId: agent?.id } })
  check(S, `ENTIDADE BASICO: convida ${tag}`, inv.status === 201 || inv.status === 200, `status ${inv.status} ${inv.text.slice(0, 120)}`)
  const token = sql(`select token from member_invites where email='${email}' and "orgId"='${eid}' order by "createdAt" desc limit 1`)
  const m = new Session(tag); await login(m, email)
  const ac = await req(m, 'POST', `/org-memberships/invites/${token}/accept`)
  if (ac.status === 201 || ac.status === 200) accepted++
  note(S, `aceite do convite por ${tag}: status ${ac.status}`)
}
const total = sql(`select count(*) from org_memberships where "orgId"='${eid}' and status='ACTIVE'`)
check(S, `ENTIDADE BASICO: limite de "até 2 membros" é aplicado (membros ativos=${total})`, +total <= 2, `há ${total} membros ativos, o plano promete 2`)

st.teamDone = true; saveState(st)
}
// ================= POLÍTICO =================
const P = await ctxSession('politico', 'politician')
const pid = st.orgIds.politico
const prop = { titulo: 'QA proposta de recapeamento', descricao: 'Proposta de recapeamento das ruas do bairro central com cronograma publico.', categorias: ['INFRASTRUCTURE'] }
for (const [plan, wantProp, wantExp] of [['BASICO', 403, 403], ['MANDATOMETRO_PRO', 201, 200], ['CAMPANHA', 201, 200]]) {
  const p = await setPlan('politicians', pid, plan)
  check(S, `admin define plano ${plan} do político`, p.status === 200, `status ${p.status}`)
  const r = await req(P, 'POST', '/propostas', { body: prop })
  check(S, `POLÍTICO ${plan}: criar proposta → ${wantProp}`, r.status === wantProp, `status ${r.status} ${r.text.slice(0, 100)}`)
  if (r.status === 201 && plan === 'MANDATOMETRO_PRO') st.proposta = r.json?.id
  const e = await req(P, 'GET', `/politicians/${pid}/export`)
  check(S, `POLÍTICO ${plan}: exportação → ${wantExp}`, e.status === wantExp, `status ${e.status}`)
}
await setPlan('politicians', pid, 'BASICO')

// ================= EMPRESA =================
const C = await ctxSession('empresa', 'company')
const cid = st.orgIds.empresa
for (const plan of ['STARTER', 'BUSINESS', 'ENTERPRISE', 'WHITE_LABEL']) {
  const p = await setPlan('companies', cid, plan)
  check(S, `admin define plano ${plan} da empresa`, p.status === 200, `status ${p.status}`)
}
const prof = await req(C, 'PATCH', `/companies/${cid}`, { body: { website: 'https://exemplo.com.br' } })
check(S, 'EMPRESA: dono edita o perfil (PATCH /companies/:id)', prof.status === 200, `status ${prof.status} ${prof.text.slice(0, 100)}`)
const profX = await req(E, 'PATCH', `/companies/${cid}`, { body: { website: 'https://hacker.example' } })
check(S, 'IDOR: dono de entidade NÃO edita perfil de empresa (403)', profX.status === 403, `status ${profX.status}`)
const ce = await req(C, 'GET', `/companies/${cid}/export`)
note(S, `EMPRESA: rota de exportação (prometida nos planos Business+) existe? status ${ce.status}`)
await setPlan('companies', cid, 'STARTER')
saveState(st)
