// Requires the local API and documented demo citizen accounts. No production URL.
import assert from 'node:assert/strict'

const base = 'http://localhost:3000/api/v1'
const password = 'Demo@Votz2026!x'
async function request(path, token, method = 'GET', body) {
  // Exercise the real throttler without changing application limits for QA.
  await new Promise((resolve) => setTimeout(resolve, 180))
  let response
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    if (response.status !== 429) break
    const seconds = Number(response.headers.get('retry-after')) || 15
    await response.text()
    console.log(`Throttled; waiting ${Math.min(seconds, 60)} seconds before retry.`)
    await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 60) * 1000))
  }
  const result = response.status === 204 ? null : await response.json()
  assert.ok(response.ok, `${method} ${path}: HTTP ${response.status}`)
  return result
}
async function login(number) {
  const session = await request('/auth/mobile/login', null, 'POST', { email: `demo.cidadao${number}@votz.test`, password })
  assert.ok(session.accessToken, 'Demo account must not require MFA')
  return session
}
const [author, reposter, viewer] = await Promise.all([login(1), login(2), login(3)])
const followPath = (user) => `/users/${user.user.id}/is-following`
const before = await Promise.all([request(followPath(author), viewer.accessToken), request(followPath(reposter), viewer.accessToken)])
async function follow(user, desired) {
  const current = await request(followPath(user), viewer.accessToken)
  if (current.following !== desired) await request(`/users/${user.user.id}/follow`, viewer.accessToken, 'POST')
}
const created = []
try {
  const original = await request('/posts', author.accessToken, 'POST', { content: 'QA repost distribution: original de teste.', city: 'Aracaju', state: 'SE' })
  created.push([original.id, author.accessToken])
  const own = await request('/posts', reposter.accessToken, 'POST', { content: 'QA repost distribution: publicação própria de teste.' })
  created.push([own.id, reposter.accessToken])
  await follow(author, false)
  await follow(reposter, true)
  assert.equal((await request(`/posts/${original.id}/repost`, reposter.accessToken, 'POST')).reposted, true)
  const profile = await request(`/posts?profileUserId=${reposter.user.id}&limit=1`, viewer.accessToken)
  assert.equal(profile.data[0].id, original.id, 'Repost of older content must sort by repost time')
  assert.equal(profile.data[0].author.userId, author.user.id)
  assert.equal(profile.data[0].repost.user.id, reposter.user.id)
  const second = await request(`/posts?profileUserId=${reposter.user.id}&limit=1&page=2`, viewer.accessToken)
  assert.equal(second.data[0].id, own.id)
  assert.equal(second.data[0].repost, null)
  const feed = () => request('/posts?sort=following&limit=50', viewer.accessToken)
  let distributed = (await feed()).data.filter((post) => post.id === original.id)
  assert.equal(distributed.length, 1)
  assert.equal(distributed[0].repost.user.id, reposter.user.id)
  assert.equal((await request('/posts?sort=following', null)).meta.total, 0, 'Anonymous following feed must stay empty')
  assert.equal((await request('/posts?sort=following&state=SP&limit=50', viewer.accessToken)).data.some((post) => post.id === original.id), false)
  assert.equal((await request('/posts?sort=following&hasPoll=true&limit=50', viewer.accessToken)).data.some((post) => post.id === original.id), false)
  await follow(author, true)
  await request(`/posts/${original.id}/repost`, author.accessToken, 'POST')
  distributed = (await feed()).data.filter((post) => post.id === original.id)
  assert.equal(distributed.length, 1, 'Followed authors and multiple reposters must not duplicate the post')
  assert.equal(distributed[0].repost.user.id, author.user.id, 'Latest relevant repost wins')
  await request(`/posts/${original.id}/repost`, author.accessToken, 'POST')
  assert.equal((await feed()).data.find((post) => post.id === original.id).repost.user.id, reposter.user.id)
  await request(`/posts/${original.id}/repost`, reposter.accessToken, 'POST')
  const afterRemoval = (await feed()).data.find((post) => post.id === original.id)
  assert.ok(afterRemoval, 'A followed author keeps their original post after a repost is removed')
  assert.equal(afterRemoval.repost, null)
  await follow(author, false)
  assert.equal((await feed()).data.some((post) => post.id === original.id), false)
  const afterProfile = await request(`/posts?profileUserId=${reposter.user.id}&limit=50`, viewer.accessToken)
  assert.equal(afterProfile.data.some((post) => post.id === original.id), false)
  const pageBeyond = await request(`/posts?profileUserId=${reposter.user.id}&limit=1&page=9999`, viewer.accessToken)
  assert.equal(pageBeyond.data.length, 0)
  assert.equal(pageBeyond.meta.total, afterProfile.meta.total)
  console.log('PASS: profile, followers, original author, event order, deduplication, filters, pagination, undo, anonymous access.')
} finally {
  await Promise.all([follow(author, before[0].following), follow(reposter, before[1].following)])
  for (const [id, token] of created.reverse()) await request(`/posts/${id}`, token, 'DELETE')
  console.log('Temporary posts removed; original follow relations restored.')
}
