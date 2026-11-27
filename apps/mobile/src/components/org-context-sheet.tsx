import { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Check from 'lucide-react-native/icons/check'
import Building2 from 'lucide-react-native/icons/building-2'
import Landmark from 'lucide-react-native/icons/landmark'
import Store from 'lucide-react-native/icons/store'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import User from 'lucide-react-native/icons/user'
import X from 'lucide-react-native/icons/x'
import { Avatar, Button, ErrorText, IconButton } from './ui'
import { useMyProfiles, useSwitchContext } from '../hooks/use-org-context'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { OrgContextType, OrgProfile } from '../lib/types'

const ORG_TYPE_LABELS: Record<OrgContextType, string> = {
  POLITICIAN: 'Político',
  ENTITY: 'Entidade pública',
  COMPANY: 'Empresa',
}

function OrgBadgeIcon({ type, color }: { type: OrgContextType; color: string }) {
  if (type === 'POLITICIAN') return <Landmark size={13} color={color} />
  if (type === 'ENTITY') return <Building2 size={13} color={color} />
  return <Store size={13} color={color} />
}

function toContextType(type: OrgContextType): 'politician' | 'entity' | 'company' {
  if (type === 'POLITICIAN') return 'politician'
  if (type === 'ENTITY') return 'entity'
  return 'company'
}

export function OrgContextSheet({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const { colors, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const user = useSession((s) => s.user)
  const activeContext = useSession((s) => s.activeContext)
  const profiles = useMyProfiles(visible)
  const switchCtx = useSwitchContext()

  const [pendingOrg, setPendingOrg] = useState<OrgProfile | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaSetupRequired, setMfaSetupRequired] = useState(false)

  const resetAndClose = () => {
    setPendingOrg(null)
    setMfaCode('')
    setMfaSetupRequired(false)
    switchCtx.reset()
    onClose()
  }

  const handleSelectPersonal = () => {
    if (!activeContext) {
      resetAndClose()
      return
    }
    setPendingOrg(null)
    setMfaSetupRequired(false)
    switchCtx.mutate(
      { contextType: 'personal' },
      {
        onSuccess: (res) => {
          if ('accessToken' in res) resetAndClose()
        },
      },
    )
  }

  const handleSelectOrg = (org: OrgProfile, code?: string) => {
    if (activeContext?.type === org.type && activeContext?.id === org.id) {
      resetAndClose()
      return
    }
    setMfaSetupRequired(false)
    switchCtx.mutate(
      {
        contextType: toContextType(org.type),
        contextId: org.id,
        ...(code ? { mfaCode: code.trim() } : {}),
      },
      {
        onSuccess: (res) => {
          if ('accessToken' in res) {
            resetAndClose()
          } else if ('requiresMfa' in res) {
            setPendingOrg(org)
          } else if ('requiresMfaSetup' in res) {
            setPendingOrg(org)
            setMfaSetupRequired(true)
          }
        },
      },
    )
  }

  const orgs = profiles.data?.orgs ?? []

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={resetAndClose}>
      <View style={sheetStyles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={resetAndClose} accessibilityLabel="Fechar seletor de perfil" />
        <View
          style={[
            sheetStyles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(20, insets.bottom + 12),
            },
          ]}
        >
          <View style={sheetStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: colors.primary }}>
                {pendingOrg ? 'Confirmar acesso' : 'Atuar como'}
              </Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 }}>
                {pendingOrg
                  ? `Verificação em duas etapas para ${pendingOrg.name}`
                  : 'Escolha qual perfil usar para publicar, avocar e responder'}
              </Text>
            </View>
            <IconButton label="Fechar" onPress={resetAndClose}>
              <X size={20} color={colors.muted} />
            </IconButton>
          </View>

          {pendingOrg ? (
            <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 8 }}>
              {mfaSetupRequired ? (
                <View style={{ backgroundColor: colors.soft, padding: 14, borderRadius: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ShieldCheck size={20} color={colors.action} />
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary, flex: 1 }}>
                      Autenticação em duas etapas necessária
                    </Text>
                  </View>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 }}>
                    Perfis institucionais exigem autenticador ativo. Ative o 2FA em "Meu Perfil → Segurança" no Votz Web e volte aqui para entrar como {pendingOrg.name}.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, color: colors.text, lineHeight: 20 }}>
                    Digite o código de 6 dígitos do seu aplicativo autenticador (ou um código de recuperação) para entrar em <Text style={{ fontFamily: theme.fonts.medium }}>{pendingOrg.name}</Text>.
                  </Text>
                  <TextInput
                    value={mfaCode}
                    onChangeText={setMfaCode}
                    placeholder="000000"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={12}
                    autoFocus
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 18,
                      letterSpacing: 4,
                      textAlign: 'center',
                      color: colors.text,
                      backgroundColor: colors.background,
                      fontFamily: theme.fonts.medium,
                    }}
                  />
                </>
              )}

              <ErrorText message={switchCtx.isError ? errorMessage(switchCtx.error) : undefined} />

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button
                  title="Voltar"
                  secondary
                  style={{ flex: 1 }}
                  onPress={() => {
                    setPendingOrg(null)
                    setMfaCode('')
                    setMfaSetupRequired(false)
                    switchCtx.reset()
                  }}
                />
                {!mfaSetupRequired && (
                  <Button
                    title="Confirmar"
                    style={{ flex: 1 }}
                    loading={switchCtx.isPending}
                    disabled={mfaCode.trim().length < 6}
                    onPress={() => handleSelectOrg(pendingOrg, mfaCode)}
                  />
                )}
              </View>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingTop: 4 }}>
              {profiles.isPending && (
                <ActivityIndicator color={colors.action} style={{ paddingVertical: 20 }} />
              )}

              {user && (
                <Pressable
                  accessibilityRole="button"
                  disabled={switchCtx.isPending}
                  onPress={handleSelectPersonal}
                  style={({ pressed }) => [
                    sheetStyles.row,
                    {
                      backgroundColor: !activeContext ? colors.tint : colors.soft,
                      borderColor: !activeContext ? colors.action : colors.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Avatar name={user.name} uri={user.avatarUrl} size={42} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary }} numberOfLines={1}>
                      {user.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <User size={13} color={colors.muted} />
                      <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                        Perfil pessoal (cidadão)
                      </Text>
                    </View>
                  </View>
                  {!activeContext && <Check size={18} color={colors.action} />}
                </Pressable>
              )}

              {orgs.map((org) => {
                const isSelected = activeContext?.type === org.type && activeContext?.id === org.id
                return (
                  <Pressable
                    key={`${org.type}-${org.id}`}
                    accessibilityRole="button"
                    disabled={switchCtx.isPending}
                    onPress={() => handleSelectOrg(org)}
                    style={({ pressed }) => [
                      sheetStyles.row,
                      {
                        backgroundColor: isSelected ? colors.tint : colors.soft,
                        borderColor: isSelected ? colors.action : colors.border,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Avatar name={org.name} uri={org.logoUrl} size={42} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary }} numberOfLines={1}>
                        {org.name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <OrgBadgeIcon type={org.type} color={colors.muted} />
                        <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
                          {ORG_TYPE_LABELS[org.type]} · {org.role}
                        </Text>
                      </View>
                    </View>
                    {isSelected && <Check size={18} color={colors.action} />}
                  </Pressable>
                )
              })}

              {!profiles.isPending && orgs.length === 0 && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, paddingVertical: 12, textAlign: 'center' }}>
                  Sua conta ainda não gerencia perfis de político, entidade ou empresa.
                </Text>
              )}

              <ErrorText message={switchCtx.isError ? errorMessage(switchCtx.error) : undefined} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  )
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
})
