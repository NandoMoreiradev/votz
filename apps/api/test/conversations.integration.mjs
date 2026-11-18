// Run against an isolated local API: CONVERSATIONS_ENABLED=true API_PORT=3001.
// JWTs and temporary users exist only for this run; no demo accounts are modified.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { JwtService } from '@nestjs/jwt'
import { io } from 'socket.io-client'

const base = 'http://127.0.0.1:3001/api/v1/conversations'
const database = new URL(process.env.DATABASE_URL)
assert.ok(['localhost', '127.0.0.1'].includes(database.hostname), 'QA requires a local database')
const db = new PrismaClient()
const jwt = new JwtService({ secret: process.env.JWT_SECRET })
const runId = randomUUID()
const users = []
const conversations = new Set()
let socket
let checks = 0
async function request(actor, path, method = 'GET', body, expected = 200) {
  await new Promise((resolve) => setTimeout(resolve, 160))
  const headers = { 'Content-Type': 'application/json' }
  if (actor) headers.Authorization = `Bearer ${actor.token}`
  let response
  for (let i = 0; i < 5; i++) {
    response = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (response.status !== 429) break
    await new Promise((resolve) =>
      setTimeout(resolve, (Number(response.headers.get('retry-after')) || 10) * 1000),
    )
  }
  const data = await response.json()
  if (response.ok) assert.ok(response.headers.get('cache-control')?.includes('no-store'), 'Private metadata must not be cached by browsers or proxies')
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
async function createGroup(actor, memberIds) {
  const body = { clientRequestId: randomUUID(), title: `QA ${runId}`, memberIds }
  const group = await request(actor, '/groups', 'POST', body, 201)
  conversations.add(group.id)
  return { group, body }
}
try {
  for (let i = 0; i < 4; i++) {
    const user = await db.user.create({
      data: { email: `qa-chat-${runId}-${i}@votz.test`, name: `QA Chat ${i}`, emailVerified: true },
    })
    users.push({
      ...user,
      token: jwt.sign({ sub: user.id, typ: 'access' }, { algorithm: 'HS256', expiresIn: '15m' }),
    })
  }
  const [a, b, c, outsider] = users
  assert.equal((await request(a, '/capabilities')).enabled, true)
  await request(a, '/contacts?q=Q', 'GET', undefined, 400)
  const searchable = await request(a, '/contacts?q=QA%20Chat')
  assert.ok(searchable.some((person) => person.id === b.id))
  assert.ok(searchable.every((person) => person.id !== a.id))
  assert.ok(
    searchable.every(
      (person) => Object.keys(person).sort().join(',') === 'avatarUrl,id,name,username,verified',
    ),
    'Contact search exposes only public profile fields',
  )
  if (process.env.CONVERSATIONS_DISABLED_API_URL) {
    const disabledUrl = new URL(process.env.CONVERSATIONS_DISABLED_API_URL)
    assert.ok(['localhost', '127.0.0.1'].includes(disabledUrl.hostname))
    const disabledResponse = await fetch(disabledUrl, { headers: { Authorization: `Bearer ${a.token}` } })
    assert.equal(disabledResponse.status, 404, 'Disabled deployment must hide metadata endpoints')
  }
  await request(null, '', 'GET', undefined, 401)
  const events = []
  socket = io('http://127.0.0.1:3001/ws', {
    auth: { token: b.token },
    transports: ['websocket'],
    reconnection: false,
  })
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('connect_error', reject)
    setTimeout(() => reject(new Error('Socket timeout')), 10000).unref()
  })
  socket.on('conversation:changed', (data) => events.push(data))

  const { group, body } = await createGroup(a, [b.id, c.id])
  assert.equal(group.myRole, 'OWNER')
  assert.equal(group.memberCount, 1)
  assert.equal((await request(a, '/groups', 'POST', body, 201)).id, group.id)
  const concurrentBody = { ...body, clientRequestId: randomUUID() }
  const concurrentGroups = await Promise.all([
    request(a, '/groups', 'POST', concurrentBody, 201),
    request(a, '/groups', 'POST', concurrentBody, 201),
  ])
  concurrentGroups.forEach((item) => conversations.add(item.id))
  assert.equal(
    concurrentGroups[0].id,
    concurrentGroups[1].id,
    'Concurrent retries create only one group',
  )
  await request(a, '/groups', 'POST', { ...body, title: 'Different title' }, 409)
  await request(
    a,
    '/groups',
    'POST',
    { ...body, clientRequestId: randomUUID(), memberIds: [b.id, b.id] },
    400,
  )
  await request(
    a,
    '/groups',
    'POST',
    { ...body, clientRequestId: randomUUID(), memberIds: [a.id] },
    400,
  )
  await request(outsider, `/${group.id}`, 'GET', undefined, 404)
  await request(outsider, `/${group.id}/archive`, 'POST', {}, 404)
  await request(b, `/${group.id}`, 'GET', undefined, 404)
  const pending = (await request(b, '?folder=requests')).items.find((item) => item.id === group.id)
  assert.deepEqual(pending.members, [])
  assert.equal(pending.invitedBy.id, a.id)
  assert.equal(JSON.stringify(pending).includes('@votz.test'), false)
  await request(outsider, `/${group.id}/respond`, 'POST', { accept: true }, 404)
  await request(b, `/${group.id}/respond`, 'POST', { accept: 'true' }, 400)
  await request(b, `/${group.id}/respond`, 'POST', { accept: true }, 201)
  await request(b, `/${group.id}/respond`, 'POST', { accept: true }, 409)
  await request(b, `/${group.id}/invitations`, 'POST', { memberIds: [outsider.id] }, 403)
  await request(b, `/${group.id}/members/${c.id}/role`, 'PATCH', { role: 'ADMIN' }, 403)
  await request(a, `/${group.id}/leave`, 'POST', {}, 409)
  await request(c, `/${group.id}/respond`, 'POST', { accept: false }, 201)
  await request(a, `/${group.id}/invitations`, 'POST', { memberIds: [c.id] }, 409)
  await request(a, `/${group.id}/members/${b.id}/role`, 'PATCH', { role: 'ADMIN' })
  await request(b, `/${group.id}/invitations`, 'POST', { memberIds: [outsider.id] }, 201)
  await request(outsider, `/${group.id}/respond`, 'POST', { accept: true }, 201)
  await request(b, `/${group.id}/members/${outsider.id}`, 'DELETE')
  await request(outsider, `/${group.id}`, 'GET', undefined, 404)
  await request(b, `/${group.id}/invitations`, 'POST', { memberIds: [outsider.id] }, 201)
  await request(outsider, `/${group.id}/respond`, 'POST', { accept: false }, 201)
  await request(b, `/${group.id}/members/${a.id}`, 'DELETE', undefined, 403)
  await request(a, `/${group.id}/owner/${b.id}`, 'POST', {}, 201)
  await request(a, `/${group.id}/leave`, 'POST', {}, 201)
  await request(a, `/${group.id}`, 'GET', undefined, 404)
  await request(b, `/${group.id}/archive`, 'POST', {}, 201)
  await request(b, `/${group.id}/invitations`, 'POST', { memberIds: [outsider.id] }, 409)

  await request(c, `/blocks/${a.id}`, 'POST', {}, 201)
  const blockedPage = await request(c, '/blocks?limit=1')
  assert.equal(blockedPage.total, 1)
  assert.equal(blockedPage.items[0].blockedId, a.id)
  assert.equal(blockedPage.items[0].blocked.name, a.name)
  assert.equal(JSON.stringify(blockedPage).includes(a.email), false)
  assert.equal((await request(b, '/blocks')).total, 0, 'Block lists are private to their owner')
  await request(c, '/blocks?limit=1000', 'GET', undefined, 400)
  assert.equal(
    (await request(a, '/contacts?q=QA%20Chat')).some((person) => person.id === c.id),
    false,
    'Blocked contacts cannot be discovered by the other party',
  )
  assert.equal(
    (await request(c, '/contacts?q=QA%20Chat')).some((person) => person.id === a.id),
    false,
  )
  await request(a, '/direct', 'POST', { targetUserId: c.id }, 403)
  await request(c, '/direct', 'POST', { targetUserId: a.id }, 403)
  await request(c, `/blocks/${a.id}`, 'DELETE')
  const direct = await request(a, '/direct', 'POST', { targetUserId: c.id }, 201)
  assert.equal(direct.myRole, 'MEMBER', 'Direct conversations have no group owner')
  conversations.add(direct.id)
  const repeated = await Promise.all([
    request(a, '/direct', 'POST', { targetUserId: c.id }, 201),
    request(a, '/direct', 'POST', { targetUserId: c.id }, 201),
  ])
  assert.ok(repeated.every((item) => item.id === direct.id))
  await request(c, `/${direct.id}/respond`, 'POST', { accept: true }, 201)
  assert.equal((await request(c, `/${direct.id}`)).memberCount, 2)
  await request(outsider, `/${direct.id}`, 'GET', undefined, 404)
  await request(a, '/direct', 'POST', { targetUserId: a.id }, 400)
  const declinedDirect = await request(b, '/direct', 'POST', { targetUserId: c.id }, 201)
  conversations.add(declinedDirect.id)
  await request(c, `/${declinedDirect.id}/respond`, 'POST', { accept: false }, 201)
  await request(b, '/direct', 'POST', { targetUserId: c.id }, 201)
  assert.equal(
    await db.conversationMember.count({
      where: { conversationId: declinedDirect.id, userId: c.id, state: 'DECLINED' },
    }),
    1,
    'Requester cannot override refusal',
  )
  assert.equal(
    (await request(c, '/direct', 'POST', { targetUserId: b.id }, 201)).myState,
    'ACTIVE',
    'Only recipient may reopen explicitly',
  )
  await request(a, '?limit=1000', 'GET', undefined, 400)
  const contextActor = {
    token: jwt.sign(
      { sub: a.id, typ: 'access', ctx: { type: 'ENTITY', id: randomUUID() } },
      { expiresIn: '15m' },
    ),
  }
  await request(contextActor, '', 'GET', undefined, 403)
  await db.user.update({ where: { id: outsider.id }, data: { banned: true } })
  await request(outsider, '', 'GET', undefined, 401)
  await db.user.update({
    where: { id: outsider.id },
    data: { banned: false, emailVerified: false },
  })
  await request(outsider, '', 'GET', undefined, 403)
  await request(a, '/direct', 'POST', { targetUserId: outsider.id }, 400)

  // Owner deletion must not leave a group without a usable administration path.
  const orphan = await createGroup(a, [b.id])
  await request(b, `/${orphan.group.id}/respond`, 'POST', { accept: true }, 201)
  await db.user.delete({ where: { id: a.id } })
  assert.equal((await request(b, `/${orphan.group.id}`)).myRole, 'OWNER')
  await request(b, `/${orphan.group.id}/archive`, 'POST', {}, 201)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  assert.ok(
    events.some((event) => event.conversationId === group.id),
    'Authenticated participant receives invalidation',
  )
  assert.ok(
    events.every((event) => Object.keys(event).sort().join(',') === 'conversationId,revision'),
    'No private metadata in socket events',
  )
  assert.ok(
    (await db.conversationOutbox.count({
      where: { conversationId: group.id, sentAt: { not: null } },
    })) > 0,
  )
  console.log(
    `PASS: ${checks} real HTTP checks; consent, authorization, idempotency, blocks, owner deletion, database and authenticated socket verified.`,
  )
} finally {
  socket?.disconnect()
  await db.conversation.deleteMany({
    where: { id: { in: [...conversations] }, title: { startsWith: 'QA ' } },
  })
  // Direct conversations have no title; restrict cleanup to the exact generated pair IDs.
  await db.conversation.deleteMany({
    where: {
      id: { in: [...conversations] },
      kind: 'DIRECT',
      members: { some: { userId: { in: users.map((u) => u.id) } } },
    },
  })
  await db.user.deleteMany({
    where: { id: { in: users.map((u) => u.id) }, email: { startsWith: `qa-chat-${runId}-` } },
  })
  await db.$disconnect()
}
