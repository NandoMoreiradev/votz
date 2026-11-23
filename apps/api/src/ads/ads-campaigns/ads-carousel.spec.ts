import { BadRequestException } from '@nestjs/common'
import { creativeMediaInputs } from './ads-campaigns.service'
import { creativeMediaFailed, creativeMediaItems, creativeMediaProcessing, creativeMediaReady } from '../ad-creative-media'

jest.mock('isomorphic-dompurify', () => ({ sanitize: (text: string) => text }))

const photo = (id: string) => ({ id, format: 'SQUARE' as const })

describe('creativeMediaInputs (o que o anunciante mandou)', () => {
  it('sem mídia: anúncio só de texto', () => {
    expect(creativeMediaInputs({})).toEqual([])
    expect(creativeMediaInputs({ mediaItems: [] })).toEqual([])
  })

  it('uma mídia no campo antigo continua valendo', () => {
    expect(creativeMediaInputs({ media: photo('a') as never })).toEqual([photo('a')])
  })

  it('carrossel: devolve as fotos na ordem em que vieram', () => {
    const items = [photo('a'), photo('b'), photo('c')]
    expect(creativeMediaInputs({ mediaItems: items as never })).toEqual(items)
  })

  it('os dois campos juntos é erro (não dá para saber qual vale)', () => {
    expect(() => creativeMediaInputs({ media: photo('a') as never, mediaItems: [photo('b')] as never })).toThrow(BadRequestException)
  })

  it('passou de 5 fotos é erro', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(photo)
    expect(() => creativeMediaInputs({ mediaItems: six as never })).toThrow(/até 5 fotos/)
    expect(creativeMediaInputs({ mediaItems: six.slice(0, 5) as never })).toHaveLength(5)
  })
})

describe('estado da mídia do criativo', () => {
  const READY = { status: 'READY' as const }
  const PROCESSING = { status: 'PROCESSING' as const }
  const FAILED = { status: 'FAILED' as const }

  it('só texto está pronto', () => {
    expect(creativeMediaReady([])).toBe(true)
    expect(creativeMediaReady(null)).toBe(true)
  })

  it('só está pronto quando TODAS as mídias estão prontas', () => {
    expect(creativeMediaReady([READY, READY, READY])).toBe(true)
    expect(creativeMediaReady([READY, PROCESSING])).toBe(false)
    expect(creativeMediaReady([READY, FAILED])).toBe(false)
  })

  it('uma falha basta para marcar falha; uma em preparo basta para marcar preparo', () => {
    expect(creativeMediaFailed([READY, FAILED])).toBe(true)
    expect(creativeMediaFailed([READY])).toBe(false)
    expect(creativeMediaProcessing([READY, PROCESSING])).toBe(true)
    expect(creativeMediaProcessing([])).toBe(false)
  })

  it('os itens saem na ordem recebida (a ordem do carrossel vem da consulta)', () => {
    const asset = (id: string) =>
      ({ id, kind: 'IMAGE', status: 'READY', format: 'SQUARE', key: `${id}.jpg`, feedKey: `${id}.feed.jpg`, thumbKey: `${id}.t.webp`, posterKey: null, width: 1080, height: 1080, sourceWidth: 2000, sourceHeight: 2000, durationMs: null, legacy: false }) as never
    const items = creativeMediaItems([asset('a'), asset('b'), asset('c')], (key) => `https://cdn.test/${key}`)
    expect(items.map((item) => item.id)).toEqual(['a', 'b', 'c'])
    expect(creativeMediaItems(null, (key) => key)).toEqual([])
  })
})
