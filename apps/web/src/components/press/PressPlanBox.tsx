import styled from 'styled-components'
import { PRESS_PLAN_LABELS, type PressPlanInfo } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import { usePressBilling } from '../../hooks/usePressTools'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-bottom: 24px;
  @media (max-width: 640px) { padding: 16px; }
`
const Head = styled.div`display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px;`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0;
`
const Tag = styled.span<{ $pro: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 3px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: #fff;
  background: ${({ theme, $pro }) => ($pro ? theme.colors.positive : theme.colors.primary)};
`
const List = styled.ul`
  margin: 0 0 14px;
  padding-left: 18px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.7;
  b { color: ${({ theme }) => theme.colors.text}; }
`
const Hint = styled.p<{ $error?: boolean }>`
  margin: 10px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};
`

export function PressPlanBox({ info }: { info: PressPlanInfo }) {
  const checkout = usePressBilling('checkout')
  const portal = usePressBilling('portal')
  const isPro = info.plan === 'PRO'
  const l = info.limits
  const error = checkout.error ?? portal.error

  return (
    <Box>
      <Head>
        <Title>Seu plano</Title>
        <Tag $pro={isPro}>{PRESS_PLAN_LABELS[info.plan]}</Tag>
      </Head>
      <List>
        <li><b>{l.maxRadarRules}</b> avisos do radar, {l.radarFrequencies.includes('IMMEDIATE') ? 'na hora ou em resumo por dia' : 'em resumo por dia'}</li>
        <li>CSV de até <b>{l.exportMaxDays} dias</b> e <b>{l.exportMaxRows.toLocaleString('pt-BR')}</b> relatos por arquivo{l.richExport ? ', com descrição e destinatário' : ''}</li>
        <li>{l.jsonExport ? 'Exportação em JSON' : <span>Exportação em JSON: <b>só no Pro</b></span>}</li>
        <li>{l.canRequestContact ? 'Pedir contato a quem aceitou falar com a imprensa' : <span>Pedir contato a quem aceitou falar com a imprensa: <b>só no Pro</b></span>}</li>
        <li>{l.timeSeries ? 'Série histórica por semana ou mês' : <span>Série histórica por semana ou mês: <b>só no Pro</b></span>}</li>
      </List>

      {!isPro && info.checkoutAvailable && (
        <Button variant="action" onClick={() => checkout.mutate()} disabled={checkout.isPending}>
          {checkout.isPending ? 'Abrindo…' : 'Assinar o Imprensa Pro'}
        </Button>
      )}
      {!isPro && !info.checkoutAvailable && (
        <Hint>
          O plano Imprensa Pro ainda está em piloto. Para testar, escreva para{' '}
          <a href={`mailto:${info.supportEmail}?subject=${encodeURIComponent('Imprensa Pro no Votz')}`}>{info.supportEmail}</a>.
        </Hint>
      )}
      {isPro && info.hasSubscription && (
        <Button variant="outline" size="sm" onClick={() => portal.mutate()} disabled={portal.isPending}>
          {portal.isPending ? 'Abrindo…' : 'Gerenciar assinatura'}
        </Button>
      )}
      {error && <Hint $error>{apiErrorMessage(error, 'Não foi possível abrir o pagamento agora.')}</Hint>}
    </Box>
  )
}
