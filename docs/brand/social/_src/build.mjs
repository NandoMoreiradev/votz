// Gera as imagens de redes sociais do Votz (perfil + carrossel).
// Uso: node docs/brand/social/_src/build.mjs
// Requer Microsoft Edge ou Google Chrome instalado (renderização headless).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(SRC, '..')
const TMP = path.join(SRC, '.tmp')
mkdirSync(TMP, { recursive: true })

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const BROWSER = BROWSERS.find(existsSync)
if (!BROWSER) throw new Error('Edge/Chrome não encontrado')

// Tokens do design system (apps/web/src/theme/index.ts)
const C = { primary: '#1A1A2E', action: '#E63946', positive: '#2DC653', neutral: '#F4F4F4', text: '#0D0D0D', white: '#FFFFFF' }

const fonts = `
@font-face{font-family:'Space Grotesk';font-weight:700;src:url(fonts/space-grotesk-latin-700-normal.woff2)}
@font-face{font-family:'Space Grotesk';font-weight:500;src:url(fonts/space-grotesk-latin-500-normal.woff2)}
@font-face{font-family:'Inter';font-weight:400;src:url(fonts/inter-latin-400-normal.woff2)}
@font-face{font-family:'Inter';font-weight:600;src:url(fonts/inter-latin-600-normal.woff2)}
@font-face{font-family:'JetBrains Mono';font-weight:500;src:url(fonts/jetbrains-mono-latin-500-normal.woff2)}
*{box-sizing:border-box;margin:0;padding:0}
body{-webkit-font-smoothing:antialiased}
`

// Símbolo (dois braços do V) — mesma geometria de votz-symbol.svg, sem o quadrado
const arms = (size, style = '') => `
<svg viewBox="20 20 80 80" width="${size}" height="${size * 80 / 80}" style="${style}">
  <path fill="#FFFFFF" d="M20 40H44L56 70V100H44Z"/>
  <path fill="${C.action}" d="M56 70L68 40L76 20H100L68 100H56Z"/>
</svg>`

// ───────── Imagem de perfil (1080×1080, segura para recorte circular) ─────────
const profile = `<!doctype html><meta charset="utf-8"><style>${fonts}
body{width:1080px;height:1080px;background:${C.primary};display:flex;align-items:center;justify-content:center}
</style><body>${arms(520)}</body>`

// ───────── Carrossel (1080×1350, formato 4:5) ─────────
const TOTAL = 5
const header = (n, dark, mono = false) => `
<div class="top">
  <img src="${dark ? 'votz-logo-dark.svg' : 'votz-logo.svg'}" height="64" style="margin-left:${dark ? -11 : 0}px${mono ? ';filter:brightness(0) invert(1)' : ''}">
  <span class="count">${String(n).padStart(2, '0')}/${String(TOTAL).padStart(2, '0')}</span>
</div>`

const base = (bg, fg) => `${fonts}
body{width:1080px;height:1350px;background:${bg};color:${fg};font-family:'Inter',sans-serif;position:relative;overflow:hidden}
.wrap{position:absolute;inset:0;padding:88px 88px 96px;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.count{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:30px;opacity:.6}
.tag{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:30px;letter-spacing:.12em;text-transform:uppercase}
h1,h2{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.025em}
`

const slides = []

// 1 — Capa
slides.push(`<!doctype html><meta charset="utf-8"><style>${base(C.primary, C.white)}
.wrap{justify-content:space-between}
.mid{margin-top:auto;margin-bottom:auto}
h1{font-size:112px;line-height:1.02}
h1 em{font-style:normal;color:${C.action}}
.sub{font-size:44px;line-height:1.35;margin-top:48px;color:rgba(255,255,255,.82);max-width:860px}
.swipe{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:32px;color:${C.white};display:flex;gap:16px;align-items:center}
.swipe b{color:${C.action};font-size:44px}
.ghost{position:absolute;right:-250px;bottom:-330px;opacity:.07}
</style><body><div class="ghost">${arms(760)}</div><div class="wrap">
${header(1, true)}
<div class="mid"><h1>Seu problema não pode <em>morrer num grupo de WhatsApp.</em></h1>
<p class="sub">Conheça o Votz: onde reclamação vira registro, e registro vira ação.</p></div>
<div class="swipe">Deslize <b>→</b></div></div></body>`)

// 2 — O que é
slides.push(`<!doctype html><meta charset="utf-8"><style>${base(C.neutral, C.primary)}
.wrap{justify-content:space-between}
.tag{color:${C.action}}
h2{font-size:92px;line-height:1.08;margin-top:40px}
h2 span{display:block;margin-bottom:34px}
h2 u{text-decoration:underline;text-decoration-color:var(--c);text-decoration-thickness:12px;text-underline-offset:24px;text-decoration-skip-ink:none}
.body{font-size:42px;line-height:1.4;color:#3b3b52;max-width:880px}
.body strong{color:${C.primary};font-weight:600}
</style><body><div class="wrap">
${header(2, false)}
<div><div class="tag">O que é o Votz</div>
<h2><span>Reclamação vira <u style="--c:${C.primary}">registro.</u></span><span>Registro vira <u style="--c:${C.action}">pressão.</u></span><span>Pressão vira <u style="--c:${C.positive}">ação.</u></span></h2></div>
<p class="body">Uma plataforma <strong>pública</strong> e <strong>grátis para o cidadão</strong>, que liga você a prefeituras, políticos e empresas que precisam responder.</p>
</div></body>`)

// 3 — Como usar
const step = (n, t, d) => `<div class="step"><span class="n">${n}</span><div><h2>${t}</h2><p>${d}</p></div></div>`
slides.push(`<!doctype html><meta charset="utf-8"><style>${base(C.primary, C.white)}
.tag{color:${C.action};margin-top:72px}
.steps{margin-top:36px;display:flex;flex-direction:column;flex:1;justify-content:space-between}
.step{display:flex;gap:40px;padding:40px 0;border-top:2px solid rgba(255,255,255,.16)}
.n{font-family:'JetBrains Mono',monospace;font-weight:500;font-size:60px;color:${C.action};line-height:1}
.step h2{font-size:68px;line-height:1.05}
.step p{font-size:37px;line-height:1.38;margin-top:14px;color:rgba(255,255,255,.8)}
</style><body><div class="wrap">
${header(3, true)}
<div class="tag">Como usar</div>
<div class="steps">
${step('01', 'Registre', 'Conte o problema com foto e local. Se preferir, seu nome não aparece para o público.')}
${step('02', 'Apoie', 'Cada apoio aumenta a pressão sobre quem precisa agir.')}
${step('03', 'Cobre', 'A resposta fica numa linha do tempo pública. Disseram que resolveu e não resolveu? Conteste.')}
</div></div></body>`)

// 4 — Chamada: convide
const chip = (t) => `<span class="chip">${t}</span>`
slides.push(`<!doctype html><meta charset="utf-8"><style>${base(C.action, C.white)}
.wrap{justify-content:space-between}
.tag{color:${C.white}}
h1{font-size:150px;line-height:.98;margin-top:36px}
.chips{display:flex;flex-wrap:wrap;gap:18px}
.chip{font-weight:600;font-size:38px;border:3px solid ${C.white};border-radius:9999px;padding:12px 30px}
.body{font-size:44px;line-height:1.35;font-weight:600;margin-top:44px}
.top .count{opacity:.85}
</style><body><div class="wrap">
${header(4, true, true)}
<div><div class="tag">Agora é com você</div><h1>Convide quem decide.</h1></div>
<div><div class="chips">${chip('Seu vereador')}${chip('Seu deputado')}${chip('A prefeitura')}${chip('O hospital da cidade')}${chip('A empresa que te atende mal')}</div>
<p class="body">De qualquer partido. Quem tem poder precisa estar onde o povo cobra.</p></div>
</div></body>`)

// 5 — CTA final
slides.push(`<!doctype html><meta charset="utf-8"><style>${base(C.primary, C.white)}
.wrap{justify-content:space-between}
.mid{display:flex;flex-direction:column;gap:56px}
.mid img{width:760px;margin-left:-36px}
h1{font-size:104px;line-height:1.04}
h1 em{font-style:normal;color:${C.action}}
.sub{font-size:42px;line-height:1.4;color:rgba(255,255,255,.82);max-width:880px}
.cta{align-self:flex-start;background:${C.action};color:${C.white};font-family:'JetBrains Mono',monospace;font-weight:500;font-size:40px;padding:26px 52px;border-radius:9999px}
</style><body><div class="wrap">
<div class="top"><span></span><span class="count">${String(5).padStart(2, '0')}/${String(TOTAL).padStart(2, '0')}</span></div>
<div class="mid"><img src="votz-logo-dark.svg">
<h1>Entre. Registre. <em>Convide.</em></h1>
<p class="sub">É político, entidade pública ou empresa? Cadastre seu perfil e responda de frente.</p></div>
<div class="cta">Link na bio</div>
</div></body>`)

function render(html, name, w, h) {
  const file = path.join(SRC, `.tmp-${name}.html`)
  writeFileSync(file, html)
  const out = path.join(OUT, `${name}.png`)
  const r = spawnSync(BROWSER, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--virtual-time-budget=4000', `--window-size=${w},${h}`, `--screenshot=${out}`,
    pathToFileURL(file).href,
  ], { stdio: 'ignore' })
  if (r.status !== 0) throw new Error(`falha ao renderizar ${name}`)
  console.log('ok', out)
}

render(profile, 'votz-perfil', 1080, 1080)
slides.forEach((html, i) => render(html, `carrossel-0${i + 1}`, 1080, 1350))
