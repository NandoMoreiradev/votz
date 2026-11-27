import { useEffect, useState } from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import Trash2 from 'lucide-react-native/icons/trash-2'
import { Screen, Toolbar } from '../components/screen'
import { Button, Card, ErrorText, Field, IconButton, State } from '../components/ui'
import {
  useCompanyDetail,
  useCreateCompanyBranch,
  useDeleteCompanyBranch,
  useUpdateCompany,
} from '../hooks/use-entity-company-tools'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'

export default function EmpresaEditarScreen() {
  const { colors, theme } = useAppTheme()
  const activeContext = useSession((s) => s.activeContext)
  const companyId = activeContext?.type === 'COMPANY' ? activeContext.id : undefined

  const query = useCompanyDetail(companyId)
  const updateMut = useUpdateCompany(companyId ?? '')
  const createBranchMut = useCreateCompanyBranch(companyId ?? '')
  const deleteBranchMut = useDeleteCompanyBranch(companyId ?? '')

  const [tradeName, setTradeName] = useState('')
  const [website, setWebsite] = useState('')
  const [slaHours, setSlaHours] = useState('48')
  const [savedMsg, setSavedMsg] = useState('')

  const [branchName, setBranchName] = useState('')
  const [branchAddress, setBranchAddress] = useState('')
  const [branchCity, setBranchCity] = useState('')
  const [branchState, setBranchState] = useState('')

  useEffect(() => {
    if (!query.data) return
    setTradeName(query.data.tradeName ?? '')
    setWebsite(query.data.website ?? '')
    setSlaHours(String(query.data.slaHours ?? 48))
  }, [query.data])

  if (!companyId) {
    return (
      <Screen>
        <Toolbar title="Empresa, SLA e filiais" back />
        <State
          title="Perfil de empresa necessário"
          description="Ative o perfil da sua empresa em Perfil → Atuar como para editar dados, SLA e filiais."
        />
      </Screen>
    )
  }

  const handleSave = () => {
    setSavedMsg('')
    updateMut.mutate(
      {
        tradeName: tradeName.trim(),
        website: website.trim() || undefined,
        slaHours: Number(slaHours) || 48,
      },
      {
        onSuccess: () => setSavedMsg('Alterações salvas com sucesso.'),
      },
    )
  }

  const handleAddBranch = () => {
    createBranchMut.mutate(
      {
        name: branchName.trim(),
        address: branchAddress.trim(),
        city: branchCity.trim(),
        state: branchState.trim().toUpperCase(),
      },
      {
        onSuccess: () => {
          setBranchName('')
          setBranchAddress('')
          setBranchCity('')
          setBranchState('')
        },
      },
    )
  }

  const confirmDeleteBranch = (branchId: string, name: string) => {
    Alert.alert('Remover filial?', `Deseja remover "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => deleteBranchMut.mutate(branchId) },
    ])
  }

  const branches = query.data?.branches ?? []

  return (
    <Screen>
      <Toolbar title="Empresa, SLA e filiais" back />
      {query.isPending ? (
        <State loading title="Carregando empresa…" />
      ) : query.isError ? (
        <State title="Não foi possível carregar" description={errorMessage(query.error)} retry={() => { void query.refetch() }} />
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.soft }}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
              Dados da empresa e SLA
            </Text>
            <Field label="Nome fantasia" value={tradeName} onChangeText={setTradeName} placeholder="Nome da empresa" />
            <Field label="Site oficial" value={website} onChangeText={setWebsite} placeholder="https://…" autoCapitalize="none" keyboardType="url" />
            <Field
              label="Prazo de resposta padrão — SLA (horas)"
              value={slaHours}
              onChangeText={setSlaHours}
              keyboardType="number-pad"
              placeholder="48"
            />
            {!!savedMsg && (
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.positive }}>{savedMsg}</Text>
            )}
            <ErrorText message={updateMut.isError ? errorMessage(updateMut.error) : undefined} />
            <Button title="Salvar alterações" loading={updateMut.isPending} onPress={handleSave} />
          </Card>

          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
              Filiais ({branches.length})
            </Text>
            {branches.length === 0 ? (
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
                Nenhuma filial cadastrada ainda.
              </Text>
            ) : (
              branches.map((b) => (
                <View
                  key={b.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    paddingTop: 10,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary }}>{b.name}</Text>
                    <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                      {b.address} · {b.city}/{b.state}
                    </Text>
                  </View>
                  <IconButton label={`Remover ${b.name}`} onPress={() => confirmDeleteBranch(b.id, b.name)}>
                    <Trash2 size={18} color={colors.action} />
                  </IconButton>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 16, color: colors.primary }}>
              Adicionar filial
            </Text>
            <Field label="Nome da unidade *" value={branchName} onChangeText={setBranchName} placeholder="Ex.: Filial Centro" />
            <Field label="Endereço *" value={branchAddress} onChangeText={setBranchAddress} placeholder="Rua, número e bairro" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <Field label="Cidade *" value={branchCity} onChangeText={setBranchCity} placeholder="São Paulo" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="UF *" value={branchState} onChangeText={setBranchState} maxLength={2} autoCapitalize="characters" placeholder="SP" />
              </View>
            </View>
            <ErrorText message={createBranchMut.isError ? errorMessage(createBranchMut.error) : undefined} />
            <Button
              title="Cadastrar filial"
              loading={createBranchMut.isPending}
              disabled={!branchName.trim() || !branchAddress.trim() || !branchCity.trim() || branchState.trim().length < 2}
              onPress={handleAddBranch}
            />
          </Card>
        </ScrollView>
      )}
    </Screen>
  )
}
