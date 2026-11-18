// Local-only initialization. Never prints secrets or resets an existing database.
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const directory = path.join(root, '.local/chat')
fs.mkdirSync(directory, { recursive: true })
const secretPath = path.join(directory, 'secrets.json')
const secrets = fs.existsSync(secretPath) ? JSON.parse(fs.readFileSync(secretPath, 'utf8')) : Object.fromEntries(['jwt', 'registration', 'database', 'tokenEncryption'].map(key => [key, randomBytes(32).toString('hex')]))
fs.writeFileSync(secretPath, JSON.stringify(secrets), { mode: 0o600 })
const sql = `SELECT 'CREATE ROLE votz_matrix LOGIN PASSWORD ''${secrets.database}''' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'votz_matrix')\n\\gexec\nSELECT 'CREATE DATABASE votz_matrix OWNER votz_matrix ENCODING ''UTF8'' LC_COLLATE ''C'' LC_CTYPE ''C'' TEMPLATE template0' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'votz_matrix')\n\\gexec\n`
const result = spawnSync('docker', ['exec', '-i', 'votz-postgres', 'psql', '-U', 'votz', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' })
if (result.status !== 0) throw new Error('Could not initialize the local Matrix database. Start votz-postgres first.')
const config = {
  server_name: 'chat.votz.local', pid_file: '/data/homeserver.pid', report_stats: false,
  public_baseurl: 'http://localhost:3000/api/v1/conversations/matrix/',
  listeners: [{ port: 8008, tls: false, type: 'http', x_forwarded: false, resources: [{ names: ['client'], compress: false }] }],
  database: { name: 'psycopg2', args: { user: 'votz_matrix', password: secrets.database, database: 'votz_matrix', host: 'votz-postgres', port: 5432, cp_min: 2, cp_max: 10 } },
  log_config: '/data/log.config', signing_key_path: '/data/chat.votz.local.signing.key', media_store_path: '/data/media_store',
  enable_registration: false, allow_guest_access: false, registration_shared_secret: secrets.registration,
  jwt_config: { enabled: true, secret: secrets.jwt, algorithm: 'HS256', issuer: 'votz-chat', audiences: ['votz-matrix'] },
  password_config: { enabled: false }, federation_domain_whitelist: [], trusted_key_servers: [],
  url_preview_enabled: false, max_upload_size: '1K', enable_metrics: false,
  rc_message: { per_second: 5, burst_count: 30 },
  // JWT logins originate only from the Votz gateway, which enforces its own limits.
  rc_login: { address: { per_second: 1, burst_count: 100 }, account: { per_second: 1, burst_count: 20 }, failed_attempts: { per_second: 0.17, burst_count: 5 } },
}
fs.writeFileSync(path.join(directory, 'homeserver.yaml'), JSON.stringify(config, null, 2), { mode: 0o600 })
fs.writeFileSync(path.join(directory, 'log.config'), JSON.stringify({ version: 1, formatters: { plain: { format: '%(asctime)s %(name)s %(levelname)s %(message)s' } }, handlers: { console: { class: 'logging.StreamHandler', formatter: 'plain' } }, root: { level: 'WARNING', handlers: ['console'] }, disable_existing_loggers: false }))
const envPath = path.join(root, 'apps/api/.env.local')
let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const entries = { CHAT_MATRIX_URL: 'http://127.0.0.1:8008', CHAT_MATRIX_SERVER_NAME: 'chat.votz.local', CHAT_MATRIX_JWT_SECRET: secrets.jwt, CHAT_MATRIX_REGISTRATION_SECRET: secrets.registration, CHAT_TOKEN_ENCRYPTION_KEY: secrets.tokenEncryption, CHAT_TEXT_ENABLED: 'false' }
for (const [key, value] of Object.entries(entries)) {
  if (!new RegExp(`^${key}=`, 'm').test(env)) env += `\n${key}=${value}`
}
fs.writeFileSync(envPath, env.trim() + '\n', { mode: 0o600 })
console.log('Local Matrix configuration initialized. Secrets remain in ignored local files. Text messaging stays disabled until validation.')
