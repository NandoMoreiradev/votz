import { DAY_MS, HOUR_MS, MINUTE_MS, windowedJobId } from './job-window'

describe('windowedJobId', () => {
  it('muda de nome a cada janela, para a tarefa recorrente rodar de novo', () => {
    const d1 = windowedJobId('inactivity', DAY_MS, new Date('2026-11-27T05:00:00Z'))
    const d2 = windowedJobId('inactivity', DAY_MS, new Date('2026-11-28T05:00:00Z'))
    expect(d1).toBe('inactivity-2026-11-27T0000')
    expect(d2).toBe('inactivity-2026-11-28T0000')
  })

  it('mantém o mesmo nome dentro da janela, para instâncias diferentes não duplicarem', () => {
    const a = windowedJobId('batch', HOUR_MS, new Date('2026-11-27T22:00:00.100Z'))
    const b = windowedJobId('batch', HOUR_MS, new Date('2026-11-27T22:59:59.900Z'))
    expect(a).toBe(b)
    expect(a).toBe('batch-2026-11-27T2200')
  })

  it('alinha janelas de 10 e 15 minutos', () => {
    expect(windowedJobId('feed-batch', 10 * MINUTE_MS, new Date('2026-11-27T22:19:00Z'))).toBe('feed-batch-2026-11-27T2210')
    expect(windowedJobId('rules', 15 * MINUTE_MS, new Date('2026-11-27T22:44:00Z'))).toBe('rules-2026-11-27T2230')
  })

  it('não usa ":" (o BullMQ recusa)', () => {
    expect(windowedJobId('x', HOUR_MS)).not.toContain(':')
  })

  it('recusa janela menor que 1 minuto', () => {
    expect(() => windowedJobId('x', 1000)).toThrow()
  })
})
