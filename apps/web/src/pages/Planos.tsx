import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import styled from 'styled-components'
import {
  COMPANY_PLANS,
  CompanyPlan,
  ENTITY_PLANS,
  ENTITY_POPULATION_TIER_LABELS,
  EntityPlan,
  EntityPopulationTier,
  FEATURE_CATALOG,
  FeatureKey,
  PLAN_PRICES,
  POLITICIAN_PLANS,
  POLITICIAN_TIER_LABELS,
  PoliticianPlan,
  PoliticianPriceTier,
  getMaxMembers,
} from '@votz/shared-types'
import { PageNavbar } from '../components/layout/StudioEmbed'
import { api } from '../lib/api'
import { useAuthStore } from '../store/auth.store'

type TabType = 'POLITICIAN' | 'ENTITY'

interface MyPlanResponse {
  orgType: 'POLITICIAN' | 'ENTITY' | 'COMPANY'
  orgId: string
  orgName: string
  plan: string
  label: string
  tier: PoliticianPriceTier | null
  limits: { maxMembers: number | null; historyDays: number | null }
  members: { active: number; pending: number; used: number; max: number | null }
}

const POLITICIAN_FEATURE_ORDER: FeatureKey[] = [
  'respond_reports',
  'analytics_basic',
  'team',
  'propostas',
  'outbreak_alerts',
  'export_data',
  'analytics_full',
  'heatmap',
  'share_card',
  'reply_templates',
  'sla_panel',
  'pdf_report',
  'api_access',
  'webhooks',
  'peer_comparison',
  'priority_support',
]

const ENTITY_FEATURE_ORDER: FeatureKey[] = [
  'respond_reports',
  'team',
  'analytics_basic',
  'outbreak_alerts',
  'export_data',
  'analytics_full',
  'heatmap',
  'sla_panel',
  'pdf_report',
  'reply_templates',
  'api_access',
  'webhooks',
  'peer_comparison',
  'priority_support',
]

const POLITICIAN_TIERS: PoliticianPriceTier[] = [1, 2, 3, 4]
const ENTITY_TIERS: EntityPopulationTier[] = ['UP_TO_50K', 'FROM_50K_TO_300K', 'OVER_300K']

const FAQ = [
  {
    q: 'Responder relatos e atualizar o andamento tem algum custo?',
    a: 'Não. Responder relatos, mudar o status e registrar o andamento público são recursos gratuitos em qualquer plano.',
  },
  {
    q: 'Assinar um plano melhora a reputação ou dá destaque na busca?',
    a: 'Não. A reputação e os selos de atendimento dependem exclusivamente das respostas e resoluções reais registradas na plataforma.',
  },
  {
    q: 'O que acontece se eu mudar para um plano com limite menor de equipe?',
    a: 'Os membros já ativos não são removidos. O sistema apenas bloqueia novos convites até que a equipe fique dentro do limite do plano atual.',
  },
  {
    q: 'Como funciona o pagamento?',
    a: 'As formas de pagamento serão informadas na contratação.',
  },
]

const COMPANY_PLAN_ORDER: CompanyPlan[] = [
  CompanyPlan.STARTER,
  CompanyPlan.BUSINESS,
  CompanyPlan.ENTERPRISE,
  CompanyPlan.WHITE_LABEL,
]

function formatCentavos(centavos: number): string {
  if (centavos <= 0) return 'Grátis'
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

function formatCompanyPrice(code: CompanyPlan): string {
  const centavos = PLAN_PRICES.COMPANY[code]
  if (centavos === null) return 'Sob consulta'
  const base = formatCentavos(centavos)
  return code === CompanyPlan.ENTERPRISE ? `${base}+/mês` : `${base}/mês`
}

function formatMembersLimit(max: number | null): string {
  if (max === null) return 'Equipe ilimitada'
  if (max === 1) return '1 usuário (sem equipe)'
  return `Até ${max} membros na equipe`
}

function formatHistoryLimit(days: number | null): string {
  if (days === null) return 'Histórico completo'
  return `Histórico dos últimos ${days} dias`
}

export function Planos() {
  const navigate = useNavigate()
  const { user, activeContext } = useAuthStore()

  const [tab, setTab] = useState<TabType>('POLITICIAN')
  const [polTier, setPolTier] = useState<PoliticianPriceTier>(2)
  const [entTier, setEntTier] = useState<EntityPopulationTier>('UP_TO_50K')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  const { data: myPlan } = useQuery<MyPlanResponse>({
    queryKey: ['plans', 'me', activeContext?.type, activeContext?.id],
    queryFn: () => api.get<MyPlanResponse>('/plans/me').then((r) => r.data),
    enabled: Boolean(activeContext),
    retry: false,
  })

  useEffect(() => {
    if (activeContext?.type === 'ENTITY') {
      setTab('ENTITY')
    } else if (activeContext?.type === 'POLITICIAN') {
      setTab('POLITICIAN')
    }
  }, [activeContext?.type])

  useEffect(() => {
    if (myPlan?.orgType === 'POLITICIAN' && myPlan.tier) {
      setPolTier(myPlan.tier)
    }
  }, [myPlan?.orgType, myPlan?.tier])

  async function handleCheckout(planCode: string, planLabel: string) {
    setFeedback(null)

    if (!user) {
      navigate('/entrar')
      return
    }

    if (!activeContext || activeContext.type !== tab) {
      setFeedback(
        tab === 'POLITICIAN'
          ? 'Troque para o perfil do político no menu superior antes de contratar um plano.'
          : 'Troque para o perfil da entidade no menu superior antes de contratar um plano.',
      )
      return
    }

    setLoadingPlan(planCode)
    try {
      const { data } = await api.post<{ url: string }>('/subscricoes/checkout', {
        orgId: activeContext.id,
        orgType: activeContext.type,
        plan: planCode,
      })
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        `Não foi possível iniciar a contratação do plano ${planLabel} agora.`
      setFeedback(Array.isArray(msg) ? msg.join(' ') : msg)
    } finally {
      setLoadingPlan(null)
    }
  }

  const politicianPlans = Object.values(POLITICIAN_PLANS)
  const entityPlans = Object.values(ENTITY_PLANS)

  return (
    <PageShell>
      <PageNavbar />
      <Page>
        <Hero>
          <HeroLabel>Planos transparentes</HeroLabel>
          <HeroTitle>Planos para mandatos e entidades</HeroTitle>
          <HeroSub>
            Responder relatos e atualizar o andamento é sempre grátis. Os planos pagos organizam
            equipe, exportação de dados e ferramentas de gestão.
          </HeroSub>
        </Hero>

        {myPlan && (
          <CurrentPlanBanner>
            <div>
              <strong>{myPlan.orgName}</strong> — Plano atual: <strong>{myPlan.label}</strong>
              {myPlan.tier ? ` (${POLITICIAN_TIER_LABELS[myPlan.tier]})` : ''}
            </div>
            <UsageBadge>
              Equipe: {myPlan.members.used}
              {myPlan.members.max !== null ? ` / ${myPlan.members.max}` : ' (ilimitado)'}
            </UsageBadge>
          </CurrentPlanBanner>
        )}

        <TabsRow>
          <Tab active={tab === 'POLITICIAN'} onClick={() => { setTab('POLITICIAN'); setFeedback(null) }}>
            Políticos e Mandatos
          </Tab>
          <Tab active={tab === 'ENTITY'} onClick={() => { setTab('ENTITY'); setFeedback(null) }}>
            Entidades Públicas
          </Tab>
        </TabsRow>

        <PrincipleNotice>
          Transparência: anunciamos apenas o que já funciona hoje. Itens em construção aparecem
          marcados como <strong>Em breve</strong>. Reputação e selos nunca dependem de plano pago.
        </PrincipleNotice>

        {feedback && <FeedbackBanner role="alert">{feedback}</FeedbackBanner>}

        {tab === 'POLITICIAN' ? (
          <>
            <TierSelectorSection>
              <SectionTitle>Faixa por cargo</SectionTitle>
              <TierButtons>
                {POLITICIAN_TIERS.map((tier) => (
                  <TierButton
                    key={tier}
                    type="button"
                    $active={polTier === tier}
                    onClick={() => setPolTier(tier)}
                  >
                    {POLITICIAN_TIER_LABELS[tier]}
                  </TierButton>
                ))}
              </TierButtons>
            </TierSelectorSection>

            <PlansGrid count={politicianPlans.length}>
              {politicianPlans.map((plan) => {
                const code = plan.code as PoliticianPlan
                const priceCentavos = PLAN_PRICES.POLITICIAN[code][polTier]
                const maxMembers = getMaxMembers('POLITICIAN', code, polTier)
                const isCurrent = myPlan?.orgType === 'POLITICIAN' && myPlan.plan === code
                const highlight = code === 'MANDATO'

                return (
                  <PlanCard key={code} $highlight={highlight}>
                    <PlanName $highlight={highlight}>{plan.label}</PlanName>
                    <PlanDescription>{plan.description}</PlanDescription>
                    <PriceRow>
                      <PlanPrice>{formatCentavos(priceCentavos)}</PlanPrice>
                      {priceCentavos > 0 && <PriceNote>/mês</PriceNote>}
                    </PriceRow>

                    <LimitsBox>
                      <LimitLine>{formatMembersLimit(maxMembers)}</LimitLine>
                      <LimitLine>{formatHistoryLimit(plan.limits.historyDays)}</LimitLine>
                    </LimitsBox>

                    <FeatureList>
                      {POLITICIAN_FEATURE_ORDER.map((featureKey) => {
                        const enabled = plan.features[featureKey]
                        const status = plan.status[featureKey]
                        const meta = FEATURE_CATALOG[featureKey]
                        const isSoon = enabled && status === 'soon'

                        return (
                          <FeatureItem key={featureKey} $muted={!enabled}>
                            <FeatureIcon $enabled={enabled} $soon={isSoon}>
                              {!enabled ? '—' : isSoon ? '🕒' : '✅'}
                            </FeatureIcon>
                            <FeatureLabelWrap>
                              <span>{meta.label}</span>
                              {isSoon && <SoonBadge>Em breve</SoonBadge>}
                            </FeatureLabelWrap>
                          </FeatureItem>
                        )
                      })}
                    </FeatureList>

                    {code === 'BASICO' ? (
                      <PlanCtaBtn type="button" disabled>
                        {isCurrent ? 'Seu plano atual' : 'Gratuito por padrão'}
                      </PlanCtaBtn>
                    ) : (
                      <PlanCtaBtn
                        type="button"
                        $highlight={highlight}
                        disabled={isCurrent || loadingPlan === code}
                        onClick={() => handleCheckout(code, plan.label)}
                      >
                        {isCurrent
                          ? 'Seu plano atual'
                          : loadingPlan === code
                            ? 'Aguarde...'
                            : `Contratar ${plan.label}`}
                      </PlanCtaBtn>
                    )}
                  </PlanCard>
                )
              })}
            </PlansGrid>

            <TableCard>
              <SectionTitle>Tabela completa de valores e limites por cargo</SectionTitle>
              <TableNote>
                Os valores acima consideram a faixa selecionada; abaixo estão todas as faixas de
                cargo e limites de equipe definidos no catálogo.
              </TableNote>
              <PriceTable>
                <thead>
                  <tr>
                    <th>Faixa de cargo</th>
                    <th>Básico</th>
                    <th>Mandato</th>
                    <th>Mandato Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {POLITICIAN_TIERS.map((tier) => (
                    <tr key={tier}>
                      <td>{POLITICIAN_TIER_LABELS[tier]}</td>
                      <td>
                        {formatCentavos(PLAN_PRICES.POLITICIAN.BASICO[tier])} ·{' '}
                        {getMaxMembers('POLITICIAN', 'BASICO', tier)} usuário
                      </td>
                      <td>
                        {formatCentavos(PLAN_PRICES.POLITICIAN.MANDATO[tier])}/mês · até{' '}
                        {getMaxMembers('POLITICIAN', 'MANDATO', tier)} membros
                      </td>
                      <td>
                        {formatCentavos(PLAN_PRICES.POLITICIAN.MANDATO_PRO[tier])}/mês · até{' '}
                        {getMaxMembers('POLITICIAN', 'MANDATO_PRO', tier)} membros
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PriceTable>
            </TableCard>
          </>
        ) : (
          <>
            <TierSelectorSection>
              <SectionTitle>Porte do município</SectionTitle>
              <TierButtons>
                {ENTITY_TIERS.map((tier) => (
                  <TierButton
                    key={tier}
                    type="button"
                    $active={entTier === tier}
                    onClick={() => setEntTier(tier)}
                  >
                    {ENTITY_POPULATION_TIER_LABELS[tier]}
                  </TierButton>
                ))}
              </TierButtons>
            </TierSelectorSection>

            <PlansGrid count={entityPlans.length}>
              {entityPlans.map((plan) => {
                const code = plan.code as EntityPlan
                const priceCentavos = PLAN_PRICES.ENTITY[code][entTier]
                const maxMembers = getMaxMembers('ENTITY', code)
                const isCurrent = myPlan?.orgType === 'ENTITY' && myPlan.plan === code
                const highlight = code === 'GESTAO'

                return (
                  <PlanCard key={code} $highlight={highlight}>
                    <PlanName $highlight={highlight}>{plan.label}</PlanName>
                    <PlanDescription>{plan.description}</PlanDescription>
                    <PriceRow>
                      <PlanPrice>{formatCentavos(priceCentavos)}</PlanPrice>
                      {priceCentavos > 0 && (
                        <PriceNote>
                          /mês{code === 'INTEGRACAO' ? ' (a confirmar)' : ''}
                        </PriceNote>
                      )}
                    </PriceRow>

                    <LimitsBox>
                      <LimitLine>{formatMembersLimit(maxMembers)}</LimitLine>
                      <LimitLine>{formatHistoryLimit(plan.limits.historyDays)}</LimitLine>
                    </LimitsBox>

                    <FeatureList>
                      {ENTITY_FEATURE_ORDER.map((featureKey) => {
                        const enabled = plan.features[featureKey]
                        const status = plan.status[featureKey]
                        const meta = FEATURE_CATALOG[featureKey]
                        const isSoon = enabled && status === 'soon'

                        return (
                          <FeatureItem key={featureKey} $muted={!enabled}>
                            <FeatureIcon $enabled={enabled} $soon={isSoon}>
                              {!enabled ? '—' : isSoon ? '🕒' : '✅'}
                            </FeatureIcon>
                            <FeatureLabelWrap>
                              <span>{meta.label}</span>
                              {isSoon && <SoonBadge>Em breve</SoonBadge>}
                            </FeatureLabelWrap>
                          </FeatureItem>
                        )
                      })}
                    </FeatureList>

                    {code === 'BASICO' ? (
                      <PlanCtaBtn type="button" disabled>
                        {isCurrent ? 'Seu plano atual' : 'Gratuito por padrão'}
                      </PlanCtaBtn>
                    ) : (
                      <PlanCtaBtn
                        type="button"
                        $highlight={highlight}
                        disabled={isCurrent || loadingPlan === code}
                        onClick={() => handleCheckout(code, plan.label)}
                      >
                        {isCurrent
                          ? 'Seu plano atual'
                          : loadingPlan === code
                            ? 'Aguarde...'
                            : `Contratar ${plan.label}`}
                      </PlanCtaBtn>
                    )}
                  </PlanCard>
                )
              })}
            </PlansGrid>

            <TableCard>
              <SectionTitle>Valores por faixa populacional da entidade</SectionTitle>
              <TableNote>
                O plano Básico é gratuito (até 2 membros e histórico de 30 dias). Para Integração,
                os valores exibidos são provisórios até confirmação comercial.
              </TableNote>
              <PriceTable>
                <thead>
                  <tr>
                    <th>Faixa de população</th>
                    <th>Básico</th>
                    <th>Gestão (até 10 membros)</th>
                    <th>Integração (ilimitado)</th>
                  </tr>
                </thead>
                <tbody>
                  {ENTITY_TIERS.map((tier) => (
                    <tr key={tier}>
                      <td>{ENTITY_POPULATION_TIER_LABELS[tier]}</td>
                      <td>{formatCentavos(PLAN_PRICES.ENTITY.BASICO[tier])}</td>
                      <td>{formatCentavos(PLAN_PRICES.ENTITY.GESTAO[tier])}/mês</td>
                      <td>
                        {formatCentavos(PLAN_PRICES.ENTITY.INTEGRACAO[tier])}/mês (a confirmar)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </PriceTable>
            </TableCard>
          </>
        )}

        <CompanySection aria-label="Planos empresariais — fase 2">
          <CompanyTitle>Empresas e concessionárias privadas</CompanyTitle>
          <CompanySubtitle>
            Catálogo previsto para a fase 2 do negócio (valores de referência, não validados).
          </CompanySubtitle>
          <CompanyGrid>
            {COMPANY_PLAN_ORDER.map((code) => (
              <CompanyItem key={code}>
                <CompanyPlanLabel>{COMPANY_PLANS[code].label}</CompanyPlanLabel>
                <CompanyPlanPrice>{formatCompanyPrice(code)}</CompanyPlanPrice>
              </CompanyItem>
            ))}
          </CompanyGrid>
        </CompanySection>

        <FaqSection>
          <FaqTitle>Dúvidas frequentes</FaqTitle>
          {FAQ.map((item, i) => (
            <FaqItem key={item.q}>
              <FaqQuestion type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                {item.q}
                <FaqToggle>{openFaq === i ? '−' : '+'}</FaqToggle>
              </FaqQuestion>
              {openFaq === i && <FaqAnswer>{item.a}</FaqAnswer>}
            </FaqItem>
          ))}
        </FaqSection>
      </Page>
    </PageShell>
  )
}

// ─── Styles (apenas tokens de theme) ─────────────────────────────────────────

const PageShell = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.colors.neutral};
`

const Page = styled.main`
  max-width: 1480px;
  margin: 0 auto;
  padding: 0 32px ${({ theme }) => theme.spacing[16]};

  @media (max-width: 720px) { padding: 0 16px ${({ theme }) => theme.spacing[12]}; }
`

const Hero = styled.section`
  text-align: center;
  padding: ${({ theme }) => theme.spacing[12]} 0 ${({ theme }) => theme.spacing[6]};
`

const HeroLabel = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
  text-transform: uppercase;
  letter-spacing: 0.08em;
`

const HeroTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(1.875rem, 4.5vw, ${({ theme }) => theme.fontSizes['4xl']});
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin: ${({ theme }) => theme.spacing[3]} 0;
  line-height: 1.15;
`

const HeroSub = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.muted};
  max-width: 660px;
  margin: 0 auto;
  line-height: 1.6;
`

const CurrentPlanBanner = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[3]};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[6]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
`

const UsageBadge = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.primary};
  padding: ${({ theme }) => theme.spacing[1]} ${({ theme }) => theme.spacing[3]};
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const TabsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing[2]};
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
`

const Tab = styled.button<{ active: boolean }>`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme, active }) => (active ? theme.colors.primary : theme.colors.muted)};
  background: none;
  border: none;
  border-bottom: 3px solid ${({ theme, active }) => (active ? theme.colors.action : 'transparent')};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[5]};
  cursor: pointer;
  margin-bottom: -2px;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`

const PrincipleNotice = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border-left: 4px solid ${({ theme }) => theme.colors.action};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[6]};
  line-height: 1.5;
`

const FeedbackBanner = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.action};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[6]};
`

const TierSelectorSection = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing[6]};
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 ${({ theme }) => theme.spacing[3]};
`

const TierButtons = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing[2]};
`

const TierButton = styled.button<{ $active: boolean }>`
  text-align: left;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme, $active }) =>
    $active ? theme.fontWeights.semibold : theme.fontWeights.regular};
  color: ${({ theme, $active }) => ($active ? theme.colors.white : theme.colors.text)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]};
  cursor: pointer;
`

const PlansGrid = styled.div<{ count: number }>`
  display: grid;
  grid-template-columns: repeat(${({ count }) => Math.min(count, 3)}, 1fr);
  gap: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[10]};

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`

const PlanCard = styled.div<{ $highlight?: boolean }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 2px solid
    ${({ theme, $highlight }) => ($highlight ? theme.colors.action : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme, $highlight }) => ($highlight ? theme.shadows.lg : theme.shadows.sm)};
`

const PlanName = styled.h3<{ $highlight?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme, $highlight }) => ($highlight ? theme.colors.action : theme.colors.primary)};
  margin: 0 0 ${({ theme }) => theme.spacing[1]};
`

const PlanDescription = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin: 0 0 ${({ theme }) => theme.spacing[4]};
`

const PriceRow = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing[1]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const PlanPrice = styled.span`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['3xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const PriceNote = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const LimitsBox = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const LimitLine = styled.div`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  & + & {
    margin-top: ${({ theme }) => theme.spacing[1]};
  }
`

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 ${({ theme }) => theme.spacing[6]};
  flex: 1;
`

const FeatureItem = styled.li<{ $muted?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[2]};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $muted }) => ($muted ? theme.colors.muted : theme.colors.text)};
  padding: ${({ theme }) => theme.spacing[2]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  opacity: ${({ $muted }) => ($muted ? 0.55 : 1)};

  &:last-child {
    border-bottom: none;
  }
`

const FeatureIcon = styled.span<{ $enabled: boolean; $soon: boolean }>`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  margin-top: 2px;
`

const FeatureLabelWrap = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
  line-height: 1.4;
`

const SoonBadge = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.full};
  padding: 1px ${({ theme }) => theme.spacing[2]};
`

const PlanCtaBtn = styled.button<{ $highlight?: boolean }>`
  display: block;
  width: 100%;
  text-align: center;
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  border-radius: ${({ theme }) => theme.radii.md};
  border: none;
  cursor: pointer;
  background: ${({ theme, $highlight }) =>
    $highlight ? theme.colors.action : theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};

  &:hover:not(:disabled) {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`

const TableCard = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[6]};
  margin-bottom: ${({ theme }) => theme.spacing[8]};
  overflow-x: auto;
`

const TableNote = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.spacing[4]};
`

const PriceTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.sm};

  th,
  td {
    text-align: left;
    padding: ${({ theme }) => theme.spacing[3]};
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    color: ${({ theme }) => theme.colors.text};
  }

  th {
    font-weight: ${({ theme }) => theme.fontWeights.semibold};
    color: ${({ theme }) => theme.colors.primary};
  }
`

const CompanySection = styled.section`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[5]} ${({ theme }) => theme.spacing[6]};
  margin-bottom: ${({ theme }) => theme.spacing[12]};
`

const CompanyTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.spacing[1]};
`

const CompanySubtitle = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  margin: 0 0 ${({ theme }) => theme.spacing[4]};
`

const CompanyGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing[3]};

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

const CompanyItem = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing[1]};
`

const CompanyPlanLabel = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const CompanyPlanPrice = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const FaqSection = styled.section`
  max-width: 720px;
  margin: 0 auto;
`

const FaqTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing[4]};
`

const FaqItem = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const FaqQuestion = styled.button`
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  padding: ${({ theme }) => theme.spacing[4]} 0;
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  text-align: left;
  cursor: pointer;
  gap: ${({ theme }) => theme.spacing[4]};

  &:hover {
    color: ${({ theme }) => theme.colors.action};
  }
`

const FaqToggle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`

const FaqAnswer = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  padding-bottom: ${({ theme }) => theme.spacing[4]};
  margin: 0;
`
