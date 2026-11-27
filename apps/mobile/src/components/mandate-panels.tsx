import { useState } from 'react'
import { Alert, Linking, Pressable, Switch, Text, View } from 'react-native'
import Copy from 'lucide-react-native/icons/copy'
import ExternalLink from 'lucide-react-native/icons/external-link'
import Trash2 from 'lucide-react-native/icons/trash-2'
import { Button, Card, ErrorText, Field, IconButton, State } from './ui'
import {
  useAccountabilityReports,
  useAlertRules,
  useCreateAccountabilityReport,
  useCreateAlertRule,
  useCreateReplyTemplate,
  useDeleteAlertRule,
  useDeleteReplyTemplate,
  useReplyTemplates,
  useToggleAlertRule,
  type AlertFrequency,
  type AlertRuleType,
} from '../hooks/use-politician-tools'
import { errorMessage } from '../lib/api'
import { copyText } from '../lib/clipboard'
import { useAppTheme } from '../theme-context'

const RULE_LABELS: Record<AlertRuleType, string> = {
  NEW_REPORT: 'Novo relato',
  PRESSURE_THRESHOLD: 'Pressão alta',
  SURTO: 'Surto detectado',
  STALLED_REPORT: 'Relato parado',
}

export function MandateAlertsPanel() {
  const { colors, theme } = useAppTheme()
  const rules = useAlertRules(true)
  const createRule = useCreateAlertRule()
  const toggleRule = useToggleAlertRule()
  const deleteRule = useDeleteAlertRule()

  const [openForm, setOpenForm] = useState(false)
  const [name, setName] = useState('')
  const [ruleType, setRuleType] = useState<AlertRuleType>('PRESSURE_THRESHOLD')
  const [minPressure, setMinPressure] = useState('40')
  const [frequency, setFrequency] = useState<AlertFrequency>('IMMEDIATE')

  const handleCreate = () => {
    createRule.mutate(
      {
        name: name.trim(),
        ruleType,
        wholeArea: true,
        channels: ['IN_APP'],
        frequency,
        ...(ruleType === 'PRESSURE_THRESHOLD' ? { minPressure: Number(minPressure) || 40 } : {}),
        ...(ruleType === 'STALLED_REPORT' ? { stalledDays: 7 } : {}),
      },
      {
        onSuccess: () => {
          setName('')
          setOpenForm(false)
        },
      },
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <Button
        title={openForm ? 'Fechar formulário' : '+ Nova regra de alerta'}
        secondary={openForm}
        onPress={() => setOpenForm((v) => !v)}
      />

      {openForm && (
        <Card>
          <Field label="Nome do alerta *" value={name} onChangeText={setName} placeholder="Ex.: Relatos urgentes no território" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(RULE_LABELS) as AlertRuleType[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setRuleType(t)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: ruleType === t ? colors.action : colors.border,
                  backgroundColor: ruleType === t ? colors.tint : colors.soft,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: ruleType === t ? colors.action : colors.primary }}>
                  {RULE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
          {ruleType === 'PRESSURE_THRESHOLD' && (
            <Field label="Pressão mínima" value={minPressure} onChangeText={setMinPressure} keyboardType="number-pad" />
          )}
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {([
              { v: 'IMMEDIATE', l: 'Na hora' },
              { v: 'DAILY_DIGEST', l: 'Resumo diário' },
            ] as const).map((opt) => (
              <Pressable
                key={opt.v}
                onPress={() => setFrequency(opt.v)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: frequency === opt.v ? colors.action : colors.border,
                  backgroundColor: frequency === opt.v ? colors.tint : colors.soft,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: frequency === opt.v ? colors.action : colors.primary, textAlign: 'center' }}>
                  {opt.l}
                </Text>
              </Pressable>
            ))}
          </View>
          <ErrorText message={createRule.isError ? errorMessage(createRule.error) : undefined} />
          <Button title="Criar alerta" loading={createRule.isPending} disabled={name.trim().length < 2} onPress={handleCreate} />
        </Card>
      )}

      {rules.isPending ? (
        <State loading title="Carregando alertas…" />
      ) : rules.isError ? (
        <State title="Alertas indisponíveis" description={errorMessage(rules.error)} retry={() => { void rules.refetch() }} />
      ) : (rules.data?.items ?? []).length === 0 ? (
        <State title="Nenhuma regra de alerta" description="Crie alertas para ser notificado sobre problemas críticos no seu território." />
      ) : (
        (rules.data?.items ?? []).map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{r.name}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                  {RULE_LABELS[r.ruleType] ?? r.ruleType} · {r.frequency === 'IMMEDIATE' ? 'Na hora' : 'Diário'}
                </Text>
              </View>
              <Switch value={r.active} onValueChange={(active) => toggleRule.mutate({ id: r.id, active })} />
              <IconButton
                label={`Remover ${r.name}`}
                onPress={() =>
                  Alert.alert('Remover alerta?', `Deseja remover "${r.name}"?`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Remover', style: 'destructive', onPress: () => deleteRule.mutate(r.id) },
                  ])
                }
              >
                <Trash2 size={18} color={colors.action} />
              </IconButton>
            </View>
          </Card>
        ))
      )}
    </View>
  )
}

export function MandateTemplatesPanel() {
  const { colors, theme } = useAppTheme()
  const templates = useReplyTemplates(true)
  const createMut = useCreateReplyTemplate()
  const deleteMut = useDeleteReplyTemplate()

  const [openForm, setOpenForm] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = (id: string, text: string) => {
    void copyText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1500)
  }

  return (
    <View style={{ gap: 12 }}>
      <Button
        title={openForm ? 'Fechar formulário' : '+ Novo modelo de resposta'}
        secondary={openForm}
        onPress={() => setOpenForm((v) => !v)}
      />

      {openForm && (
        <Card>
          <Field label="Título do modelo *" value={title} onChangeText={setTitle} placeholder="Ex.: Encaminhamento à secretaria" />
          <Field label="Texto padrão *" value={body} onChangeText={setBody} multiline placeholder="Texto que sua equipe pode reutilizar ao responder relatos…" />
          <ErrorText message={createMut.isError ? errorMessage(createMut.error) : undefined} />
          <Button
            title="Salvar modelo"
            loading={createMut.isPending}
            disabled={title.trim().length < 2 || body.trim().length < 10}
            onPress={() =>
              createMut.mutate(
                { title: title.trim(), body: body.trim() },
                {
                  onSuccess: () => {
                    setTitle('')
                    setBody('')
                    setOpenForm(false)
                  },
                },
              )
            }
          />
        </Card>
      )}

      {templates.isPending ? (
        <State loading title="Carregando modelos…" />
      ) : templates.isError ? (
        <State title="Modelos indisponíveis" description={errorMessage(templates.error)} retry={() => { void templates.refetch() }} />
      ) : (templates.data?.items ?? []).length === 0 ? (
        <State title="Nenhum modelo salvo" description="Crie textos padrão para responder relatos com agilidade." />
      ) : (
        (templates.data?.items ?? []).map((t) => (
          <Card key={t.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary, flex: 1 }}>
                {t.title}
              </Text>
              <IconButton label="Copiar modelo" onPress={() => handleCopy(t.id, t.body)}>
                <Copy size={18} color={copiedId === t.id ? colors.positive : colors.primary} />
              </IconButton>
              <IconButton
                label={`Remover ${t.title}`}
                onPress={() =>
                  Alert.alert('Remover modelo?', `Deseja remover "${t.title}"?`, [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Remover', style: 'destructive', onPress: () => deleteMut.mutate(t.id) },
                  ])
                }
              >
                <Trash2 size={18} color={colors.action} />
              </IconButton>
            </View>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 }}>{t.body}</Text>
            {copiedId === t.id && (
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.positive }}>
                Texto copiado para a área de transferência!
              </Text>
            )}
          </Card>
        ))
      )}
    </View>
  )
}

export function MandateAccountabilityPanel() {
  const { colors, theme } = useAppTheme()
  const reports = useAccountabilityReports(true)
  const createMut = useCreateAccountabilityReport()

  const generateLast30Days = () => {
    const to = new Date()
    const from = new Date(Date.now() - 30 * 86_400_000)
    createMut.mutate({
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    })
  }

  return (
    <View style={{ gap: 12 }}>
      <Button
        title="Gerar prestação dos últimos 30 dias"
        loading={createMut.isPending}
        onPress={generateLast30Days}
      />
      <ErrorText message={createMut.isError ? errorMessage(createMut.error) : undefined} />

      {reports.isPending ? (
        <State loading title="Carregando prestações…" />
      ) : reports.isError ? (
        <State title="Prestações indisponíveis" description={errorMessage(reports.error)} retry={() => { void reports.refetch() }} />
      ) : (reports.data?.items ?? []).length === 0 ? (
        <State title="Nenhuma prestação gerada" description="Gere um relatório oficial auditável do seu mandato." />
      ) : (
        (reports.data?.items ?? []).map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.action }}>{r.status}</Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                {new Date(r.createdAt).toLocaleDateString('pt-BR')}
              </Text>
            </View>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
              Período: {r.periodFrom.slice(0, 10)} a {r.periodTo.slice(0, 10)}
            </Text>
            {!!r.publicCode && (
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                Código público: {r.publicCode}
              </Text>
            )}
            {!!r.pdfUrl && (
              <Pressable
                onPress={() => void Linking.openURL(r.pdfUrl!).catch(() => {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
              >
                <ExternalLink size={15} color={colors.action} />
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>Abrir PDF</Text>
              </Pressable>
            )}
          </Card>
        ))
      )}
    </View>
  )
}
