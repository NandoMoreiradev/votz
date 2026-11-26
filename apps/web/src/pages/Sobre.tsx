import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import {
  ArrowRight,
  Broadcast,
  Buildings,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  Code,
  DeviceMobile,
  Eye,
  Fire,
  Handshake,
  LockKey,
  MapPin,
  Megaphone,
  Newspaper,
  Scales,
  ShieldCheck,
  Storefront,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'

type AudienceKey =
  | 'cidadaos'
  | 'politicos'
  | 'entidades'
  | 'empresas'
  | 'imprensa'
  | 'institutos'

interface AudienceFeature {
  title: string
  description: string
  to?: string
  linkLabel?: string
}

interface AudienceTab {
  key: AudienceKey
  label: string
  headline: string
  summary: string
  ctaLabel: string
  ctaTo: string
  secondaryLabel?: string
  secondaryTo?: string
  features: AudienceFeature[]
}

const AUDIENCES: AudienceTab[] = [
  {
    key: 'cidadaos',
    label: 'Cidadãos',
    headline: 'Sua reclamação não morre num protocolo esquecido.',
    summary:
      'Registre problemas reais do seu bairro ou cidade, apoie relatos de outras pessoas e acompanhe cada passo até a solução — de graça e com opção de anonimato.',
    ctaLabel: 'Criar um relato',
    ctaTo: '/novo',
    secondaryLabel: 'Explorar o feed',
    secondaryTo: '/',
    features: [
      {
        title: 'Relatos públicos ou anônimos',
        description: 'Envie fotos, vídeos e localização no mapa. Em relatos anônimos, sua identidade fica protegida.',
        to: '/novo',
        linkLabel: 'Fazer relato',
      },
      {
        title: 'Mapa de problemas e Surtos',
        description: 'Veja o que está acontecendo perto de você e acompanhe alertas quando um problema cresce em escala.',
        to: '/mapa',
        linkLabel: 'Abrir mapa',
      },
      {
        title: 'Propostas, Debates e Pesquisas',
        description: 'Participe de debates ao vivo, acompanhe propostas públicas e responda pesquisas abertas.',
        to: '/debates',
        linkLabel: 'Ver debates',
      },
      {
        title: 'Conversas criptografadas',
        description: 'Mensageiro com criptografia de ponta a ponta no computador e no celular para conversar com privacidade.',
        to: '/conversas',
        linkLabel: 'Abrir conversas',
      },
    ],
  },
  {
    key: 'politicos',
    label: 'Políticos',
    headline: 'Mostre trabalho com fatos públicos, não só com discurso.',
    summary:
      'Assuma problemas da população, preste contas em tempo real e construa histórico verificável no Mandatômetro.',
    ctaLabel: 'Ver planos para mandatos',
    ctaTo: '/planos',
    secondaryLabel: 'Ver políticos no Votz',
    secondaryTo: '/politicos',
    features: [
      {
        title: 'Mandatômetro e Prestação Pública',
        description: 'Painel aberto com atuação, respostas e entregas do mandato acessível por qualquer eleitor.',
        to: '/politicos',
        linkLabel: 'Conhecer perfis',
      },
      {
        title: 'Avocação de relatos',
        description: 'Assuma publicamente um problema registrado na sua região e acompanhe a cobrança até resolver.',
      },
      {
        title: 'Portal do Mandato e Equipe',
        description: 'Organize assessores no Votz Estúdio com alertas de surto, modelos de resposta e relatórios.',
        to: '/planos',
        linkLabel: 'Comparar planos',
      },
      {
        title: 'Propostas e Debates ao vivo',
        description: 'Publique propostas para ouvir a população e participe de debates transmitidos na plataforma.',
        to: '/propostas',
        linkLabel: 'Ver propostas',
      },
    ],
  },
  {
    key: 'entidades',
    label: 'Entidades Públicas',
    headline: 'Gestão transparente de demandas, prazos e confiança.',
    summary:
      'Prefeituras, secretarias, autarquias e órgãos públicos respondem com agilidade, acompanham prazos e enxergam onde os problemas se concentram.',
    ctaLabel: 'Registrar órgão público',
    ctaTo: '/solicitar-cadastro',
    secondaryLabel: 'Ver entidades',
    secondaryTo: '/entidades',
    features: [
      {
        title: 'Resposta oficial gratuita',
        description: 'Responder relatos, atualizar o andamento e prestar esclarecimentos públicos não tem custo.',
        to: '/entidades',
        linkLabel: 'Explorar entidades',
      },
      {
        title: 'Painel de prazos (SLA) e Dados',
        description: 'Acompanhe tempo médio de resposta, taxa de resolução e mapa de calor por região.',
        to: '/planos',
        linkLabel: 'Ver recursos',
      },
      {
        title: 'Consultas públicas',
        description: 'Ouça a população de forma estruturada antes de tomar decisões importantes.',
      },
      {
        title: 'Votz Score transparente',
        description: 'Reputação calculada de forma clara a partir de respostas reais e confirmações dos cidadãos.',
      },
    ],
  },
  {
    key: 'empresas',
    label: 'Empresas',
    headline: 'Atenda clientes às claras e construa reputação de verdade.',
    summary:
      'Concessionárias, operadoras e empresas privadas centralizam relatos por filial, respondem oficialmente e divulgam campanhas com transparência total.',
    ctaLabel: 'Registrar empresa',
    ctaTo: '/solicitar-cadastro',
    secondaryLabel: 'Biblioteca de anúncios',
    secondaryTo: '/anuncios/biblioteca',
    features: [
      {
        title: 'Gestão por matriz e filiais',
        description: 'Acompanhe relatos por unidade, delegue para sua equipe e responda com perfil verificado.',
      },
      {
        title: 'Votz Estúdio',
        description: 'Central única para equipe, métricas de atendimento, faturamento e acompanhamento de campanhas.',
        to: '/planos',
        linkLabel: 'Ver planos',
      },
      {
        title: 'Anúncios transparentes',
        description: 'Campanhas segmentadas com métricas claras e registro público obrigatório na Biblioteca de Anúncios.',
        to: '/anuncios/biblioteca',
        linkLabel: 'Abrir biblioteca',
      },
      {
        title: 'Canal direto com o cidadão',
        description: 'Resolva problemas recorrentes antes que virem crise e transforme atendimento em confiança.',
      },
    ],
  },
  {
    key: 'imprensa',
    label: 'Imprensa',
    headline: 'Pautas reais, dados verificáveis e contato direto.',
    summary:
      'Ferramentas pensadas para jornalistas e pesquisadores acompanharem problemas emergentes, surtos locais e respostas oficiais em um só lugar.',
    ctaLabel: 'Acessar área de imprensa',
    ctaTo: '/imprensa',
    secondaryLabel: 'Abrir mapa de relatos',
    secondaryTo: '/mapa',
    features: [
      {
        title: 'Credenciamento jornalístico',
        description: 'Acesso dedicado para jornalistas, veículos de comunicação, ONGs e pesquisadores.',
        to: '/imprensa',
        linkLabel: 'Conhecer portal',
      },
      {
        title: 'Radar de pautas e Surtos',
        description: 'Identifique rapidamente quando uma reclamação local explode em dezenas de relatos parecidos.',
      },
      {
        title: 'Briefings e linha do tempo imutável',
        description: 'Histórico completo com datas, respostas oficiais e contestações para apuração segura.',
      },
      {
        title: 'Pedidos diretos às assessorias',
        description: 'Envie solicitações formais de posicionamento para entidades, empresas e mandatos.',
      },
    ],
  },
  {
    key: 'institutos',
    label: 'Institutos de Pesquisa',
    headline: 'Publique pesquisas com metodologia clara e alcance nacional.',
    summary:
      'Institutos verificados compartilham levantamentos, resultados e dados abertos diretamente com cidadãos, imprensa e gestores.',
    ctaLabel: 'Ver pesquisas públicas',
    ctaTo: '/pesquisas',
    secondaryLabel: 'Solicitar cadastro',
    secondaryTo: '/solicitar-cadastro',
    features: [
      {
        title: 'Perfil verificado de instituto',
        description: 'Página dedicada com histórico de pesquisas publicadas e credibilidade verificada.',
        to: '/pesquisas',
        linkLabel: 'Explorar pesquisas',
      },
      {
        title: 'Resultados legíveis para todos',
        description: 'Apresentação clara de perguntas, metodologia e números sem complicação.',
      },
      {
        title: 'Integração com o debate público',
        description: 'Pesquisas ganham contexto real junto às pautas, relatos e debates da plataforma.',
      },
      {
        title: 'Transparência metodológica',
        description: 'Espaço dedicado para explicar amostra, período de coleta e responsáveis pelo estudo.',
      },
    ],
  },
]

const CYCLE_STEPS = [
  {
    num: '01',
    icon: Megaphone,
    title: 'Relato',
    text: 'Você registra o problema com foto, vídeo e local no mapa. Se preferir, pode publicar de forma anônima.',
  },
  {
    num: '02',
    icon: Fire,
    title: 'Apoio e Pressão',
    text: 'Quem também sofre com o problema dá apoio, comenta e soma relatos parecidos. A pressão cresce de forma pública.',
  },
  {
    num: '03',
    icon: Handshake,
    title: 'Resposta ou Avocação',
    text: 'O órgão ou empresa responde com prazo. Um político também pode avocar o problema para cobrar solução.',
  },
  {
    num: '04',
    icon: CheckCircle,
    title: 'Memória e Contestação',
    text: 'Cada passo fica gravado para sempre. Se marcarem como resolvido sem resolver, você pode contestar.',
  },
]

const GLOSSARY = [
  { term: 'Relato', meaning: 'O registro público de um problema real, com local, mídia e linha do tempo.' },
  { term: 'Apoio', meaning: 'Não é curtida: é o sinal coletivo de que o problema importa e precisa de solução.' },
  { term: 'Pressão', meaning: 'Índice público que combina apoios, comentários, relatos parecidos e dias sem resposta.' },
  { term: 'Memória', meaning: 'Histórico imutável de tudo o que foi prometido, respondido, resolvido ou contestado.' },
  { term: 'Avocar', meaning: 'Quando um político assume publicamente um relato para cobrar e acompanhar a solução.' },
  { term: 'Contestar', meaning: 'Quando o cidadão nega um "resolvido" que não aconteceu na prática.' },
  { term: 'Surto', meaning: 'Alerta automático quando um mesmo problema explode em escala numa região.' },
  { term: 'Mandatômetro', meaning: 'Painel público que mede a atuação e as respostas reais de cada político.' },
  { term: 'Votz Score', meaning: 'Nota de reputação de entidades, empresas e políticos baseada em fatos registrados.' },
]

const TRUST_PILLARS = [
  {
    icon: ShieldCheck,
    title: 'Anonimato real e LGPD',
    description:
      'Relatos anônimos não expõem quem publicou. Dados pessoais sensíveis são protegidos com criptografia e você controla sua privacidade.',
    linkTo: '/privacidade',
    linkLabel: 'Ler política de privacidade',
  },
  {
    icon: LockKey,
    title: 'Conversas ponta a ponta',
    description:
      'O mensageiro do Votz usa criptografia de ponta a ponta no computador e no celular: só você e quem conversa com você podem ler.',
    linkTo: '/conversas',
    linkLabel: 'Conhecer Conversas',
  },
  {
    icon: Eye,
    title: 'Sem partido e transparente',
    description:
      'Notas de Contexto da Comunidade ajudam a checar fatos, e todo anúncio pago fica visível na Biblioteca Pública de Anúncios.',
    linkTo: '/anuncios/biblioteca',
    linkLabel: 'Ver biblioteca de anúncios',
  },
  {
    icon: Code,
    title: 'Dados abertos e multiplataforma',
    description:
      'API pública documentada para pesquisa e jornalismo, além de acesso completo pelo navegador e pelo aplicativo mobile.',
    href: '/api/v1/docs',
    linkLabel: 'Acessar API pública',
  },
]

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.text};
`

const Main = styled.main`
  flex: 1;
`

const Hero = styled.section`
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onAccent};
  padding: 72px 24px 80px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 48px 20px 56px;
  }
`

const HeroInner = styled.div`
  max-width: 1160px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.95fr);
  gap: 48px;
  align-items: center;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
    gap: 36px;
  }
`

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 12px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: ${({ theme }) => theme.colors.onAccent};
  margin-bottom: 20px;
`

const EyebrowDot = styled.span`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.action};
  display: inline-block;
`

const HeroTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(2rem, 4.2vw, 3.15rem);
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: ${({ theme }) => theme.colors.onAccent};
  margin-bottom: 20px;

  span {
    color: ${({ theme }) => theme.colors.action};
  }
`

const HeroLead = styled.p`
  font-size: clamp(1rem, 1.4vw, 1.125rem);
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.84);
  max-width: 580px;
  margin-bottom: 32px;
`

const HeroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`

const HeroPrimaryBtn = styled(Button)`
  color: ${({ theme }) => theme.colors.onAccent};
`

const HeroGhostBtn = styled(Link)`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 22px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.45);
  }
`

const HeroCard = styled.div`
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const HeroCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
`

const HeroCardLabel = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.72);
`

const LivePill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.positive};
`

const FlowList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`

const FlowItem = styled.div`
  display: grid;
  grid-template-columns: 36px 1fr;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: rgba(255, 255, 255, 0.05);
`

const FlowIcon = styled.div<{ $tone?: 'action' | 'positive' | 'neutral' }>`
  width: 36px;
  height: 36px;
  border-radius: ${({ theme }) => theme.radii.md};
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, $tone }) =>
    $tone === 'action'
      ? theme.colors.action
      : $tone === 'positive'
        ? theme.colors.positive
        : 'rgba(255, 255, 255, 0.14)'};
  color: ${({ theme }) => theme.colors.onAccent};
`

const FlowTitle = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.onAccent};
  margin-bottom: 2px;
`

const FlowDesc = styled.div`
  font-size: 0.8125rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.76);
`

const Section = styled.section<{ $alt?: boolean }>`
  padding: 68px 24px;
  background: ${({ theme, $alt }) => ($alt ? theme.colors.surface : theme.colors.neutral)};
  border-top: 1px solid ${({ theme }) => theme.colors.border};

  @media (max-width: 768px) {
    padding: 48px 20px;
  }
`

const Container = styled.div`
  max-width: 1160px;
  margin: 0 auto;
`

const SectionHeader = styled.div`
  max-width: 680px;
  margin-bottom: 40px;
`

const SectionTag = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.colors.action};
  margin-bottom: 10px;
`

const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(1.5rem, 2.8vw, 2.15rem);
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 12px;
`

const SectionSubtitle = styled.p`
  font-size: 1rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 20px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const StepCard = styled.article`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const StepTop = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const StepNum = styled.span`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.muted};
`

const IconBadge = styled.div`
  width: 40px;
  height: 40px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.action};
  display: flex;
  align-items: center;
  justify-content: center;
`

const CardTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const CardText = styled.p`
  font-size: 0.9375rem;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.muted};
`

const TabsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 28px;
`

const TabButton = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.action : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.action : theme.colors.neutral)};
  color: ${({ theme, $active }) => ($active ? theme.colors.onAccent : theme.colors.text)};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.action};
  }
`

const AudiencePanel = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 32px;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.35fr);
  gap: 32px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    padding: 24px 20px;
  }
`

const AudienceIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`

const AudienceHeadline = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(1.25rem, 2.2vw, 1.625rem);
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.25;
  color: ${({ theme }) => theme.colors.text};
`

const AudienceSummary = styled.p`
  font-size: 0.9375rem;
  line-height: 1.6;
  color: ${({ theme }) => theme.colors.muted};
`

const AudienceActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
`

const FeaturesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`

const FeatureCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const InlineLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 6px;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.action};

  &:hover {
    text-decoration: underline;
  }
`

const ExternalInlineLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 6px;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.action};

  &:hover {
    text-decoration: underline;
  }
`

const GlossaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`

const GlossaryItem = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 18px 20px;
`

const GlossaryTerm = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const GlossaryMeaning = styled.p`
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`

const TrustGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`

const TrustCard = styled.article`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const TrustHead = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const MobileStrip = styled.div`
  margin-top: 28px;
  padding: 22px 24px;
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
`

const MobileStripInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  max-width: 680px;
`

const CtaBand = styled.section`
  padding: 64px 24px;
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onAccent};

  @media (max-width: 768px) {
    padding: 48px 20px;
  }
`

const CtaInner = styled.div`
  max-width: 1160px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  flex-wrap: wrap;
`

const CtaCopy = styled.div`
  max-width: 620px;
`

const CtaTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(1.5rem, 2.8vw, 2.15rem);
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  line-height: 1.2;
  color: ${({ theme }) => theme.colors.onAccent};
  margin-bottom: 10px;
`

const CtaText = styled.p`
  font-size: 1rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.8);
`

const CtaActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`

const TAB_ICONS: Record<AudienceKey, typeof UsersThree> = {
  cidadaos: UsersThree,
  politicos: Scales,
  entidades: Buildings,
  empresas: Storefront,
  imprensa: Newspaper,
  institutos: ChartBar,
}

export function Sobre() {
  const [activeTab, setActiveTab] = useState<AudienceKey>('cidadaos')
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    const prevTitle = document.title
    document.title = 'Sobre o Votz — Infraestrutura de Accountability Cívico'
    return () => {
      document.title = prevTitle
    }
  }, [])

  const currentAudience = AUDIENCES.find((a) => a.key === activeTab) ?? AUDIENCES[0]

  return (
    <Page>
      <Navbar />

      <Main>
        <Hero>
          <HeroInner>
            <div>
              <Eyebrow>
                <EyebrowDot aria-hidden="true" />
                Dados abertos · Sem partido · Pelo Brasil
              </Eyebrow>
              <HeroTitle>
                Reclamação vira registro. Registro vira <span>pressão</span>. Pressão vira ação.
              </HeroTitle>
              <HeroLead>
                O Votz é a plataforma brasileira de accountability cívico que conecta cidadãos,
                entidades públicas, políticos, empresas, imprensa e institutos de pesquisa em torno
                de problemas reais — com histórico público e imutável.
              </HeroLead>
              <HeroActions>
                <HeroPrimaryBtn variant="action" size="lg" as={Link as any} to="/novo">
                  + Criar um relato
                </HeroPrimaryBtn>
                <HeroGhostBtn to="/">
                  Explorar relatos
                  <ArrowRight size={18} weight="bold" aria-hidden="true" />
                </HeroGhostBtn>
                <HeroGhostBtn to="/planos">Para organizações</HeroGhostBtn>
              </HeroActions>
            </div>

            <HeroCard aria-label="Resumo do funcionamento do Votz">
              <HeroCardHeader>
                <HeroCardLabel>Ciclo público no Votz</HeroCardLabel>
                <LivePill>
                  <CheckCircle size={15} weight="fill" aria-hidden="true" />
                  100% auditável
                </LivePill>
              </HeroCardHeader>
              <FlowList>
                <FlowItem>
                  <FlowIcon $tone="action">
                    <MapPin size={18} weight="bold" aria-hidden="true" />
                  </FlowIcon>
                  <div>
                    <FlowTitle>Problema registrado no mapa</FlowTitle>
                    <FlowDesc>
                      Foto, vídeo, categoria e endereço — com opção de anonimato protegido.
                    </FlowDesc>
                  </div>
                </FlowItem>
                <FlowItem>
                  <FlowIcon $tone="neutral">
                    <WarningCircle size={18} weight="bold" aria-hidden="true" />
                  </FlowIcon>
                  <div>
                    <FlowTitle>Pressão coletiva e alertas de Surto</FlowTitle>
                    <FlowDesc>
                      Apoios, relatos parecidos e tempo sem resposta sobem a urgência automaticamente.
                    </FlowDesc>
                  </div>
                </FlowItem>
                <FlowItem>
                  <FlowIcon $tone="neutral">
                    <ClockCounterClockwise size={18} weight="bold" aria-hidden="true" />
                  </FlowIcon>
                  <div>
                    <FlowTitle>Memória que ninguém apaga</FlowTitle>
                    <FlowDesc>
                      Cada resposta, prazo, avocação ou contestação entra na linha do tempo pública.
                    </FlowDesc>
                  </div>
                </FlowItem>
                <FlowItem>
                  <FlowIcon $tone="positive">
                    <CheckCircle size={18} weight="bold" aria-hidden="true" />
                  </FlowIcon>
                  <div>
                    <FlowTitle>Solução confirmada por quem cobrou</FlowTitle>
                    <FlowDesc>
                      Se o problema continuar lá, o cidadão contesta e o relato volta a cobrar ação.
                    </FlowDesc>
                  </div>
                </FlowItem>
              </FlowList>
            </HeroCard>
          </HeroInner>
        </Hero>

        <Section>
          <Container>
            <SectionHeader>
              <SectionTag>Como funciona</SectionTag>
              <SectionTitle>Do problema na rua até a cobrança que dá resultado</SectionTitle>
              <SectionSubtitle>
                Sem burocracia e sem juridiquês. Tudo acontece às claras, com regras iguais para
                todo mundo.
              </SectionSubtitle>
            </SectionHeader>

            <StepsGrid>
              {CYCLE_STEPS.map((step) => {
                const Icon = step.icon
                return (
                  <StepCard key={step.num}>
                    <StepTop>
                      <IconBadge>
                        <Icon size={20} weight="bold" aria-hidden="true" />
                      </IconBadge>
                      <StepNum>{step.num}</StepNum>
                    </StepTop>
                    <CardTitle>{step.title}</CardTitle>
                    <CardText>{step.text}</CardText>
                  </StepCard>
                )
              })}
            </StepsGrid>
          </Container>
        </Section>

        <Section $alt id="perfis">
          <Container>
            <SectionHeader>
              <SectionTag>Para quem é o Votz</SectionTag>
              <SectionTitle>Um ecossistema completo para cada papel na sociedade</SectionTitle>
              <SectionSubtitle>
                Escolha um perfil abaixo para ver tudo o que a plataforma disponibiliza hoje.
              </SectionSubtitle>
            </SectionHeader>

            <TabsRow role="tablist" aria-label="Perfis atendidos pelo Votz">
              {AUDIENCES.map((aud) => {
                const Icon = TAB_ICONS[aud.key]
                const active = aud.key === activeTab
                return (
                  <TabButton
                    key={aud.key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    $active={active}
                    onClick={() => setActiveTab(aud.key)}
                  >
                    <Icon size={17} weight={active ? 'bold' : 'regular'} aria-hidden="true" />
                    {aud.label}
                  </TabButton>
                )
              })}
            </TabsRow>

            <AudiencePanel role="tabpanel">
              <AudienceIntro>
                <SectionTag style={{ marginBottom: 0 }}>{currentAudience.label}</SectionTag>
                <AudienceHeadline>{currentAudience.headline}</AudienceHeadline>
                <AudienceSummary>{currentAudience.summary}</AudienceSummary>
                <AudienceActions>
                  <Button variant="action" size="md" as={Link as any} to={currentAudience.ctaTo}>
                    {currentAudience.ctaLabel}
                  </Button>
                  {currentAudience.secondaryTo && currentAudience.secondaryLabel && (
                    <Button
                      variant="outline"
                      size="md"
                      as={Link as any}
                      to={currentAudience.secondaryTo}
                    >
                      {currentAudience.secondaryLabel}
                    </Button>
                  )}
                </AudienceActions>
              </AudienceIntro>

              <FeaturesGrid>
                {currentAudience.features.map((feat) => (
                  <FeatureCard key={feat.title}>
                    <CardTitle>{feat.title}</CardTitle>
                    <CardText>{feat.description}</CardText>
                    {feat.to && feat.linkLabel && (
                      <InlineLink to={feat.to}>
                        {feat.linkLabel}
                        <ArrowRight size={15} weight="bold" aria-hidden="true" />
                      </InlineLink>
                    )}
                  </FeatureCard>
                ))}
              </FeaturesGrid>
            </AudiencePanel>
          </Container>
        </Section>

        <Section>
          <Container>
            <SectionHeader>
              <SectionTag>Vocabulário do Votz</SectionTag>
              <SectionTitle>Cada palavra aqui tem um papel claro</SectionTitle>
              <SectionSubtitle>
                O Votz não é uma rede de entretenimento. Os termos refletem o que realmente acontece
                na cobrança pública.
              </SectionSubtitle>
            </SectionHeader>

            <GlossaryGrid>
              {GLOSSARY.map((item) => (
                <GlossaryItem key={item.term}>
                  <GlossaryTerm>{item.term}</GlossaryTerm>
                  <GlossaryMeaning>{item.meaning}</GlossaryMeaning>
                </GlossaryItem>
              ))}
            </GlossaryGrid>
          </Container>
        </Section>

        <Section $alt>
          <Container>
            <SectionHeader>
              <SectionTag>Confiança e segurança</SectionTag>
              <SectionTitle>Transparência no que é público. Proteção no que é seu.</SectionTitle>
              <SectionSubtitle>
                Construído desde o primeiro dia com segurança, privacidade e auditabilidade como
                regra — não como detalhe.
              </SectionSubtitle>
            </SectionHeader>

            <TrustGrid>
              {TRUST_PILLARS.map((pillar) => {
                const Icon = pillar.icon
                return (
                  <TrustCard key={pillar.title}>
                    <TrustHead>
                      <IconBadge>
                        <Icon size={20} weight="bold" aria-hidden="true" />
                      </IconBadge>
                      <CardTitle>{pillar.title}</CardTitle>
                    </TrustHead>
                    <CardText>{pillar.description}</CardText>
                    {pillar.linkTo && (
                      <InlineLink to={pillar.linkTo}>
                        {pillar.linkLabel}
                        <ArrowRight size={15} weight="bold" aria-hidden="true" />
                      </InlineLink>
                    )}
                    {pillar.href && (
                      <ExternalInlineLink href={pillar.href} target="_blank" rel="noreferrer">
                        {pillar.linkLabel}
                        <ArrowRight size={15} weight="bold" aria-hidden="true" />
                      </ExternalInlineLink>
                    )}
                  </TrustCard>
                )
              })}
            </TrustGrid>

            <MobileStrip>
              <MobileStripInfo>
                <IconBadge>
                  <DeviceMobile size={20} weight="bold" aria-hidden="true" />
                </IconBadge>
                <div>
                  <CardTitle>No computador e no celular</CardTitle>
                  <CardText>
                    Use o Votz pelo navegador ou pelo aplicativo mobile — com notificações em tempo
                    real, debates ao vivo, mapa e conversas criptografadas sincronizadas.
                  </CardText>
                </div>
              </MobileStripInfo>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Button variant="ghost" size="sm" as={Link as any} to="/contexto">
                  <ClipboardText size={16} aria-hidden="true" />
                  Contexto da Comunidade
                </Button>
                <Button variant="ghost" size="sm" as={Link as any} to="/debates">
                  <Broadcast size={16} aria-hidden="true" />
                  Debates
                </Button>
                <Button variant="ghost" size="sm" as={Link as any} to="/conversas">
                  <ChatCircleDots size={16} aria-hidden="true" />
                  Conversas
                </Button>
              </div>
            </MobileStrip>
          </Container>
        </Section>

        <CtaBand>
          <CtaInner>
            <CtaCopy>
              <CtaTitle>Pronto para colocar luz no que precisa mudar?</CtaTitle>
              <CtaText>
                Crie sua conta gratuita como cidadão ou solicite o cadastro oficial da sua entidade,
                mandato ou empresa.
              </CtaText>
            </CtaCopy>
            <CtaActions>
              <HeroPrimaryBtn
                variant="action"
                size="lg"
                as={Link as any}
                to={user ? '/novo' : '/cadastro'}
              >
                {user ? '+ Criar um relato' : 'Criar conta grátis'}
              </HeroPrimaryBtn>
              <HeroGhostBtn to="/solicitar-cadastro">Registrar organização</HeroGhostBtn>
            </CtaActions>
          </CtaInner>
        </CtaBand>
      </Main>
    </Page>
  )
}
