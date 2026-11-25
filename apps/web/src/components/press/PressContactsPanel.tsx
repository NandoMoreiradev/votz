import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { PRESS_CONTACT_STATUS_LABELS } from '@votz/shared-types'
import { Button } from '../ui/Button'
import { apiErrorMessage } from '../../hooks/usePressCredential'
import { useCancelPressContact, useSentPressContacts } from '../../hooks/usePressContacts'
import { SkeletonRows } from '../ui/Skeleton'

const Box = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px 24px;
  margin-bottom: 24px;
  @media (max-width: 640px) { padding: 16px; }
`
const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading}; font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.primary}; margin: 0 0 6px;
`
const Text = styled.p`font-size: ${({ theme }) => theme.fontSizes.sm}; color: ${({ theme }) => theme.colors.muted}; line-height: 1.6; margin: 0 0 12px; max-width: 680px;`
const Row = styled.div`padding: 12px 0; border-top: 1px solid ${({ theme }) => theme.colors.border}; font-size: ${({ theme }) => theme.fontSizes.sm};`
const Tag = styled.span<{ $tone: 'ok' | 'wait' | 'off' }>`
  display: inline-block; padding: 2px 8px; border-radius: ${({ theme }) => theme.radii.full}; margin-right: 8px;
  font-family: ${({ theme }) => theme.fonts.mono}; font-size: ${({ theme }) => theme.fontSizes.xs}; font-weight: ${({ theme }) => theme.fontWeights.bold}; color: #fff;
  background: ${({ theme, $tone }) => ($tone === 'ok' ? theme.colors.positive : $tone === 'wait' ? theme.colors.primary : theme.colors.muted)};
`
const Reply = styled.blockquote`
  margin: 8px 0 0; padding: 8px 12px; border-left: 3px solid ${({ theme }) => theme.colors.positive};
  background: ${({ theme }) => theme.colors.neutral}; color: ${({ theme }) => theme.colors.text};
`
const Meta = styled.div`color: ${({ theme }) => theme.colors.muted}; font-size: ${({ theme }) => theme.fontSizes.xs}; margin-top: 4px;`

/** Pedidos de contato que o jornalista enviou, e o que cada pessoa respondeu (só se aceitou). */
export function PressContactsPanel() {
  const { data, isLoading } = useSentPressContacts(true)
  const cancel = useCancelPressContact()
  const [error, setError] = useState('')
  const rows = data ?? []

  return (
    <Box>
      <Title>Pedidos de contato</Title>
      <Text>
        Para pedir contato, abra um relato cujo autor aceitou falar com a imprensa. Aqui você acompanha as respostas.
        Quando alguém recusa, você só vê "sem disponibilidade": o motivo não é mostrado.
      </Text>
      {isLoading && <SkeletonRows rows={3} />}
      {!isLoading && rows.length === 0 && <Text>Você ainda não fez nenhum pedido.</Text>}
      {rows.map((r) => (
        <Row key={r.id}>
          <Tag $tone={r.status === 'ACCEPTED' ? 'ok' : r.status === 'PENDING' ? 'wait' : 'off'}>{PRESS_CONTACT_STATUS_LABELS[r.status]}</Tag>
          <b>{r.recipient.name}</b> · <Link to={`/relatos/${r.report.id}`}>{r.report.title}</Link>
          <Meta>Enviado em {new Date(r.createdAt).toLocaleDateString('pt-BR')}{r.status === 'PENDING' ? ` · vale até ${new Date(r.expiresAt).toLocaleDateString('pt-BR')}` : ''}</Meta>
          {r.status === 'ACCEPTED' && (
            <>
              {r.reply ? <Reply>{r.reply}</Reply> : <Meta>A pessoa aceitou, sem deixar recado.</Meta>}
              {r.viaVotzChat && (
                <Meta>Ela prefere conversar pelas Conversas do Votz: <Link to="/conversas">abra Conversas</Link> e chame {r.recipient.name}.</Meta>
              )}
            </>
          )}
          {r.status === 'PENDING' && (
            <Button
              variant="ghost" size="sm" style={{ marginTop: 6 }} disabled={cancel.isPending}
              onClick={() => { setError(''); cancel.mutate(r.id, { onError: (e) => setError(apiErrorMessage(e, 'Não foi possível cancelar.')) }) }}
            >
              Cancelar pedido
            </Button>
          )}
        </Row>
      ))}
      {error && <Text style={{ color: '#E63946' }}>{error}</Text>}
    </Box>
  )
}
