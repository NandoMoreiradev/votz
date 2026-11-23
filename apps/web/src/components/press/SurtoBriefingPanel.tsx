import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { REPORT_STATUS_LABELS, getCategoryLabel, type PressBriefing } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import { useSurtoBriefing } from '../../hooks/usePressAi'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ theme }) => theme.colors.action};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-top: 16px;
  @media (max-width: 640px) { padding: 16px; }
`
const Head = styled.div`display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;`
const Tag = styled.span<{ $ai: boolean }>`
  display: inline-block; padding: 3px 8px; border-radius: ${({ theme }) => theme.radii.sm};
  font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xs}; font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: #fff; background: ${({ theme, $ai }) => ($ai ? theme.colors.primary : theme.colors.muted)};
`
const Headline = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading}; font-size: ${({ theme }) => theme.fontSizes.xl};
  color: ${({ theme }) => theme.colors.primary}; margin: 10px 0 8px;
`
const P = styled.p`font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.text}; line-height: 1.7; margin: 0 0 12px;`
const H4 = styled.h4`
  font-family: ${({ theme }) => theme.fonts.heading}; font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.primary}; margin: 18px 0 6px;
`
const List = styled.ul`margin: 0; padding-left: 18px; font-size: ${({ theme }) => theme.fontSizes.sm}; line-height: 1.7; li { margin-bottom: 6px; }`
const Stats = styled.div`
  display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 12px 0;
`
const Stat = styled.div`
  background: ${({ theme }) => theme.colors.neutral}; border-radius: ${({ theme }) => theme.radii.md}; padding: 10px 12px;
  strong { display: block; font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xl}; color: ${({ theme }) => theme.colors.text}; }
  span { font-size: ${({ theme }) => theme.fontSizes.xs}; color: ${({ theme }) => theme.colors.muted}; }
`
const Ref = styled(Link)`font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xs}; margin-right: 6px;`
const Disclaimer = styled.p`
  margin: 16px 0 0; padding: 10px 12px; border-radius: ${({ theme }) => theme.radii.md};
  background: #FEF3C7; color: #92400E; font-size: ${({ theme }) => theme.fontSizes.sm}; line-height: 1.5;
`
const Msg = styled.p<{ $error?: boolean }>`
  margin: 10px 0 0; font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
`

function dateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}

function Numbers({ b }: { b: PressBriefing }) {
  const s = b.stats
  const statusLine = Object.entries(s.byStatus).map(([k, n]) => `${n} ${(REPORT_STATUS_LABELS as Record<string, string>)[k] ?? k}`).join(' · ')
  return (
    <>
      <H4>Números (do banco do Votz)</H4>
      <Stats>
        <Stat><strong>{s.totalReports}</strong><span>relatos no surto</span></Stat>
        <Stat><strong>{s.publicReports}</strong><span>públicos (não anônimos)</span></Stat>
        <Stat><strong>{s.answeredReports}</strong><span>com resposta da entidade</span></Stat>
        <Stat><strong>{s.maxPressure.toLocaleString('pt-BR')}</strong><span>maior pressão (média {s.avgPressure.toLocaleString('pt-BR')})</span></Stat>
      </Stats>
      <P>
        Primeiro relato: {dateTime(s.firstReportAt)} · último: {dateTime(s.lastReportAt)}
        {statusLine ? ` · situação: ${statusLine}` : ''}
        {s.topNeighborhoods.length ? ` · bairros: ${s.topNeighborhoods.map((n) => `${n.name} (${n.count})`).join(', ')}` : ''}
        {s.topEntities.length ? ` · entidades citadas: ${s.topEntities.map((n) => `${n.name} (${n.count})`).join(', ')}` : ''}
      </P>
    </>
  )
}

export function SurtoBriefingPanel({ surtoId, onClose }: { surtoId: string; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useSurtoBriefing(surtoId)

  return (
    <Box>
      <Head>
        <div>
          {data && <Tag $ai={data.aiGenerated}>{data.aiGenerated ? 'Escrito por IA' : 'Só números'}</Tag>}
          {data && <Msg style={{ display: 'inline', marginLeft: 8 }}>{getCategoryLabel(data.stats.category)} · {data.stats.city}/{data.stats.state} · gerado em {dateTime(data.generatedAt)}</Msg>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
      </Head>

      {isLoading && <Msg>Gerando o briefing… na primeira vez pode levar até 30 segundos. Depois ele fica guardado para todo mundo.</Msg>}
      {isError && (
        <>
          <Msg $error>{apiErrorMessage(error, 'Não foi possível gerar o briefing agora.')}</Msg>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} style={{ marginTop: 8 }}>Tentar de novo</Button>
        </>
      )}

      {data && (
        <>
          {data.content ? (
            <>
              <Headline>{data.content.headline}</Headline>
              <P>{data.content.summary}</P>
              {data.content.complaints.length > 0 && (
                <>
                  <H4>O que os moradores relatam</H4>
                  <List>
                    {data.content.complaints.map((c, i) => (
                      <li key={i}>
                        <b>{c.title}.</b> {c.detail}{' '}
                        {c.refs.map((n) => {
                          const ref = data.references.find((r) => r.n === n)
                          return ref ? <Ref key={n} to={`/relatos/${ref.id}`} title={ref.title}>[{n}]</Ref> : null
                        })}
                      </li>
                    ))}
                  </List>
                </>
              )}
              {data.content.questions.length > 0 && (
                <>
                  <H4>Perguntas para a entidade responsável</H4>
                  <List>{data.content.questions.map((q, i) => <li key={i}>{q}</li>)}</List>
                </>
              )}
              {data.content.caveats.length > 0 && (
                <>
                  <H4>Cuidados antes de publicar</H4>
                  <List>{data.content.caveats.map((q, i) => <li key={i}>{q}</li>)}</List>
                </>
              )}
            </>
          ) : (
            <Msg>A IA não respondeu agora, então mostramos só os números e os relatos. Tente de novo em alguns minutos.</Msg>
          )}

          <Numbers b={data} />

          {data.references.length > 0 && (
            <>
              <H4>Relatos usados como fonte</H4>
              <List>
                {data.references.map((r) => (
                  <li key={r.id}>
                    <Ref to={`/relatos/${r.id}`}>[{r.n}]</Ref>
                    <Link to={`/relatos/${r.id}`}>{r.title}</Link>
                  </li>
                ))}
              </List>
            </>
          )}
          <Disclaimer>{data.disclaimer}</Disclaimer>
        </>
      )}
    </Box>
  )
}
