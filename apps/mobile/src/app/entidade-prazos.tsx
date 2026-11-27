import { useEffect, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import UserCheck from 'lucide-react-native/icons/user-check'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, Field, State, TabStrip } from '../components/ui'
import { statusLabels } from '../components/content-row'
import {
  useAssignSlaReport,
  useSlaMembers,
  useSlaPerformance,
  useSlaPolicy,
  useSlaQueue,
  useSlaWorkload,
  useUpdateSlaPolicy,
  type SlaQueueItem,
  type SlaUrgencyFilter,
} from '../hooks/use-entity-company-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

type SectionTab = 'queue' | 'workload' | 'performance' | 'policy'

const SECTION_TABS: readonly { value: SectionTab; label: string }[] = [
  { value: 'queue', label: 'Fila' },
  { value: 'workload', label: 'Carga' },
  { value: 'performance', label: 'Desempenho' },
  { value: 'policy', label: 'Política' },
]

const URGENCY_TABS: readonly { value: SlaUrgencyFilter; label: string }[] = [
  { value: 'BREACHED', label: 'Vencidos' },
  { value: 'DUE_TODAY', label: 'Hoje' },
  { value: 'AT_RISK', label: 'Em risco' },
  { value: 'ALL', label: 'Todos' },
]

function QueueCard({ item }: { item: SlaQueueItem }) {
  const { colors, theme } = useAppTheme()
  const members = useSlaMembers(true)
  const assignMut = useAssignSlaReport()
  const [picking, setPicking] = useState(false)

  const badgeText =
    item.slaState === 'BREACHED'
      ? `Vencido${item.hoursOverdue ? ` há ${Math.round(item.hoursOverdue)}h` : ''}`
      : item.hoursRemaining !== null
        ? `${Math.max(0, Math.round(item.hoursRemaining))}h restantes`
        : statusLabels[item.status] ?? item.status
  const badgeColor =
    item.slaState === 'BREACHED'
      ? colors.action
      : item.slaState === 'AT_RISK'
        ? '#F59E0B'
        : colors.positive

  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: badgeColor, textTransform: 'uppercase' }}>
            {badgeText}
          </Text>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
            Pressão {Math.round(item.pressureScore)}
          </Text>
        </View>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>{item.title}</Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
          {[item.neighborhood, item.city, item.state].filter(Boolean).join(', ')} · {statusLabels[item.status] ?? item.status}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setPicking((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 }}
      >
        <UserCheck size={14} color={colors.action} />
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.action }}>
          {item.assignment?.assignee?.name ? `Responsável: ${item.assignment.assignee.name} (alterar)` : 'Atribuir responsável'}
        </Text>
      </Pressable>

      {picking && (
        <View style={{ gap: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Pressable
              onPress={() => assignMut.mutate({ reportId: item.id, assigneeId: null }, { onSuccess: () => setPicking(false) })}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.soft,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>Sem responsável</Text>
            </Pressable>
            {(members.data ?? []).map((m) => (
              <Pressable
                key={m.userId}
                onPress={() =>
                  assignMut.mutate({ reportId: item.id, assigneeId: m.userId }, { onSuccess: () => setPicking(false) })
                }
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: item.assignment?.assignee?.id === m.userId ? colors.action : colors.border,
                  backgroundColor: item.assignment?.assignee?.id === m.userId ? colors.tint : colors.soft,
                }}
              >
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.primary }}>
                  {m.name || 'Membro'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </Card>
  )
}

function SlaPolicyPanel() {
  const { colors, theme } = useAppTheme()
  const policy = useSlaPolicy(true)
  const updateMut = useUpdateSlaPolicy()
  const [escalation, setEscalation] = useState('24')
  const [hoursByCat, setHoursByCat] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState('')

  useEffect(() => {
    if (!policy.data) return
    setEscalation(String(policy.data.slaEscalationHours ?? 24))
    const merged: Record<string, string> = {}
    const source = { ...policy.data.defaultSlaHoursByCategory, ...policy.data.slaHours }
    Object.entries(source).forEach(([k, v]) => {
      merged[k] = String(v)
    })
    setHoursByCat(merged)
  }, [policy.data])

  if (policy.isPending) return <State loading title="Carregando política de SLA…" />
  if (policy.isError) return <State title="Política indisponível" description={errorMessage(policy.error)} />

  const save = () => {
    setSaved('')
    const parsed: Record<string, number> = {}
    Object.entries(hoursByCat).forEach(([k, v]) => {
      const n = Number(v)
      if (n > 0) parsed[k] = n
    })
    updateMut.mutate(
      { slaHours: parsed, slaEscalationHours: Number(escalation) || 24 },
      { onSuccess: () => setSaved('Política de SLA atualizada.') },
    )
  }

  return (
    <Card>
      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
        Política de prazos (horas)
      </Text>
      <Field label="Escalonamento antes do vencimento (horas)" value={escalation} onChangeText={setEscalation} keyboardType="number-pad" />
      {Object.entries(hoursByCat).slice(0, 8).map(([cat, val]) => (
        <Field
          key={cat}
          label={`SLA — ${cat} (horas)`}
          value={val}
          onChangeText={(next) => setHoursByCat((prev) => ({ ...prev, [cat]: next }))}
          keyboardType="number-pad"
        />
      ))}
      {!!saved && <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.positive }}>{saved}</Text>}
      <ErrorText message={updateMut.isError ? errorMessage(updateMut.error) : undefined} />
      <Button title="Salvar política" loading={updateMut.isPending} onPress={save} />
    </Card>
  )
}

export default function EntidadePrazosScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const isEntity = activeContext?.type === 'ENTITY'

  const [section, setSection] = useState<SectionTab>('queue')
  const [urgency, setUrgency] = useState<SlaUrgencyFilter>('BREACHED')

  const queue = useSlaQueue(urgency, isEntity && section === 'queue')
  const workload = useSlaWorkload(isEntity && section === 'workload')
  const perf = useSlaPerformance(isEntity && section === 'performance')

  if (!isEntity) {
    return (
      <Screen>
        <Toolbar title="Prazos e fila (SLA)" back />
        <State
          title="Perfil de entidade necessário"
          description="Ative o perfil da sua entidade pública em Perfil → Atuar como para gerenciar prazos e SLA."
        />
      </Screen>
    )
  }

  const summary = queue.data?.summary

  return (
    <Screen>
      <Toolbar title="Prazos e fila (SLA)" back />
      <TabStrip tabs={SECTION_TABS} value={section} onChange={setSection} />

      {section === 'queue' && (
        <>
          <TabStrip tabs={URGENCY_TABS} value={urgency} onChange={setUrgency} />
          <FlatList
            style={{ flex: 1, backgroundColor: colors.soft }}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 }}
            data={queue.data?.items ?? []}
            keyExtractor={(item) => item.id}
            refreshing={queue.isRefetching}
            onRefresh={() => {
              void queue.refetch()
            }}
            ListHeaderComponent={
              summary ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Vencidos', value: summary.breached, color: colors.action },
                    { label: 'Vence hoje', value: summary.dueToday, color: '#F59E0B' },
                    { label: 'Em risco', value: summary.atRisk, color: '#F97316' },
                    { label: 'No prazo', value: summary.onTime, color: colors.positive },
                  ].map((k) => (
                    <Card key={k.label} style={{ flex: 1, minWidth: 130, padding: 12, gap: 2 }}>
                      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, color: k.color }}>{k.value}</Text>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>{k.label}</Text>
                    </Card>
                  ))}
                </View>
              ) : undefined
            }
            renderItem={({ item }) => <QueueCard item={item} />}
            ListEmptyComponent={
              <State
                loading={queue.isPending}
                title={
                  queue.isPending
                    ? 'Carregando fila de prazos…'
                    : queue.isError
                      ? 'Não foi possível carregar'
                      : 'Nenhum relato neste filtro'
                }
                description={queue.isError ? errorMessage(queue.error) : undefined}
                retry={queue.isError ? () => { void queue.refetch() } : undefined}
              />
            }
          />
        </>
      )}

      {section !== 'queue' && (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {section === 'workload' && (
            workload.isPending ? (
              <State loading title="Carregando carga da equipe…" />
            ) : workload.isError ? (
              <State title="Carga indisponível" description={errorMessage(workload.error)} />
            ) : workload.data ? (
              <>
                <Card>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: colors.primary }}>
                    {workload.data.unassignedCount} relato(s) sem responsável
                  </Text>
                </Card>
                {workload.data.members.map((m) => (
                  <Card key={m.userId}>
                    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                      {m.name || 'Membro'} · {m.roleName}
                    </Text>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                      Total: {m.totalAssigned} · Vencidos: {m.breached} · Hoje: {m.dueToday} · No prazo: {m.onTime}
                    </Text>
                  </Card>
                ))}
              </>
            ) : null
          )}

          {section === 'performance' && (
            perf.isPending ? (
              <State loading title="Carregando desempenho…" />
            ) : perf.isError ? (
              <State title="Desempenho indisponível" description={errorMessage(perf.error)} />
            ) : perf.data ? (
              <>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Card style={{ flex: 1, padding: 12 }}>
                    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: colors.positive }}>
                      {perf.data.summary.complianceRate.value !== null
                        ? `${Math.round(perf.data.summary.complianceRate.value * 100)}%`
                        : '—'}
                    </Text>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                      Cumprimento de SLA
                    </Text>
                  </Card>
                  <Card style={{ flex: 1, padding: 12 }}>
                    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: colors.primary }}>
                      {perf.data.summary.firstResponseMedianH !== null
                        ? `${Math.round(perf.data.summary.firstResponseMedianH)}h`
                        : '—'}
                    </Text>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
                      Mediana 1ª resposta
                    </Text>
                  </Card>
                </View>
                <Card>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                    Por categoria
                  </Text>
                  {perf.data.byCategory.map((c) => (
                    <View key={c.category} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text }}>
                        {c.category} (meta {c.declaredHours}h)
                      </Text>
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>
                        {c.complianceRate.value !== null ? `${Math.round(c.complianceRate.value * 100)}%` : '—'}
                      </Text>
                    </View>
                  ))}
                </Card>
              </>
            ) : null
          )}

          {section === 'policy' && <SlaPolicyPanel />}
        </ScrollView>
      )}
    </Screen>
  )
}
