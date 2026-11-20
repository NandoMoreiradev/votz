import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { isAxiosError } from 'axios'
import { Cloud, ArrowsLeftRight } from '@phosphor-icons/react'
import {
  CHAT_BACKUP_MIN_PASSWORD,
  CHAT_BACKUP_TEXT,
  formatStorageSize,
  formatTransferCode,
} from '@votz/chat-core'
import {
  useChatBackupActions,
  useChatBackupMeta,
  useChatHistoryTransferMeta,
} from '../../hooks/useChatBackup'
import { Page, Panel } from './layout'

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  h2 {
    margin: 0;
    font-size: 17px;
  }
`
const Muted = styled.p`
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`
const Form = styled.form`
  display: grid;
  gap: 10px;
  margin-top: 14px;
  max-width: 420px;
`
const Input = styled.input`
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 14px;
`
const Row = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
`
const Primary = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: ${({ theme }) => theme.colors.action};
  color: ${({ theme }) => theme.colors.white};
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`
const Secondary = styled.button`
  height: 40px;
  padding: 0 16px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 10px;
  background: transparent;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`
const CodeBox = styled.div`
  margin-top: 12px;
  padding: 16px;
  border-radius: 12px;
  background: ${({ theme }) => theme.colors.neutral};
  text-align: center;
  strong {
    display: block;
    font-size: 28px;
    letter-spacing: 4px;
    font-family: ${({ theme }) => theme.fonts.mono};
    margin: 6px 0;
  }
`
const Notice = styled.p<{ $error?: boolean }>`
  margin: 10px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme, $error }) =>
    $error ? theme.colors.action : theme.colors.positive};
`

function messageOf(error: unknown): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined
    if (typeof data?.message === 'string') return data.message
    if (Array.isArray(data?.message) && data.message[0]) return data.message[0]
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir.'
}

export function ChatBackupPanel() {
  const meta = useChatBackupMeta()
  const transfer = useChatHistoryTransferMeta()
  const { save, restore, remove, sendTransfer, receiveTransfer } =
    useChatBackupActions()

  const [savePassword, setSavePassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [transferCodeInput, setTransferCodeInput] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(
    null,
  )

  const notActivated =
    isAxiosError(meta.error) && meta.error.response?.status === 401

  if (notActivated) {
    return (
      <Page>
        <Panel role="status">
          <strong>Conecte este navegador primeiro</strong>
          <Muted>
            O backup e a transferência de histórico ficam disponíveis assim que
            este navegador estiver conectado às suas conversas.
          </Muted>
          <Row style={{ marginTop: 12 }}>
            <Primary as={Link} to="/conversas">
              Voltar às conversas
            </Primary>
          </Row>
        </Panel>
      </Page>
    )
  }

  function handleSave(event: FormEvent) {
    event.preventDefault()
    if (savePassword.length < CHAT_BACKUP_MIN_PASSWORD) {
      setFeedback({
        text: `Use pelo menos ${CHAT_BACKUP_MIN_PASSWORD} caracteres.`,
        error: true,
      })
      return
    }
    if (savePassword !== confirmPassword) {
      setFeedback({ text: 'As duas senhas não conferem.', error: true })
      return
    }
    setFeedback(null)
    save.mutate(savePassword, {
      onSuccess: () => {
        setSavePassword('')
        setConfirmPassword('')
        setFeedback({ text: 'Backup salvo com sucesso na nuvem.' })
      },
      onError: (err) => setFeedback({ text: messageOf(err), error: true }),
    })
  }

  function handleRestore(event: FormEvent) {
    event.preventDefault()
    setFeedback(null)
    restore.mutate(restorePassword, {
      onSuccess: (res) => {
        setRestorePassword('')
        setFeedback({
          text:
            res.imported > 0
              ? `Histórico restaurado (${res.imported} ${res.imported === 1 ? 'conversa recuperada' : 'conversas recuperadas'}).`
              : 'Backup aberto com sucesso. Este navegador já tinha o histórico mais recente.',
        })
      },
      onError: (err) => setFeedback({ text: messageOf(err), error: true }),
    })
  }

  function handleDelete() {
    if (
      !window.confirm(
        'Apagar o backup protegido da nuvem? As mensagens já abertas nos seus aparelhos continuam neles, mas você não poderá restaurar da nuvem se perder todos os aparelhos.',
      )
    )
      return
    setFeedback(null)
    remove.mutate(undefined, {
      onSuccess: () => setFeedback({ text: 'Backup removido da nuvem.' }),
      onError: (err) => setFeedback({ text: messageOf(err), error: true }),
    })
  }

  function handleSendTransfer() {
    setFeedback(null)
    sendTransfer.mutate(undefined, {
      onSuccess: (res) => {
        setGeneratedCode(res.code)
        setFeedback({
          text: 'Código gerado. Digite no outro aparelho em até 15 minutos.',
        })
      },
      onError: (err) => setFeedback({ text: messageOf(err), error: true }),
    })
  }

  function handleReceiveTransfer(event: FormEvent) {
    event.preventDefault()
    if (!transfer.data?.id) return
    setFeedback(null)
    receiveTransfer.mutate(
      { id: transfer.data.id, code: transferCodeInput },
      {
        onSuccess: (res) => {
          setTransferCodeInput('')
          setFeedback({
            text:
              res.imported > 0
                ? `Histórico recebido (${res.imported} ${res.imported === 1 ? 'registro importado' : 'registros importados'}).`
                : 'Transferência recebida com sucesso.',
          })
        },
        onError: (err) => setFeedback({ text: messageOf(err), error: true }),
      },
    )
  }

  const busy =
    save.isPending ||
    restore.isPending ||
    remove.isPending ||
    sendTransfer.isPending ||
    receiveTransfer.isPending

  return (
    <Page>
      <Panel>
        <Head>
          <Cloud size={22} />
          <h2>{CHAT_BACKUP_TEXT.title}</h2>
        </Head>
        <Muted>{CHAT_BACKUP_TEXT.subtitle}</Muted>
        {meta.data?.exists && meta.data.updatedAt && (
          <Muted style={{ marginTop: 8 }}>
            <strong>Backup ativo</strong> · atualizado em{' '}
            {new Date(meta.data.updatedAt).toLocaleString('pt-BR')} (
            {formatStorageSize(meta.data.sizeBytes)})
          </Muted>
        )}

        <Form onSubmit={handleSave}>
          <Muted>{CHAT_BACKUP_TEXT.passwordHint}</Muted>
          <Input
            type="password"
            aria-label="Senha do backup"
            placeholder="Senha do backup (mínimo 8 caracteres)"
            value={savePassword}
            onChange={(e) => setSavePassword(e.target.value)}
            minLength={CHAT_BACKUP_MIN_PASSWORD}
            required
          />
          <Input
            type="password"
            aria-label="Confirmar senha do backup"
            placeholder="Repita a senha do backup"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={CHAT_BACKUP_MIN_PASSWORD}
            required
          />
          <Row>
            <Primary type="submit" disabled={busy}>
              {meta.data?.exists
                ? CHAT_BACKUP_TEXT.updateAction
                : CHAT_BACKUP_TEXT.saveAction}
            </Primary>
            {meta.data?.exists && (
              <Secondary type="button" disabled={busy} onClick={handleDelete}>
                {CHAT_BACKUP_TEXT.deleteAction}
              </Secondary>
            )}
          </Row>
        </Form>

        {meta.data?.exists && (
          <Form
            onSubmit={handleRestore}
            style={{ paddingTop: 14, borderTop: '1px solid #e5e5e5' }}
          >
            <strong>{CHAT_BACKUP_TEXT.restoreTitle}</strong>
            <Input
              type="password"
              aria-label="Senha para restaurar backup"
              placeholder="Digite a senha do backup"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              required
            />
            <Row>
              <Secondary type="submit" disabled={busy || !restorePassword}>
                {CHAT_BACKUP_TEXT.restoreAction}
              </Secondary>
            </Row>
          </Form>
        )}
      </Panel>

      <Panel>
        <Head>
          <ArrowsLeftRight size={22} />
          <h2>{CHAT_BACKUP_TEXT.transferTitle}</h2>
        </Head>
        <Muted>{CHAT_BACKUP_TEXT.transferSubtitle}</Muted>
        <Row style={{ marginTop: 12 }}>
          <Secondary type="button" disabled={busy} onClick={handleSendTransfer}>
            {CHAT_BACKUP_TEXT.sendTransferAction}
          </Secondary>
        </Row>
        {generatedCode && (
          <CodeBox role="status">
            <Muted>Código temporário de transferência (válido por 15 min):</Muted>
            <strong>{formatTransferCode(generatedCode)}</strong>
            <Muted>
              Abra Configurações → Backup protegido na nuvem no outro aparelho e
              digite este código.
            </Muted>
          </CodeBox>
        )}
        {transfer.data?.available && transfer.data.id && (
          <Form
            onSubmit={handleReceiveTransfer}
            style={{ paddingTop: 14, borderTop: '1px solid #e5e5e5' }}
          >
            <strong>{CHAT_BACKUP_TEXT.receiveTransferTitle}</strong>
            <Muted>
              Há um histórico aguardando recebimento. Digite os 8 dígitos
              mostrados no outro aparelho.
            </Muted>
            <Input
              type="text"
              inputMode="numeric"
              aria-label="Código de transferência"
              placeholder="0000 0000"
              maxLength={9}
              value={transferCodeInput}
              onChange={(e) => setTransferCodeInput(e.target.value)}
              required
            />
            <Row>
              <Primary
                type="submit"
                disabled={
                  busy || transferCodeInput.replace(/\D/g, '').length !== 8
                }
              >
                {CHAT_BACKUP_TEXT.receiveTransferAction}
              </Primary>
            </Row>
          </Form>
        )}
      </Panel>

      {feedback && (
        <Panel>
          <Notice role="status" $error={feedback.error}>
            {feedback.text}
          </Notice>
        </Panel>
      )}
    </Page>
  )
}
