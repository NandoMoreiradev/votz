import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import {
  PRESS_CONTACT_DECLINE_LABELS,
  PRESS_CONTACT_DECLINE_REASONS,
  PRESS_CONTACT_LIMITS as L,
  PRESS_CONTACT_STATUS_LABELS,
  PRESS_OUTLET_LABELS,
  type PressContactDeclineReason,
  type PressContactReceived,
} from '@votz/shared-types'
import { Navbar } from '../components/layout/Navbar'
import { Button } from '../components/ui/Button'
import { useAuthStore } from '../store/auth.store'
import { apiErrorMessage } from '../hooks/usePressCredential'
import { useReceivedPressContacts, useRespondPressContact } from '../hooks/usePressContacts'
import { SkeletonRows } from '../components/ui/Skeleton'

const Page = styled.div`min-height: 100vh; background: ${({ theme }) => theme.colors.neutral};`
const Content = styled.div`max-width: 760px; margin: 0 auto; padding: 32px 24px 72px; @media (max-width: 640px) { padding: 16px 16px 48px; }`
const H1 = styled.h1`font-family: ${({ theme }) => theme.fonts.heading}; font-size: ${({ theme }) => theme.fontSizes['3xl']}; color: ${({ theme }) => theme.colors.primary}; margin: 0 0 8px;`
const Lead = styled.p`font-size: ${({ theme }) => theme.fontSizes.md}; color: ${({ theme }) => theme.colors.muted}; line-height: 1.6; margin: 0 0 24px; max-width: 620px;`
const Card = styled.section`
  background: ${({ theme }) => theme.colors.surface}; border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg}; padding: 20px 22px; margin-bottom: 14px;
`
const Head = styled.div`display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: baseline;`
const Outlet = styled.div`font-family: ${({ theme }) => theme.fonts.heading}; font-size: ${({ theme }) => theme.fontSizes.lg}; color: ${({ theme }) => theme.colors.primary};`
const Meta = styled.div`font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.muted}; margin-top: 2px; word-break: break-word;`
const Quote = styled.blockquote`
  margin: 14px 0; padding: 10px 14px; border-left: 3px solid ${({ theme }) => theme.colors.action};
  background: ${({ theme }) => theme.colors.neutral}; font-size: ${({ theme }) => theme.fontSizes.md}; line-height: 1.6; white-space: pre-wrap;
`
const Status = styled.span<{ $tone: 'ok' | 'wait' | 'off' }>`
  font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xs}; font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 3px 8px; border-radius: ${({ theme }) => theme.radii.full}; color: #fff;
  background: ${({ theme, $tone }) => ($tone === 'ok' ? theme.colors.positive : $tone === 'wait' ? theme.colors.primary : theme.colors.muted)};
`
const Row = styled.div`display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px;`
const TextArea = styled.textarea`
  width: 100%; min-height: 80px; margin: 8px 0; padding: 10px 12px; font: inherit; font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md}; resize: vertical;
`
const Check = styled.label`display: flex; gap: 8px; align-items: flex-start; font-size: ${({ theme }) => theme.fontSizes.sm}; margin: 6px 0; line-height: 1.5;`
const Msg = styled.p<{ $error?: boolean }>`margin: 8px 0 0; font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme, $error }) => ($error ? theme.colors.action : theme.colors.muted)};`

function SafeLink({ href }: { href: string }) {
  if (!/^https?:\/\//i.test(href)) return <span>{href}</span>
  return <a href={href} target="_blank" rel="noopener noreferrer nofollow">{href}</a>
}

function RequestCard({ item }: { item: PressContactReceived }) {
  const respond = useRespondPressContact()
  const [mode, setMode] = useState<'accept' | 'decline' | null>(null)
  const [reply, setReply] = useState('')
  const [viaChat, setViaChat] = useState(false)
  const [reason, setReason] = useState<PressContactDeclineReason>('NOT_NOW')
  const [block, setBlock] = useState(false)
  const [error, setError] = useState('')
  const pending = item.status === 'PENDING'

  function send() {
    setError('')
    respond.mutate(
      mode === 'accept'
        ? { id: item.id, action: 'accept', reply: reply.trim() || undefined, viaVotzChat: viaChat }
        : { id: item.id, action: 'decline', reason, block: block || reason === 'ABUSIVE' },
      { onSuccess: () => setMode(null), onError: (e) => setError(apiErrorMessage(e, 'Não foi possível responder agora.')) },
    )
  }

  return (
    <Card>
      <Head>
        <div>
          <Outlet>{item.outlet.name}</Outlet>
          <Meta>
            {PRESS_OUTLET_LABELS[item.outlet.type]} · <SafeLink href={item.outlet.website} /> · pedido de {item.journalist.name}, jornalista com credencial verificada
          </Meta>
        </div>
        <Status $tone={item.status === 'ACCEPTED' ? 'ok' : pending ? 'wait' : 'off'}>{PRESS_CONTACT_STATUS_LABELS[item.status]}</Status>
      </Head>
      <Meta>Sobre o seu relato: <Link to={`/relatos/${item.report.id}`}>{item.report.title}</Link> · recebido em {new Date(item.createdAt).toLocaleDateString('pt-BR')}</Meta>
      <Quote>{item.message}</Quote>

      {item.status === 'ACCEPTED' && (
        <Meta>
          Você aceitou{item.reply ? <> e compartilhou: <b>{item.reply}</b></> : ' e não deixou recado'}
          {item.viaVotzChat ? ' · Você disse que prefere as Conversas do Votz' : ''}
        </Meta>
      )}

      {pending && mode === null && (
        <>
          <Msg>Você não é obrigado a responder. O pedido vale até {new Date(item.expiresAt).toLocaleDateString('pt-BR')}. Seu telefone e e-mail não foram passados.</Msg>
          <Row>
            <Button variant="action" size="sm" onClick={() => setMode('accept')}>Aceitar</Button>
            <Button variant="outline" size="sm" onClick={() => setMode('decline')}>Recusar</Button>
          </Row>
        </>
      )}

      {pending && mode === 'accept' && (
        <>
          <Msg>Escreva só o que você quer compartilhar, como o melhor horário ou como prefere ser contatado. <b>Só este jornalista vai ler.</b> Pode deixar em branco.</Msg>
          <TextArea maxLength={L.REPLY_MAX} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ex.: Pode me chamar por aqui à tarde." />
          <Check><input type="checkbox" checked={viaChat} onChange={(e) => setViaChat(e.target.checked)} />Prefiro conversar pelas Conversas do Votz (cifradas)</Check>
          <Row>
            <Button variant="action" size="sm" onClick={send} disabled={respond.isPending}>{respond.isPending ? 'Enviando…' : 'Confirmar e aceitar'}</Button>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)} disabled={respond.isPending}>Voltar</Button>
          </Row>
        </>
      )}

      {pending && mode === 'decline' && (
        <>
          {PRESS_CONTACT_DECLINE_REASONS.map((r) => (
            <Check key={r}>
              <input type="radio" name={`reason-${item.id}`} checked={reason === r} onChange={() => setReason(r)} />
              {PRESS_CONTACT_DECLINE_LABELS[r]}
            </Check>
          ))}
          <Check>
            <input type="checkbox" checked={block || reason === 'ABUSIVE'} disabled={reason === 'ABUSIVE'} onChange={(e) => setBlock(e.target.checked)} />
            Não receber mais pedidos deste jornalista
          </Check>
          <Msg>O jornalista só fica sabendo que você não está disponível. O motivo não é mostrado a ele. Denúncias de abuso são vistas pela moderação.</Msg>
          <Row>
            <Button variant="action" size="sm" onClick={send} disabled={respond.isPending}>{respond.isPending ? 'Enviando…' : 'Confirmar recusa'}</Button>
            <Button variant="ghost" size="sm" onClick={() => setMode(null)} disabled={respond.isPending}>Voltar</Button>
          </Row>
        </>
      )}
      {error && <Msg $error>{error}</Msg>}
    </Card>
  )
}

export function PressContactInbox() {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const { data, isLoading, isError } = useReceivedPressContacts(sessionReady && !!user)
  const rows = data ?? []

  return (
    <Page>
      <Navbar />
      <Content>
        <H1>Pedidos da imprensa</H1>
        <Lead>
          Aqui aparecem os pedidos de jornalistas com credencial verificada que querem falar com você sobre um relato que você marcou
          com "aceito falar com a imprensa". Você escolhe se aceita, e ninguém recebe seu telefone ou e-mail sem você compartilhar.
        </Lead>
        {sessionReady && !user && <Msg>Entre na sua conta para ver os pedidos. <Link to="/login?redirect=/pedidos-da-imprensa">Entrar</Link></Msg>}
        {isLoading && <SkeletonRows rows={3} height={90} />}
        {isError && <Msg $error>Não foi possível carregar os pedidos.</Msg>}
        {user && !isLoading && !isError && rows.length === 0 && <Msg>Você não tem pedidos da imprensa.</Msg>}
        {rows.map((r) => <RequestCard key={r.id} item={r} />)}
      </Content>
    </Page>
  )
}
