import styled, { keyframes } from 'styled-components'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { useSurto } from '../hooks/useAlerts'
import type { SurtoReport } from '../hooks/useAlerts'
import { Category } from '@votz/shared-types'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CAT_LABELS: Record<Category, string> = {
  HEALTH: 'Saúde', MOBILITY: 'Mobilidade', SAFETY: 'Segurança',
  EDUCATION: 'Educação', SANITATION: 'Saneamento', HOUSING: 'Habitação',
  ENVIRONMENT: 'Meio Ambiente', INFRASTRUCTURE: 'Infraestrutura',
  URBAN_SERVICES: 'Serviços Urbanos', CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade', SOCIAL_WELFARE: 'Assistência Social',
  OTHER: 'Outra',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (h < 1) return 'agora'
  if (h < 24) return `há ${h}h`
  if (d === 1) return 'há 1 dia'
  return `há ${d} dias`
}

const blink = keyframes`
  0%,100% { opacity: 1; }
  50%      { opacity: .5; }
`
const skelPulse = keyframes`
  0%,100% { opacity: 1; }
  50%      { opacity: .4; }
`

// ─── Styled ───────────────────────────────────────────────────────────────────
const Page = styled.div`
  min-height: 100vh;
  background: #FAFAF7;
`
const Content = styled.div`
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 32px 64px;
  @media (max-width: 640px) { padding: 16px 16px 48px; }
`
const Back = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.875rem;
  color: #6B6B7A;
  margin-bottom: 24px;
  &:hover { color: #0D0D0D; }
`
const Hero = styled.div`
  background: #0D0D0D;
  color: #fff;
  border-radius: 14px;
  padding: 28px 32px;
  margin-bottom: 28px;
  position: relative;
  overflow: hidden;
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 0% 60%, rgba(230,57,70,.35), transparent 55%);
    pointer-events: none;
  }
  > * { position: relative; }
`
const HeroTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #fff;
  background: #E63946;
  padding: 5px 10px;
  border-radius: 5px;
  margin-bottom: 16px;
  animation: ${blink} 2.4s infinite;
`
const HeroTitle = styled.h1`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 8px;
`
const HeroMeta = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  color: rgba(255,255,255,.55);
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
`
const StatsRow = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
  flex-wrap: wrap;
`
const Stat = styled.div`
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 8px;
  padding: 12px 20px;
  text-align: center;
`
const StatNum = styled.div`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #fff;
  line-height: 1;
  margin-bottom: 4px;
`
const StatLabel = styled.div`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 10px;
  color: rgba(255,255,255,.45);
  text-transform: uppercase;
  letter-spacing: 0.06em;
`
const EntityBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  background: #DCFCE7;
  border: 1px solid #86EFAC;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 28px;
  font-size: 13.5px;
  color: #14532D;
  b { font-weight: 600; }
`
const EntityPending = styled(EntityBanner)`
  background: #FEF3C7;
  border-color: #FCD34D;
  color: #78350F;
`
const SectionTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #0D0D0D;
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  .ct {
    font-family: ${({ theme }) => theme.fonts.mono};
    font-size: 12px;
    color: #6B6B7A;
    font-weight: 400;
  }
`
const ReportList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`
const ReportCard = styled.article`
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 10px;
  padding: 16px 20px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  &:hover { border-color: #0D0D0D; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
`
const ReportTitle = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 15px;
  font-weight: 600;
  color: #0D0D0D;
  margin-bottom: 6px;
  line-height: 1.3;
`
const ReportDesc = styled.p`
  font-size: 13px;
  color: #6B6B7A;
  line-height: 1.5;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`
const ReportFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: #9494A0;
  flex-wrap: wrap;
`
const ReportDot = styled.span`
  width: 3px; height: 3px;
  border-radius: 50%;
  background: #C4C4CC;
`
const RespondedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #DCFCE7;
  color: #14532D;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 7px;
  border-radius: 4px;
  margin-left: auto;
`
const Skeleton = styled.div`
  background: #fff;
  border: 1px solid #E5E5E0;
  border-radius: 10px;
  height: 90px;
  animation: ${skelPulse} 1.5s ease-in-out infinite;
`
const Empty = styled.div`
  text-align: center;
  padding: 48px 24px;
  color: #6B6B7A;
  font-size: 14px;
`

// ─── ReportRow ────────────────────────────────────────────────────────────────
function ReportRow({ report }: { report: SurtoReport }) {
  const navigate = useNavigate()
  return (
    <ReportCard onClick={() => navigate(`/relatos/${report.id}`)}>
      <ReportTitle>{report.title}</ReportTitle>
      <ReportDesc>{report.description}</ReportDesc>
      <ReportFooter>
        <span>{timeAgo(report.createdAt)}</span>
        {report.neighborhood && (
          <>
            <ReportDot />
            <span>{report.neighborhood}</span>
          </>
        )}
        <ReportDot />
        <span>Pressão <b style={{ color: '#0D0D0D' }}>{report.pressureScore.toFixed(1)}</b></span>
        <ReportDot />
        <span>{report._count.votes} apoios · {report._count.comments} comentários</span>
        {report.entityResponded && (
          <RespondedBadge>✓ Respondido</RespondedBadge>
        )}
      </ReportFooter>
    </ReportCard>
  )
}

// ─── SurtoDetail ──────────────────────────────────────────────────────────────
export function SurtoDetail() {
  const { id } = useParams<{ id: string }>()
  const { data: surto, isLoading } = useSurto(id!)

  return (
    <Page>
      <Navbar />
      <Content>
        <Back to="/">← Voltar ao feed</Back>

        {isLoading && (
          <>
            <div style={{ background: '#0D0D0D', borderRadius: 14, height: 200, marginBottom: 28, animation: `${skelPulse} 1.5s ease-in-out infinite` }} />
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} style={{ marginBottom: 10 }} />)}
          </>
        )}

        {!isLoading && !surto && (
          <Empty>Surto não encontrado ou já encerrado.</Empty>
        )}

        {surto && (
          <>
            <Hero>
              <HeroTag>⚡ Surto ativo</HeroTag>
              <HeroTitle>
                {CAT_LABELS[surto.category as Category] ?? surto.category} em {surto.city}
                {surto.state ? ` · ${surto.state}` : ''}
              </HeroTitle>
              <HeroMeta>
                <span>Detectado {timeAgo(surto.detectedAt)}</span>
                <span>·</span>
                <span>Última atualização {timeAgo(surto.updatedAt)}</span>
              </HeroMeta>
              <StatsRow>
                <Stat>
                  <StatNum>{surto.count}</StatNum>
                  <StatLabel>Relatos em 24h</StatLabel>
                </Stat>
                <Stat>
                  <StatNum>{surto.reports.filter((r) => r.entityResponded).length}</StatNum>
                  <StatLabel>Com resposta</StatLabel>
                </Stat>
                <Stat>
                  <StatNum>
                    {surto.reports.length > 0
                      ? (surto.reports.reduce((s, r) => s + r.pressureScore, 0) / surto.reports.length).toFixed(1)
                      : '—'}
                  </StatNum>
                  <StatLabel>Pressão média</StatLabel>
                </Stat>
              </StatsRow>
            </Hero>

            {surto.entityResponded ? (
              <EntityBanner>
                ✓ <span><b>Entidade respondeu</b> a pelo menos um relato deste surto.</span>
              </EntityBanner>
            ) : (
              <EntityPending>
                ⏳ <span><b>Aguardando resposta</b> — a entidade responsável foi notificada.</span>
              </EntityPending>
            )}

            <SectionTitle>
              Relatos vinculados
              <span className="ct">{surto.reports.length} encontrados</span>
            </SectionTitle>

            {surto.reports.length === 0 ? (
              <Empty>Nenhum relato vinculado ainda.</Empty>
            ) : (
              <ReportList>
                {surto.reports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))}
              </ReportList>
            )}
          </>
        )}
      </Content>
    </Page>
  )
}
