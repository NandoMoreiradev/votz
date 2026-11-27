import { useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import Scale from 'lucide-react-native/icons/scale'
import CheckCircle from 'lucide-react-native/icons/check-circle'
import ArchiveIcon from 'lucide-react-native/icons/archive'
import { REPORT_LIFECYCLE_LIMITS as L, ReportStatus, getArchiveReasonLabel } from '@votz/shared-types'
import { Avatar, Button, ErrorText } from './ui'
import { useConfirmResolution, useWithdrawAdvocacy } from '../hooks/use-org-context'
import { errorMessage } from '../lib/api'
import { useAppTheme } from '../theme-context'
import type { Report, ReportAdvocacyCard } from '../lib/types'

export function formatDay(iso: string | Date) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Abre o perfil público da instituição (político ou entidade). */
export function openOrgProfile(orgType: string, orgId: string | null | undefined) {
  if (!orgId) return
  const kind = orgType === 'POLITICIAN' ? 'politicians' : orgType === 'ENTITY' ? 'entities' : null
  if (kind) router.push({ pathname: '/profile/[kind]/[id]', params: { kind, id: orgId } })
}

/** Linha de opções em "pílulas" (status, motivo, prazo). */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  const { colors, theme } = useAppTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <Pressable
            key={opt.value || 'none'}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt.value)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: active ? colors.action : colors.border,
              backgroundColor: active ? colors.tint : colors.soft,
            }}
          >
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: active ? colors.action : colors.primary }}>
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/** Quem assumiu o relato em público (avocações ativas). */
export function AdvocacyCommitments({ report }: { report: Report }) {
  const { colors, theme } = useAppTheme()
  const [now] = useState(() => Date.now())
  const active = (report.advocacies ?? []).filter((a) => !a.closedAt)
  if (active.length === 0) return null
  const open = report.status !== ReportStatus.RESOLVED && report.status !== ReportStatus.ARCHIVED
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={16} color={colors.primary} />
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>
          {active.length === 1 ? 'Relato avocado' : `${active.length} avocaram este relato`}
        </Text>
      </View>
      {active.map((a: ReportAdvocacyCard) => {
        const late = open && a.promisedFor && new Date(a.promisedFor).getTime() < now
        return (
          <Pressable
            key={`${a.orgType}:${a.orgId}`}
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${a.name}`}
            onPress={() => openOrgProfile(a.orgType, a.orgId)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}
          >
            <Avatar name={a.name} uri={a.avatarUrl} size={30} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 }}>
                <Text style={{ fontFamily: theme.fonts.medium }}>{a.name}</Text> assumiu o compromisso público de
                acompanhar até a solução.
              </Text>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: late ? colors.action : colors.muted }}>
                {a.subtitle ? `${a.subtitle} · ` : ''}desde {formatDay(a.createdAt)}
                {a.promisedFor ? (late ? ` · prazo prometido venceu em ${formatDay(a.promisedFor)}` : ` · prazo: ${formatDay(a.promisedFor)}`) : ''}
              </Text>
              {a.message ? (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>“{a.message}”</Text>
              ) : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Situação do relato: contestado (em análise), arquivado (com motivo) ou resolvido (confirme ou conteste). */
export function LifecycleNotice({ report, isAuthor }: { report: Report; isAuthor: boolean }) {
  const { colors, theme } = useAppTheme()
  const confirm = useConfirmResolution(report.id)

  const box = (accent: string, icon: React.ReactNode, children: React.ReactNode) => (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        backgroundColor: colors.soft,
      }}
    >
      {icon}
      <View style={{ flex: 1, gap: 8 }}>{children}</View>
    </View>
  )
  const text = { fontFamily: theme.fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 }
  const bold = { fontFamily: theme.fonts.medium }

  if (report.status === ReportStatus.DISPUTED) {
    return box(
      colors.action,
      <Scale size={18} color={colors.action} />,
      <Text style={text}>
        <Text style={bold}>Em análise pela moderação do Votz.</Text> Alguém contestou a resolução. Quem recebeu o relato
        pode responder com provas; a moderação decide.
      </Text>,
    )
  }
  if (report.status === ReportStatus.ARCHIVED) {
    return box(
      colors.muted,
      <ArchiveIcon size={18} color={colors.muted} />,
      <Text style={text}>
        <Text style={bold}>Arquivado</Text>
        {report.archiveReason ? `: ${getArchiveReasonLabel(report.archiveReason)}.` : '.'} Quem fez o relato ou marcou “Eu
        também” pode contestar até 30 dias depois.
      </Text>,
    )
  }
  if (report.status !== ReportStatus.RESOLVED) return null

  return box(
    colors.positive,
    <CheckCircle size={18} color={colors.positive} />,
    <>
      <Text style={text}>
        {report.resolutionConfirmedAt ? (
          <>
            <Text style={bold}>Resolução confirmada</Text> por quem fez o relato.
          </>
        ) : (
          <>
            <Text style={bold}>Marcado como resolvido</Text>
            {report.resolvedWithoutEvidence ? ', sem foto ou documento.' : '.'}{' '}
            {isAuthor ? 'Foi resolvido mesmo? Confirme ou conteste.' : 'Quem fez o relato ainda não confirmou.'}
          </>
        )}
      </Text>
      {isAuthor && !report.resolutionConfirmedAt && (
        <Button title="Sim, foi resolvido" loading={confirm.isPending} onPress={() => confirm.mutate()} />
      )}
      <ErrorText message={confirm.isError ? errorMessage(confirm.error) : undefined} />
    </>,
  )
}

/** Desistir da avocação (público, com motivo, conta no Mandatômetro). */
export function WithdrawAdvocacy({ report, mine }: { report: Report; mine: ReportAdvocacyCard }) {
  const { colors, theme } = useAppTheme()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const withdraw = useWithdrawAdvocacy(report.id)

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
        Você avocou este relato em {formatDay(mine.createdAt)}
        {mine.promisedFor ? ` e prometeu solução até ${formatDay(mine.promisedFor)}` : ''}.
      </Text>
      {!open ? (
        <Button title="Desistir da avocação" secondary onPress={() => setOpen(true)} />
      ) : (
        <>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            A desistência fica na Memória do relato, com o motivo, e conta no Mandatômetro.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={`Por que você está desistindo? (mínimo ${L.WITHDRAW_MIN} letras)`}
            placeholderTextColor={colors.muted}
            multiline
            maxLength={500}
            style={{
              minHeight: 72,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              padding: 12,
              textAlignVertical: 'top',
              color: colors.text,
              backgroundColor: colors.background,
              fontFamily: theme.fonts.body,
              fontSize: 14,
            }}
          />
          <ErrorText message={withdraw.isError ? errorMessage(withdraw.error) : undefined} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Voltar" secondary style={{ flex: 1 }} disabled={withdraw.isPending} onPress={() => setOpen(false)} />
            <Button
              title="Confirmar"
              style={{ flex: 1 }}
              loading={withdraw.isPending}
              disabled={reason.trim().length < L.WITHDRAW_MIN}
              onPress={() => withdraw.mutate(reason.trim(), { onSuccess: () => { setOpen(false); setReason('') } })}
            />
          </View>
        </>
      )}
    </View>
  )
}
