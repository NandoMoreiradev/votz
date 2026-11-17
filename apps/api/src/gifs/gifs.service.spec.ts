import { ConfigService } from '@nestjs/config'
import { GifsService } from './gifs.service'

describe('GifsService', () => {
  it('returns disabled when no API key is configured', async () => {
    const config = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService
    const service = new GifsService(config)

    const res = await service.search('brasil')
    expect(res).toEqual({ enabled: false, provider: null, items: [], next: null })
  })

  it('validates allowed external GIF hosts strictly', () => {
    const config = { get: jest.fn().mockReturnValue('') } as unknown as ConfigService
    const service = new GifsService(config)

    expect(service.isAllowedGifUrl('https://media.giphy.com/media/abc/giphy.gif')).toBe(true)
    expect(service.isAllowedGifUrl('https://static.klipy.com/ii/123/test.gif')).toBe(true)
    expect(service.isAllowedGifUrl('http://media.giphy.com/media/abc/giphy.gif')).toBe(false)
    expect(service.isAllowedGifUrl('https://evil.example.com/payload.gif')).toBe(false)
  })
})
