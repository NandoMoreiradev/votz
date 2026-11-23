import { useState } from 'react'
import styled from 'styled-components'
import {
  AD_AUTO_TOPUP_COPY,
  AD_INVOICE_STATUS_LABELS,
  AD_REFUND_LIMITS,
  AD_REFUND_STATUS_LABELS,
  type AdBillingView,
  type AdInvoiceStatus,
  type AdRefundStatus,
} from '@votz/shared-types'
import { adsErrorMessage, formatBRL, useCancelAdRefund, useRequestAdRefund, useSetAdAutoTopUp } from '../../hooks/useAds'
import { Badge, Card, CardTitle, ErrorMsg, Field, Hint, Input, Label, Mono, PrimaryButton, Row, SecondaryButton } from './ads-ui'

const Item = styled.div`
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:first-of-type { border-top: none; padding-top: 4px; }
`

const Check = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin: 10px 0 14px;
  font-size: 0.875rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  input { margin-top: 4px; }
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
`

type Tone = 'positive' | 'action' | 'muted'
const refundTone = (status: AdRefundStatus): Tone => (status === 'PAID' ? 'positive' : status === 'REQUESTED' ? 'muted' : 'action')
const invoiceTone = (status: AdInvoiceStatus): Tone => (status === 'ISSUED' ? 'positive' : status === 'PENDING' ? 'muted' : 'action')
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const month = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', month: 'long', year: 'numeric' })

/** "50", "50,5" ou "1.250,00" (reais) → centavos. Devolve null se não for um valor. */
function reaisToCents(text: string): number | null {
  const normalized = text.trim().replace(/\./g, '').replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  return Math.round(parseFloat(normalized) * 100)
}
const centsToReais = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

/** Pedir de volta o saldo que sobrou. */
export function RefundSection({ companyId, accountId, billing, canManage }: { companyId: string; accountId: string; billing: AdBillingView; canManage: boolean }) {
  const request = useRequestAdRefund(companyId, accountId)
  const cancel = useCancelAdRefund(companyId, accountId)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const cents = reaisToCents(amount)
  const refundable = billing.refundableCents
  const invalid = amount === '' ? null
    : cents === null ? 'Digite o valor em reais, por exemplo 50,00.'
    : cents > refundable ? `Dá para devolver até ${formatBRL(refundable)} agora.`
    : cents < AD_REFUND_LIMITS.MIN_CENTS && cents !== refundable ? `A devolução mínima é de ${formatBRL(AD_REFUND_LIMITS.MIN_CENTS)}.`
    : null

  return (
    <Card>
      <CardTitle>Devolução de saldo</CardTitle>
      <Hint style={{ marginBottom: 12 }}>
        Sobrou saldo? Você pode pedir de volta o que pagou em recargas. O valor sai do saldo na hora do pedido e o Votz devolve o dinheiro para você.
        Pedir de volta pode pausar suas campanhas se o saldo acabar.
      </Hint>
      {canManage && (
        refundable > 0 ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (cents !== null && !invalid) request.mutate({ amountCents: cents, reason: reason.trim() || undefined }, { onSuccess: () => { setAmount(''); setReason('') } })
            }}
          >
            <Field>
              <Label htmlFor="refund-amount">Quanto quer de volta (em reais)</Label>
              <Input id="refund-amount" inputMode="decimal" value={amount} placeholder={centsToReais(refundable)} onChange={(event) => setAmount(event.target.value)} aria-invalid={!!invalid} />
              <Hint>Dá para devolver até {formatBRL(refundable)} agora.</Hint>
              {invalid && <ErrorMsg role="alert">{invalid}</ErrorMsg>}
            </Field>
            <Field>
              <Label htmlFor="refund-reason">Por que está pedindo (opcional)</Label>
              <Input id="refund-reason" value={reason} maxLength={AD_REFUND_LIMITS.REASON_MAX} onChange={(event) => setReason(event.target.value)} />
            </Field>
            <PrimaryButton type="submit" disabled={request.isPending || cents === null || !!invalid || amount === ''}>{request.isPending ? 'Pedindo…' : 'Pedir devolução'}</PrimaryButton>
            {request.isError && <ErrorMsg role="alert">{adsErrorMessage(request.error)}</ErrorMsg>}
          </form>
        ) : <Hint>Não há saldo para devolver agora.</Hint>
      )}

      {billing.refunds.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {billing.refunds.map((refund) => (
            <Item key={refund.id}>
              <Row style={{ justifyContent: 'space-between' }}>
                <div>
                  <strong><Mono>{formatBRL(refund.amountCents)}</Mono></strong>
                  <Hint>Pedida em {when(refund.requestedAt)}{refund.resolvedAt ? ` · resolvida em ${when(refund.resolvedAt)}` : ''}</Hint>
                  {refund.resolutionNote && <Hint>Motivo: {refund.resolutionNote}</Hint>}
                </div>
                <Badge $tone={refundTone(refund.status)}>{AD_REFUND_STATUS_LABELS[refund.status]}</Badge>
              </Row>
              {canManage && refund.status === 'REQUESTED' && (
                <Row style={{ marginTop: 8 }}>
                  <SecondaryButton type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(refund.id)}>Cancelar pedido (o valor volta ao saldo)</SecondaryButton>
                </Row>
              )}
            </Item>
          ))}
          {cancel.isError && <ErrorMsg role="alert">{adsErrorMessage(cancel.error)}</ErrorMsg>}
        </div>
      )}
    </Card>
  )
}

/** Recarga automática com o cartão salvo. */
export function AutoTopUpSection({ companyId, accountId, billing, canManage }: { companyId: string; accountId: string; billing: AdBillingView; canManage: boolean }) {
  const current = billing.autoTopUp
  const save = useSetAdAutoTopUp(companyId, accountId)
  const [threshold, setThreshold] = useState(centsToReais(current?.thresholdCents ?? 5_000))
  const [amount, setAmount] = useState(centsToReais(current?.amountCents ?? 10_000))
  const [limit, setLimit] = useState(centsToReais(current?.monthlyLimitCents ?? 50_000))
  const [accept, setAccept] = useState(false)
  const thresholdCents = reaisToCents(threshold)
  const amountCents = reaisToCents(amount)
  const limitCents = reaisToCents(limit)
  const ready = thresholdCents !== null && amountCents !== null && limitCents !== null

  return (
    <Card>
      <CardTitle>Recarga automática</CardTitle>
      {!billing.autoTopUpAvailable ? (
        <Hint>A recarga automática ainda não está disponível. Quando o pagamento por cartão estiver ligado, ela aparece aqui.</Hint>
      ) : (
        <>
          <Hint style={{ marginBottom: 12 }}>{AD_AUTO_TOPUP_COPY.CONSENT} {AD_AUTO_TOPUP_COPY.CAP}</Hint>
          {current?.enabled && (
            <Hint style={{ marginBottom: 12 }}>
              <strong>Ligada.</strong> Recarrega {formatBRL(current.amountCents)} quando o saldo ficar abaixo de {formatBRL(current.thresholdCents)}. Neste mês já foram {formatBRL(current.usedThisMonthCents)} de até {formatBRL(current.monthlyLimitCents)}.
            </Hint>
          )}
          {!current?.enabled && current?.stoppedReason && <ErrorMsg role="alert">Desligada: {current.stoppedReason}</ErrorMsg>}
          {canManage && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (ready) save.mutate({ enabled: true, thresholdCents, amountCents, monthlyLimitCents: limitCents, acceptCharges: accept })
              }}
            >
              <Grid>
                <Field>
                  <Label htmlFor="auto-threshold">Recarregar quando o saldo ficar abaixo de (R$)</Label>
                  <Input id="auto-threshold" inputMode="decimal" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
                </Field>
                <Field>
                  <Label htmlFor="auto-amount">Valor de cada recarga (R$)</Label>
                  <Input id="auto-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
                <Field>
                  <Label htmlFor="auto-limit">Teto por mês (R$)</Label>
                  <Input id="auto-limit" inputMode="decimal" value={limit} onChange={(event) => setLimit(event.target.value)} />
                </Field>
              </Grid>
              <Check>
                <input type="checkbox" checked={accept} onChange={(event) => setAccept(event.target.checked)} />
                <span>Aceito que o Votz cobre o meu cartão sozinho, nessas condições, até eu desligar.</span>
              </Check>
              <Row>
                <PrimaryButton type="submit" disabled={save.isPending || !ready || !accept}>{save.isPending ? 'Salvando…' : current?.enabled ? 'Salvar mudanças' : 'Ligar recarga automática'}</PrimaryButton>
                {current?.enabled && (
                  <SecondaryButton
                    type="button"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ enabled: false, thresholdCents: current.thresholdCents, amountCents: current.amountCents, monthlyLimitCents: current.monthlyLimitCents })}
                  >
                    Desligar
                  </SecondaryButton>
                )}
              </Row>
              {save.isError && <ErrorMsg role="alert">{adsErrorMessage(save.error)}</ErrorMsg>}
            </form>
          )}
        </>
      )}
    </Card>
  )
}

/** Notas fiscais mensais do gasto com anúncios. */
export function InvoicesSection({ billing }: { billing: AdBillingView }) {
  return (
    <Card>
      <CardTitle>Notas fiscais</CardTitle>
      <Hint style={{ marginBottom: 8 }}>A nota de cada mês sai no começo do mês seguinte, com o valor que foi gasto em anúncios. Recarga de saldo não gera nota: o serviço só conta quando os anúncios gastam.</Hint>
      {billing.invoices.length === 0 ? <Hint>Ainda não há notas. A primeira sai depois do primeiro mês com gasto.</Hint> : (
        billing.invoices.map((invoice) => (
          <Item key={invoice.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <div>
                <strong style={{ textTransform: 'capitalize' }}>{month(invoice.periodStart)}</strong> · <Mono>{formatBRL(invoice.amountCents)}</Mono>
                <Hint>
                  Gasto de {day(invoice.periodStart)} a {day(invoice.periodEnd)}
                  {invoice.number ? ` · nota nº ${invoice.number}` : ''}
                  {invoice.issuedAt ? ` · emitida em ${when(invoice.issuedAt)}` : ''}
                </Hint>
                {(invoice.pdfUrl || invoice.xmlUrl) && (
                  <Hint>
                    {invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">Baixar PDF</a>}
                    {invoice.pdfUrl && invoice.xmlUrl ? ' · ' : ''}
                    {invoice.xmlUrl && <a href={invoice.xmlUrl} target="_blank" rel="noopener noreferrer">Baixar XML</a>}
                  </Hint>
                )}
                {invoice.status === 'FAILED' && <Hint>Não conseguimos emitir esta nota. Fale com o suporte do Votz.</Hint>}
              </div>
              <Badge $tone={invoiceTone(invoice.status)}>{AD_INVOICE_STATUS_LABELS[invoice.status]}</Badge>
            </Row>
          </Item>
        ))
      )}
    </Card>
  )
}
