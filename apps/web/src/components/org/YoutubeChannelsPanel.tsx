import { useState } from 'react'
import styled from 'styled-components'
import { Check, Copy, Trash, WarningCircle } from '@phosphor-icons/react'
import {
  useAddYoutubeChannel,
  useRemoveYoutubeChannel,
  useVerifyYoutubeChannel,
  useYoutubeChannels,
} from '../../hooks/useYoutubeChannels'
import { YoutubeChannel } from '../../types/api'
import {
  Callout,
  DarkButton,
  GhostButton,
  Panel,
  PanelBody,
  PanelHead,
  Skeleton,
  StatusPill,
} from '../studio/studio-ui'

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
`

const Row = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  padding: 12px 14px;
`

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const ChannelName = styled.div`
  flex: 1;
  min-width: 120px;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const RowActions = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
`

const SmallBtn = styled(GhostButton)`
  height: 30px;
  padding: 0 10px;
  font-size: 0.75rem;
`

const DangerBtn = styled(SmallBtn)`
  color: ${({ theme }) => theme.colors.action};
  border-color: ${({ theme }) => theme.colors.action}55;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.action}12;
    border-color: ${({ theme }) => theme.colors.action};
  }
`

const Steps = styled.ol`
  margin: 10px 0 0 16px;
  padding: 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.55;

  li + li { margin-top: 4px; }
`

const Code = styled.code`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.75rem;
  background: ${({ theme }) => theme.colors.white};
  border: 1px dashed ${({ theme }) => theme.colors.muted};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 1px 6px;
  user-select: all;
`

const AddForm = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const Input = styled.input`
  flex: 1;
  min-width: 180px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary}1A;
  }
`

function apiMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message
  if (Array.isArray(message)) return message[0] ?? fallback
  return message ?? fallback
}

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
        <ChannelName title={channel.title}>{channel.title}</ChannelName>
        <StatusPill $tone={verified ? 'positive' : 'warning'}>
          {verified ? 'Verificado' : 'Falta verificar'}
        </StatusPill>
      </RowTop>

      {!verified && (
        <Steps>
          <li>
            Copie o código: <Code>{channel.verificationCode}</Code>{' '}
            <SmallBtn type="button" onClick={copyCode} style={{ height: 24, marginLeft: 4 }}>
              {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </SmallBtn>
          </li>
          <li>No YouTube Studio, abra Personalização › Informações básicas e cole na descrição do canal.</li>
          <li>Salve e clique em Verificar. O YouTube pode levar alguns minutos para atualizar.</li>
        </Steps>
      )}

      <RowActions>
        {!verified && (
          <SmallBtn
            type="button"
            disabled={verify.isPending}
            onClick={() => {
              onError('')
              verify.mutate(channel.id, {
                onError: (e) => onError(apiMessage(e, 'Não deu para verificar agora. Tente de novo.')),
              })
            }}
          >
            {verify.isPending ? 'Verificando…' : 'Verificar agora'}
          </SmallBtn>
        )}
        <DangerBtn
          type="button"
          disabled={remove.isPending}
          onClick={() => {
            if (!confirm(`Tirar o canal "${channel.title}"? Debates já marcados continuam como estão.`)) return
            onError('')
            remove.mutate(channel.id, {
              onError: (e) => onError(apiMessage(e, 'Não deu para remover agora.')),
            })
          }}
        >
          <Trash size={13} aria-hidden="true" /> Remover
        </DangerBtn>
      </RowActions>
    </Row>
  )
}

export function YoutubeChannelsPanel() {
  const { data: channels, isLoading, isError } = useYoutubeChannels()
  const add = useAddYoutubeChannel()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

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
      <PanelHead
        title="Canais do YouTube"
        hint="Só canal verificado pode transmitir debates ao vivo."
      />
      <PanelBody>
        {isLoading ? (
          <Skeleton $h={52} style={{ marginBottom: 14 }} />
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
            placeholder="youtube.com/@seucanal"
            aria-label="Link do canal do YouTube"
            maxLength={200}
          />
          <DarkButton type="button" onClick={handleAdd} disabled={!link.trim() || add.isPending}>
            {add.isPending ? 'Adicionando…' : 'Adicionar'}
          </DarkButton>
        </AddForm>

        {error && (
          <div style={{ marginTop: 10 }}>
            <Callout tone="action" icon={WarningCircle} role="alert">{error}</Callout>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}
