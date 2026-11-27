import { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Switch, Text, View } from 'react-native'
import { router } from 'expo-router'
import Sparkles from 'lucide-react-native/icons/sparkles'
import Trash2 from 'lucide-react-native/icons/trash-2'
import {
  PRESS_CONTACT_STATUS_LABELS,
  PRESS_CREDENTIAL_STATUS_LABELS,
  PRESS_OUTLET_LABELS,
  PRESS_OUTLET_TYPES,
  PRESS_PLAN_LABELS,
  PRESS_RADAR_FREQUENCIES,
  PRESS_RADAR_FREQUENCY_LABELS,
  PRESS_RADAR_KIND_LABELS,
  PRESS_RADAR_KINDS,
  type PressOutletType,
  type PressRadarFrequency,
  type PressRadarKind,
} from '@votz/shared-types'
import { Button, Card, ErrorText, Field, IconButton, State } from './ui'
import {
  useCancelPressContact,
  useCreatePressCredential,
  useCreateRadarRule,
  useDeleteRadarRule,
  useMyPressCredential,
  usePressPlan,
  usePressSearch,
  useRadarRules,
  useResendPressEmail,
  useSentPressContacts,
  useSurtoBriefing,
  useUpdateRadarRule,
} from '../hooks/use-press'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

export function PressSearchPanel() {
  const { colors, theme } = useAppTheme()
  const [q, setQ] = useState('')
  const [uf, setUf] = useState('')
  const search = usePressSearch()

  const run = () => {
    if (q.trim().length < 3) return
    search.mutate({ q: q.trim(), state: uf.trim() || undefined })
  }

  return (
    <View style={{ gap: 12 }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={16} color={colors.action} />
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
            Busca por significado (IA)
          </Text>
        </View>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
          Pesquise relatos pelo sentido do problema — mesmo quando o cidadão usou palavras diferentes.
        </Text>
        <Field label="O que você procura?" value={q} onChangeText={setQ} placeholder="Ex.: falta de remédio no posto de saúde" />
        <Field label="UF (opcional)" value={uf} onChangeText={setUf} maxLength={2} autoCapitalize="characters" placeholder="SP" />
        <ErrorText message={search.isError ? errorMessage(search.error) : undefined} />
        <Button title="Buscar relatos" loading={search.isPending} disabled={q.trim().length < 3} onPress={run} />
      </Card>

      {search.data && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.muted }}>
            {search.data.total} resultado(s) encontrado(s)
          </Text>
          {search.data.results.map((r) => (
            <Pressable key={r.id} onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action }}>
                    {Math.round(r.score)}% relevante
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                    {[r.city, r.state].filter(Boolean).join('/')}
                  </Text>
                </View>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{r.title}</Text>
                <Text numberOfLines={2} style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
                  {r.excerpt}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

export function SurtoBriefingBox({ surtoId }: { surtoId: string }) {
  const { colors, theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const query = useSurtoBriefing(open ? surtoId : null)

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}>
        <Sparkles size={14} color={colors.action} />
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
          Gerar briefing jornalístico (IA) →
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={{ marginTop: 8, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: colors.border, gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.primary }}>Briefing do surto</Text>
        <Pressable onPress={() => setOpen(false)}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>Ocultar</Text>
        </Pressable>
      </View>

      {query.isPending ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}>
          <ActivityIndicator size="small" color={colors.action} />
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
            Analisando relatos do surto…
          </Text>
        </View>
      ) : query.isError ? (
        <ErrorText message={errorMessage(query.error)} />
      ) : query.data ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
            {query.data.stats.totalReports} relatos · {query.data.stats.answeredReports} respondidos · pressão máx. {Math.round(query.data.stats.maxPressure)}
          </Text>
          {query.data.content && (
            <>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                {query.data.content.headline}
              </Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, lineHeight: 20 }}>
                {query.data.content.summary}
              </Text>
              {query.data.content.questions.length > 0 && (
                <View style={{ gap: 4 }}>
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.primary }}>
                    Perguntas sugeridas para apuração:
                  </Text>
                  {query.data.content.questions.map((question, idx) => (
                    <Text key={idx} style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.text }}>
                      • {question}
                    </Text>
                  ))}
                </View>
              )}
            </>
          )}
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>{query.data.disclaimer}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function PressRadarPanel() {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const rules = useRadarRules(!!user)
  const createRule = useCreateRadarRule()
  const updateRule = useUpdateRadarRule()
  const deleteRule = useDeleteRadarRule()

  const [openForm, setOpenForm] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<PressRadarKind>('SURGE')
  const [frequency, setFrequency] = useState<PressRadarFrequency>('IMMEDIATE')
  const [stateUf, setStateUf] = useState('')
  const [minPressure, setMinPressure] = useState('50')

  if (!user) return <State title="Entre na sua conta" description="Faça login como jornalista credenciado para configurar alertas no radar." />

  const handleCreate = () => {
    createRule.mutate(
      {
        name: name.trim(),
        kind,
        frequency,
        ...(stateUf.trim() ? { states: [stateUf.trim().toUpperCase()] } : {}),
        ...(kind === 'PRESSURE' ? { minPressure: Number(minPressure) || 50 } : {}),
        ...(kind === 'UNANSWERED' ? { stalledDays: 7 } : {}),
      },
      {
        onSuccess: () => {
          setName('')
          setStateUf('')
          setOpenForm(false)
        },
      },
    )
  }

  return (
    <View style={{ gap: 12 }}>
      <Button
        title={openForm ? 'Fechar formulário' : '+ Novo alerta de radar'}
        secondary={openForm}
        onPress={() => setOpenForm((v) => !v)}
      />

      {openForm && (
        <Card>
          <Field label="Nome do alerta *" value={name} onChangeText={setName} placeholder="Ex.: Surtos de saúde em SP" />
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>Tipo de aviso</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {PRESS_RADAR_KINDS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: kind === k ? colors.action : colors.border,
                    backgroundColor: kind === k ? colors.tint : colors.soft,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: kind === k ? colors.action : colors.primary }}>
                    {PRESS_RADAR_KIND_LABELS[k]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>Frequência</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PRESS_RADAR_FREQUENCIES.map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFrequency(f)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: frequency === f ? colors.action : colors.border,
                    backgroundColor: frequency === f ? colors.tint : colors.soft,
                  }}
                >
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: frequency === f ? colors.action : colors.primary, textAlign: 'center' }}>
                    {PRESS_RADAR_FREQUENCY_LABELS[f]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Field label="UF (opcional)" value={stateUf} onChangeText={setStateUf} maxLength={2} autoCapitalize="characters" placeholder="SP" />
          {kind === 'PRESSURE' && (
            <Field label="Pressão mínima" value={minPressure} onChangeText={setMinPressure} keyboardType="number-pad" />
          )}
          <ErrorText message={createRule.isError ? errorMessage(createRule.error) : undefined} />
          <Button title="Criar alerta" loading={createRule.isPending} disabled={name.trim().length < 2} onPress={handleCreate} />
        </Card>
      )}

      {rules.isPending ? (
        <State loading title="Carregando radar…" />
      ) : rules.isError ? (
        <State title="Radar indisponível" description={errorMessage(rules.error)} retry={() => { void rules.refetch() }} />
      ) : (rules.data ?? []).length === 0 ? (
        <State title="Nenhum alerta no radar" description="Crie alertas para ser avisado de surtos e relatos de alta pressão." />
      ) : (
        (rules.data ?? []).map((r) => (
          <Card key={r.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{r.name}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                  {PRESS_RADAR_KIND_LABELS[r.kind]} · {PRESS_RADAR_FREQUENCY_LABELS[r.frequency]}
                  {r.states.length > 0 ? ` · ${r.states.join(', ')}` : ''}
                </Text>
              </View>
              <Switch
                value={r.active}
                onValueChange={(active) => updateRule.mutate({ id: r.id, active })}
              />
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

export function PressSentContactsPanel() {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const sent = useSentPressContacts(!!user)
  const cancelMut = useCancelPressContact()

  if (!user) return <State title="Entre na sua conta" description="Faça login como jornalista credenciado para acompanhar pedidos enviados." />
  if (sent.isPending) return <State loading title="Carregando pedidos enviados…" />
  if (sent.isError) return <State title="Indisponível" description={errorMessage(sent.error)} />
  if (!sent.data || sent.data.length === 0) {
    return <State title="Nenhum pedido enviado" description="Quando você pedir contato ao autor de um relato, o andamento aparecerá aqui." />
  }

  return (
    <View style={{ gap: 10 }}>
      {sent.data.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action, textTransform: 'uppercase' }}>
              {PRESS_CONTACT_STATUS_LABELS[item.status]}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
              {new Date(item.createdAt).toLocaleDateString('pt-BR')}
            </Text>
          </View>
          <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.report.id } })}>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
              {item.report.title} →
            </Text>
          </Pressable>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text }}>{item.message}</Text>
          {item.status === 'ACCEPTED' && !!item.reply && (
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.positive }}>
              Resposta do autor: {item.reply}
            </Text>
          )}
          {item.status === 'PENDING' && (
            <Button
              title="Cancelar pedido"
              secondary
              loading={cancelMut.isPending}
              onPress={() => cancelMut.mutate(item.id)}
            />
          )}
        </Card>
      ))}
    </View>
  )
}

export function PressCredentialPanel() {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const cred = useMyPressCredential(!!user)
  const plan = usePressPlan(!!user)
  const createCred = useCreatePressCredential()
  const resendEmail = useResendPressEmail()

  const [outletName, setOutletName] = useState('')
  const [outletType, setOutletType] = useState<PressOutletType>('PORTAL')
  const [website, setWebsite] = useState('')
  const [newsroomEmail, setNewsroomEmail] = useState('')
  const [portfolioUrl, setPortfolioUrl] = useState('')
  const [jobTitle, setJobTitle] = useState('')

  if (!user) return <State title="Entre na sua conta" description="Faça login para solicitar ou acompanhar sua credencial de imprensa." />
  if (cred.isPending) return <State loading title="Verificando credencial…" />

  if (cred.data) {
    const c = cred.data
    return (
      <Card>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.action, textTransform: 'uppercase' }}>
          Credencial: {PRESS_CREDENTIAL_STATUS_LABELS[c.status]}
        </Text>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: colors.primary }}>{c.outletName}</Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
          {PRESS_OUTLET_LABELS[c.outletType]} · {c.newsroomEmail}
        </Text>
        {plan.data && (
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>
            Plano atual: {PRESS_PLAN_LABELS[plan.data.plan]}
          </Text>
        )}
        {!c.emailConfirmed && (
          <View style={{ gap: 8, marginTop: 4 }}>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.action }}>
              E-mail da redação ainda não confirmado. Verifique sua caixa de entrada.
            </Text>
            <Button
              title={resendEmail.isSuccess ? 'E-mail reenviado' : 'Reenviar e-mail de confirmação'}
              secondary
              loading={resendEmail.isPending}
              onPress={() => resendEmail.mutate()}
            />
          </View>
        )}
        {!!c.reviewNote && (
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
            Observação da moderação: {c.reviewNote}
          </Text>
        )}
      </Card>
    )
  }

  return (
    <Card>
      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
        Solicitar credencial de imprensa
      </Text>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
        Jornalistas verificados têm acesso ao Radar, Busca IA, Briefing de Surtos e pedidos de contato com autores.
      </Text>
      <Field label="Nome do veículo *" value={outletName} onChangeText={setOutletName} placeholder="Ex.: Folha Regional" />
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>Tipo de veículo *</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {PRESS_OUTLET_TYPES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setOutletType(t)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: outletType === t ? colors.action : colors.border,
                backgroundColor: outletType === t ? colors.tint : colors.soft,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: outletType === t ? colors.action : colors.primary }}>
                {PRESS_OUTLET_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Field label="Cargo (opcional)" value={jobTitle} onChangeText={setJobTitle} placeholder="Ex.: Repórter" />
      <Field label="Site do veículo *" value={website} onChangeText={setWebsite} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      <Field label="E-mail da redação *" value={newsroomEmail} onChangeText={setNewsroomEmail} placeholder="nome@veiculo.com.br" autoCapitalize="none" keyboardType="email-address" />
      <Field label="Link de matéria publicada (portfólio) *" value={portfolioUrl} onChangeText={setPortfolioUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
      <ErrorText message={createCred.isError ? errorMessage(createCred.error) : undefined} />
      <Button
        title="Enviar solicitação"
        loading={createCred.isPending}
        disabled={!outletName.trim() || !website.trim() || !newsroomEmail.trim() || !portfolioUrl.trim()}
        onPress={() =>
          createCred.mutate({
            outletName: outletName.trim(),
            outletType,
            website: website.trim(),
            newsroomEmail: newsroomEmail.trim(),
            portfolioUrls: [portfolioUrl.trim()],
            ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
          })
        }
      />
    </Card>
  )
}
