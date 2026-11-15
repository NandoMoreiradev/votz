import { Session, req, sql, resetThrottle, check, note, loadState, saveState, login, totp, sleep, BASE, ORIGIN, PASSWORD } from './lib.mjs'
const st = loadState()
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const sections = []
const sec = (name, fn) => sections.push([name, fn])
const clean = () => { resetThrottle(); sql(`update users set "failedLoginAttempts"=0,"lockedUntil"=null,"mfaFailedAttempts"=0,"mfaLockedUntil"=null,banned=false where email like 'qa.%@votz.test'`) }
const withSession = async (tag) => { resetThrottle(); const s = new Session(tag); const l = await login(s, `qa.${tag}@votz.test`, PASSWORD, st.users[tag]?.mfaSecret); if (!l.ok) throw new Error(`login ${tag} ${JSON.stringify(l.r?.json).slice(0, 80)}`); return s }

// ───────────── A. tokens e MFA ─────────────
sec('tokens', async () => {
  const S = 'sessao'; clean()
  const s = new Session('adm')
  const r = await req(s, 'POST', '/auth/login', { body: { email: 'qa.admin@votz.test', password: PASSWORD }, auth: false })
  check(S, 'admin com MFA: login devolve mfaToken (e NÃO accessToken)', r.json?.requiresMfa === true && !r.json?.accessToken, r.text.slice(0, 80))
  const me = await req(null, 'GET', '/auth/me', { token: r.json.mfaToken })
  check(S, 'H1: token pré-MFA (mfa_pending) NÃO vale como sessão (401)', me.status === 401, `status ${me.status}`)
  const adm = await req(null, 'GET', '/admin/stats', { token: r.json.mfaToken })
  check(S, 'H1: token pré-MFA não abre o painel de admin (401)', adm.status === 401, `status ${adm.status}`)
  const none = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' + Buffer.from(JSON.stringify({ sub: st.users.admin.id, typ: 'access', email: 'qa.admin@votz.test', type: 'ADMIN' })).toString('base64url') + '.'
  const n = await req(null, 'GET', '/admin/stats', { token: none })
  check(S, 'JWT com alg=none é recusado (401)', n.status === 401, `status ${n.status}`)
  const forged = await req(null, 'GET', '/auth/me', { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + Buffer.from(JSON.stringify({ sub: st.users.admin.id, typ: 'access' })).toString('base64url') + '.assinaturafalsa' })
  check(S, 'JWT com assinatura falsa é recusado (401)', forged.status === 401, `status ${forged.status}`)
  const noauth = await req(null, 'GET', '/auth/me', { auth: false })
  check(S, 'rota protegida sem token (401)', noauth.status === 401, `status ${noauth.status}`)
})

sec('refresh', async () => {
  const S = 'sessao'; clean()
  const s = await withSession('cidadao_b')
  const c0 = s.cookies.get('votz_refresh_token')
  check(S, 'login define cookie de refresh', !!c0)
  const rf = await req(s, 'POST', '/auth/refresh', { auth: false })
  check(S, 'refresh com cookie + Origin correto → 200 e novo access token', rf.status === 200 && !!rf.json?.accessToken, `status ${rf.status}`)
  const c1 = s.cookies.get('votz_refresh_token')
  check(S, 'refresh ROTACIONA o cookie (valor muda)', c1 && c1 !== c0)
  // corrida: dois refresh simultâneos com o mesmo cookie (leeway)
  const clone = () => { const x = new Session('x'); x.cookies.set('votz_refresh_token', s.cookies.get('votz_refresh_token')); return x }
  const [r1, r2] = await Promise.all([req(clone(), 'POST', '/auth/refresh', { auth: false }), req(clone(), 'POST', '/auth/refresh', { auth: false })])
  check(S, '3A.1: dois refresh SIMULTÂNEOS com o mesmo cookie → ambos 200 (sem logout aleatório)', r1.status === 200 && r2.status === 200, `${r1.status}/${r2.status}`)
  // reuso tardio: cookie antigo c0 depois da janela de 10 s
  await sleep(11500)
  const old = new Session('old'); old.cookies.set('votz_refresh_token', c0)
  const reuse = await req(old, 'POST', '/auth/refresh', { auth: false })
  check(S, 'H3: reuso de refresh token ANTIGO após a janela → 401', reuse.status === 401, `status ${reuse.status}`)
  const after = await req(s, 'POST', '/auth/refresh', { auth: false })
  check(S, 'H3: ...e a FAMÍLIA inteira foi revogada (token mais novo também falha)', after.status === 401, `status ${after.status}`)
  // CSRF por Origin
  clean(); const t = await withSession('cidadao_b')
  const bad = await req(t, 'POST', '/auth/refresh', { auth: false, origin: 'http://evil.example' })
  check(S, 'L4: refresh com Origin de outro site → 403', bad.status === 403, `status ${bad.status}`)
  const none = await req(t, 'POST', '/auth/refresh', { auth: false, origin: null })
  check(S, 'L4: refresh sem Origin/Referer → 403', none.status === 403, `status ${none.status}`)
  const lo = await req(t, 'POST', '/auth/logout', { origin: 'http://evil.example' })
  check(S, 'L4: logout com Origin de outro site → 403', lo.status === 403, `status ${lo.status}`)
  // logout-all
  const u1 = await withSession('cidadao_b'); const u2 = new Session('u2'); await login(u2, 'qa.cidadao_b@votz.test')
  const la = await req(u1, 'POST', '/auth/logout-all')
  check(S, 'logout-all responde ok', la.status === 200 || la.status === 201, `status ${la.status}`)
  const dead = await req(u2, 'POST', '/auth/refresh', { auth: false })
  check(S, 'logout-all revoga as outras sessões (refresh do outro aparelho → 401)', dead.status === 401, `status ${dead.status}`)
})

sec('cadastro', async () => {
  const S = 'entrada'; clean()
  const base = { name: 'QA Injecao', email: 'qa.injecao@votz.test', password: PASSWORD, phone: '+5579999990099', zipCode: '49000000', streetNumber: '1', acceptedTermsVersion: '2026-11-14', acceptedPrivacyVersion: '2026-11-14', confirmAge18: true }
  const t = (b) => req(null, 'POST', '/auth/register', { auth: false, body: b })
  check(S, 'cadastro com campo extra type=ADMIN é rejeitado (400)', (await t({ ...base, type: 'ADMIN' })).status === 400)
  check(S, 'cadastro sem aceitar a idade (confirmAge18=false) → 400', (await t({ ...base, confirmAge18: false })).status === 400)
  const old = await t({ ...base, acceptedTermsVersion: '1999-01-01' })
  check(S, 'cadastro com versão antiga dos Termos → 409', old.status === 409, `status ${old.status}`)
  const weak = await t({ ...base, password: 'senhafraca' })
  check(S, 'senha fraca é rejeitada (400)', weak.status === 400, `status ${weak.status}`)
  const proto = await req(null, 'POST', '/auth/register', { auth: false, raw: '{"__proto__":{"admin":true},"name":"x"}', headers: { 'Content-Type': 'application/json' } })
  check(S, 'poluição de protótipo (__proto__) é rejeitada (400)', proto.status === 400, `status ${proto.status}`)
  const big = await req(null, 'POST', '/auth/login', { auth: false, raw: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(2_000_000) }), headers: { 'Content-Type': 'application/json' } })
  check(S, 'corpo de 2 MB é recusado (413)', big.status === 413, `status ${big.status}`)
  const a = await req(null, 'POST', '/auth/login', { auth: false, body: { email: 'naoexiste@votz.test', password: 'Qualquer@123' } })
  const b = await req(null, 'POST', '/auth/login', { auth: false, body: { email: 'qa.cidadao_a@votz.test', password: 'SenhaErrada@123' } })
  check(S, 'login: mesma mensagem para e-mail inexistente e senha errada (sem enumeração)', a.status === b.status && a.json?.message === b.json?.message, `${a.status}/${a.json?.message} vs ${b.status}/${b.json?.message}`)
  // tempos
  const tm = async (email) => { const t0 = performance.now(); for (let i = 0; i < 3; i++) { resetThrottle(); await req(null, 'POST', '/auth/login', { auth: false, body: { email, password: 'SenhaErrada@123' } }) } return (performance.now() - t0) / 3 }
  const t1 = await tm('naoexiste2@votz.test'); const t2 = await tm('qa.sem_vinculo@votz.test'); clean()
  check(S, `L2: tempo de resposta parecido (inexistente ${t1 | 0} ms × existente ${t2 | 0} ms)`, Math.abs(t1 - t2) < Math.max(t1, t2) * 0.5, `${t1 | 0} vs ${t2 | 0}`)
  const emailDup = await t({ ...base, email: 'qa.cidadao_a@votz.test' })
  note(S, `cadastro com e-mail já existente responde ${emailDup.status} (enumeração de conta aceita e documentada)`)
})

sec('forcabruta', async () => {
  const S = 'forca-bruta'; clean()
  let last = 0
  for (let i = 0; i < 7; i++) { const r = await req(null, 'POST', '/auth/login', { auth: false, body: { email: 'qa.sem_vinculo@votz.test', password: 'Errada@12345' } }); last = r.status; await sleep(250) }
  const locked = sql(`select "lockedUntil" is not null from users where email='qa.sem_vinculo@votz.test'`)
  check(S, 'conta bloqueada após 5 senhas erradas (lockedUntil preenchido)', locked === 't', locked)
  resetThrottle()
  const good = await req(null, 'POST', '/auth/login', { auth: false, body: { email: 'qa.sem_vinculo@votz.test', password: PASSWORD } })
  check(S, 'conta bloqueada recusa até a senha CORRETA (429)', good.status === 429, `status ${good.status}`)
  clean()
  // MFA: 5 códigos errados bloqueiam
  const s = new Session('adm'); const r = await req(s, 'POST', '/auth/login', { body: { email: 'qa.admin@votz.test', password: PASSWORD }, auth: false })
  let status = 0
  for (let i = 0; i < 7; i++) { const v = await req(s, 'POST', '/auth/mfa/verify', { auth: false, body: { mfaToken: r.json.mfaToken, code: '000000' } }); status = v.status; await sleep(250) }
  check(S, 'L1: após 5 códigos MFA errados o admin é bloqueado (429)', status === 429, `último status ${status}`)
  clean()
  // limitador usa o Redis?
  const keys = sql('select 1')
  void keys
})

// ───────────── B. autorização ─────────────
sec('papeis', async () => {
  const S = 'autorizacao'; clean()
  const c = await withSession('cidadao_a'); const m = await withSession('moderador'); const a = await withSession('admin')
  const eq = async (name, p, who, method, path, body, want) => { const r = await req(who, method, path, { body }); check(S, `${name} → ${want}`, r.status === want, `status ${r.status} ${r.text.slice(0, 80)}`); return r }
  await eq('cidadão em /admin/stats', 0, c, 'GET', '/admin/stats', undefined, 403)
  await eq('moderador em /admin/stats', 0, m, 'GET', '/admin/stats', undefined, 200)
  await eq('anônimo em /admin/stats', 0, new Session('n'), 'GET', '/admin/stats', undefined, 401)
  await eq('A0: moderador tenta mudar papel (setUserType)', 0, m, 'PATCH', `/admin/users/${st.users.sem_vinculo.id}/type`, { type: 'ADMIN', reason: 'tentativa de escalada de privilegio' }, 403)
  await eq('A0: moderador tenta se promover a ADMIN', 0, m, 'PATCH', `/admin/users/${st.users.moderador.id}/type`, { type: 'ADMIN', reason: 'tentativa de escalada de privilegio' }, 403)
  await eq('A0: admin muda papel de outra conta (PRESS) com motivo', 0, a, 'PATCH', `/admin/users/${st.users.sem_vinculo.id}/type`, { type: 'PRESS', reason: 'QA: teste de mudanca de papel por admin' }, 200)
  await eq('A0: admin NÃO muda o próprio papel', 0, a, 'PATCH', `/admin/users/${st.users.admin.id}/type`, { type: 'CITIZEN', reason: 'QA: tentando rebaixar a si mesmo' }, 400)
  await eq('A0: tipo organizacional (ENTITY) recusado neste endpoint', 0, a, 'PATCH', `/admin/users/${st.users.sem_vinculo.id}/type`, { type: 'ENTITY', reason: 'QA: tipo organizacional nao permitido' }, 400)
  await eq('A0: mudança de papel sem motivo → 400', 0, a, 'PATCH', `/admin/users/${st.users.sem_vinculo.id}/type`, { type: 'CITIZEN' }, 400)
  const aud = sql(`select count(*) from moderation_actions where action='USER_TYPE_CHANGED'`)
  check(S, 'A0: mudança de papel ficou auditada em moderation_actions', +aud >= 1, `linhas ${aud}`)
  sql(`update users set type='CITIZEN' where email='qa.sem_vinculo@votz.test'`)
  await eq('moderador NÃO bane administrador', 0, m, 'PATCH', `/admin/users/${st.users.admin.id}/ban`, { banned: true, reason: 'tentativa de banir o admin' }, 400)
  await eq('moderador NÃO altera plano (admin-only)', 0, m, 'PATCH', `/admin/entities/${st.orgIds.entidade}/plan`, { plan: 'PRO' }, 403)
  await eq('cidadão NÃO aprova solicitação de cadastro', 0, c, 'POST', `/registration-requests/00000000-0000-0000-0000-000000000000/approve`, {}, 403)
  await eq('cidadão NÃO dispara sincronização (tse-sync)', 0, c, 'POST', '/tse-sync/trigger/candidatos', {}, 403)
  await eq('mass assignment: PATCH /users/:id com type/verified → 400', 0, c, 'PATCH', `/users/${st.users.cidadao_a.id}`, { type: 'ADMIN', verified: true }, 400)
  await eq('PATCH no perfil de OUTRO usuário → 403', 0, c, 'PATCH', `/users/${st.users.cidadao_b.id}`, { name: 'hackeado' }, 403)
  // GET público não vaza dados sensíveis
  const pu = await req(null, 'GET', `/users/${st.users.cidadao_a.id}`, { auth: false })
  const leak = /email|phone|password|cpf|mfa|zipCode|street/i.test(pu.text)
  check(S, 'perfil público não expõe e-mail/telefone/CPF/endereço', pu.status === 200 && !leak, pu.text.slice(0, 200))
})

sec('banimento', async () => {
  const S = 'autorizacao'; clean()
  const m = await withSession('moderador'); const b = await withSession('cidadao_b')
  const bad = await req(m, 'PATCH', `/admin/users/${st.users.cidadao_b.id}/ban`, { body: { banned: true } })
  check(S, 'banir sem motivo → 400', bad.status === 400, `status ${bad.status}`)
  const ban = await req(m, 'PATCH', `/admin/users/${st.users.cidadao_b.id}/ban`, { body: { banned: true, reason: 'QA: teste de banimento pela moderacao' } })
  check(S, 'moderador bane usuário com motivo', ban.status === 200, `status ${ban.status} ${ban.text.slice(0, 80)}`)
  const me = await req(b, 'GET', '/auth/me')
  check(S, 'banido: access token já emitido deixa de valer (401)', me.status === 401, `status ${me.status}`)
  const rf = await req(b, 'POST', '/auth/refresh', { auth: false })
  check(S, 'banido: refresh é recusado (401)', rf.status === 401, `status ${rf.status}`)
  resetThrottle(); const lg = await req(null, 'POST', '/auth/login', { auth: false, body: { email: 'qa.cidadao_b@votz.test', password: PASSWORD } })
  check(S, 'banido: login é recusado (401)', lg.status === 401, `status ${lg.status}`)
  const un = await req(m, 'PATCH', `/admin/users/${st.users.cidadao_b.id}/ban`, { body: { banned: false } })
  check(S, 'moderador desbana', un.status === 200, `status ${un.status}`)
})

// ───────────── C. IDOR e conteúdo ─────────────
sec('conteudo', async () => {
  const S = 'conteudo'; clean()
  const A = await withSession('cidadao_a'); const B = await withSession('cidadao_b'); const M = await withSession('moderador')
  const rid = st.reports.entidade
  const cm = await req(A, 'POST', `/reports/${rid}/comments`, { body: { content: 'Comentario de teste do cidadao A sobre o buraco.' } })
  check(S, 'cidadão comenta em relato', cm.status === 201, `status ${cm.status} ${cm.text.slice(0, 100)}`)
  const cid = cm.json?.id
  const ed = await req(B, 'PATCH', `/reports/${rid}/comments/${cid}`, { body: { content: 'editado por outro usuario' } })
  check(S, 'IDOR: outro cidadão NÃO edita comentário alheio (403)', ed.status === 403, `status ${ed.status}`)
  const dl = await req(B, 'DELETE', `/reports/${rid}/comments/${cid}`)
  check(S, 'IDOR: outro cidadão NÃO apaga comentário alheio (403)', dl.status === 403, `status ${dl.status}`)
  const ok = await req(A, 'PATCH', `/reports/${rid}/comments/${cid}`, { body: { content: 'Comentario editado pelo proprio autor.' } })
  check(S, 'autor edita o próprio comentário', ok.status === 200, `status ${ok.status}`)
  // sinalização
  const fl = await req(B, 'POST', '/moderation/flags', { body: { targetType: 'COMMENT', targetId: cid, reason: 'OFFENSIVE', details: 'QA: teste de sinalizacao' } })
  check(S, 'cidadão sinaliza comentário alheio', fl.status === 201, `status ${fl.status} ${fl.text.slice(0, 100)}`)
  const dup = await req(B, 'POST', '/moderation/flags', { body: { targetType: 'COMMENT', targetId: cid, reason: 'OFFENSIVE' } })
  check(S, 'sinalização duplicada → 409', dup.status === 409, `status ${dup.status}`)
  const own = await req(A, 'POST', '/moderation/flags', { body: { targetType: 'COMMENT', targetId: cid, reason: 'SPAM_OR_ADS' } })
  check(S, 'não é possível sinalizar o próprio comentário (403)', own.status === 403, `status ${own.status}`)
  const list = await req(B, 'GET', '/admin/flags')
  check(S, 'cidadão NÃO lista sinalizações (403)', list.status === 403, `status ${list.status}`)
  const ml = await req(M, 'GET', '/admin/flags?status=OPEN')
  check(S, 'moderador lista sinalizações abertas', ml.status === 200 && ml.json?.data?.length >= 1, `status ${ml.status}`)
  const fid = ml.json?.data?.[0]?.id
  const rs = await req(M, 'PATCH', `/admin/flags/${fid}/resolve`, { body: { action: 'REMOVE_CONTENT', note: 'QA: conteudo removido pela moderacao' } })
  check(S, 'moderador resolve removendo o conteúdo', rs.status === 200, `status ${rs.status} ${rs.text.slice(0, 100)}`)
  const gone = sql(`select count(*) from comments where id='${cid}'`)
  check(S, '...e o comentário foi realmente removido', gone === '0', gone)
  const bad = await req(M, 'PATCH', `/admin/flags/nao-e-uuid/resolve`, { body: { action: 'DISMISS', note: 'QA: id invalido aqui' } })
  check(S, 'flags/:id/resolve com id inválido → 400', bad.status === 400, `status ${bad.status}`)
  // XSS / injeção
  const x = await req(A, 'POST', '/reports', { body: { title: 'QA <script>alert(1)</script> titulo com html', description: 'QA descricao <img src=x onerror=alert(1)> com html malicioso para testar sanitizacao.', category: 'OTHER', latitude: -10.91, longitude: -37.07, city: 'Aracaju', state: 'SE' } })
  const got = await req(null, 'GET', `/reports/${x.json?.id}`, { auth: false })
  check(S, 'XSS: <script> e onerror são removidos na gravação', x.status === 201 && !/<script|onerror/i.test(got.text), got.text.slice(0, 160))
  for (const [nm, p] of [['search', `/reports?search=${encodeURIComponent("' OR '1'='1")}`], ['search2', `/reports?search=${encodeURIComponent("'; DROP TABLE users;--")}`], ['similar', `/reports/similar?title=${encodeURIComponent("x'); select pg_sleep(5);--")}`], ['uuid', '/reports/abc']]) {
    const t0 = Date.now(); const r = await req(null, 'GET', p, { auth: false }); const dt = Date.now() - t0
    check(S, `injeção SQL em ${nm}: sem erro 500 e sem atraso (${dt} ms, status ${r.status})`, r.status < 500 && dt < 4000, `status ${r.status} ${r.text.slice(0, 80)}`)
  }
  const users = sql('select count(*) from users'); check(S, 'a tabela users continua intacta após os payloads', +users > 0, users)
  // mídia vinda do cliente
  const ext = await req(A, 'POST', '/reports', { body: { title: 'QA midia externa', description: 'Relato de teste com midia hospedada fora do Votz para validar.', category: 'OTHER', media: ['https://evil.example/pixel.png'] } })
  check(S, 'A4: mídia hospedada fora do Votz é recusada (400)', ext.status === 400, `status ${ext.status} ${ext.text.slice(0, 100)}`)
  const mk = await req(A, 'POST', `/reports/${rid}/comments`, { body: { content: 'x', mediaType: 'AUDIO', mediaUrl: 'http://127.0.0.1:9000/votz/verification/aaaa.pdf', mediaKey: 'verification/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.pdf' } })
  check(S, 'A3: comentário com mediaKey de pasta privada é recusado (400)', mk.status === 400, `status ${mk.status} ${mk.text.slice(0, 100)}`)
})

// ───────────── D. uploads ─────────────
sec('uploads', async () => {
  const S = 'upload'; clean()
  const A = await withSession('cidadao_a')
  const up = async (path, buf, name, type) => { const f = new FormData(); f.append('file', new Blob([buf], { type }), name); return req(A, 'POST', path, { raw: f }) }
  let r = await up('/storage/upload/report-media', png, 'foto.png', 'image/png')
  check(S, 'PNG válido é aceito e guardado no storage', r.status === 201 && !!r.json?.key, `status ${r.status} ${r.text.slice(0, 120)}`)
  if (r.json?.url) { const g = await fetch(r.json.url); check(S, 'arquivo enviado é entregue com Content-Type de imagem', g.ok && /image\/png/.test(g.headers.get('content-type') ?? ''), `${g.status} ${g.headers.get('content-type')}`) }
  r = await up('/storage/upload/report-media', Buffer.from('<html><script>alert(1)</script></html>'), 'x.png', 'image/png')
  check(S, 'HTML disfarçado de PNG (mimetype falso) é recusado', r.status === 400, `status ${r.status} ${r.text.slice(0, 100)}`)
  r = await up('/storage/upload/report-media', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml')
  check(S, 'SVG com script é recusado', r.status === 400, `status ${r.status}`)
  r = await up('/storage/upload/report-media', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]), 'a.png', 'image/png')
  check(S, 'executável Windows (MZ) disfarçado é recusado', r.status === 400, `status ${r.status}`)
  r = await up('/storage/upload/avatar', Buffer.from('texto qualquer'), 'a.txt', 'text/plain')
  check(S, 'arquivo de texto como avatar é recusado', r.status === 400, `status ${r.status}`)
  r = await req(null, 'POST', '/storage/upload/report-media', { auth: false, raw: (() => { const f = new FormData(); f.append('file', new Blob([png], { type: 'image/png' }), 'a.png'); return f })() })
  check(S, 'upload sem login é recusado (401)', r.status === 401, `status ${r.status}`)
})

// ───────────── E. cabeçalhos, CORS, Stripe ─────────────
sec('http', async () => {
  const S = 'http'; clean()
  const h = await fetch(BASE + '/health')
  const need = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'referrer-policy']
  check(S, 'API envia cabeçalhos de segurança (CSP, HSTS, nosniff, referrer)', need.every((k) => h.headers.get(k)), need.filter((k) => !h.headers.get(k)).join(','))
  check(S, 'API não expõe X-Powered-By', !h.headers.get('x-powered-by'), h.headers.get('x-powered-by') ?? '')
  const evil = await fetch(BASE + '/auth/me', { method: 'OPTIONS', headers: { Origin: 'http://evil.example', 'Access-Control-Request-Method': 'GET' } })
  check(S, 'CORS: origem desconhecida NÃO recebe Access-Control-Allow-Origin', !evil.headers.get('access-control-allow-origin'), evil.headers.get('access-control-allow-origin') ?? '')
  const good = await fetch(BASE + '/auth/me', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' } })
  check(S, 'CORS: origem do front recebe a própria origem + credenciais', good.headers.get('access-control-allow-origin') === ORIGIN && good.headers.get('access-control-allow-credentials') === 'true', `${good.headers.get('access-control-allow-origin')} ${good.headers.get('access-control-allow-credentials')}`)
  const ck = new Session('c'); const rl = await req(ck, 'POST', '/auth/login', { auth: false, body: { email: 'qa.cidadao_a@votz.test', password: PASSWORD } })
  const sc = (await fetch(BASE + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify({ email: 'qa.cidadao_a@votz.test', password: PASSWORD }) })).headers.getSetCookie().join(' ; ')
  check(S, 'cookie de refresh: HttpOnly e SameSite definidos', /HttpOnly/i.test(sc) && /SameSite=/i.test(sc), sc.slice(0, 160))
  note(S, `cookie em dev: ${sc.replace(/votz_refresh_token=[^;]+/, 'votz_refresh_token=<token>').slice(0, 160)}`)
  // Stripe: quem pode abrir cobrança
  clean()
  const A = await withSession('cidadao_a'); const E2 = await withSession('entidade2')
  const body = { orgId: st.orgIds.entidade, orgType: 'ENTITY', plan: 'GESTAO' }
  let r = await req(A, 'POST', '/subscricoes/checkout', { body })
  check(S, 'H2: membro SEM permissão de cobrança não abre checkout (403)', r.status === 403, `status ${r.status}`)
  r = await req(A, 'POST', '/subscricoes/portal', { body: { orgId: st.orgIds.entidade, orgType: 'ENTITY' } })
  check(S, 'H2: membro SEM permissão de cobrança não abre o portal (403)', r.status === 403, `status ${r.status}`)
  r = await req(E2, 'POST', '/subscricoes/portal', { body: { orgId: st.orgIds.entidade, orgType: 'ENTITY' } })
  check(S, 'H2: dono de OUTRA entidade não abre o portal da entidade alheia (403)', r.status === 403, `status ${r.status}`)
  const bw = await req(null, 'POST', '/subscricoes/webhook', { auth: false, raw: '{"type":"checkout.session.completed"}', headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=fake' } })
  check(S, 'webhook do Stripe com assinatura falsa é recusado (400)', bw.status === 400, `status ${bw.status}`)
  const E = new Session('e'); resetThrottle(); await login(E, 'qa.entidade@votz.test', PASSWORD, st.users.entidade.mfaSecret)
  const sw = await req(E, 'POST', '/auth/switch-context', { body: { contextType: 'entity', contextId: st.orgIds.entidade, mfaCode: await totp(st.users.entidade.mfaSecret) } }); E.token = sw.json.accessToken
  r = await req(E, 'POST', '/subscricoes/checkout', { body })
  note(S, `dono COM permissão pede checkout: status ${r.status} ${r.text.slice(0, 140)}`)
})

const only = process.argv[2]
for (const [name, fn] of sections) {
  if (only && name !== only) continue
  try { await fn() } catch (e) { check('erro-script', `seção ${name} abortou`, false, e.message) }
}
saveState(st)
