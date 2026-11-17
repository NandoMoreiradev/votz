import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notificationContent } from '../src/lib/notification-content.ts'

const notification = (type, overrides = {}) => ({
  id: 'notification-1', type, read: false, createdAt: '2026-11-17T12:00:00Z',
  report: null, metadata: null, ...overrides,
})

test('notificações sociais sem relato abrem a publicação correta', () => {
  for (const type of ['POST_LIKE', 'POST_COMMENT', 'POST_REPOST', 'POST_MENTION']) {
    const result = notificationContent(notification(type, { metadata: { postId: 'post-1' } }))
    assert.equal(result.href, `/publicacoes/post-1${type === 'POST_COMMENT' ? '#responder' : ''}`)
    assert.match(result.label, /publicação/)
  }
})

test('notificações de relato mantêm o destino e traduzem o status', () => {
  const result = notificationContent(notification('STATUS_CHANGED', {
    report: { id: 'report-1', title: 'Iluminação da praça' }, metadata: { newStatus: 'RESOLVED' },
  }))
  assert.equal(result.href, '/relatos/report-1')
  assert.match(result.label, /Iluminação da praça.*Resolvido/)
})

test('notificações sem destino ou com metadados incompletos permanecem legíveis', () => {
  for (const type of ['NEW_COMMENT', 'STATUS_CHANGED', 'SURTO_DETECTED', 'ALERT_RULE_MATCHED',
    'WEEKLY_DIGEST', 'SLA_AT_RISK', 'SLA_BREACHED', 'SLA_ESCALATED', 'REPORT_ASSIGNED',
    'POST_LIKE', 'POST_COMMENT', 'POST_REPOST', 'POST_MENTION', 'FUTURE_NOTIFICATION']) {
    const result = notificationContent(notification(type))
    assert.equal(result.href, null)
    assert.ok(result.label.length > 0)
    assert.doesNotMatch(result.label, /undefined|null/)
  }
  for (const postId of [null, 17, '', ' ']) {
    assert.equal(notificationContent(notification('POST_COMMENT', { metadata: { postId } })).href, null)
  }
})

test('IDs de metadados são tratados como um segmento de URL', () => {
  assert.equal(notificationContent(notification('POST_MENTION', {
    metadata: { postId: 'post/other?query=true#hash' },
  })).href, '/publicacoes/post%2Fother%3Fquery%3Dtrue%23hash')
})
