import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import type { AdObjective } from '@votz/shared-types'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, Field, State, TabStrip } from '../components/ui'
import {
  useCompanyAdAccounts,
  useCompanyAdBilling,
  useCompanyAdCampaigns,
  useCompanyAdStats,
  useCompanyAdStatsByAd,
  useConfirmTestTopUp,
  useCreateCompanyAdAccount,
  useCreateCompanyCampaign,
  useCreateCompanyTopUp,
  useDuplicateCompanyCampaign,
  useSetCompanyCampaignStatus,
  useSubmitCompanyAd,
} from '../hooks/use-entity-company-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  DRAFT: 'Rascunho',
  ARCHIVED: 'Arquivada',
}

type AdsTab = 'campaigns' | 'report' | 'billing'

const TABS: readonly { value: AdsTab; label: string }[] = [
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'report', label: 'Relatório' },
  { value: 'billing', label: 'Faturamento' },
]

export default function EmpresaAnunciosScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : undefined

  const [tab, setTab] = useState<AdsTab>('campaigns')
  const [accountName, setAccountName] = useState('')

  // Nova campanha
  const [newOpen, setNewOpen] = useState(false)
  const [campName, setCampName] = useState('')
  const [objective, setObjective] = useState<AdObjective>('TRAFFIC')
  const [dailyReais, setDailyReais] = useState('20')
  const [headline, setHeadline] = useState('')
  const [body, setBody] = useState('')
  const [destinationUrl, setDestinationUrl] = useState('')

  // Recarga
  const [topUpReais, setTopUpReais] = useState('50')

  const accounts = useCompanyAdAccounts(companyId)
  const firstAccount = accounts.data?.[0]
  const accountId = firstAccount?.id

  const createAccount = useCreateCompanyAdAccount(companyId ?? '')
  const billing = useCompanyAdBilling(companyId, accountId)
  const stats = useCompanyAdStats(companyId, accountId, 30)
  const statsByAd = useCompanyAdStatsByAd(companyId, accountId, 30)
  const campaigns = useCompanyAdCampaigns(companyId, accountId)

  const toggleStatus = useSetCompanyCampaignStatus(companyId ?? '', accountId ?? '')
  const createCampaign = useCreateCompanyCampaign(companyId ?? '', accountId ?? '')
  const duplicateCampaign = useDuplicateCompanyCampaign(companyId ?? '', accountId ?? '')
  const submitAd = useSubmitCompanyAd(companyId ?? '', accountId ?? '')
  const createTopUp = useCreateCompanyTopUp(companyId ?? '', accountId ?? '')
  const confirmTestTopUp = useConfirmTestTopUp(companyId ?? '', accountId ?? '')

  if (!companyId) {
    return (
      <Screen>
        <Toolbar title="Anúncios e relatórios" back />
        <State
          title="Perfil de empresa necessário"
          description="Ative o perfil da sua empresa em Perfil → Atuar como para gerenciar campanhas e saldo."
        />
      </Screen>
    )
  }

  const totals = (stats.data ?? []).reduce(
    (acc, row) => ({
      impressions: acc.impressions + (row.viewableImpressions ?? 0),
      clicks: acc.clicks + (row.clicks ?? 0),
      spendCents: acc.spendCents + (row.spendCents ?? 0),
    }),
    { impressions: 0, clicks: 0, spendCents: 0 },
  )

  const handleCreateCampaign = () => {
    const budgetCents = Math.max(500, Math.round((Number(dailyReais.replace(',', '.')) || 20) * 100))
    createCampaign.mutate(
      {
        name: campName.trim(),
        objective,
        adSet: {
          name: 'Público principal',
          dailyBudgetCents: budgetCents,
          startAt: new Date().toISOString(),
          states: [],
          cities: [],
          interests: [],
          ageBands: [],
          genders: [],
          automaticAudience: true,
        },
        creative: {
          headline: headline.trim(),
          body: body.trim(),
          ctaLabel: objective === 'MESSAGES' ? 'Enviar mensagem' : 'Saiba mais',
          destinationKind: objective === 'MESSAGES' ? 'PAGE_MESSAGE' : 'URL',
          ...(objective === 'TRAFFIC' ? { destinationUrl: destinationUrl.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          setNewOpen(false)
          setCampName('')
          setHeadline('')
          setBody('')
          setDestinationUrl('')
        },
      },
    )
  }

  return (
    <Screen>
      <Toolbar title="Gerenciador de Anúncios" back />
      {firstAccount && <TabStrip tabs={TABS} value={tab} onChange={setTab} />}

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.soft }}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {accounts.isPending ? (
          <State loading title="Carregando conta de anúncios…" />
        ) : accounts.isError ? (
          <State title="Não foi possível carregar" description={errorMessage(accounts.error)} retry={() => { void accounts.refetch() }} />
        ) : !firstAccount ? (
          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: colors.primary }}>
              Criar conta de anúncios
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
              Ative sua conta de anúncios para divulgar sua empresa no feed do Votz.
            </Text>
            <Field label="Nome da conta *" value={accountName} onChangeText={setAccountName} placeholder={activeContext?.name || 'Minha empresa'} />
            <ErrorText message={createAccount.isError ? errorMessage(createAccount.error) : undefined} />
            <Button
              title="Criar conta"
              loading={createAccount.isPending}
              disabled={accountName.trim().length < 2}
              onPress={() => createAccount.mutate(accountName.trim())}
            />
          </Card>
        ) : (
          <>
            {tab === 'campaigns' && (
              <>
                <Button
                  title={newOpen ? 'Fechar nova campanha' : '+ Nova campanha'}
                  secondary={newOpen}
                  onPress={() => setNewOpen((v) => !v)}
                />

                {newOpen && (
                  <Card>
                    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
                      Nova campanha
                    </Text>
                    <Field label="Nome da campanha *" value={campName} onChangeText={setCampName} placeholder="Ex.: Promoção da semana" />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {([
                        { v: 'TRAFFIC', l: 'Visitas ao site' },
                        { v: 'MESSAGES', l: 'Mensagens no Votz' },
                      ] as const).map((opt) => (
                        <Pressable
                          key={opt.v}
                          onPress={() => setObjective(opt.v)}
                          style={{
                            flex: 1,
                            paddingVertical: 8,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: objective === opt.v ? colors.action : colors.border,
                            backgroundColor: objective === opt.v ? colors.tint : colors.soft,
                          }}
                        >
                          <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: objective === opt.v ? colors.action : colors.primary, textAlign: 'center' }}>
                            {opt.l}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Field label="Orçamento diário (R$)" value={dailyReais} onChangeText={setDailyReais} keyboardType="decimal-pad" placeholder="20" />
                    <Field label="Título do anúncio *" value={headline} onChangeText={setHeadline} placeholder="Chamada curta e clara" maxLength={80} />
                    <Field label="Texto do anúncio *" value={body} onChangeText={setBody} multiline placeholder="Descreva sua oferta ou serviço…" maxLength={280} />
                    {objective === 'TRAFFIC' && (
                      <Field label="Link de destino *" value={destinationUrl} onChangeText={setDestinationUrl} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
                    )}
                    <ErrorText message={createCampaign.isError ? errorMessage(createCampaign.error) : undefined} />
                    <Button
                      title="Criar campanha"
                      loading={createCampaign.isPending}
                      disabled={
                        campName.trim().length < 2 ||
                        headline.trim().length < 3 ||
                        body.trim().length < 10 ||
                        (objective === 'TRAFFIC' && !destinationUrl.trim().startsWith('http'))
                      }
                      onPress={handleCreateCampaign}
                    />
                  </Card>
                )}

                <ErrorText
                  message={
                    toggleStatus.isError
                      ? errorMessage(toggleStatus.error)
                      : duplicateCampaign.isError
                        ? errorMessage(duplicateCampaign.error)
                        : submitAd.isError
                          ? errorMessage(submitAd.error)
                          : undefined
                  }
                />

                {campaigns.isPending ? (
                  <State loading title="Carregando campanhas…" />
                ) : (campaigns.data ?? []).length === 0 ? (
                  <State title="Nenhuma campanha criada" description="Toque em '+ Nova campanha' para criar sua primeira." />
                ) : (
                  (campaigns.data ?? []).map((c) => {
                    const isActive = c.status === 'ACTIVE'
                    const canToggle = c.status === 'ACTIVE' || c.status === 'PAUSED'
                    const draftAd = c.adSets.flatMap((s) => s.ads).find((a) => a.reviewStatus === 'NOT_SUBMITTED')
                    return (
                      <Card key={c.id}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary, flex: 1 }}>
                            {c.name}
                          </Text>
                          <Text
                            style={{
                              fontFamily: theme.fonts.medium,
                              fontSize: 11,
                              color: isActive ? colors.positive : colors.muted,
                              textTransform: 'uppercase',
                            }}
                          >
                            {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                          Objetivo: {c.objective} · {c.adSets.length} conjunto(s)
                        </Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {draftAd && (
                            <Button
                              title="Enviar p/ revisão"
                              style={{ flex: 1, minWidth: 120 }}
                              loading={submitAd.isPending}
                              onPress={() => submitAd.mutate(draftAd.id)}
                            />
                          )}
                          {canToggle && (
                            <Button
                              title={isActive ? 'Pausar' : 'Ativar'}
                              secondary={isActive}
                              style={{ flex: 1, minWidth: 110 }}
                              loading={toggleStatus.isPending}
                              onPress={() =>
                                toggleStatus.mutate({ campaignId: c.id, status: isActive ? 'PAUSED' : 'ACTIVE' })
                              }
                            />
                          )}
                          <Button
                            title="Duplicar"
                            secondary
                            style={{ flex: 1, minWidth: 110 }}
                            loading={duplicateCampaign.isPending}
                            onPress={() => duplicateCampaign.mutate(c.id)}
                          />
                        </View>
                      </Card>
                    )
                  })
                )}
              </>
            )}

            {tab === 'report' && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { label: 'Exibições (30d)', value: totals.impressions.toLocaleString('pt-BR') },
                    { label: 'Cliques (30d)', value: totals.clicks.toLocaleString('pt-BR') },
                    { label: 'Gasto (30d)', value: formatBRL(totals.spendCents) },
                  ].map((k) => (
                    <Card key={k.label} style={{ flex: 1, minWidth: 110, padding: 12, gap: 2 }}>
                      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: colors.primary }}>{k.value}</Text>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>{k.label}</Text>
                    </Card>
                  ))}
                </View>

                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                  Desempenho por anúncio (30d)
                </Text>
                {(statsByAd.data ?? []).length === 0 ? (
                  <State title="Sem dados de entrega ainda" description="Assim que seus anúncios rodarem, os números aparecem aqui." />
                ) : (
                  (statsByAd.data ?? []).map((row) => (
                    <Card key={row.adId}>
                      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>{row.headline}</Text>
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                        {row.campaignName} · {row.viewableImpressions.toLocaleString('pt-BR')} exibições · {row.clicks} cliques · {formatBRL(row.spendCents)}
                      </Text>
                    </Card>
                  ))
                )}
              </>
            )}

            {tab === 'billing' && (
              <>
                <Card>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                    Conta: {firstAccount.name}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 26, color: colors.primary }}>
                    {billing.data ? formatBRL(billing.data.account.balanceCents) : '—'}
                  </Text>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                    Saldo disponível · Modo: {billing.data?.mode ?? '—'}
                  </Text>
                </Card>

                <Card>
                  <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                    Adicionar saldo
                  </Text>
                  <Field label="Valor (R$)" value={topUpReais} onChangeText={setTopUpReais} keyboardType="decimal-pad" placeholder="50" />
                  <ErrorText message={createTopUp.isError ? errorMessage(createTopUp.error) : undefined} />
                  <Button
                    title="Gerar recarga"
                    loading={createTopUp.isPending}
                    onPress={() => {
                      const amountCents = Math.round((Number(topUpReais.replace(',', '.')) || 50) * 100)
                      const method = billing.data?.methods?.[0] ?? 'PIX'
                      createTopUp.mutate({ amountCents, method })
                    }}
                  />
                </Card>

                {(billing.data?.topUps ?? []).map((t) => (
                  <Card key={t.id}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontFamily: theme.fonts.heading, fontSize: 15, color: colors.primary }}>
                        {formatBRL(t.amountCents)}
                      </Text>
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.muted }}>{t.status}</Text>
                    </View>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                      {t.method} · {new Date(t.createdAt).toLocaleDateString('pt-BR')}
                    </Text>
                    {billing.data?.mode === 'test' && t.status === 'PENDING' && (
                      <Button
                        title="Confirmar recarga (teste)"
                        secondary
                        loading={confirmTestTopUp.isPending}
                        onPress={() => confirmTestTopUp.mutate(t.id)}
                      />
                    )}
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
