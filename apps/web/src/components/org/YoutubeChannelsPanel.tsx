import { useState } from 'react'
import styled from 'styled-components'
import {
  useAddYoutubeChannel,
  useRemoveYoutubeChannel,
  useVerifyYoutubeChannel,
  useYoutubeChannels,
} from '../../hooks/useYoutubeChannels'
import { YoutubeChannel } from '../../types/api'

// ── Styled ──────────────────────────────────────────────────────────────────

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px;
  margin-top: 24px;
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Intro = styled.p`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin-bottom: 18px;
`

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
`

const Row = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  padding: 14px 16px;
`

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
`

const ChannelName = styled.div`
  flex: 1;
  min-width: 0;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
`

const Badge = styled.span<{ $ok: boolean }>`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  padding: 3px 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  color: ${({ theme }) => theme.colors.white};
  background: ${({ $ok, theme }) => ($ok ? theme.colors.positive : theme.colors.muted)};
`

const Btn = styled.button<{ $danger?: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  border: 1px solid ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.primary)};
  background: ${({ $danger, theme }) => ($danger ? 'transparent' : theme.colors.primary)};
  color: ${({ $danger, theme }) => ($danger ? theme.colors.action : theme.colors.white)};
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const Steps = styled.ol`
  margin: 12px 0 0 18px;
  padding: 0;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
`

const Code = styled.code`
  font-family: ${({ theme }) => theme.fonts.mono};
  background: ${({ theme }) => theme.colors.white};
  border: 1px dashed ${({ theme }) => theme.colors.muted};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 2px 8px;
  user-select: all;
`

const AddForm = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
`

const Input = styled.input`
  flex: 1;
  min-width: 220px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.text};
`

const ErrorText = styled.p`
  margin-top: 10px;
  font-size: ${({ theme }) => theme.fontSizes.sm};
  color: ${({ theme }) => theme.colors.action};
`

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(message)) return message[0] ?? fallback
  return message ?? fallback
}

// ── Componente ──────────────────────────────────────────────────────────────

function ChannelRow({ channel, onError }: { channel: YoutubeChannel; onError: (msg: string) => void }) {
  const verify = useVerifyYoutubeChannel()
  const remove = useRemoveYoutubeChannel()
  const [copied, setCopied] = useState(false)
  const verified = !!channel.verifiedAt

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(channel.verificationCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // sem permissão de área de transferência: o código já está selecionável na tela
    }
  }

  return (
    <Row>
      <RowTop>
        <ChannelName>{channel.title}</ChannelName>
        <Badge $ok={verified}>{verified ? 'Verificado' : 'Falta verificar'}</Badge>
        {!verified && (
          <Btn
            disabled={verify.isPending}
            onClick={() => {
              onError('')
              verify.mutate(channel.id, {
                onError: (e) => onError(apiMessage(e, 'Não deu para verificar agora. Tente de novo.')),
              })
            }}
          >
            {verify.isPending ? 'Verificando...' : 'Verificar'}
          </Btn>
        )}
        <Btn
          $danger
          disabled={remove.isPending}
          onClick={() => {
            if (!confirm(`Tirar o canal "${channel.title}"? Debates já marcados continuam como estão.`)) return
            onError('')
            remove.mutate(channel.id, {
              onError: (e) => onError(apiMessage(e, 'Não deu para remover agora.')),
            })
          }}
        >
          Remover
        </Btn>
      </RowTop>

      {!verified && (
        <Steps>
          <li>
            Copie este código: <Code>{channel.verificationCode}</Code>{' '}
            <Btn type="button" onClick={copyCode}>{copied ? 'Copiado' : 'Copiar'}</Btn>
          </li>
          <li>No YouTube Studio, abra Personalização, Informações básicas, e cole o código na descrição do canal.</li>
          <li>Salve e volte aqui para clicar em Verificar. O YouTube pode levar alguns minutos para mostrar.</li>
        </Steps>
      )}
    </Row>
  )
}

export function YoutubeChannelsPanel() {
  const { data: channels, isLoading, isError } = useYoutubeChannels()
  const add = useAddYoutubeChannel()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  // 403: o perfil ativo não pode mexer em canais. Não mostra o painel.
  if (isError) return null

  function handleAdd() {
    const value = link.trim()
    if (!value) return
    setError('')
    add.mutate(value, {
      onSuccess: () => setLink(''),
      onError: (e) => setError(apiMessage(e, 'Não deu para adicionar o canal agora.')),
    })
  }

  return (
    <Panel>
      <Title>Canais do YouTube</Title>
      <Intro>
        Os debates do Votz passam ao vivo pelo YouTube. Ligue aqui o canal de onde sai a live e prove que ele é seu.
        Só canal verificado pode transmitir um debate.
      </Intro>

      {isLoading ? (
        <Intro>Carregando...</Intro>
      ) : (
        !!channels?.length && (
          <List>
            {channels.map((c) => (
              <ChannelRow key={c.id} channel={c} onError={setError} />
            ))}
          </List>
        )
      )}

      <AddForm>
        <Input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Link do canal (youtube.com/@nome)"
          maxLength={200}
        />
        <Btn type="button" onClick={handleAdd} disabled={!link.trim() || add.isPending}>
          {add.isPending ? 'Adicionando...' : 'Adicionar canal'}
        </Btn>
      </AddForm>
      {error && <ErrorText>{error}</ErrorText>}
    </Panel>
  )
}
