import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Category } from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Card, State } from '../components/ui'
import { statusLabels } from '../components/content-row'
import {
  PressCredentialPanel,
  PressRadarPanel,
  PressSearchPanel,
  PressSentContactsPanel,
  SurtoBriefingBox,
} from '../components/press-tools-panels'
import {
  usePressEntidadesRanking,
  usePressRelatosDestaque,
  usePressResumo,
  usePressSurtosAtivos,
  usePressTendencias,
} from '../hooks/use-press'
import { useAppTheme } from '../theme-context'

const CAT_LABELS: Record<Category, string> = {
  HEALTH: 'Saúde',
  MOBILITY: 'Mobilidade',
  SAFETY: 'Segurança',
  EDUCATION: 'Educação',
  SANITATION: 'Saneamento',
  HOUSING: 'Habitação',
  ENVIRONMENT: 'Meio Ambiente',
  INFRASTRUCTURE: 'Infraestrutura',
  URBAN_SERVICES: 'Serviços Urbanos',
  CORRUPTION: 'Corrupção',
  ACCESSIBILITY: 'Acessibilidade',
  SOCIAL_WELFARE: 'Assistência Social',
  OTHER: 'Outra',
}

type PressTab = 'destaques' | 'busca' | 'surtos' | 'radar' | 'contatos' | 'credencial' | 'tendencias' | 'entidades'

const TABS: readonly { value: PressTab; label: string }[] = [
  { value: 'destaques', label: 'Destaques' },
  { value: 'busca', label: 'Busca IA' },
  { value: 'surtos', label: 'Surtos' },
  { value: 'radar', label: 'Radar' },
  { value: 'contatos', label: 'Contatos' },
  { value: 'credencial', label: 'Credencial' },
  { value: 'tendencias', label: 'Tendências' },
  { value: 'entidades', label: 'Entidades' },
]

export default function ImprensaScreen() {
  const { colors, theme } = useAppTheme()
  const [tab, setTab] = useState<PressTab>('destaques')
  const resumo = usePressResumo()
  const destaques = usePressRelatosDestaque(20)
  const surtos = usePressSurtosAtivos()
  const tendencias = usePressTendencias(30)
  const entidades = usePressEntidadesRanking(20)

  return (
    <Screen>
      <Toolbar title="Portal de Imprensa" back />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
      >
        {TABS.map((t) => {
          const active = tab === t.value
          return (
            <Pressable
              key={t.value}
              onPress={() => setTab(t.value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 18,
                backgroundColor: active ? colors.action : colors.soft,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: active ? colors.onAccent : colors.primary }}>
                {t.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'destaques' && resumo.data && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'Relatos', value: resumo.data.totalReports.toLocaleString('pt-BR') },
              { label: 'Últimos 30d', value: resumo.data.reportsLast30.toLocaleString('pt-BR') },
              { label: 'Resolvidos', value: `${resumo.data.resolvedRate}%` },
              { label: 'Surtos ativos', value: String(resumo.data.activeSurtos) },
            ].map((kpi) => (
              <Card key={kpi.label} style={{ flex: 1, minWidth: 140, gap: 4 }}>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 22, color: colors.primary }}>{kpi.value}</Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{kpi.label}</Text>
              </Card>
            ))}
          </View>
        )}

        {tab === 'destaques' && (
          destaques.isPending ? (
            <State loading title="Carregando destaques…" />
          ) : (
            (destaques.data ?? []).map((r) => (
              <Pressable key={r.id} onPress={() => router.push({ pathname: '/report/[id]', params: { id: r.id } })}>
                <Card>
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.action }}>
                    {CAT_LABELS[r.category] ?? r.category} · {statusLabels[r.status] ?? r.status}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>{r.title}</Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                    {[r.city, r.state].filter(Boolean).join('/')} · Pressão {Math.round(r.pressureScore)} · {r._count.votes} apoios
                  </Text>
                </Card>
              </Pressable>
            ))
          )
        )}

        {tab === 'busca' && <PressSearchPanel />}

        {tab === 'surtos' && (
          surtos.isPending ? (
            <State loading title="Carregando surtos…" />
          ) : (surtos.data ?? []).length === 0 ? (
            <State title="Nenhum surto ativo" description="Quando houver concentração incomum de relatos, aparecerá aqui." />
          ) : (
            (surtos.data ?? []).map((s) => (
              <Card key={s.id}>
                <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.action }}>
                  SURTO ATIVO · {CAT_LABELS[s.category] ?? s.category}
                </Text>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: colors.primary }}>
                  {s.city}/{s.state}
                </Text>
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
                  {s.count} relatos concentrados · detectado em {new Date(s.detectedAt).toLocaleDateString('pt-BR')}
                </Text>
                <SurtoBriefingBox surtoId={s.id} />
              </Card>
            ))
          )
        )}

        {tab === 'radar' && <PressRadarPanel />}
        {tab === 'contatos' && <PressSentContactsPanel />}
        {tab === 'credencial' && <PressCredentialPanel />}

        {tab === 'tendencias' && (
          tendencias.isPending ? (
            <State loading title="Carregando tendências…" />
          ) : tendencias.data ? (
            <>
              <Card>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                  Categorias (últimos {tendencias.data.period} dias)
                </Text>
                {tendencias.data.byCategory.map((c) => (
                  <View key={c.category} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text }}>
                      {CAT_LABELS[c.category] ?? c.category}
                    </Text>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>
                      {c.count} ({c.pct}%)
                    </Text>
                  </View>
                ))}
              </Card>
              <Card>
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                  Cidades com mais relatos
                </Text>
                {tendencias.data.topCidades.map((c, idx) => (
                  <View key={`${c.city}-${c.state}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text }}>
                      {[c.city, c.state].filter(Boolean).join('/') || 'Sem cidade'}
                    </Text>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>{c.count}</Text>
                  </View>
                ))}
              </Card>
            </>
          ) : null
        )}

        {tab === 'entidades' && (
          entidades.isPending ? (
            <State loading title="Carregando ranking…" />
          ) : (
            (entidades.data ?? []).map((e, idx) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'entities', id: e.id } })}
              >
                <Card>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                        #{idx + 1} {e.legalName}
                      </Text>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                        {[e.city, e.state].filter(Boolean).join('/')} · {e.reportCount} relatos
                      </Text>
                    </View>
                    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.action }}>
                      {Math.round(e.votzScore)}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))
          )
        )}
      </ScrollView>
    </Screen>
  )
}
