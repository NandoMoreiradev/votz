import { requiresRedisAdapter } from './redis-io.adapter'

describe('requiresRedisAdapter', () => {
  it.each([undefined, '', 'false', '0', 'no'])('não exige quando WS_REQUIRE_REDIS_ADAPTER = %p', (value) => {
    expect(requiresRedisAdapter({ WS_REQUIRE_REDIS_ADAPTER: value })).toBe(false)
  })

  it.each(['true', 'TRUE', ' 1 ', 'yes'])('exige quando WS_REQUIRE_REDIS_ADAPTER = %p', (value) => {
    expect(requiresRedisAdapter({ WS_REQUIRE_REDIS_ADAPTER: value })).toBe(true)
  })
})
