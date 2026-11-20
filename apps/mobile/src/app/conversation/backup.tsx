import { useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import ArrowLeftRight from 'lucide-react-native/icons/arrow-left-right'
import Cloud from 'lucide-react-native/icons/cloud'
import {
  CHAT_BACKUP_MIN_PASSWORD,
  CHAT_BACKUP_TEXT,
  formatStorageSize,
  formatTransferCode,
} from '@votz/chat-core'
import { ConversationGate } from '../../components/conversation-ui'
import { Screen, Toolbar } from '../../components/screen'
import { Button, ErrorText, Field, Heading, Label, State } from '../../components/ui'
import {
  useChatBackupActions,
  useChatBackupMeta,
  useChatHistoryTransferMeta,
} from '../../hooks/use-chat-backup'
import { ApiError, errorMessage } from '../../lib/api'
import { theme } from '../../theme'

function BackupBody() {
  const meta = useChatBackupMeta()
  const transfer = useChatHistoryTransferMeta()
  const { save, restore, remove, sendTransfer, receiveTransfer } =
    useChatBackupActions()

  const [savePassword, setSavePassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [transferCodeInput, setTransferCodeInput] = useState('')
  const [generatedCode, setGeneratedCode] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  const notActivated =
    meta.error instanceof ApiError && meta.error.status === 401

  if (notActivated) {
    return (
      <State
        title="Conecte este aparelho primeiro"
        description="O backup e a transferência de histórico ficam disponíveis assim que este aparelho estiver conectado às suas conversas."
      />
    )
  }

  const busy =
    save.isPending ||
    restore.isPending ||
    remove.isPending ||
    sendTransfer.isPending ||
    receiveTransfer.isPending

  function handleSave() {
    if (savePassword.length < CHAT_BACKUP_MIN_PASSWORD) {
      setErrorText(`Use pelo menos ${CHAT_BACKUP_MIN_PASSWORD} caracteres.`)
      return
    }
    if (savePassword !== confirmPassword) {
      setErrorText('As duas senhas não conferem.')
      return
    }
    setErrorText(null)
    setFeedback(null)
    save.mutate(savePassword, {
      onSuccess: () => {
        setSavePassword('')
        setConfirmPassword('')
        setFeedback('Backup salvo com sucesso na nuvem.')
      },
      onError: (err) => setErrorText(errorMessage(err)),
    })
  }

  function handleRestore() {
    setErrorText(null)
    setFeedback(null)
    restore.mutate(restorePassword, {
      onSuccess: (res) => {
        setRestorePassword('')
        setFeedback(
          res.imported > 0
            ? `Histórico restaurado (${res.imported} ${res.imported === 1 ? 'conversa recuperada' : 'conversas recuperadas'}).`
            : 'Backup aberto com sucesso. Este aparelho já tinha o histórico mais recente.',
        )
      },
      onError: (err) => setErrorText(errorMessage(err)),
    })
  }

  function handleDelete() {
    Alert.alert(
      'Apagar backup da nuvem?',
      'As mensagens já abertas nos seus aparelhos continuam neles, mas você não poderá restaurar da nuvem se perder todos os aparelhos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            setErrorText(null)
            setFeedback(null)
            remove.mutate(undefined, {
              onSuccess: () => setFeedback('Backup removido da nuvem.'),
              onError: (err) => setErrorText(errorMessage(err)),
            })
          },
        },
      ],
    )
  }

  function handleSendTransfer() {
    setErrorText(null)
    setFeedback(null)
    sendTransfer.mutate(undefined, {
      onSuccess: (res) => {
        setGeneratedCode(res.code)
        setFeedback('Código gerado. Digite no outro aparelho em até 15 minutos.')
      },
      onError: (err) => setErrorText(errorMessage(err)),
    })
  }

  function handleReceiveTransfer() {
    if (!transfer.data?.id) return
    setErrorText(null)
    setFeedback(null)
    receiveTransfer.mutate(
      { id: transfer.data.id, code: transferCodeInput },
      {
        onSuccess: (res) => {
          setTransferCodeInput('')
          setFeedback(
            res.imported > 0
              ? `Histórico recebido (${res.imported} ${res.imported === 1 ? 'registro importado' : 'registros importados'}).`
              : 'Transferência recebida com sucesso.',
          )
        },
        onError: (err) => setErrorText(errorMessage(err)),
      },
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {!!errorText && <ErrorText message={errorText} />}
      {!!feedback && (
        <View style={styles.okBox}>
          <Text style={styles.okText}>{feedback}</Text>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.head}>
          <Cloud size={22} color={theme.colors.primary} />
          <Heading>{CHAT_BACKUP_TEXT.title}</Heading>
        </View>
        <Label muted>{CHAT_BACKUP_TEXT.subtitle}</Label>
        {meta.data?.exists && meta.data.updatedAt && (
          <Label>
            Backup ativo · {new Date(meta.data.updatedAt).toLocaleString('pt-BR')}{' '}
            ({formatStorageSize(meta.data.sizeBytes)})
          </Label>
        )}
        <Label muted>{CHAT_BACKUP_TEXT.passwordHint}</Label>
        <Field
          accessibilityLabel="Senha do backup"
          secureTextEntry
          autoCapitalize="none"
          placeholder="Senha do backup (mínimo 8 caracteres)"
          value={savePassword}
          onChangeText={setSavePassword}
        />
        <Field
          accessibilityLabel="Confirmar senha do backup"
          secureTextEntry
          autoCapitalize="none"
          placeholder="Repita a senha do backup"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <Button
          title={
            meta.data?.exists
              ? CHAT_BACKUP_TEXT.updateAction
              : CHAT_BACKUP_TEXT.saveAction
          }
          loading={save.isPending}
          disabled={busy}
          onPress={handleSave}
        />
        {meta.data?.exists && (
          <>
            <View style={styles.divider} />
            <Text style={styles.subTitle}>{CHAT_BACKUP_TEXT.restoreTitle}</Text>
            <Field
              accessibilityLabel="Senha para restaurar backup"
              secureTextEntry
              autoCapitalize="none"
              placeholder="Digite a senha do backup"
              value={restorePassword}
              onChangeText={setRestorePassword}
            />
            <Button
              secondary
              title={CHAT_BACKUP_TEXT.restoreAction}
              loading={restore.isPending}
              disabled={busy || !restorePassword}
              onPress={handleRestore}
            />
            <Button
              secondary
              title={CHAT_BACKUP_TEXT.deleteAction}
              disabled={busy}
              onPress={handleDelete}
            />
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.head}>
          <ArrowLeftRight size={22} color={theme.colors.primary} />
          <Heading>{CHAT_BACKUP_TEXT.transferTitle}</Heading>
        </View>
        <Label muted>{CHAT_BACKUP_TEXT.transferSubtitle}</Label>
        <Button
          secondary
          title={CHAT_BACKUP_TEXT.sendTransferAction}
          loading={sendTransfer.isPending}
          disabled={busy}
          onPress={handleSendTransfer}
        />
        {generatedCode && (
          <View style={styles.codeBox}>
            <Label muted>Código temporário (vale por 15 min):</Label>
            <Text style={styles.codeText}>{formatTransferCode(generatedCode)}</Text>
            <Label muted>
              Abra Configurações → Backup protegido na nuvem no outro aparelho e
              digite este código.
            </Label>
          </View>
        )}
        {transfer.data?.available && transfer.data.id && (
          <>
            <View style={styles.divider} />
            <Text style={styles.subTitle}>
              {CHAT_BACKUP_TEXT.receiveTransferTitle}
            </Text>
            <Field
              accessibilityLabel="Código de transferência"
              keyboardType="number-pad"
              maxLength={9}
              placeholder="0000 0000"
              value={transferCodeInput}
              onChangeText={setTransferCodeInput}
            />
            <Button
              title={CHAT_BACKUP_TEXT.receiveTransferAction}
              loading={receiveTransfer.isPending}
              disabled={
                busy || transferCodeInput.replace(/\D/g, '').length !== 8
              }
              onPress={handleReceiveTransfer}
            />
          </>
        )}
      </View>
    </ScrollView>
  )
}

export default function ChatBackupScreen() {
  return (
    <Screen>
      <Toolbar title="Backup e histórico" back />
      <ConversationGate>
        <BackupBody />
      </ConversationGate>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subTitle: {
    fontSize: 15,
    fontFamily: theme.fonts.medium,
    color: theme.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 6,
  },
  codeBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.tint,
    alignItems: 'center',
    gap: 6,
  },
  codeText: {
    fontSize: 28,
    letterSpacing: 4,
    fontFamily: theme.fonts.heading,
    color: theme.colors.primary,
  },
  okBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.tint,
  },
  okText: {
    fontSize: 14,
    fontFamily: theme.fonts.medium,
    color: theme.colors.primary,
  },
})
