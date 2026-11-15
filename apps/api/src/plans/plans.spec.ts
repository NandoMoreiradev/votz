import {
  ENTITY_PLANS,
  FEATURE_STATUS,
  PLAN_PRICES,
  POLITICIAN_PLANS,
  getMaxMembers,
  getPlanConfig,
  getPoliticianTier,
  getRequiredPlanForFeature,
  hasFeature,
} from '@votz/shared-types'

describe('Plans Catalog (@votz/shared-types)', () => {
  it('exposes catalog configs for all Politician and Entity plans without CAMPANHA', () => {
    expect(Object.keys(POLITICIAN_PLANS)).toEqual(['BASICO', 'MANDATO', 'MANDATO_PRO'])
    expect(Object.keys(ENTITY_PLANS)).toEqual(['BASICO', 'GESTAO', 'INTEGRACAO'])
    expect(getPlanConfig('POLITICIAN', 'CAMPANHA')).toBeNull()
    expect(getPlanConfig('POLITICIAN', 'MANDATOMETRO_PRO')).toBeNull()
  })

  it('keeps respond_reports and analytics_basic available on all plans, and restricts propostas/export_data properly', () => {
    expect(hasFeature('POLITICIAN', 'BASICO', 'respond_reports')).toBe(true)
    expect(hasFeature('POLITICIAN', 'BASICO', 'analytics_basic')).toBe(true)
    expect(hasFeature('POLITICIAN', 'BASICO', 'propostas')).toBe(false)
    expect(hasFeature('POLITICIAN', 'BASICO', 'export_data')).toBe(false)

    expect(hasFeature('POLITICIAN', 'MANDATO', 'propostas')).toBe(true)
    expect(hasFeature('POLITICIAN', 'MANDATO', 'outbreak_alerts')).toBe(true)
    expect(hasFeature('POLITICIAN', 'MANDATO', 'export_data')).toBe(false)

    expect(hasFeature('POLITICIAN', 'MANDATO_PRO', 'propostas')).toBe(true)
    expect(hasFeature('POLITICIAN', 'MANDATO_PRO', 'export_data')).toBe(true)
    expect(hasFeature('POLITICIAN', 'MANDATO_PRO', 'api_access')).toBe(true)

    expect(hasFeature('ENTITY', 'BASICO', 'respond_reports')).toBe(true)
    expect(hasFeature('ENTITY', 'BASICO', 'export_data')).toBe(false)
    expect(hasFeature('ENTITY', 'GESTAO', 'export_data')).toBe(true)
    expect(hasFeature('ENTITY', 'GESTAO', 'api_access')).toBe(false)
    expect(hasFeature('ENTITY', 'INTEGRACAO', 'export_data')).toBe(true)
    expect(hasFeature('ENTITY', 'INTEGRACAO', 'api_access')).toBe(true)
  })

  it('marks unbuilt roadmap features as soon and built 4B/4C features as available', () => {
    const soonKeys = ['sla_panel', 'peer_comparison'] as const
    for (const key of soonKeys) {
      expect(FEATURE_STATUS[key]).toBe('soon')
    }
    expect(FEATURE_STATUS.respond_reports).toBe('available')
    expect(FEATURE_STATUS.export_data).toBe('available')
    expect(FEATURE_STATUS.propostas).toBe('available')
    expect(FEATURE_STATUS.analytics_full).toBe('available')
    expect(FEATURE_STATUS.heatmap).toBe('available')
    expect(FEATURE_STATUS.pdf_report).toBe('available')
    expect(FEATURE_STATUS.share_card).toBe('available')
    expect(FEATURE_STATUS.webhooks).toBe('available')
    expect(FEATURE_STATUS.reply_templates).toBe('available')
  })

  it('returns correct maxMembers per orgType, plan, and politician tier', () => {
    expect(getMaxMembers('POLITICIAN', 'BASICO', 1)).toBe(1)
    expect(getMaxMembers('POLITICIAN', 'BASICO', 4)).toBe(1)

    expect(getMaxMembers('POLITICIAN', 'MANDATO', 1)).toBe(2)
    expect(getMaxMembers('POLITICIAN', 'MANDATO', 2)).toBe(3)
    expect(getMaxMembers('POLITICIAN', 'MANDATO', 3)).toBe(5)
    expect(getMaxMembers('POLITICIAN', 'MANDATO', 4)).toBe(8)

    expect(getMaxMembers('POLITICIAN', 'MANDATO_PRO', 1)).toBe(5)
    expect(getMaxMembers('POLITICIAN', 'MANDATO_PRO', 2)).toBe(8)
    expect(getMaxMembers('POLITICIAN', 'MANDATO_PRO', 3)).toBe(12)
    expect(getMaxMembers('POLITICIAN', 'MANDATO_PRO', 4)).toBe(20)

    expect(getMaxMembers('ENTITY', 'BASICO')).toBe(2)
    expect(getMaxMembers('ENTITY', 'GESTAO')).toBe(10)
    expect(getMaxMembers('ENTITY', 'INTEGRACAO')).toBeNull()

    expect(getPlanConfig('ENTITY', 'BASICO')?.limits.historyDays).toBe(30)
    expect(getPlanConfig('ENTITY', 'GESTAO')?.limits.historyDays).toBeNull()
  })

  it('resolves politician price tiers for known offices and defaults to tier 2 with warning for unknown or empty offices', () => {
    const warn = jest.fn()
    const logger = { warn }

    expect(getPoliticianTier('Vereador', logger)).toBe(2)
    expect(getPoliticianTier('Vereadora', logger)).toBe(2)
    expect(getPoliticianTier('Prefeito', logger)).toBe(3)
    expect(getPoliticianTier('Vice-Prefeito', logger)).toBe(3)
    expect(getPoliticianTier('Deputada Estadual', logger)).toBe(3)
    expect(getPoliticianTier('Deputado Distrital', logger)).toBe(3)
    expect(getPoliticianTier('Deputado Federal', logger)).toBe(4)
    expect(getPoliticianTier('Senador(a)', logger)).toBe(4)
    expect(getPoliticianTier('Governador', logger)).toBe(4)
    expect(warn).not.toHaveBeenCalled()

    expect(getPoliticianTier('Cargo Inventado', logger)).toBe(2)
    expect(getPoliticianTier('', logger)).toBe(2)
    expect(getPoliticianTier(null, logger)).toBe(2)
    expect(warn).toHaveBeenCalledTimes(3)
  })

  it('stores hypothesis prices centrally in centavos inside PLAN_PRICES and finds required plans for features', () => {
    expect(PLAN_PRICES.POLITICIAN.MANDATO[1]).toBe(19000)
    expect(PLAN_PRICES.POLITICIAN.MANDATO_PRO[4]).toBe(149000)
    expect(PLAN_PRICES.ENTITY.GESTAO.UP_TO_50K).toBe(59000)
    expect(PLAN_PRICES.ENTITY.GESTAO.OVER_300K).toBe(320000)
    expect(PLAN_PRICES.COMPANY.STARTER).toBe(30000)
    expect(PLAN_PRICES.COMPANY.BUSINESS).toBe(120000)
    expect(PLAN_PRICES.COMPANY.ENTERPRISE).toBe(350000)
    expect(PLAN_PRICES.COMPANY.WHITE_LABEL).toBeNull()

    expect(getRequiredPlanForFeature('POLITICIAN', 'propostas')?.code).toBe('MANDATO')
    expect(getRequiredPlanForFeature('POLITICIAN', 'export_data')?.code).toBe('MANDATO_PRO')
    expect(getRequiredPlanForFeature('ENTITY', 'export_data')?.code).toBe('GESTAO')
    expect(getRequiredPlanForFeature('ENTITY', 'api_access')?.code).toBe('INTEGRACAO')
  })
})
