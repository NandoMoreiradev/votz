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
import { AutoTopUpSection, InvoicesSection, RefundSection } from '../../components/ads/BillingExtras'
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
import { ClockCountdown, Info, Receipt, Wallet, WarningCircle } from '@phosphor-icons/react'
import { Callout, DataTable, PageHeader, StatCard, StatGrid, StatSkeletons, StudioPage, TableScroll } from '../../components/studio/studio-ui'



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



const BillingGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 0 16px;
  align-items: start;

  @media (max-width: 1180px) { grid-template-columns: minmax(0, 1fr); }
`

const Amount = styled.span<{ $negative: boolean }>`
  font-family: ${({ theme }) => theme.fonts.mono};
  color: ${({ $negative, theme }) => ($negative ? theme.colors.text : theme.colors.positiveText)};
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
    <StudioPage>
      <PageHeader
        crumbs={[{ label: 'Anúncios', to: '/estudio/anuncios' }, { label: 'Faturamento' }]}
        title="Faturamento"
        description="Você paga os anúncios com saldo: recarrega antes e o Votz desconta só o que for gasto."
        actions={accounts.data && accounts.data.length > 1 && (
          <Select aria-label="Conta de anúncios" value={accountId} onChange={(event) => setChosenAccount(event.target.value)} style={{ width: 'auto', minHeight: 36 }}>
            {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        )}
      />

      {accounts.isLoading ? <StatSkeletons count={3} />
        : accounts.isError ? <ErrorMsg role="alert">{adsErrorMessage(accounts.error)}</ErrorMsg>
        : !accounts.data?.length ? <Card><CardTitle>Nenhuma conta de anúncios</CardTitle><Hint>Crie a conta em Anúncios › Campanhas para poder recarregar saldo.</Hint></Card>
        : billing.isLoading ? <StatSkeletons count={3} />
        : billing.isError ? <ErrorMsg role="alert">{adsErrorMessage(billing.error)}</ErrorMsg>
        : billing.data && accountId && <BillingBody companyId={companyId} accountId={accountId} billing={billing.data} canManage={canManage} />}
    </StudioPage>
  )
}

function BillingBody({ companyId, accountId, billing, canManage }: { companyId: string; accountId: string; billing: AdBillingView; canManage: boolean }) {
  const testMode = billing.mode === 'test'
  const spent30 = billing.statement
    .filter((line) => line.type === 'SPEND' && Date.now() - new Date(line.createdAt).getTime() <= 30 * 86_400_000)
    .reduce((sum, line) => sum - line.amountCents, 0)
  const pending = billing.topUps.filter((topUp) => topUp.status === 'PENDING')
  return (
    <>
      {testMode && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="info" icon={Info} role="note">
            <strong>Modo de teste.</strong> Nenhum dinheiro de verdade é cobrado. Depois de gerar a recarga, use “Simular pagamento” para o saldo entrar.
          </Callout>
        </div>
      )}
      {!billing.reconciled && (
        <div style={{ marginBottom: 16 }}>
          <Callout tone="action" icon={WarningCircle} role="alert">O saldo desta conta não bate com o extrato. Não faça recargas e fale com o suporte do Votz.</Callout>
        </div>
      )}

      <StatGrid style={{ marginBottom: 16 }}>
        <StatCard label={`Saldo de ${billing.account.name}`} icon={Wallet} value={<span aria-label="Saldo atual">{formatBRL(billing.account.balanceCents)}</span>} hint={billing.account.balanceCents > 0 ? 'Pronto para rodar campanhas' : 'Sem saldo, as campanhas não rodam'} />
        <StatCard label="Gasto nos últimos 30 dias" icon={Receipt} value={formatBRL(spent30)} hint="pelo extrato" />
        <StatCard label="Recargas esperando pagamento" icon={ClockCountdown} value={String(pending.length)} hint={pending.length ? formatBRL(pending.reduce((sum, t) => sum + t.amountCents, 0)) : 'nenhuma'} />
      </StatGrid>

      <BillingGrid>
        <div>
          <Card>
            <CardTitle>Recargas</CardTitle>
            {billing.topUps.length === 0 ? <Hint>Você ainda não pediu nenhuma recarga.</Hint>
              : billing.topUps.map((topUp) => <TopUpRow key={topUp.id} companyId={companyId} accountId={accountId} topUp={topUp} testMode={testMode} canManage={canManage} />)}
          </Card>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <CardTitle style={{ padding: '16px 18px 0' }}>Extrato</CardTitle>
            {billing.statement.length === 0 ? <Hint style={{ padding: '4px 18px 16px' }}>Nada por aqui ainda. Quando o saldo mudar, aparece neste extrato.</Hint> : (
              <TableScroll style={{ marginTop: 10 }}>
                <DataTable>
                  <thead><tr><th className="left">Quando</th><th className="left">O que foi</th><th>Valor</th><th>Saldo depois</th></tr></thead>
                  <tbody>
                    {billing.statement.map((line) => (
                      <tr key={line.id}>
                        <td className="left dim">{when(line.createdAt)}</td>
                        <td className="left wrap" style={{ minWidth: 180 }}>{AD_LEDGER_TYPE_LABELS[line.type]}<Hint>{line.description}</Hint></td>
                        <td className="num"><Amount $negative={line.amountCents < 0}>{line.amountCents > 0 ? '+' : '−'}{formatBRL(Math.abs(line.amountCents))}</Amount></td>
                        <td className="num">{formatBRL(line.balanceAfterCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableScroll>
            )}
          </Card>
        </div>

        <div>
          {canManage && <TopUpForm companyId={companyId} accountId={accountId} billing={billing} />}
          <AutoTopUpSection key={`auto-${accountId}-${billing.autoTopUp?.consentAt ?? 'off'}-${billing.autoTopUp?.enabled}`} companyId={companyId} accountId={accountId} billing={billing} canManage={canManage} />
          <RefundSection companyId={companyId} accountId={accountId} billing={billing} canManage={canManage} />
          <InvoicesSection billing={billing} />
        </div>
      </BillingGrid>
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
