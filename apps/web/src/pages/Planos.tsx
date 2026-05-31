import { useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'entidades' | 'politicos' | 'empresas'

interface PlanFeature {
  text: string
  locked?: boolean
}

interface Plan {
  name: string
  planKey: string | null  // null = plano grátis
  price: string
  priceNote?: string
  highlight?: boolean
  features: PlanFeature[]
  cta: string
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const ENTITY_PLANS: Plan[] = [
  {
    name: 'Básico',
    planKey: null,
    price: 'Grátis',
    features: [
      { text: 'Perfil verificado público' },
      { text: 'Responder relatos e atualizar status' },
      { text: 'Votz Score calculado automaticamente' },
      { text: 'Até 2 membros na equipe' },
      { text: 'Dashboard analytics', locked: true },
      { text: 'Exportação de relatórios', locked: true },
      { text: 'SLA configurável por categoria', locked: true },
    ],
    cta: 'Criar perfil gratuito',
  },
  {
    name: 'Gestão',
    planKey: 'GESTAO',
    price: 'R$ 1.200',
    priceNote: '/mês',
    highlight: true,
    features: [
      { text: 'Tudo do Básico' },
      { text: 'Dashboard analytics completo' },
      { text: 'SLA configurável por categoria' },
      { text: 'Exportação de relatórios mensais (JSON)' },
      { text: 'Até 5 membros na equipe' },
      { text: 'Alertas por email ao receber relato' },
      { text: 'API key e webhooks', locked: true },
      { text: 'Relatórios custom por bairro/período', locked: true },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'Pro',
    planKey: 'PRO',
    price: 'R$ 3.200',
    priceNote: '/mês',
    features: [
      { text: 'Tudo do Gestão' },
      { text: 'API key para integração de sistemas' },
      { text: 'Webhooks em tempo real' },
      { text: 'Relatórios custom por bairro e período' },
      { text: 'Até 15 membros na equipe' },
      { text: 'Templates de resposta' },
      { text: 'Badge de destaque na listagem' },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'Enterprise',
    planKey: null,
    price: 'Sob consulta',
    features: [
      { text: 'Tudo do Pro' },
      { text: 'Suporte dedicado' },
      { text: 'Múltiplos departamentos' },
      { text: 'SLA garantido de implementação' },
      { text: 'Customizações sob medida' },
    ],
    cta: 'Entrar em contato',
  },
]

const POLITICIAN_PLANS: Plan[] = [
  {
    name: 'Básico',
    planKey: null,
    price: 'Grátis',
    features: [
      { text: 'Perfil público com mandato e partido' },
      { text: 'Mandatômetro público (% resolvidos vs ignorados)' },
      { text: 'Avocar relatos da zona eleitoral' },
      { text: 'Relatório de atuação exportável', locked: true },
      { text: 'Dashboard analytics por bairro', locked: true },
      { text: 'Badge de responsividade', locked: true },
      { text: 'Criar Propostas vinculadas a relatos', locked: true },
    ],
    cta: 'Criar perfil gratuito',
  },
  {
    name: 'Mandatômetro Pro',
    planKey: 'MANDATOMETRO_PRO',
    price: 'R$ 800',
    priceNote: '/mês',
    highlight: true,
    features: [
      { text: 'Tudo do Básico' },
      { text: 'Badge de responsividade + destaque na listagem' },
      { text: 'Relatório de atuação exportável em PDF' },
      { text: 'Dashboard analytics por bairro e categoria' },
      { text: 'Notificações prioritárias de surtos na zona' },
      { text: 'Criar Propostas vinculadas a relatos reais' },
      { text: 'Compromissos eleitorais públicos', locked: true },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'Campanha',
    planKey: 'CAMPANHA',
    price: 'R$ 5.000',
    priceNote: 'pagamento único',
    features: [
      { text: 'Tudo do Mandatômetro Pro' },
      { text: 'Compromissos eleitorais vinculados a relatos reais' },
      { text: 'Badge "Candidato Comprometido"' },
      { text: 'Portfolio eleitoral com progresso de promessas' },
      { text: 'Destaque na home durante período eleitoral' },
      { text: 'Histórico imutável de promessas cumpridas' },
    ],
    cta: 'Falar com o Votz',
  },
]

const COMPANY_PLANS: Plan[] = [
  {
    name: 'Starter',
    planKey: 'STARTER',
    price: 'R$ 300',
    priceNote: '/mês',
    features: [
      { text: 'Perfil verificado público' },
      { text: 'Resposta pública a relatos' },
      { text: 'Dashboard básico' },
      { text: 'Até 2 membros' },
      { text: 'Janela de 24h para resolução privada' },
      { text: 'Analytics completo', locked: true },
      { text: 'Gestão de filiais', locked: true },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'Business',
    planKey: 'BUSINESS',
    price: 'R$ 1.200',
    priceNote: '/mês',
    highlight: true,
    features: [
      { text: 'Tudo do Starter' },
      { text: 'Analytics completo' },
      { text: 'SLA configurável' },
      { text: 'Exportação de relatórios' },
      { text: 'Até 5 membros' },
      { text: 'Alertas por email' },
      { text: 'Gestão de filiais (básico)' },
      { text: 'API + webhook', locked: true },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'Enterprise',
    planKey: 'ENTERPRISE',
    price: 'R$ 3.500+',
    priceNote: '/mês',
    features: [
      { text: 'Tudo do Business' },
      { text: 'Multi-filial unificado' },
      { text: 'API + webhook para integração CRM' },
      { text: 'Membros ilimitados' },
      { text: 'Relatórios custom por filial/região' },
    ],
    cta: 'Falar com o Votz',
  },
  {
    name: 'White-label',
    planKey: null,
    price: 'Sob consulta',
    features: [
      { text: 'Tudo do Enterprise' },
      { text: 'Votz embedado no canal próprio da empresa' },
      { text: 'Branding customizado' },
      { text: 'Registro público mantido (sem supressão)' },
      { text: 'Suporte dedicado exclusivo' },
    ],
    cta: 'Entrar em contato',
  },
]

const FAQ = [
  {
    q: 'Posso aparecer no Votz sem assinar?',
    a: 'Sim. Relatos sobre sua entidade ou mandato são públicos de qualquer forma. A assinatura dá acesso ao dashboard, à capacidade de responder com eficiência e ao controle sobre como você aparece.',
  },
  {
    q: 'O que acontece se eu não responder os relatos?',
    a: 'Seu Votz Score cai publicamente a cada dia sem resposta. O score de pressão sobe (dias sem resposta × 2), o relato sobe no feed e pode virar surto. Ignorar tem custo — e ele fica no histórico para sempre.',
  },
  {
    q: 'Como funciona o pagamento?',
    a: 'O pagamento é feito via Stripe, com cartão de crédito. Ao clicar em Assinar, você é redirecionado para o checkout seguro do Stripe e volta ao Votz automaticamente após a confirmação.',
  },
  {
    q: 'Posso cancelar a qualquer momento?',
    a: 'Sim. Ao cancelar, seu perfil continua existindo no plano Básico (gratuito). Nenhum relato é removido.',
  },
]

// ─── Component ────────────────────────────────────────────────────────────────

const TAB_ORG_TYPE: Record<Tab, string> = {
  entidades: 'ENTITY',
  politicos: 'POLITICIAN',
  empresas: 'COMPANY',
}

export function Planos() {
  const [activeTab, setActiveTab] = useState<Tab>('entidades')
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const { user, activeContext } = useAuthStore()
  const navigate = useNavigate()

  const plans = activeTab === 'entidades' ? ENTITY_PLANS : activeTab === 'politicos' ? POLITICIAN_PLANS : COMPANY_PLANS

  async function handleCheckout(planKey: string | null, planName: string) {
    if (!planKey) {
      navigate('/solicitar-cadastro')
      return
    }
    if (!user) {
      navigate('/entrar')
      return
    }
    if (!activeContext) {
      alert('Selecione o perfil da sua organização antes de assinar.')
      return
    }
    if (activeContext.type.toUpperCase() !== TAB_ORG_TYPE[activeTab]) {
      alert('Mude para o perfil correto antes de assinar este plano.')
      return
    }
    setLoadingPlan(planKey)
    try {
      const { data } = await api.post('/subscricoes/checkout', {
        orgId: activeContext.id,
        orgType: activeContext.type.toUpperCase(),
        plan: planKey,
      })
      window.location.href = data.url
    } catch {
      alert('Erro ao iniciar checkout. Tente novamente.')
    } finally {
      setLoadingPlan(null)
    }
  }

  return (
    <Page>
      <Hero>
        <HeroLabel>Planos Votz</HeroLabel>
        <HeroTitle>Ignorar tem custo.<br />Agir tem valor.</HeroTitle>
        <HeroSub>
          Seu perfil já existe no Votz — com ou sem assinatura. Relatos sobre você são
          públicos e ficam na memória para sempre. A diferença é se você escolhe agir com
          dados e controle, ou apenas ser cobrado sem ferramentas.
        </HeroSub>
      </Hero>

      <TabsRow>
        <Tab active={activeTab === 'entidades'} onClick={() => setActiveTab('entidades')}>
          Para Entidades
        </Tab>
        <Tab active={activeTab === 'politicos'} onClick={() => setActiveTab('politicos')}>
          Para Políticos
        </Tab>
        <Tab active={activeTab === 'empresas'} onClick={() => setActiveTab('empresas')}>
          Para Empresas
        </Tab>
      </TabsRow>

      {activeTab === 'entidades' && (
        <UrgencyBar>
          Seu Votz Score cai a cada dia sem resposta. Entidades no plano Gestão têm acesso
          ao dashboard que mostra exatamente onde agir — antes que o problema vire manchete.
        </UrgencyBar>
      )}
      {activeTab === 'politicos' && (
        <UrgencyBar>
          Cidadãos do seu distrito são notificados quando você age <em>ou quando você ignora</em>.
          O Mandatômetro é público. A diferença é se você tem as ferramentas para mostrar seu trabalho.
        </UrgencyBar>
      )}
      {activeTab === 'empresas' && (
        <UrgencyBar>
          Diferente do Reclame Aqui, no Votz o registro é imutável e a pressão é coletiva.
          O plano certo transforma reclamações em relacionamento — e reputação em vantagem competitiva.
        </UrgencyBar>
      )}

      <PlansGrid count={plans.length}>
        {plans.map((plan) => (
          <PlanCard key={plan.name} highlight={plan.highlight}>
            {plan.highlight && <HighlightBadge>Mais escolhido</HighlightBadge>}
            <PlanName highlight={plan.highlight}>{plan.name}</PlanName>
            <PriceRow>
              <PlanPrice>{plan.price}</PlanPrice>
              {plan.priceNote && <PriceNote>{plan.priceNote}</PriceNote>}
            </PriceRow>
            <FeatureList>
              {plan.features.map((f, i) => (
                <FeatureItem key={i} locked={f.locked}>
                  <FeatureIcon locked={f.locked}>{f.locked ? '🔒' : '✓'}</FeatureIcon>
                  {f.text}
                </FeatureItem>
              ))}
            </FeatureList>
            <PlanCtaBtn
              highlight={plan.highlight}
              disabled={loadingPlan === plan.planKey}
              onClick={() => handleCheckout(plan.planKey, plan.name)}
            >
              {loadingPlan === plan.planKey ? 'Aguarde...' : plan.cta}
            </PlanCtaBtn>
          </PlanCard>
        ))}
      </PlansGrid>

      <FaqSection>
        <FaqTitle>Dúvidas frequentes</FaqTitle>
        {FAQ.map((item, i) => (
          <FaqItem key={i}>
            <FaqQuestion onClick={() => setOpenFaq(openFaq === i ? null : i)}>
              {item.q}
              <FaqToggle>{openFaq === i ? '−' : '+'}</FaqToggle>
            </FaqQuestion>
            {openFaq === i && <FaqAnswer>{item.a}</FaqAnswer>}
          </FaqItem>
        ))}
      </FaqSection>
    </Page>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const Page = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 ${({ theme }) => theme.spacing[4]};
`

const Hero = styled.section`
  text-align: center;
  padding: ${({ theme }) => theme.spacing[16]} 0 ${({ theme }) => theme.spacing[8]};
`

const HeroLabel = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
  text-transform: uppercase;
  letter-spacing: 0.1em;
`

const HeroTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(2rem, 5vw, ${({ theme }) => theme.fontSizes['4xl']});
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin: ${({ theme }) => theme.spacing[3]} 0;
  line-height: 1.15;
`

const HeroSub = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.muted};
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
`

const TabsRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing[2]};
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing[4]};
  border-bottom: 2px solid ${({ theme }) => theme.colors.border};
  padding-bottom: 0;
`

const Tab = styled.button<{ active: boolean }>`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: 600;
  color: ${({ theme, active }) => active ? theme.colors.primary : theme.colors.muted};
  background: none;
  border: none;
  border-bottom: 3px solid ${({ theme, active }) => active ? theme.colors.action : 'transparent'};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[5]};
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -2px;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`

const UrgencyBar = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.white};
  background: ${({ theme }) => theme.colors.primary};
  border-left: 4px solid ${({ theme }) => theme.colors.action};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[5]};
  border-radius: 6px;
  margin-bottom: ${({ theme }) => theme.spacing[6]};
  line-height: 1.5;

  em { color: ${({ theme }) => theme.colors.action}; font-style: normal; font-weight: 600; }
`

const PlansGrid = styled.div<{ count: number }>`
  display: grid;
  grid-template-columns: repeat(${({ count }) => Math.min(count, 4)}, 1fr);
  gap: ${({ theme }) => theme.spacing[4]};
  margin-bottom: ${({ theme }) => theme.spacing[16]};

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`

const PlanCard = styled.div<{ highlight?: boolean }>`
  position: relative;
  background: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme, highlight }) => highlight ? theme.colors.action : theme.colors.border};
  border-radius: 12px;
  padding: ${({ theme }) => theme.spacing[6]};
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme, highlight }) => highlight ? theme.shadows.lg : theme.shadows.sm};
`

const HighlightBadge = styled.span`
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: 700;
  padding: 2px 12px;
  border-radius: 999px;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const PlanName = styled.h3<{ highlight?: boolean }>`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: 700;
  color: ${({ theme, highlight }) => highlight ? theme.colors.action : theme.colors.primary};
  margin: 0 0 ${({ theme }) => theme.spacing[2]};
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
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`

const PriceNote = styled.span`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
`

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 ${({ theme }) => theme.spacing[6]};
  flex: 1;
`

const FeatureItem = styled.li<{ locked?: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[2]};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, locked }) => locked ? theme.colors.muted : theme.colors.text};
  padding: ${({ theme }) => theme.spacing[2]} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  opacity: ${({ locked }) => locked ? 0.5 : 1};

  &:last-child { border-bottom: none; }
`

const FeatureIcon = styled.span<{ locked?: boolean }>`
  flex-shrink: 0;
  font-size: 12px;
  color: ${({ theme, locked }) => locked ? theme.colors.muted : theme.colors.positive};
  margin-top: 2px;
`

const PlanCtaBtn = styled.button<{ highlight?: boolean }>`
  display: block;
  width: 100%;
  text-align: center;
  font-family: ${({ theme }) => theme.fonts.body};
  font-weight: 600;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  padding: ${({ theme }) => theme.spacing[3]} ${({ theme }) => theme.spacing[4]};
  border-radius: 8px;
  border: none;
  cursor: pointer;
  background: ${({ theme, highlight }) => highlight ? theme.colors.action : theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  transition: opacity 0.15s;

  &:hover:not(:disabled) { opacity: 0.88; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const FaqSection = styled.section`
  max-width: 720px;
  margin: 0 auto ${({ theme }) => theme.spacing[16]};
`

const FaqTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes['2xl']};
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
  margin-bottom: ${({ theme }) => theme.spacing[6]};
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
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  text-align: left;
  cursor: pointer;
  gap: ${({ theme }) => theme.spacing[4]};

  &:hover { color: ${({ theme }) => theme.colors.action}; }
`

const FaqToggle = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.muted};
  flex-shrink: 0;
`

const FaqAnswer = styled.p`
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  padding-bottom: ${({ theme }) => theme.spacing[4]};
  margin: 0;
`
