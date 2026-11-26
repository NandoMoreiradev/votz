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

test('novos tipos de relato, surto, publicação e pesquisa renderizam label e rota corretos', () => {
  assert.equal(
    notificationContent(notification('SURTO_DETECTED', { metadata: { surtoId: 's-1', city: 'Campinas' } })).href,
    '/surtos/s-1',
  )
  assert.match(
    notificationContent(notification('STATUS_CHANGED', {
      report: { id: 'r-2', title: 'Buraco na av' },
      metadata: { status: 'IN_PROGRESS' },
    })).label,
    /Em andamento/,
  )
  assert.equal(
    notificationContent(notification('POST_COMMENT_REPLY', { metadata: { postId: 'p-9' } })).href,
    '/publicacoes/p-9#responder',
  )
  assert.equal(
    notificationContent(notification('POST_QUOTE', { metadata: { postId: 'p-10' } })).href,
    '/publicacoes/p-10',
  )
  assert.equal(
    notificationContent(notification('OFFICIAL_SURVEY_PUBLISHED', { metadata: { surveySlug: 'mobilidade-sp', invited: true } })).href,
    '/pesquisas/mobilidade-sp',
  )
  for (const type of ['NEW_REPORT_RECEIVED', 'REPORT_REASSIGNED', 'REPORT_DISPUTED', 'REPORT_UPDATE', 'COMMENT_REPLY']) {
    const res = notificationContent(notification(type, { report: { id: 'r-9', title: 'Poste apagado' } }))
    assert.equal(res.href, '/relatos/r-9')
    assert.match(res.label, /Poste apagado/)
  }
})
