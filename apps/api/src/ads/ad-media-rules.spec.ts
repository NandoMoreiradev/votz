import { AD_MEDIA_RULES, adMediaProblem } from '@votz/shared-types'

/** Exigências de foto e vídeo de anúncio (padrão de mídia, seção 2.3). Site e API usam a mesma função. */
describe('adMediaProblem', () => {
  it('as exigências são as aprovadas: 1080 px de largura e vídeo de até 60 s', () => {
    expect(AD_MEDIA_RULES.MIN_WIDTH).toBe(1080)
    expect(AD_MEDIA_RULES.MAX_VIDEO_SECONDS).toBe(60)
  })

  it('foto e vídeo com 1080 px ou mais passam', () => {
    expect(adMediaProblem({ kind: 'IMAGE', width: 1080, scope: 'file' })).toBeNull()
    expect(adMediaProblem({ kind: 'IMAGE', width: 4000, scope: 'crop' })).toBeNull()
    expect(adMediaProblem({ kind: 'VIDEO', width: 1080, durationMs: 60_000, scope: 'file' })).toBeNull()
  })

  it('arredondamento de 1 px não recusa (recorte de 1079,6 px)', () => {
    expect(adMediaProblem({ kind: 'IMAGE', width: 1079, scope: 'crop' })).toBeNull()
    expect(adMediaProblem({ kind: 'IMAGE', width: 1078, scope: 'crop' })).not.toBeNull()
  })

  it('arquivo estreito: mensagem fala do arquivo; recorte pequeno: fala do enquadramento', () => {
    expect(adMediaProblem({ kind: 'IMAGE', width: 800, scope: 'file' })).toMatch(/Essa foto é pequena demais para anúncio.*1080 px/)
    expect(adMediaProblem({ kind: 'VIDEO', width: 800, scope: 'file' })).toMatch(/Esse vídeo é pequeno demais.*um com/)
    expect(adMediaProblem({ kind: 'IMAGE', width: 800, scope: 'crop' })).toMatch(/enquadramento.*1080 px/)
  })

  it('vídeo com mais de 60 s é recusado, com meio segundo de folga de leitura', () => {
    expect(adMediaProblem({ kind: 'VIDEO', width: 1080, durationMs: 60_400, scope: 'file' })).toBeNull()
    expect(adMediaProblem({ kind: 'VIDEO', width: 1080, durationMs: 60_600, scope: 'file' })).toMatch(/60 segundos/)
  })

  it('duração desconhecida não recusa; foto não tem limite de duração', () => {
    expect(adMediaProblem({ kind: 'VIDEO', width: 1080, durationMs: null, scope: 'crop' })).toBeNull()
    expect(adMediaProblem({ kind: 'IMAGE', width: 1080, durationMs: 999_000, scope: 'file' })).toBeNull()
  })

  it('GIF nunca vale, mesmo grande', () => {
    expect(adMediaProblem({ kind: 'GIF', width: 4000, scope: 'file' })).toMatch(/GIF/)
  })
})
