import { useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Tag from 'lucide-react-native/icons/tag'
import X from 'lucide-react-native/icons/x'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, State, TabStrip } from '../components/ui'
import { statusLabels } from '../components/content-row'
import {
  MandateAccountabilityPanel,
  MandateAlertsPanel,
  MandateTemplatesPanel,
} from '../components/mandate-panels'
import {
  useAddOrgNote,
  useAddOrgTag,
  useDeleteOrgTag,
  useMandateInbox,
  type MandateInboxItem,
} from '../hooks/use-politician-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

type SectionTab = 'inbox' | 'alerts' | 'templates' | 'accountability'
type FilterTab = 'unanswered' | 'advocated' | 'all'

const SECTION_TABS: readonly { value: SectionTab; label: string }[] = [
  { value: 'inbox', label: 'Caixa' },
  { value: 'alerts', label: 'Alertas' },
  { value: 'templates', label: 'Modelos' },
  { value: 'accountability', label: 'Prestação' },
]

const FILTER_TABS: readonly { value: FilterTab; label: string }[] = [
  { value: 'unanswered', label: 'Sem resposta' },
  { value: 'advocated', label: 'Avocados' },
  { value: 'all', label: 'Todos' },
]

function MandateReportCard({ item }: { item: MandateInboxItem }) {
  const { colors, theme } = useAppTheme()
  const addTag = useAddOrgTag()
  const deleteTag = useDeleteOrgTag()
  const addNote = useAddOrgNote()

  const [expanded, setExpanded] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [noteInput, setNoteInput] = useState('')

  const tags = item.internalTags ?? []
  const notes = item.internalNotes ?? []

  return (
    <Card>
      <Pressable onPress={() => router.push({ pathname: '/report/[id]', params: { id: item.id } })} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action }}>
            {statusLabels[item.status] ?? item.status} · Pressão {Math.round(item.pressureScore)}
          </Text>
          {item.advocatedByMe && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ShieldCheck size={13} color={colors.positive} />
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.positive }}>Avocado</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>{item.title}</Text>
        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
          {[item.neighborhood, item.city, item.state].filter(Boolean).join(', ')} · {item.supportCount} apoios · {item.commentsCount} comentários
        </Text>
      </Pressable>

      {tags.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((t) => (
            <View
              key={t.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 99,
                backgroundColor: colors.soft,
                borderWidth: 0.5,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.primary }}>#{t.label}</Text>
              <Pressable onPress={() => deleteTag.mutate({ reportId: item.id, tagId: t.id })}>
                <X size={12} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 }}
      >
        <Tag size={13} color={colors.muted} />
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>
          {expanded ? 'Ocultar tags e notas internas' : `Tags e notas internas (${tags.length + notes.length})`}
        </Text>
      </Pressable>

      {expanded && (
        <View style={{ gap: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={tagInput}
              onChangeText={setTagInput}
              placeholder="Nova tag (ex.: Urgente)"
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 13,
                color: colors.text,
                backgroundColor: colors.background,
              }}
            />
            <Button
              title="Tag"
              secondary
              disabled={tagInput.trim().length < 2 || addTag.isPending}
              onPress={() =>
                addTag.mutate(
                  { reportId: item.id, label: tagInput.trim() },
                  { onSuccess: () => setTagInput('') },
                )
              }
            />
          </View>

          {notes.map((n) => (
            <View key={n.id} style={{ backgroundColor: colors.soft, padding: 8, borderRadius: 8 }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.text }}>{n.content}</Text>
            </View>
          ))}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Nota interna da equipe…"
              placeholderTextColor={colors.muted}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                fontSize: 13,
                color: colors.text,
                backgroundColor: colors.background,
              }}
            />
            <Button
              title="Salvar"
              secondary
              disabled={noteInput.trim().length < 2 || addNote.isPending}
              onPress={() =>
                addNote.mutate(
                  { reportId: item.id, content: noteInput.trim() },
                  { onSuccess: () => setNoteInput('') },
                )
              }
            />
          </View>
        </View>
      )}
    </Card>
  )
}

export default function MandatoScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const isPolitician = activeContext?.type === 'POLITICIAN'

  const [section, setSection] = useState<SectionTab>('inbox')
  const [tab, setTab] = useState<FilterTab>('unanswered')
  const [sortBy, setSortBy] = useState<'pressure' | 'recent'>('pressure')

  const query = useMandateInbox(
    {
      onlyUnanswered: tab === 'unanswered',
      onlyAdvocated: tab === 'advocated',
      sortBy,
    },
    isPolitician && section === 'inbox',
  )

  if (!isPolitician) {
    return (
      <Screen>
        <Toolbar title="Portal do Mandato" back />
        <State
          title="Perfil de político necessário"
          description="Ative seu perfil de político em Perfil → Atuar como para acessar o Portal do Mandato."
        />
      </Screen>
    )
  }

  const kpis = query.data?.kpis

  return (
    <Screen>
      <Toolbar title="Portal do Mandato" back />
      <TabStrip tabs={SECTION_TABS} value={section} onChange={setSection} />

      {section !== 'inbox' ? (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {section === 'alerts' && <MandateAlertsPanel />}
          {section === 'templates' && <MandateTemplatesPanel />}
          {section === 'accountability' && <MandateAccountabilityPanel />}
        </ScrollView>
      ) : (
        <>
          <TabStrip tabs={FILTER_TABS} value={tab} onChange={setTab} />
          <FlatList
            style={{ flex: 1, backgroundColor: colors.soft }}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40, flexGrow: 1 }}
            data={query.data?.items ?? []}
            keyExtractor={(item) => item.id}
            refreshing={query.isRefetching}
            onRefresh={() => {
              void query.refetch()
            }}
            ListHeaderComponent={
              <View style={{ gap: 10 }}>
                {kpis && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      { label: 'Sem resposta', value: kpis.unansweredCount },
                      { label: 'Avocados', value: kpis.advocatedInProgressCount },
                      { label: 'Resolvidos (mês)', value: kpis.resolvedThisMonthCount },
                    ].map((k) => (
                      <Card key={k.label} style={{ flex: 1, gap: 2, padding: 12 }}>
                        <Text style={{ fontFamily: theme.fonts.heading, fontSize: 20, color: colors.primary }}>{k.value}</Text>
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>{k.label}</Text>
                      </Card>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                    {query.data?.territory ? `Território: ${query.data.territory.state}` : ''}
                  </Text>
                  <Pressable onPress={() => setSortBy((s) => (s === 'pressure' ? 'recent' : 'pressure'))}>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.action }}>
                      Ordenar: {sortBy === 'pressure' ? 'Maior pressão' : 'Mais recentes'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            }
            renderItem={({ item }) => <MandateReportCard item={item} />}
            ListEmptyComponent={
              <State
                loading={query.isPending}
                title={
                  query.isPending
                    ? 'Carregando caixa do mandato…'
                    : query.isError
                      ? 'Não foi possível carregar'
                      : 'Nenhum relato neste filtro'
                }
                description={query.isError ? errorMessage(query.error) : undefined}
                retry={query.isError ? () => { void query.refetch() } : undefined}
              />
            }
          />
        </>
      )}
    </Screen>
  )
}
