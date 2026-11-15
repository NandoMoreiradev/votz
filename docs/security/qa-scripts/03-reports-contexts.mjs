import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp } from './lib.mjs'

const S = 'ciclo'
const state = loadState()
state.ctx ??= {}; state.reports ??= {}
resetThrottle()
const ids = {
  entidade: sql(`select id from entities where "legalName"='QA Prefeitura Teste Um'`),
  entidade2: sql(`select id from entities where "legalName"='QA Hospital Teste Dois'`),
  politico: sql(`select id from politicians where name='QA Vereador Teste'`),
  empresa: sql(`select id from companies where "legalName"='QA Telecom Teste LTDA'`),
}
state.orgIds = ids

const A = new Session('a'); const B = new Session('b')
await login(A, 'qa.cidadao_a@votz.test'); await login(B, 'qa.cidadao_b@votz.test')

const mk = (s, over = {}) => req(s, 'POST', '/reports', { body: { title: 'QA buraco na rua principal do bairro', description: 'Existe um buraco grande na rua principal que causa acidentes ha semanas e ninguem resolve.', category: 'INFRASTRUCTURE', latitude: -10.9111, longitude: -37.0717, city: 'Aracaju', state: 'SE', neighborhood: 'Centro', ...over } })

// --- relato identificado para a entidade 1, relato para o politico, relato anonimo
let r; if (state.reports.entidade) { note(S,'relatos ja existem, reaproveitando') } else {
r = await mk(A, { recipientType: 'ENTITY', recipientId: ids.entidade })
check(S, 'cidadão cria relato destinado a entidade', r.status === 201, `status ${r.status} ${r.text.slice(0, 200)}`)
state.reports.entidade = r.json?.id
r = await mk(A, { title: 'QA calcada quebrada na avenida central', recipientType: 'POLITICIAN', recipientId: ids.politico })
check(S, 'cidadão cria relato destinado a político', r.status === 201, `status ${r.status} ${r.text.slice(0, 200)}`)
state.reports.politico = r.json?.id
r = await mk(B, { title: 'QA denuncia anonima de lixo acumulado', anonymous: true, recipientType: 'ENTITY', recipientId: ids.entidade })
check(S, 'cidadão cria relato ANÔNIMO', r.status === 201, `status ${r.status} ${r.text.slice(0, 200)}`)
state.reports.anonimo = r.json?.id
}

// anonimato: banco e saída pública
const row = sql(`select "authorId" is null, anonymous from reports where id='${state.reports.anonimo}'`)
check(S, 'anonimato: authorId é NULL no banco', row === 't|t', row)
const pub = await req(null, 'GET', `/reports/${state.reports.anonimo}`, { auth: false })
check(S, 'anonimato: GET público não traz autor', pub.status === 200 && !pub.json?.author, JSON.stringify(pub.json?.author))
const tl = sql(`select count(*) from timeline_events where "reportId"='${state.reports.anonimo}' and "authorId" is not null`)
check(S, 'anonimato: nenhum evento da linha do tempo aponta para o autor', tl === '0', tl)
const cnt = sql(`select count(*) from access_logs where event not in ('LOGIN','REGISTER','GOOGLE_LOGIN','MFA_LOGIN')`)
check(S, 'log de acesso só tem eventos de início de sessão (nada de conteúdo)', cnt === '0', cnt)

// --- MFA e troca de contexto dos donos de organização
const owners = { entidade: 'entity', entidade2: 'entity', politico: 'politician', empresa: 'company' }
const sess = {}
for (const [tag, type] of Object.entries(owners)) {
  resetThrottle()
  const s = new Session(tag); sess[tag] = s
  const l = await login(s, `qa.${tag}@votz.test`, undefined, state.users[tag]?.mfaSecret)
  if (!l.ok) { check(S, `${tag}: login`, false, JSON.stringify(l.r?.json)); continue }
  const prof = await req(s, 'GET', '/auth/my-profiles')
  check(S, `${tag}: /auth/my-profiles lista o perfil aprovado`, prof.status === 200 && JSON.stringify(prof.json).includes(ids[tag]), prof.text.slice(0, 160))
  // sem MFA ativo a troca de contexto é negada
  const noMfa = await req(s, 'POST', '/auth/switch-context', { body: { contextType: type, contextId: ids[tag] } })
  check(S, `${tag}: trocar para perfil institucional SEM MFA exige configurar MFA`, noMfa.json?.requiresMfaSetup === true, noMfa.text.slice(0, 120))
  let secret = state.users[tag].mfaSecret
  if (!secret) {
    const sp = await req(s, 'POST', '/auth/mfa/setup')
    secret = sp.json?.secret
    const en = await req(s, 'POST', '/auth/mfa/enable', { body: { code: await totp(secret) } })
    check(S, `${tag}: ativa MFA (setup + enable)`, en.status === 200 && en.json?.backupCodes?.length === 8, `status ${en.status}`)
    state.users[tag].mfaSecret = secret
  }
  // troca sem código -> pede MFA
  const ask = await req(s, 'POST', '/auth/switch-context', { body: { contextType: type, contextId: ids[tag] } })
  check(S, `${tag}: com MFA ativo, troca sem código pede o código (requiresMfa)`, ask.json?.requiresMfa === true, ask.text.slice(0, 120))
  // código errado
  const wrong = await req(s, 'POST', '/auth/switch-context', { body: { contextType: type, contextId: ids[tag], mfaCode: '000000' } })
  check(S, `${tag}: código MFA errado é recusado (401)`, wrong.status === 401, `status ${wrong.status}`)
  const ok = await req(s, 'POST', '/auth/switch-context', { body: { contextType: type, contextId: ids[tag], mfaCode: await totp(secret) } })
  check(S, `${tag}: troca para o perfil com MFA correto`, ok.status === 200 && !!ok.json?.accessToken && !!ok.json?.ctx, `status ${ok.status} ${ok.text.slice(0, 160)}`)
  if (ok.json?.accessToken) { s.token = ok.json.accessToken; state.ctx[tag] = ok.json.ctx }
}
saveState(state)

// --- entidade age no relato destinado a ela
const E = sess.entidade, E2 = sess.entidade2, P = sess.politico
const adv = await req(E, 'POST', `/entities/${ids.entidade}/advocate/${state.reports.entidade}`)
check(S, 'ENTIDADE: avocar relato destinado a ela', adv.status === 201 || adv.status === 200, `status ${adv.status} ${adv.text.slice(0, 160)}`)
const st = await req(E, 'PATCH', `/reports/${state.reports.entidade}/status`, { body: { status: 'IN_PROGRESS', content: 'Equipe enviada ao local para avaliar o reparo.' } })
check(S, 'ENTIDADE: atualizar status do relato (IN_PROGRESS)', st.status === 200 || st.status === 201, `status ${st.status} ${st.text.slice(0, 200)}`)
// outra entidade NAO pode
const adv2 = await req(E2, 'POST', `/entities/${ids.entidade}/advocate/${state.reports.entidade}`)
check(S, 'IDOR: outra entidade NÃO consegue avocar em nome da entidade alheia (403)', adv2.status === 403, `status ${adv2.status}`)
const adv3 = await req(E2, 'POST', `/entities/${ids.entidade2}/advocate/${state.reports.entidade}`)
note(S, `outra entidade avocando o relato alheio pelo proprio id: status ${adv3.status} (relato nao e destinado a ela)`)
const st2 = await req(E2, 'PATCH', `/reports/${state.reports.entidade}/status`, { body: { status: 'RESOLVED', content: 'Tentando resolver relato que nao e meu.' } })
check(S, 'IDOR: outra entidade NÃO consegue mudar o status de relato alheio', st2.status === 403, `status ${st2.status} ${st2.text.slice(0, 120)}`)
const stC = await req(A, 'PATCH', `/reports/${state.reports.entidade}/status`, { body: { status: 'RESOLVED', content: 'Cidadão tentando marcar como resolvido.' } })
check(S, 'cidadão comum NÃO consegue mudar status de relato', stC.status === 403, `status ${stC.status}`)

// --- político
const padv = await req(P, 'POST', `/politicians/${ids.politico}/advocate/${state.reports.politico}`)
check(S, 'POLÍTICO: avocar relato destinado a ele', padv.status === 201 || padv.status === 200, `status ${padv.status} ${padv.text.slice(0, 160)}`)
const pst = await req(P, 'PATCH', `/reports/${state.reports.politico}/status`, { body: { status: 'UNDER_REVIEW', content: 'Gabinete acompanhando a demanda.' } })
check(S, 'POLÍTICO: atualizar status do relato', pst.status === 200 || pst.status === 201, `status ${pst.status} ${pst.text.slice(0, 200)}`)
console.log('\nfim ciclo')
