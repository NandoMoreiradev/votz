import { FOR_YOU_MIX, hasFewFollows, mixForYouFeed, planWindow, type MixCandidate } from './feed-mix'
import type { ViewerRankingContext } from './feed-ranking.service'

const NOW = Date.UTC(2026, 10, 20, 12, 0, 0)
let seq = 0

function post(over: Partial<MixCandidate> = {}): MixCandidate {
  seq++
  return {
    id: `p${seq}`,
    authorUserId: `author-${seq}`,
    authorOrgType: null,
    authorOrgId: null,
    cityKey: null,
    state: null,
    hotScore: 1,
    createdAt: new Date(NOW - seq * 60_000),
    topicIds: [],
    authorTrusted: true,
    ...over,
  }
}

function viewer(over: Partial<ViewerRankingContext> = {}): ViewerRankingContext {
  return {
    userId: 'me',
    city: 'Aracaju',
    cityKey: 'aracaju',
    state: 'SE',
    followedUserIds: new Set(),
    followedPoliticianIds: new Set(),
    followedEntityIds: new Set(),
    followedTopicIds: new Set(),
    ...over,
  }
}

/** Gente que o viewer segue: ids f0..f(n-1). */
function followers(n: number) {
  return new Set(Array.from({ length: n }, (_, i) => `f${i}`))
}

function bigPool(follows: Set<string>) {
  const followed = [...follows]
  const posts: MixCandidate[] = []
  // 3 posts de cada seguido (pool grande para o círculo)
  for (const id of followed) for (let i = 0; i < 3; i++) posts.push(post({ authorUserId: id, hotScore: 0.5 }))
  // 30 locais de autores diferentes
  for (let i = 0; i < 30; i++) posts.push(post({ cityKey: 'aracaju', state: 'SE', hotScore: 0.3 }))
  // 30 de fora, em alta
  for (let i = 0; i < 30; i++) posts.push(post({ cityKey: 'recife', state: 'PE', hotScore: 5 + i }))
  return posts
}

describe('planWindow', () => {
  it('distribui 5/3/2 em 10 vagas, com descoberta nunca colada', () => {
    const plan = planWindow(FOR_YOU_MIX.NORMAL)
    expect(plan).toHaveLength(10)
    expect(plan.filter((s) => s === 'circle')).toHaveLength(5)
    expect(plan.filter((s) => s === 'local')).toHaveLength(3)
    expect(plan.filter((s) => s === 'discovery')).toHaveLength(2)
    plan.forEach((slot, i) => { if (slot === 'discovery') expect(plan[i + 1]).not.toBe('discovery') })
  })

  it('sobe a descoberta para 4 em 10 para quem segue poucos, sem ficar colada', () => {
    const plan = planWindow(FOR_YOU_MIX.FEW_FOLLOWS)
    expect(plan.filter((s) => s === 'discovery')).toHaveLength(4)
    plan.forEach((slot, i) => { if (slot === 'discovery') expect(plan[i + 1]).not.toBe('discovery') })
    // e não termina e recomeça colando entre um bloco e outro
    expect(plan[0] === 'discovery' && plan[9] === 'discovery').toBe(false)
  })
})

describe('mixForYouFeed', () => {
  it('mistura ~5 seguidos, ~3 locais e ~2 descoberta a cada 10 (quem segue bastante)', () => {
    const follows = followers(8)
    const v = viewer({ followedUserIds: follows })
    const out = mixForYouFeed(bigPool(follows), v)
    const first10 = out.slice(0, 10)
    expect(first10.filter((i) => follows.has(i.post.authorUserId))).toHaveLength(5)
    expect(first10.filter((i) => i.reason !== null)).toHaveLength(2)
    expect(first10.filter((i) => i.reason === null && !follows.has(i.post.authorUserId))).toHaveLength(3)
    expect(first10.filter((i) => i.reason === null && !follows.has(i.post.authorUserId)).every((i) => i.post.cityKey === 'aracaju')).toBe(true)
  })

  it('descoberta nunca vem duas seguidas e sempre traz o motivo escrito pelo servidor', () => {
    const follows = followers(8)
    const out = mixForYouFeed(bigPool(follows), viewer({ followedUserIds: follows })).slice(0, 40)
    out.forEach((item, i) => { if (item.reason) expect(out[i + 1]?.reason ?? null).toBeNull() })
    const reasons = new Set(out.filter((i) => i.reason).map((i) => i.reason))
    for (const reason of reasons) expect([FOR_YOU_MIX.REASON_CITY, FOR_YOU_MIX.REASON_SUGGESTED]).toContain(reason)
    for (const item of out.filter((i) => i.reason === FOR_YOU_MIX.REASON_CITY)) expect(item.post.cityKey).toBe('aracaju')
    for (const item of out.filter((i) => i.reason === FOR_YOU_MIX.REASON_SUGGESTED)) expect(item.post.cityKey).not.toBe('aracaju')
  })

  it('quem segue menos de 5 contas recebe ~4 de descoberta em 10', () => {
    const follows = followers(2)
    const v = viewer({ followedUserIds: follows })
    expect(hasFewFollows(v)).toBe(true)
    const out = mixForYouFeed(bigPool(follows), v)
    expect(out.slice(0, 10).filter((i) => i.reason !== null)).toHaveLength(4)
  })

  it('descoberta só de conteúdo confiável', () => {
    const follows = followers(6)
    const pool = bigPool(follows)
    const untrusted = pool.filter((p) => p.cityKey === 'recife').slice(0, 15)
    untrusted.forEach((p) => { p.authorTrusted = false; p.hotScore = 1000 })
    const out = mixForYouFeed(pool, viewer({ followedUserIds: follows }))
    const discovered = out.filter((i) => i.reason !== null).map((i) => i.post.id)
    for (const p of untrusted) expect(discovered).not.toContain(p.id)
  })

  it('post sem confiança não vira descoberta nem entra no feed se não for do círculo ou local', () => {
    const only = [post({ cityKey: 'recife', state: 'PE', authorTrusted: false })]
    expect(mixForYouFeed(only, viewer())).toHaveLength(0)
  })

  it('anti-monopólio: o mesmo autor no máximo 2 vezes a cada 10 itens', () => {
    const follows = followers(8)
    const pool = bigPool(follows)
    for (let i = 0; i < 12; i++) pool.push(post({ authorUserId: 'f0', hotScore: 99 }))
    const out = mixForYouFeed(pool, viewer({ followedUserIds: follows })).map((i) => i.post.authorUserId)
    for (let start = 0; start + 10 <= out.length; start++) {
      const window = out.slice(start, start + 10)
      const counts = new Map<string, number>()
      for (const id of window) counts.set(id, (counts.get(id) ?? 0) + 1)
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(FOR_YOU_MIX.MAX_PER_AUTHOR_IN_WINDOW)
    }
  })

  it('o que sobra de um grupo é preenchido pelos outros e nada se repete', () => {
    // só há descoberta e local; sem círculo
    const pool = [
      ...Array.from({ length: 8 }, () => post({ cityKey: 'aracaju', state: 'SE' })),
      ...Array.from({ length: 8 }, () => post({ cityKey: 'recife', state: 'PE', hotScore: 9 })),
    ]
    const out = mixForYouFeed(pool, viewer())
    expect(out).toHaveLength(16)
    expect(new Set(out.map((i) => i.post.id)).size).toBe(16)
    out.slice(0, 10).forEach((item, i) => { if (item.reason) expect(out[i + 1].reason).toBeNull() })
  })

  it('sem círculo nem cidade, ainda mostra descoberta (feed não fica vazio)', () => {
    const pool = Array.from({ length: 6 }, () => post({ hotScore: 3 }))
    const out = mixForYouFeed(pool, viewer({ city: null, cityKey: null, state: null }))
    expect(out).toHaveLength(6)
    expect(out.every((i) => i.reason === FOR_YOU_MIX.REASON_SUGGESTED)).toBe(true)
  })

  it('post do próprio autor conta como círculo e não leva rótulo', () => {
    const mine = post({ authorUserId: 'me', authorTrusted: false })
    const out = mixForYouFeed([mine], viewer())
    expect(out).toHaveLength(1)
    expect(out[0].reason).toBeNull()
  })
})
