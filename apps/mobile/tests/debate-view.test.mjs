import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activeStream, countdownLabel, hostLabel, isVideoId, youtubeEmbedUrl, youtubeWatchUrl } from '../src/lib/debate-view.ts'

const participant = (id, over = {}) => ({
  id, politicianId: `pol-${id}`, role: 'DEBATER', inviteStatus: 'CONFIRMED',
  youtubeVideoId: null, youtubeChannelTitle: null,
  politician: { id: `pol-${id}`, name: `Político ${id}`, avatarUrl: null, office: 'Deputado', party: { abbreviation: 'ABC' } },
  ...over,
})
const debate = (over = {}) => ({
  youtubeVideoId: 'dQw4w9WgXcQ', youtubeChannelTitle: 'Canal do anfitrião', participants: [], creator: null, hostEntity: null, ...over,
})

test('só aceita id de vídeo do YouTube bem formado', () => {
  assert.equal(isVideoId('dQw4w9WgXcQ'), true)
  for (const bad of ['', 'curto', 'dQw4w9WgXcQ1', 'dQw4w9WgXc!', 'dQw4w9WgXc ', null, undefined, 42, '../etc/passwd'])
    assert.equal(isVideoId(bad), false, String(bad))
})

test('monta o player sem cookies de rastreio e recusa id inválido', () => {
  const url = new URL(youtubeEmbedUrl('dQw4w9WgXcQ'))
  assert.equal(url.hostname, 'www.youtube-nocookie.com')
  assert.equal(url.pathname, '/embed/dQw4w9WgXcQ')
  assert.equal(url.searchParams.get('autoplay'), '1')
  assert.equal(url.searchParams.get('origin'), 'https://votz.app')
  assert.equal(youtubeEmbedUrl('x"><script>'), null)
  assert.equal(youtubeWatchUrl('dQw4w9WgXcQ'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  assert.equal(youtubeWatchUrl('inválido'), null)
})

test('mostra o vídeo principal, ou o do debatedor escolhido quando ele tem link', () => {
  const d = debate({ participants: [
    participant('a', { youtubeVideoId: 'AAAAAAAAAAA', youtubeChannelTitle: 'Canal do João' }),
    participant('b'),
  ] })
  assert.deepEqual(activeStream(d, null), { videoId: 'dQw4w9WgXcQ', channelTitle: 'Canal do anfitrião', participantId: null })
  assert.deepEqual(activeStream(d, 'a'), { videoId: 'AAAAAAAAAAA', channelTitle: 'Canal do João', participantId: 'a' })
  // debatedor sem link, inexistente ou com convite pendente volta para o principal
  assert.equal(activeStream(d, 'b').participantId, null)
  assert.equal(activeStream(d, 'zzz').participantId, null)
  const pending = debate({ participants: [participant('a', { inviteStatus: 'PENDING', youtubeVideoId: 'AAAAAAAAAAA' })] })
  assert.equal(activeStream(pending, 'a').videoId, 'dQw4w9WgXcQ')
})

test('anfitrião: político, entidade ou o próprio Votz', () => {
  assert.equal(hostLabel({ creator: { name: 'João' }, hostEntity: null }), 'João')
  assert.equal(hostLabel({ creator: null, hostEntity: { legalName: 'Prefeitura de X' } }), 'Prefeitura de X')
  assert.equal(hostLabel({ creator: null, hostEntity: null }), 'Votz')
})

test('contagem regressiva em português simples', () => {
  const now = new Date('2026-10-01T12:00:00Z').getTime()
  const at = (minutes) => new Date(now + minutes * 60_000).toISOString()
  assert.equal(countdownLabel(at(-5), now), 'Começa em instantes')
  assert.equal(countdownLabel(at(1), now), 'Começa em instantes')
  assert.equal(countdownLabel(at(12), now), 'Começa em 12min')
  assert.equal(countdownLabel(at(125), now), 'Começa em 2h 05min')
  assert.equal(countdownLabel(at(60 * 24), now), 'Começa em 1 dia')
  assert.equal(countdownLabel(at(60 * 24 * 3), now), 'Começa em 3 dias')
})
