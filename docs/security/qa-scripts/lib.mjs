// Cliente de teste do Votz (somente ambiente local). Cookie jar por sessão, SQL via docker, TOTP via otplib.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('C:/Users/pc/WebstormProjects/Votz/package.json')
const { generate } = require('otplib')

export const BASE = 'http://127.0.0.1:3000/api/v1'
export const ORIGIN = 'http://localhost:5173'
export const PASSWORD = 'Qa@Votz2026!x'
export const DOCKER = 'E:/Dev/Docker/resources/bin/docker.exe'
const HERE = path.dirname(fileURLToPath(import.meta.url))
export const STATE_FILE = path.join(HERE, 'state.json')
export const RESULTS_FILE = path.join(HERE, 'results.json')

export const loadState = () => (existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {})
export const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2))

export class Session {
  constructor(label) { this.label = label; this.cookies = new Map(); this.token = null }
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
}

export async function req(session, method, p, { body, headers = {}, origin = ORIGIN, auth = true, raw, token } = {}) {
  const h = { ...headers }
  if (origin) h.Origin = origin
  const tk = token ?? (auth ? session?.token : null)
  if (tk) h.Authorization = `Bearer ${tk}`
  if (session && session.cookies.size) h.Cookie = session.cookieHeader()
  let payload
  if (raw !== undefined) payload = raw
  else if (body !== undefined) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(BASE + p, { method, headers: h, body: payload, redirect: 'manual' })
  if (session) {
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(';'); const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim(); const val = pair.slice(i + 1)
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(sc) || val === '') session.cookies.delete(name)
      else session.cookies.set(name, val)
    }
  }
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch { /* corpo não-JSON */ }
  return { status: res.status, json, text, headers: res.headers }
}

export function sql(query) {
  return execFileSync(DOCKER, ['exec', 'votz-postgres', 'psql', '-U', 'votz', '-d', 'votz', '-At', '-F', '|', '-c', query], { encoding: 'utf8' }).trim()
}

export function resetThrottle() {
  try {
    const keys = execFileSync(DOCKER, ['exec', 'votz-redis', 'redis-cli', '--scan', '--pattern', 'votz:throttle:*'], { encoding: 'utf8' }).split('\n').filter(Boolean)
    if (keys.length) execFileSync(DOCKER, ['exec', 'votz-redis', 'redis-cli', 'DEL', ...keys], { encoding: 'utf8' })
    return keys.length
  } catch { return -1 }
}

export const totp = (secret) => generate({ secret })
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── resultados ───────────────────────────────────────────────────────────────
const results = existsSync(RESULTS_FILE) ? JSON.parse(readFileSync(RESULTS_FILE, 'utf8')) : []
export function check(suite, name, pass, detail = '') {
  results.push({ suite, name, pass: !!pass, detail: String(detail).slice(0, 300) })
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${suite}] ${name}${pass ? '' : '   -> ' + String(detail).slice(0, 200)}`)
  writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2))
  return pass
}
export const note = (suite, msg) => { console.log(`NOTE  [${suite}] ${msg}`); results.push({ suite, name: msg, pass: null, detail: 'nota' }); writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2)) }

// ── login com MFA (para quem exige) ──────────────────────────────────────────
export async function login(session, email, password = PASSWORD, mfaSecret) {
  const r = await req(session, 'POST', '/auth/login', { body: { email, password }, auth: false })
  if (r.status !== 200 && r.status !== 201) return { ok: false, r }
  if (r.json?.requiresMfa) {
    if (!mfaSecret) return { ok: false, r, needsMfa: true }
    const v = await req(session, 'POST', '/auth/mfa/verify', { body: { mfaToken: r.json.mfaToken, code: await totp(mfaSecret) }, auth: false })
    if (v.status !== 200) return { ok: false, r: v }
    session.token = v.json.accessToken; session.user = v.json.user
    return { ok: true, r: v }
  }
  if (r.json?.requiresMfaSetup) return { ok: false, r, needsSetup: true, setupToken: r.json.mfaSetupToken }
  session.token = r.json.accessToken; session.user = r.json.user
  return { ok: true, r }
}
