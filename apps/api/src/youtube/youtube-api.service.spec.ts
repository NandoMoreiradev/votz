import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common'
import { YoutubeApiService } from './youtube-api.service'

describe('YoutubeApiService', () => {
  let service: YoutubeApiService
  let config: { get: jest.Mock }
  const realFetch = global.fetch

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue('chave-de-teste') }
    service = new YoutubeApiService(config as any)
  })

  afterEach(() => {
    global.fetch = realFetch
  })

  const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

  describe('parseVideoId', () => {
    it.each([
      ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30s', 'dQw4w9WgXcQ'],
      ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/live/dQw4w9WgXcQ?feature=share', 'dQw4w9WgXcQ'],
      ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
      ['  https://youtu.be/dQw4w9WgXcQ  ', 'dQw4w9WgXcQ'],
    ])('aceita %s', (url, expected) => {
      expect(service.parseVideoId(url)).toBe(expected)
    })

    it.each([
      'dQw4w9WgXcQ',
      'https://vimeo.com/12345678901',
      'https://youtube.com.malicioso.com/watch?v=dQw4w9WgXcQ',
      'https://evil.com/?u=https://youtu.be/dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://www.youtube.com/watch?v=curto',
      'https://www.youtube.com/watch',
      'https://www.youtube.com/@canal',
      '',
    ])('recusa %s', (url) => {
      expect(service.parseVideoId(url)).toBeNull()
    })
  })

  describe('parseChannelRef', () => {
    it('lê id, @nome e links de canal', () => {
      expect(service.parseChannelRef('UCaaaaaaaaaaaaaaaaaaaaaa')).toEqual({ kind: 'id', value: 'UCaaaaaaaaaaaaaaaaaaaaaa' })
      expect(service.parseChannelRef('@canaldojoao')).toEqual({ kind: 'handle', value: '@canaldojoao' })
      expect(service.parseChannelRef('https://www.youtube.com/@canaldojoao')).toEqual({ kind: 'handle', value: '@canaldojoao' })
      expect(service.parseChannelRef('https://www.youtube.com/@canaldojoao/streams')).toEqual({ kind: 'handle', value: '@canaldojoao' })
      expect(service.parseChannelRef('https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa')).toEqual({
        kind: 'id',
        value: 'UCaaaaaaaaaaaaaaaaaaaaaa',
      })
    })

    it('recusa links antigos e de outros sites', () => {
      expect(service.parseChannelRef('https://www.youtube.com/c/NomeAntigo')).toBeNull()
      expect(service.parseChannelRef('https://www.youtube.com/user/NomeAntigo')).toBeNull()
      expect(service.parseChannelRef('https://evil.com/@canaldojoao')).toBeNull()
      expect(service.parseChannelRef('canal sem arroba')).toBeNull()
    })
  })

  describe('getVideo', () => {
    it('lê canal, incorporação e se é transmissão ao vivo', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({
          items: [
            {
              snippet: { channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa', channelTitle: 'Canal do João' },
              status: { embeddable: true, privacyStatus: 'public' },
              liveStreamingDetails: { scheduledStartTime: '2026-10-01T18:00:00Z' },
            },
          ],
        }),
      )
      global.fetch = fetchMock as any

      await expect(service.getVideo('dQw4w9WgXcQ')).resolves.toEqual({
        videoId: 'dQw4w9WgXcQ',
        channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        channelTitle: 'Canal do João',
        embeddable: true,
        privacyStatus: 'public',
        isLiveBroadcast: true,
      })

      const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
      expect(calledUrl.pathname).toBe('/youtube/v3/videos')
      expect(calledUrl.searchParams.get('id')).toBe('dQw4w9WgXcQ')
      expect(calledUrl.searchParams.get('key')).toBe('chave-de-teste')
    })

    it('vídeo comum não conta como live e incorporação desligada vira false', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        okJson({ items: [{ snippet: { channelId: 'UCx', channelTitle: 'X' }, status: { embeddable: false } }] }),
      ) as any

      const info = await service.getVideo('dQw4w9WgXcQ')
      expect(info?.isLiveBroadcast).toBe(false)
      expect(info?.embeddable).toBe(false)
      expect(info?.privacyStatus).toBe('private')
    })

    it('devolve null quando o vídeo não existe', async () => {
      global.fetch = jest.fn().mockResolvedValue(okJson({ items: [] })) as any
      await expect(service.getVideo('dQw4w9WgXcQ')).resolves.toBeNull()
    })
  })

  describe('getChannel', () => {
    it('busca por id ou por @nome', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        okJson({ items: [{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', snippet: { title: 'Canal', description: 'votz-abc' } }] }),
      )
      global.fetch = fetchMock as any

      await expect(service.getChannel({ kind: 'handle', value: '@canaldojoao' })).resolves.toEqual({
        channelId: 'UCaaaaaaaaaaaaaaaaaaaaaa',
        title: 'Canal',
        description: 'votz-abc',
      })
      expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.get('forHandle')).toBe('@canaldojoao')

      await service.getChannel({ kind: 'id', value: 'UCaaaaaaaaaaaaaaaaaaaaaa' })
      expect(new URL(fetchMock.mock.calls[1][0] as string).searchParams.get('id')).toBe('UCaaaaaaaaaaaaaaaaaaaaaa')
    })

    it('devolve null quando o canal não existe', async () => {
      global.fetch = jest.fn().mockResolvedValue(okJson({})) as any
      await expect(service.getChannel({ kind: 'handle', value: '@naoexiste' })).resolves.toBeNull()
    })
  })

  describe('falhas', () => {
    it('sem YOUTUBE_API_KEY avisa que o recurso não está ligado e nem chama o Google', async () => {
      config.get.mockReturnValue(undefined)
      const fetchMock = jest.fn()
      global.fetch = fetchMock as any

      await expect(service.getVideo('dQw4w9WgXcQ')).rejects.toThrow(ServiceUnavailableException)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('erro do Google e queda de rede viram uma mensagem simples, sem vazar a chave', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }) as any
      const rejected = await service.getVideo('dQw4w9WgXcQ').catch((e) => e)
      expect(rejected).toBeInstanceOf(BadGatewayException)
      expect(JSON.stringify(rejected.getResponse())).not.toContain('chave-de-teste')

      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any
      await expect(service.getVideo('dQw4w9WgXcQ')).rejects.toThrow(BadGatewayException)
    })
  })
})
