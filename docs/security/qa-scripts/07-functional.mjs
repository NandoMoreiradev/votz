import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp, sleep, PASSWORD } from './lib.mjs'
const st = loadState(); resetThrottle()
const S = 'funcional'
const sec = []
const add = (n, f) => sec.push([n, f])
const ses = async (tag) => { resetThrottle(); const s = new Session(tag); const l = await login(s, `qa.${tag}@votz.test`, PASSWORD, st.users[tag]?.mfaSecret); if (!l.ok) throw new Error('login ' + tag); return s }
const rid = st.reports.entidade

add('publico', async () => {
  const N = null
  let r = await req(N, 'GET', '/reports?limit=5', { auth: false })
  check(S, 'listagem pública de relatos (paginada)', r.status === 200 && Array.isArray(r.json?.data) && r.json?.meta?.total >= 1, `status ${r.status} ${r.text.slice(0, 100)}`)
  const total = r.json?.meta?.total
  r = await req(N, 'GET', '/reports?category=INFRASTRUCTURE&state=SE', { auth: false })
  check(S, 'filtro por categoria e UF', r.status === 200 && r.json?.data?.every?.((x) => x.category === 'INFRASTRUCTURE'), `status ${r.status}`)
  r = await req(N, 'GET', '/reports?status=IN_PROGRESS', { auth: false })
  check(S, 'filtro por status', r.status === 200, `status ${r.status}`)
  r = await req(N, 'GET', '/reports?limit=500', { auth: false })
  check(S, 'limite de página acima do máximo é tratado (400 ou limitado)', r.status === 400 || (r.status === 200 && r.json?.data?.length <= 100), `status ${r.status} qtd ${r.json?.data?.length}`)
  r = await req(N, 'GET', `/reports/${rid}`, { auth: false })
  check(S, 'detalhe do relato traz linha do tempo e contagens', r.status === 200 && Array.isArray(r.json?.timeline), `status ${r.status}`)
  r = await req(N, 'GET', '/map/reports', { auth: false })
  check(S, 'mapa: GET /map/reports (GeoJSON)', r.status === 200 && (r.json?.features || r.json?.type), `status ${r.status} ${r.text.slice(0, 80)}`)
  r = await req(N, 'GET', '/reports/similar?title=buraco%20na%20rua%20principal', { auth: false })
  check(S, 'relatos parecidos (busca textual/semântica)', r.status === 200, `status ${r.status} ${r.text.slice(0, 80)}`)
  r = await req(N, 'GET', '/politicians?state=SE&limit=5', { auth: false })
  check(S, 'lista de políticos (65 mil importados) responde rápido', r.status === 200 && (r.json?.data?.length ?? 0) > 0, `status ${r.status}`)
  const t0 = Date.now(); r = await req(N, 'GET', '/politicians?search=silva&limit=10', { auth: false })
  check(S, `busca de político por nome (${Date.now() - t0} ms)`, r.status === 200 && Date.now() - t0 < 3000, `status ${r.status}`)
  r = await req(N, 'GET', '/entities?state=SE&limit=5', { auth: false })
  check(S, 'lista de entidades (5,5 mil importadas)', r.status === 200 && (r.json?.data?.length ?? 0) > 0, `status ${r.status}`)
  r = await req(N, 'GET', '/parties', { auth: false })
  check(S, 'lista de partidos', r.status === 200 && (r.json?.length ?? r.json?.data?.length) >= 20, `status ${r.status}`)
  for (const p of ['resumo', 'tendencias', 'relatos-destaque', 'entidades-ranking', 'surtos-ativos']) {
    r = await req(N, 'GET', `/imprensa/${p}`, { auth: false })
    check(S, `imprensa/${p} (público)`, r.status === 200, `status ${r.status} ${r.text.slice(0, 60)}`)
  }
  r = await req(N, 'GET', '/debates', { auth: false }); check(S, 'lista de debates', r.status === 200, `status ${r.status}`)
  r = await req(N, 'GET', '/propostas', { auth: false }); check(S, 'lista de propostas', r.status === 200, `status ${r.status}`)
  r = await req(N, 'GET', '/alerts', { auth: false }); check(S, 'alertas/surtos ativos', r.status === 200, `status ${r.status}`)
  r = await req(N, 'GET', '/health', { auth: false }); check(S, 'health', r.status === 200, `status ${r.status} ${r.text.slice(0, 60)}`)
  void total
})

add('cidadao', async () => {
  const A = await ses('cidadao_a'); const B = await ses('cidadao_b')
  let r = await req(B, 'POST', `/reports/${rid}/votes`, { body: { type: 'SUPPORT' } })
  check(S, 'CIDADÃO: apoiar um relato (Apoio)', r.status === 201 || r.status === 200, `status ${r.status} ${r.text.slice(0, 100)}`)
  const again = await req(B, 'POST', `/reports/${rid}/votes`, { body: { type: 'SUPPORT' } })
  note(S, `apoio duplicado do mesmo usuário responde ${again.status} (${again.text.slice(0, 80)})`)
  const cnt = await req(null, 'GET', `/reports/${rid}/votes`, { auth: false })
  const n = sql(`select count(*) from votes where "reportId"='${rid}' and "userId"='${st.users.cidadao_b.id}'`)
  check(S, 'apoio duplicado não conta duas vezes (1 voto no banco)', n === '1', `votos do usuário: ${n}`)
  check(S, 'contagem pública de apoios', cnt.status === 200, `status ${cnt.status}`)
  r = await req(B, 'GET', `/reports/${rid}/votes/me`); check(S, 'CIDADÃO: ver o próprio voto', r.status === 200, `status ${r.status}`)
  // pressão
  const pr = sql(`select "pressureScore" from reports where id='${rid}'`); note(S, `pressão atual do relato: ${pr}`)
  // perfil
  r = await req(A, 'PATCH', `/users/${st.users.cidadao_a.id}`, { body: { name: 'QA cidadao A (editado)', bio: 'Bio de teste do cidadao.' } })
  check(S, 'CIDADÃO: editar o próprio perfil', r.status === 200, `status ${r.status} ${r.text.slice(0, 100)}`)
  r = await req(A, 'GET', '/users/me'); check(S, 'CIDADÃO: GET /users/me traz consentimento e hasPassword', r.status === 200 && r.json?.termsVersion && 'hasPassword' in r.json && !('password' in r.json), r.text.slice(0, 120))
  r = await req(null, 'GET', `/users/${st.users.cidadao_a.id}/reports`, { auth: false }); check(S, 'relatos públicos de um usuário', r.status === 200, `status ${r.status}`)
  // notificações: a entidade avocou o relato de A
  const nt = await req(A, 'GET', '/notifications'); check(S, 'CIDADÃO: recebe notificações', nt.status === 200, `status ${nt.status} ${nt.text.slice(0, 80)}`)
  const un = await req(A, 'GET', '/notifications/unread-count'); check(S, 'contador de não lidas', un.status === 200, `status ${un.status}`)
  r = await req(A, 'PATCH', '/notifications/read-all'); check(S, 'marcar todas como lidas', r.status === 200, `status ${r.status}`)
  // contestar (dispute): moderador resolve, autor contesta
  const M = await ses('moderador')
  const rs = await req(M, 'PATCH', `/reports/${rid}/status`, { body: { status: 'RESOLVED', content: 'QA: resolvido pela moderacao para testar o fluxo de contestacao.' } })
  check(S, 'moderador marca o relato como RESOLVIDO', rs.status === 200, `status ${rs.status} ${rs.text.slice(0, 100)}`)
  const dB = await req(B, 'POST', `/reports/${rid}/dispute`, { body: { reason: 'QA: sou outro usuario tentando contestar' } })
  check(S, 'CONTESTAR: quem não é o autor não pode contestar (403)', dB.status === 403, `status ${dB.status}`)
  const dA = await req(A, 'POST', `/reports/${rid}/dispute`, { body: { reason: 'QA: o buraco continua na rua, nada foi consertado.' } })
  check(S, 'CONTESTAR: o autor contesta o "resolvido"', dA.status === 201 || dA.status === 200, `status ${dA.status} ${dA.text.slice(0, 120)}`)
  const an = st.reports.anonimo
  await req(M, 'PATCH', `/reports/${an}/status`, { body: { status: 'RESOLVED', content: 'QA: resolvido.' } })
  const dAn = await req(B, 'POST', `/reports/${an}/dispute`, { body: { reason: 'QA: tentando contestar o anonimo' } })
  check(S, 'CONTESTAR: autor de relato ANÔNIMO não consegue contestar (por desenho)', dAn.status === 400, `status ${dAn.status} ${dAn.text.slice(0, 100)}`)
  const rdis = await req(M, 'POST', `/reports/${rid}/dispute/resolve`, { body: { outcome: 'REOPEN', note: 'QA: reaberto' } })
  note(S, `moderador resolve a contestação: status ${rdis.status} ${rdis.text.slice(0, 100)}`)
})

add('api-publica', async () => {
  const A = await ses('cidadao_a')
  let r = await req(A, 'POST', '/api-keys', { body: { name: 'QA chave gratis' } })
  check(S, 'API PÚBLICA: usuário cria chave (FREE) e vê a chave uma vez', r.status === 201 && !!r.json?.key, `status ${r.status} ${r.text.slice(0, 120)}`)
  const key = r.json?.key; const kid = r.json?.id
  r = await req(null, 'GET', '/api-publica/relatos?limit=2', { auth: false, headers: { 'x-api-key': key } })
  check(S, 'API PÚBLICA: consulta com a chave', r.status === 200, `status ${r.status} ${r.text.slice(0, 80)}`)
  check(S, 'API PÚBLICA: cabeçalhos de limite (X-RateLimit-*)', !!r.headers.get('x-ratelimit-limit'), r.headers.get('x-ratelimit-limit') ?? '')
  const lim = r.headers.get('x-ratelimit-limit')
  const bad = await req(null, 'GET', '/api-publica/relatos', { auth: false, headers: { 'x-api-key': 'votz_chave_invalida' } })
  check(S, 'API PÚBLICA: chave inválida → 401', bad.status === 401, `status ${bad.status}`)
  const none = await req(null, 'GET', '/api-publica/relatos', { auth: false })
  check(S, 'API PÚBLICA: sem chave → 401', none.status === 401, `status ${none.status}`)
  const list = await req(A, 'GET', '/api-keys'); check(S, 'lista de chaves não devolve a chave inteira/hash', list.status === 200 && !/keyHash|"key":/.test(list.text), list.text.slice(0, 120))
  // o cliente pode escolher o nível pago?
  const paid = await req(A, 'POST', '/api-keys', { body: { name: 'QA tentando nivel pago', tier: 'PAID' } })
  check(S, 'FINDING: usuário comum NÃO consegue criar chave do nível PAGO escolhendo tier=PAID', !(paid.status === 201 && paid.json?.tier === 'PAID'), `status ${paid.status} tier=${paid.json?.tier} limite=${lim}`)
  if (paid.json?.key) { const rp = await req(null, 'GET', '/api-publica/relatos?limit=1', { auth: false, headers: { 'x-api-key': paid.json.key } }); note(S, `limite da chave que o usuário criou com tier=PAID: ${rp.headers.get('x-ratelimit-limit')} req/h (FREE=${lim})`); await req(A, 'DELETE', `/api-keys/${paid.json.id}`) }
  r = await req(A, 'DELETE', `/api-keys/${kid}`); check(S, 'revogar a própria chave', r.status === 200 || r.status === 204, `status ${r.status}`)
  const after = await req(null, 'GET', '/api-publica/relatos', { auth: false, headers: { 'x-api-key': key } })
  check(S, 'chave revogada deixa de funcionar (401)', after.status === 401, `status ${after.status}`)
  const pubAnon = await req(null, 'GET', `/api-publica/relatos/${st.reports.anonimo}`, { auth: false, headers: { 'x-api-key': 'x' } })
  void pubAnon
})

add('lgpd', async () => {
  resetThrottle()
  const email = 'qa.descartavel@votz.test'; const s = new Session('d')
  let r = await req(s, 'POST', '/auth/register', { auth: false, body: { name: 'QA Descartavel', email, password: PASSWORD, phone: '+5579999990077', zipCode: '49000000', streetNumber: '7', acceptedTermsVersion: '2026-11-14', acceptedPrivacyVersion: '2026-11-14', confirmAge18: true } })
  check(S, 'LGPD: cria conta descartável', r.status === 201, `status ${r.status}`)
  sql(`update users set "emailVerified"=true where email='${email}'`)
  const id = r.json?.user?.id; s.token = r.json?.accessToken
  const rp = await req(s, 'POST', '/reports', { body: { title: 'QA relato da conta descartavel', description: 'Relato criado por uma conta que sera excluida para testar a anonimizacao.', category: 'OTHER', city: 'Aracaju', state: 'SE' } })
  const cm = await req(s, 'POST', `/reports/${st.reports.politico}/comments`, { body: { content: 'Comentario da conta descartavel que deve ser apagado.' } })
  await req(s, 'POST', `/reports/${st.reports.politico}/votes`, { body: { type: 'SUPPORT' } })
  const ex = await req(s, 'POST', '/users/me/data-export')
  check(S, 'LGPD: pedir exportação dos dados (portabilidade)', ex.status === 200 || ex.status === 201 || ex.status === 202, `status ${ex.status} ${ex.text.slice(0, 100)}`)
  const bad = await req(s, 'DELETE', '/users/me', { body: { password: 'SenhaErrada@123' } })
  check(S, 'LGPD: excluir conta com senha errada é recusado (403)', bad.status === 403, `status ${bad.status}`)
  const del = await req(s, 'DELETE', '/users/me', { body: { password: PASSWORD } })
  check(S, 'LGPD: excluir a própria conta com a senha', del.status === 200 || del.status === 204, `status ${del.status} ${del.text.slice(0, 120)}`)
  check(S, 'LGPD: usuário removido do banco', sql(`select count(*) from users where id='${id}'`) === '0')
  check(S, 'LGPD: comentários e apoios apagados', sql(`select (select count(*) from comments where "authorId"='${id}') + (select count(*) from votes where "userId"='${id}')`) === '0')
  const kept = sql(`select count(*), bool_and("authorId" is null), bool_and(anonymous) from reports where id='${rp.json?.id}'`)
  check(S, 'LGPD: o relato permanece (Memória pública) mas sem autor e marcado anônimo', kept === '1|t|t', kept)
  check(S, 'LGPD: log de acesso da conta foi PRESERVADO (obrigação legal, 6 meses)', +sql(`select count(*) from access_logs where "userId"='${id}'`) >= 1)
  check(S, 'LGPD: sessões (refresh tokens) apagadas junto', sql(`select count(*) from refresh_tokens where "userId"='${id}'`) === '0')
  void cm
})

add('politico-bug2', async () => {
  const P = new Session('p'); resetThrottle(); await login(P, 'qa.politico@votz.test', PASSWORD, st.users.politico.mfaSecret)
  const sw = await req(P, 'POST', '/auth/switch-context', { body: { contextType: 'politician', contextId: st.orgIds.politico, mfaCode: await totp(st.users.politico.mfaSecret) } }); P.token = sw.json.accessToken
  const c = await req(P, 'POST', `/reports/${st.reports.politico}/comments`, { body: { content: 'Resposta oficial do gabinete ao relato.' } })
  note(S, `BUG-2: político (contexto correto) comenta como instituição: status ${c.status} ${c.text.slice(0, 100)}`)
  const d = await req(P, 'POST', '/debates', { body: { title: 'QA debate teste', description: 'Debate de teste', scheduledFor: new Date(Date.now() + 86400000).toISOString() } })
  note(S, `político cria debate: status ${d.status} ${d.text.slice(0, 120)}`)
})

const only = process.argv[2]
for (const [n, f] of sec) { if (only && n !== only) continue; try { await f() } catch (e) { check('erro-script', `seção ${n} abortou`, false, e.message) } }
saveState(st)
