import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { PRESS_CONTACT_LIMITS as L } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { useAuthStore } from '../../store/auth.store'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import { usePressContactStatus, useRequestPressContact, useSetPressContactOptIn } from '../../hooks/usePressContacts'

const Card = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 16px 18px;
  margin-top: 16px;
`
const Title = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0 0 8px;
`
const Text = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
  margin: 0 0 10px;
`
const Check = styled.label`
  display: flex; gap: 10px; align-items: flex-start; cursor: pointer;
  font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.text}; line-height: 1.5;
  input { margin-top: 3px; }
`
const TextArea = styled.textarea`
  width: 100%; min-height: 96px; margin: 8px 0; padding: 10px 12px; font: inherit; font-size: 0.875rem;
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md}; resize: vertical;
  &:focus { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 0; }
`
const Msg = styled.p<{ $error?: boolean; $ok?: boolean }>`
  margin: 8px 0 0; font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme, $error, $ok }) => ($error ? theme.colors.action : $ok ? theme.colors.positive : theme.colors.muted)};
`
const Row = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`

/**
 * Cartão da lateral do relato: o autor liga ou desliga o "aceito falar com a imprensa"; o jornalista Pro credenciado
 * vê o botão de pedir contato. Para qualquer outra pessoa não aparece nada (e nada do aceite vaza).
 */
export function PressContactCard({ reportId, anonymous }: { reportId: string; anonymous: boolean }) {
  const user = useAuthStore((s) => s.user)
  const sessionReady = useAuthStore((s) => s.sessionReady)
  const { data: status } = usePressContactStatus(reportId, sessionReady && !!user && !anonymous)
  const setOptIn = useSetPressContactOptIn(reportId)
  const request = useRequestPressContact()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  if (anonymous || !user || !status) return null

  if (status.isAuthor) {
    return (
      <Card>
        <Title>Imprensa</Title>
        <Check>
          <input
            type="checkbox" checked={status.optIn} disabled={setOptIn.isPending}
            onChange={(e) => setOptIn.mutate(e.target.checked)}
          />
          <span>
            <b>Aceito falar com a imprensa sobre este relato.</b> Jornalistas com credencial verificada (e plano pago) podem
            pedir contato. Você decide se aceita ou recusa, e seu telefone e e-mail não são passados.
          </span>
        </Check>
        {setOptIn.isError && <Msg $error>{apiErrorMessage(setOptIn.error, 'Não foi possível salvar.')}</Msg>}
        {status.optIn && <Msg>Os pedidos aparecem em <Link to="/pedidos-da-imprensa">Pedidos da imprensa</Link>.</Msg>}
      </Card>
    )
  }

  // Jornalista credenciado: só vê algo se o autor aceitou.
  if (!status.optIn) return null

  if (sent || status.alreadyRequested) {
    return (
      <Card>
        <Title>Pedido de contato</Title>
        <Msg $ok>{sent ? 'Pedido enviado. Você será avisado quando a pessoa responder.' : 'Você já fez um pedido de contato para este relato. Acompanhe na página de imprensa.'}</Msg>
      </Card>
    )
  }

  return (
    <Card>
      <Title>Falar com quem relatou</Title>
      <Text>O autor deste relato aceitou falar com a imprensa credenciada.</Text>
      {!status.canRequest && status.reason && <Msg>{status.reason}</Msg>}
      {status.canRequest && !open && <Button variant="action" size="sm" onClick={() => setOpen(true)}>Pedir contato</Button>}
      {status.canRequest && open && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setError('')
            request.mutate(
              { reportId, message },
              { onSuccess: () => { setSent(true); setOpen(false) }, onError: (err) => setError(apiErrorMessage(err, 'Não foi possível enviar o pedido.')) },
            )
          }}
        >
          <Text>
            Diga quem você é, o que quer saber e para quando. A pessoa vê o nome do seu veículo e pode aceitar, recusar ou bloquear você.
            Você não recebe o telefone nem o e-mail dela: só o que ela mesma escolher compartilhar ao aceitar.
          </Text>
          <TextArea
            required minLength={L.MESSAGE_MIN} maxLength={L.MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Ex.: Sou repórter da Gazeta e gostaria de ouvir o seu caso. Preciso do relato até sexta-feira."
          />
          <Msg>{message.trim().length}/{L.MESSAGE_MAX} (mínimo {L.MESSAGE_MIN})</Msg>
          {error && <Msg $error>{error}</Msg>}
          <Row style={{ marginTop: 8 }}>
            <Button type="submit" variant="action" size="sm" disabled={request.isPending || message.trim().length < L.MESSAGE_MIN}>
              {request.isPending ? 'Enviando…' : 'Enviar pedido'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={request.isPending}>Cancelar</Button>
          </Row>
        </form>
      )}
    </Card>
  )
}
