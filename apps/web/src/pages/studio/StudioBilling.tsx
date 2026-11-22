import { useState } from 'react'
import styled from 'styled-components'
import {
  AD_LEDGER_TYPE_LABELS,
  AD_TOPUP_METHOD_LABELS,
  AD_TOPUP_STATUS_LABELS,
  type AdBillingView,
  type AdTopUpMethod,
  type AdTopUpStatus,
  type AdTopUpView,
} from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import {
  adsErrorMessage,
  formatBRL,
  useAdAccounts,
  useAdBilling,
  useCancelAdTopUp,
  useConfirmTestTopUp,
  useCreateAdTopUp,
} from '../../hooks/useAds'
import {
  Badge,
  Card,
  CardTitle,
  Chip,
  Chips,
  ErrorMsg,
  Field,
  Head,
  Hint,
  Input,
  Label,
  Mono,
  PrimaryButton,
  Row,
  SecondaryButton,
  Select,
  Sub,
  Title,
} from '../../components/ads/ads-ui'

const Notice = styled.div`
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
`

const Balance = styled.p`
  margin: 4px 0 0;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 2rem;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const Code = styled.code`
  display: block;
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surfaceHover};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
  user-select: all;
`

const TopUpItem = styled.div`
  padding: 14px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:first-of-type { border-top: none; padding-top: 4px; }
`

/** O extrato tem quatro colunas: em tela estreita rola só ele, não a página inteira. */
const ScrollX = styled.div`
  overflow-x: auto;
`

const Statement = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid ${({ theme }) => theme.colors.border}; }
  th { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: ${({ theme }) => theme.colors.muted}; }
  td.num, th.num { text-align: right; white-space: nowrap; }
`

const Amount = styled.span<{ $negative: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ $negative, theme }) => ($negative ? theme.colors.action : theme.colors.positive)};
`

type Tone = 'positive' | 'action' | 'muted'
const statusTone = (status: AdTopUpStatus): Tone => (status === 'PAID' ? 'positive' : status === 'PENDING' ? 'muted' : 'action')
const PRESETS = [5000, 10000, 20000, 50000]
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

/** "50", "50,5" ou "1.250,00" (reais) → centavos. Devolve null se não for um valor. */
function reaisToCents(text: string): number | null {
  const normalized = text.trim().replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(parseFloat(normalized) * 100)
}

/** Estúdio › Anúncios › Faturamento: saldo pré-pago, recarga e extrato. */
export function StudioBilling() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canManage = !!activeContext?.permissions.includes('MANAGE_ADS')
  const canView = canManage || !!activeContext?.permissions.includes('VIEW_ADS')

  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosenAccount, setChosenAccount] = useState<string>()
  const accountId = chosenAccount ?? accounts.data?.[0]?.id
  const billing = useAdBilling(canView ? companyId : '', accountId)

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Card><CardTitle>Faturamento é para empresas</CardTitle><Hint>Troque para o perfil de uma empresa para ver o saldo de anúncios.</Hint></Card>
  }
  if (!canView) {
    return <Card><CardTitle>Sem acesso ao faturamento</CardTitle><Hint>Peça a quem administra a empresa a permissão de ver ou criar anúncios em Equipe e acesso.</Hint></Card>
  }

  return (
    <>
      <Head>
        <div>
          <Title>Faturamento</Title>
          <Sub>Você paga os anúncios com saldo: recarrega antes e o Votz desconta só o que for gasto.</Sub>
        </div>
      </Head>

      {accounts.isLoading ? <Hint>Carregando…</Hint>
        : accounts.isError ? <ErrorMsg role="alert">{adsErrorMessage(accounts.error)}</ErrorMsg>
        : !accounts.data?.length ? <Card><CardTitle>Nenhuma conta de anúncios</CardTitle><Hint>Crie a conta em Anúncios › Campanhas para poder recarregar saldo.</Hint></Card>
        : (
          <>
            {accounts.data.length > 1 && (
              <Card>
                <Field style={{ marginBottom: 0 }}>
                  <Label htmlFor="billing-account">Conta de anúncios</Label>
                  <Select id="billing-account" value={accountId} onChange={(event) => setChosenAccount(event.target.value)}>
                    {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </Field>
              </Card>
            )}
            {billing.isLoading ? <Hint>Carregando saldo…</Hint>
              : billing.isError ? <ErrorMsg role="alert">{adsErrorMessage(billing.error)}</ErrorMsg>
              : billing.data && accountId && <BillingBody companyId={companyId} accountId={accountId} billing={billing.data} canManage={canManage} />}
          </>
        )}
    </>
  )
}

function BillingBody({ companyId, accountId, billing, canManage }: { companyId: string; accountId: string; billing: AdBillingView; canManage: boolean }) {
  const testMode = billing.mode === 'test'
  return (
    <>
      {testMode && (
        <Notice role="note">
          <strong>Modo de teste.</strong> Nenhum dinheiro de verdade é cobrado. Depois de gerar a recarga, use "Simular pagamento" para o saldo entrar.
        </Notice>
      )}
      {!billing.reconciled && (
        <ErrorMsg role="alert">O saldo desta conta não bate com o extrato. Não faça recargas e fale com o suporte do Votz.</ErrorMsg>
      )}

      <Card>
        <Hint>Saldo de {billing.account.name}</Hint>
        <Balance aria-label="Saldo atual">{formatBRL(billing.account.balanceCents)}</Balance>
        <Hint>
          {billing.account.balanceCents > 0
            ? 'Com saldo e um anúncio aprovado, você já pode ligar campanhas.'
            : 'Sem saldo não dá para ligar campanhas. Recarregue abaixo.'}
        </Hint>
      </Card>

      {canManage && <TopUpForm companyId={companyId} accountId={accountId} billing={billing} />}

      <Card>
        <CardTitle>Recargas</CardTitle>
        {billing.topUps.length === 0 ? <Hint>Você ainda não pediu nenhuma recarga.</Hint>
          : billing.topUps.map((topUp) => <TopUpRow key={topUp.id} companyId={companyId} accountId={accountId} topUp={topUp} testMode={testMode} canManage={canManage} />)}
      </Card>

      <Card>
        <CardTitle>Extrato</CardTitle>
        {billing.statement.length === 0 ? <Hint>Nada por aqui ainda. Quando o saldo mudar, aparece neste extrato.</Hint> : (
          <ScrollX>
          <Statement>
            <thead><tr><th>Quando</th><th>O que foi</th><th className="num">Valor</th><th className="num">Saldo depois</th></tr></thead>
            <tbody>
              {billing.statement.map((line) => (
                <tr key={line.id}>
                  <td>{when(line.createdAt)}</td>
                  <td>{AD_LEDGER_TYPE_LABELS[line.type]}<Hint>{line.description}</Hint></td>
                  <td className="num"><Amount $negative={line.amountCents < 0}>{line.amountCents > 0 ? '+' : '−'}{formatBRL(Math.abs(line.amountCents))}</Amount></td>
                  <td className="num"><Mono>{formatBRL(line.balanceAfterCents)}</Mono></td>
                </tr>
              ))}
            </tbody>
          </Statement>
          </ScrollX>
        )}
      </Card>
    </>
  )
}

function TopUpForm({ companyId, accountId, billing }: { companyId: string; accountId: string; billing: AdBillingView }) {
  const [amount, setAmount] = useState('100,00')
  const [method, setMethod] = useState<AdTopUpMethod>(billing.methods[0] ?? 'PIX')
  const create = useCreateAdTopUp(companyId, accountId)
  const cents = reaisToCents(amount)
  const { minTopUpCents, maxTopUpCents } = billing.limits
  const invalid = cents === null ? 'Digite o valor em reais, por exemplo 100,00.'
    : cents < minTopUpCents ? `A recarga mínima é de ${formatBRL(minTopUpCents)}.`
    : cents > maxTopUpCents ? `A recarga máxima por pedido é de ${formatBRL(maxTopUpCents)}.`
    : null

  if (billing.methods.length === 0) {
    return <Card><CardTitle>Recarregar saldo</CardTitle><Hint>As formas de pagamento ainda não estão ligadas. Assim que estiverem, a recarga aparece aqui.</Hint></Card>
  }

  return (
    <Card>
      <CardTitle>Recarregar saldo</CardTitle>
      <Hint style={{ marginBottom: 14 }}>Escolha quanto quer colocar e como vai pagar.</Hint>
      <form onSubmit={(event) => { event.preventDefault(); if (cents !== null && !invalid) create.mutate({ amountCents: cents, method }) }}>
        <Field>
          <Label htmlFor="topup-amount">Valor (em reais)</Label>
          <Input id="topup-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={!!invalid} />
          <Chips style={{ marginTop: 8 }}>
            {PRESETS.map((preset) => (
              <Chip key={preset} type="button" $selected={cents === preset} onClick={() => setAmount((preset / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }))}>
                {formatBRL(preset)}
              </Chip>
            ))}
          </Chips>
          {invalid && <ErrorMsg role="alert">{invalid}</ErrorMsg>}
        </Field>
        <Field>
          <Label htmlFor="topup-method">Forma de pagamento</Label>
          <Select id="topup-method" value={method} onChange={(event) => setMethod(event.target.value as AdTopUpMethod)}>
            {billing.methods.map((item) => <option key={item} value={item}>{AD_TOPUP_METHOD_LABELS[item]}</option>)}
          </Select>
        </Field>
        <PrimaryButton type="submit" disabled={create.isPending || !!invalid}>{create.isPending ? 'Gerando…' : 'Gerar recarga'}</PrimaryButton>
        {create.isError && <ErrorMsg role="alert">{adsErrorMessage(create.error)}</ErrorMsg>}
      </form>
    </Card>
  )
}

function TopUpRow({ companyId, accountId, topUp, testMode, canManage }: { companyId: string; accountId: string; topUp: AdTopUpView; testMode: boolean; canManage: boolean }) {
  const confirm = useConfirmTestTopUp(companyId, accountId)
  const cancel = useCancelAdTopUp(companyId, accountId)
  const pending = topUp.status === 'PENDING'
  return (
    <TopUpItem>
      <Row style={{ justifyContent: 'space-between' }}>
        <div>
          <strong><Mono>{formatBRL(topUp.amountCents)}</Mono></strong> · {AD_TOPUP_METHOD_LABELS[topUp.method]}
          <Hint>Pedida em {when(topUp.createdAt)}{topUp.paidAt ? ` · paga em ${when(topUp.paidAt)}` : ''}</Hint>
        </div>
        <Badge $tone={statusTone(topUp.status)}>{AD_TOPUP_STATUS_LABELS[topUp.status]}</Badge>
      </Row>
      {pending && (
        <>
          {topUp.paymentCode && (
            <>
              <Hint style={{ marginTop: 8 }}>{topUp.method === 'PIX' ? 'Pix copia e cola:' : 'Linha digitável do boleto:'}</Hint>
              <Code>{topUp.paymentCode}</Code>
            </>
          )}
          <Hint>Vale até {when(topUp.expiresAt)}.</Hint>
          {canManage && (
            <Row style={{ marginTop: 10 }}>
              {testMode && <PrimaryButton type="button" disabled={confirm.isPending} onClick={() => confirm.mutate(topUp.id)}>{confirm.isPending ? 'Confirmando…' : 'Simular pagamento (teste)'}</PrimaryButton>}
              <SecondaryButton type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(topUp.id)}>Cancelar recarga</SecondaryButton>
            </Row>
          )}
        </>
      )}
      {confirm.isError && <ErrorMsg role="alert">{adsErrorMessage(confirm.error)}</ErrorMsg>}
      {cancel.isError && <ErrorMsg role="alert">{adsErrorMessage(cancel.error)}</ErrorMsg>}
    </TopUpItem>
  )
}
