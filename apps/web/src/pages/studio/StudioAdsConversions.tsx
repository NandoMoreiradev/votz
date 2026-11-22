import { useState } from 'react'
import styled from 'styled-components'
import { AD_ATTRIBUTION_WINDOW_DAYS, AD_CONVERSIONS, type AdConversionKeyCreated, type AdConversionKeyView } from '@votz/shared-types'
import { useAuthStore } from '../../store/auth.store'
import {
  adsErrorMessage,
  conversionsEndpoint,
  useAdAccounts,
  useAdConversionKeys,
  useCreateAdConversionKey,
  useRevokeAdConversionKey,
} from '../../hooks/useAds'
import {
  Badge,
  Card,
  CardTitle,
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

const Steps = styled.ol`
  margin: 8px 0 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  line-height: 1.5;
`

const SecretBox = styled.div`
  margin-top: 12px;
  padding: 14px;
  border: 2px solid ${({ theme }) => theme.colors.positive};
  border-radius: ${({ theme }) => theme.radii.lg};
  background: ${({ theme }) => theme.colors.white};
`

const Secret = styled.code`
  display: block;
  margin: 8px 0;
  padding: 10px 12px;
  overflow-wrap: anywhere;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.875rem;
`

const Code = styled.pre`
  margin: 8px 0 0;
  padding: 12px;
  overflow-x: auto;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.8125rem;
  line-height: 1.5;
`

const KeyRow = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  padding: 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:first-child { border-top: 0; }
`

const KeyList = styled.ul`
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
`

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null)

function exampleRequest(endpoint: string): string {
  return [
    `curl -X POST ${endpoint} \\`,
    `  -H "x-api-key: SUA_CHAVE" \\`,
    `  -H "content-type: application/json" \\`,
    `  -d '{"events":[{`,
    `    "clickId": "O_CODIGO_QUE_VEIO_NO_LINK",`,
    `    "eventName": "PURCHASE",`,
    `    "valueCents": 4990,`,
    `    "occurredAt": "2026-11-22T15:00:00Z",`,
    `    "dedupeKey": "pedido-1234"`,
    `  }]}'`,
  ].join('\n')
}

function KeyItem({ item, canManage, busy, onRevoke }: { item: AdConversionKeyView; canManage: boolean; busy: boolean; onRevoke: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const revoked = !!item.revokedAt
  return (
    <KeyRow>
      <div>
        <strong>{item.name}</strong> <Mono>{item.prefix}…</Mono> {revoked ? <Badge $tone="muted">Revogada</Badge> : <Badge $tone="positive">Ativa</Badge>}
        <Hint style={{ margin: '2px 0 0' }}>
          Criada em {when(item.createdAt)} · {item.lastUsedAt ? `usada pela última vez em ${when(item.lastUsedAt)}` : 'ainda não foi usada'}
          {revoked ? ` · revogada em ${when(item.revokedAt)}` : ''}
        </Hint>
      </div>
      {canManage && !revoked && (
        confirming ? (
          <Row>
            <SecondaryButton type="button" disabled={busy} onClick={() => setConfirming(false)}>Voltar</SecondaryButton>
            <PrimaryButton type="button" disabled={busy} onClick={onRevoke}>Sim, revogar</PrimaryButton>
          </Row>
        ) : (
          <SecondaryButton type="button" onClick={() => setConfirming(true)}>Revogar</SecondaryButton>
        )
      )}
    </KeyRow>
  )
}

function Keys({ companyId, accountId, canManage }: { companyId: string; accountId: string; canManage: boolean }) {
  const keys = useAdConversionKeys(companyId, accountId)
  const create = useCreateAdConversionKey(companyId, accountId)
  const revoke = useRevokeAdConversionKey(companyId, accountId)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<AdConversionKeyCreated | null>(null)
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null)

  const submit = () => {
    setCopied(null)
    create.mutate(name.trim(), {
      onSuccess: (data) => {
        setCreated(data)
        setName('')
      },
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created?.key ?? '')
      setCopied('ok')
    } catch {
      setCopied('fail')
    }
  }

  const nameOk = name.trim().length >= 2

  return (
    <>
      <Card>
        <CardTitle>Chaves</CardTitle>
        <Hint>
          A chave é a senha que mostra ao Votz que a conversão vem de você. Guarde no servidor da sua loja, nunca no site que as pessoas abrem.
          Cada conta pode ter até {AD_CONVERSIONS.MAX_ACTIVE_KEYS} chaves ativas.
        </Hint>

        {canManage && (
          <Row style={{ marginTop: 12, alignItems: 'flex-end' }}>
            <Field style={{ marginBottom: 0, flex: '1 1 220px' }}>
              <Label htmlFor="key-name">Nome da chave</Label>
              <Input id="key-name" value={name} maxLength={60} placeholder="Ex.: Loja virtual" onChange={(event) => setName(event.target.value)} />
            </Field>
            <PrimaryButton type="button" disabled={!nameOk || create.isPending} onClick={submit}>{create.isPending ? 'Criando…' : 'Criar chave'}</PrimaryButton>
          </Row>
        )}
        {create.isError && <ErrorMsg role="alert">{adsErrorMessage(create.error)}</ErrorMsg>}

        {created && (
          <SecretBox role="status">
            <strong>Chave criada: {created.name}</strong>
            <Hint style={{ margin: '4px 0 0' }}>Copie e guarde agora. Por segurança, ela não aparece de novo. Se perder, revogue e crie outra.</Hint>
            <Secret data-testid="new-conversion-key">{created.key}</Secret>
            <Row>
              <SecondaryButton type="button" onClick={copy}>Copiar chave</SecondaryButton>
              <SecondaryButton type="button" onClick={() => { setCreated(null); setCopied(null) }}>Já guardei</SecondaryButton>
              {copied === 'ok' && <Hint style={{ margin: 0 }}>Copiada.</Hint>}
              {copied === 'fail' && <Hint style={{ margin: 0 }}>Não consegui copiar sozinho. Selecione o texto e copie.</Hint>}
            </Row>
          </SecretBox>
        )}

        {keys.isError ? <ErrorMsg role="alert">{adsErrorMessage(keys.error)}</ErrorMsg>
          : keys.isLoading ? <Hint style={{ marginTop: 12 }}>Carregando…</Hint>
          : !keys.data?.length ? <Hint style={{ marginTop: 12 }}>Nenhuma chave ainda.</Hint>
          : (
            <KeyList>
              {keys.data.map((item) => (
                <KeyItem key={item.id} item={item} canManage={canManage} busy={revoke.isPending} onRevoke={() => revoke.mutate(item.id)} />
              ))}
            </KeyList>
          )}
        {revoke.isError && <ErrorMsg role="alert">{adsErrorMessage(revoke.error)}</ErrorMsg>}
      </Card>
    </>
  )
}

export function StudioAdsConversions() {
  const activeContext = useAuthStore((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : ''
  const canManage = !!activeContext?.permissions.includes('MANAGE_ADS')
  const canView = canManage || !!activeContext?.permissions.includes('VIEW_ADS')
  const accounts = useAdAccounts(canView ? companyId : '')
  const [chosen, setChosen] = useState<string>()
  const accountId = chosen ?? accounts.data?.[0]?.id

  if (!activeContext || activeContext.type !== 'COMPANY') {
    return <Card><CardTitle>Conversões é para empresas</CardTitle><Hint>Troque para o perfil de uma empresa para ligar as conversões dos seus anúncios.</Hint></Card>
  }
  if (!canView) {
    return <Card><CardTitle>Sem acesso às conversões</CardTitle><Hint>Peça a quem administra a empresa a permissão de ver anúncios em Equipe e acesso.</Hint></Card>
  }

  return (
    <>
      <Head>
        <div>
          <Title>Conversões</Title>
          <Sub>Veja quantas compras e contatos vieram dos seus anúncios, sem rastrear ninguém.</Sub>
        </div>
      </Head>

      <Card>
        <CardTitle>Como funciona</CardTitle>
        <Steps>
          <li>Quando alguém toca no botão do seu anúncio, o Votz leva essa pessoa ao seu site com um código no endereço: <Mono>votz_click_id</Mono>.</li>
          <li>Seu site guarda esse código. Se a pessoa comprar ou chamar você, ele vem junto.</li>
          <li>Seu sistema manda ao Votz: o código, o que aconteceu, o valor e a hora. Vale até {AD_ATTRIBUTION_WINDOW_DAYS} dias depois do clique.</li>
        </Steps>
        <Hint style={{ marginTop: 10 }}>O Votz nunca conta ao anunciante quem clicou. O código não mostra nome, e-mail nem nada da pessoa, e você também não manda nada dela.</Hint>
      </Card>

      {accounts.isLoading ? <Hint>Carregando…</Hint>
        : accounts.isError ? <ErrorMsg role="alert">{adsErrorMessage(accounts.error)}</ErrorMsg>
        : !accounts.data?.length ? <Card><CardTitle>Nenhuma conta de anúncios</CardTitle><Hint>Crie a conta em Anúncios › Campanhas para ligar as conversões.</Hint></Card>
        : (
          <>
            {accounts.data.length > 1 && (
              <Card>
                <Field style={{ marginBottom: 0 }}>
                  <Label htmlFor="conv-account">Conta de anúncios</Label>
                  <Select id="conv-account" value={accountId} onChange={(event) => { setChosen(event.target.value) }}>
                    {accounts.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Select>
                </Field>
              </Card>
            )}
            {accountId && <Keys key={accountId} companyId={companyId} accountId={accountId} canManage={canManage} />}
          </>
        )}

      <Card>
        <CardTitle>Como mandar uma conversão</CardTitle>
        <Hint>Até {AD_CONVERSIONS.MAX_BATCH} por chamada. Mandar a mesma de novo (mesmo <Mono>dedupeKey</Mono>) não conta duas vezes. O valor é em centavos e é opcional.</Hint>
        <Code aria-label="Exemplo de chamada">{exampleRequest(conversionsEndpoint())}</Code>
        <Hint style={{ marginTop: 10 }}>
          <Mono>eventName</Mono> aceita PURCHASE (compra), LEAD (contato), SIGNUP (cadastro), CONTACT (conversa) e OTHER.
          A resposta diz o que foi aceito, o que já tinha chegado e o que foi recusado, com o motivo.
        </Hint>
      </Card>
    </>
  )
}
