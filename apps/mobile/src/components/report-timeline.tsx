import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import ArrowUp from 'lucide-react-native/icons/arrow-up'
import Flame from 'lucide-react-native/icons/flame'
import Users from 'lucide-react-native/icons/users'
import ShieldCheck from 'lucide-react-native/icons/shield-check'
import AlertTriangle from 'lucide-react-native/icons/alert-triangle'
import FileText from 'lucide-react-native/icons/file-text'
import ImagePlus from 'lucide-react-native/icons/image-plus'
import Building2 from 'lucide-react-native/icons/building-2'
import Landmark from 'lucide-react-native/icons/landmark'
import X from 'lucide-react-native/icons/x'
import {
  ADVOCACY_PROMISE_DAYS,
  ARCHIVE_REASON_LABELS,
  ArchiveReason,
  EventType,
  REPORT_LIFECYCLE_LIMITS as L,
  ReportStatus,
  checkDisputeWindow,
  getReportStatusLabel,
  recipientStatusOptions,
  timelineEventLabel,
} from '@votz/shared-types'
import { Avatar, Button, ErrorText, IconButton, styles } from './ui'
import { OrgContextSheet } from './org-context-sheet'
import { PressContactCard } from './press-contact-card'
import { AdvocacyCommitments, ChoiceChips, LifecycleNotice, WithdrawAdvocacy, formatDay, openOrgProfile } from './report-lifecycle'
import {
  useAdvocateReport,
  useDisputeReport,
  useMyProfiles,
  useReportFollowers,
  useReportFollowStatus,
  useToggleFollowReport,
  useUpdateReportStatus,
  useVoteReport,
} from '../hooks/use-org-context'
import { api, errorMessage } from '../lib/api'
import { formatCount } from '../lib/format'
import { uploadReportMedia } from '../lib/report-upload'
import { useSession } from '../lib/session'
import { useAppTheme } from '../theme-context'
import type { Report, TimelineEvent } from '../lib/types'

const EVENT_COLORS: Record<string, string> = {
  [EventType.CREATED]: '#9CA3AF',
  [EventType.RESPONDED]: '#3B82F6',
  [EventType.STATUS_CHANGED]: '#F59E0B',
  [EventType.UPDATE]: '#8B5CF6',
  [EventType.DISPUTED]: '#F97316',
  [EventType.RESOLVED]: '#2DC653',
  [EventType.ARCHIVED]: '#6B7280',
}

const isVisualUrl = (url: string) => /\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(url)

function formatTimelineDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function TimelineRow({
  event,
  isLast,
  onOpenImage,
}: {
  event: TimelineEvent
  isLast: boolean
  onOpenImage: (url: string) => void
}) {
  const { colors, theme } = useAppTheme()
  const color = EVENT_COLORS[event.type] ?? '#9CA3AF'
  const meta = event.metadata as Record<string, unknown> | null | undefined
  const label = timelineEventLabel(String(event.type), meta)
  const media = Array.isArray(meta?.media)
    ? (meta.media as unknown[]).filter((u): u is string => typeof u === 'string' && u.length > 0)
    : []

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ alignItems: 'center', width: 20 }}>
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: color,
            borderWidth: 3,
            borderColor: colors.surface,
            marginTop: 2,
          }}
        />
        {!isLast && (
          <View
            style={{
              width: 2,
              flex: 1,
              backgroundColor: colors.border,
              marginTop: 4,
              marginBottom: 2,
            }}
          />
        )}
      </View>

      <View style={{ flex: 1, paddingBottom: isLast ? 4 : 20, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View
            style={{
              backgroundColor: `${color}1A`,
              borderColor: `${color}44`,
              borderWidth: 1,
              borderRadius: 99,
              paddingHorizontal: 9,
              paddingVertical: 2,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.medium,
                fontSize: 11,
                color,
                textTransform: 'uppercase',
                letterSpacing: 0.4,
              }}
            >
              {label}
            </Text>
          </View>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: colors.muted }}>
            {formatTimelineDate(event.createdAt)}
          </Text>
        </View>

        <Text style={[styles.text, { color: colors.text, fontSize: 14, lineHeight: 21 }]}>
          {event.content}
        </Text>

        {media.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 2 }}>
            {media.map((url) =>
              isVisualUrl(url) ? (
                <Pressable
                  key={url}
                  accessibilityRole="imagebutton"
                  accessibilityLabel="Ampliar imagem da atualização"
                  onPress={() => onOpenImage(url)}
                  style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.soft }}
                >
                  <Image source={url} recyclingKey={url} style={{ width: 72, height: 72 }} contentFit="cover" />
                </Pressable>
              ) : (
                <Pressable
                  key={url}
                  accessibilityRole="link"
                  accessibilityLabel="Abrir anexo"
                  onPress={() =>
                    void Linking.openURL(url).catch(() =>
                      Alert.alert('Não foi possível abrir', 'Tente novamente em instantes.'),
                    )
                  }
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 10,
                    backgroundColor: colors.soft,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <FileText size={22} color={colors.action} />
                  <Text style={{ fontSize: 10, color: colors.muted, fontFamily: theme.fonts.medium }}>Anexo</Text>
                </Pressable>
              ),
            )}
          </ScrollView>
        )}

        {event.actorOrg && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${event.actorOrg.name}`}
            disabled={!event.actorOrg.id}
            onPress={() => openOrgProfile(event.actorOrg!.type, event.actorOrg!.id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, alignSelf: 'flex-start' }}
          >
            <Avatar name={event.actorOrg.name} uri={event.actorOrg.avatarUrl ?? null} size={20} />
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>{event.actorOrg.name}</Text>
          </Pressable>
        )}
        {!event.actorOrg && event.author && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver perfil de ${event.author.name}`}
            onPress={() =>
              router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'users', id: event.author!.id } })
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, alignSelf: 'flex-start' }}
          >
            <Avatar name={event.author.name} uri={event.author.avatarUrl} size={20} />
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>
              {event.author.name}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

export function ReportTimeline({ timeline }: { timeline?: TimelineEvent[] }) {
  const { colors, theme } = useAppTheme()
  const [openedImage, setOpenedImage] = useState<string | null>(null)

  if (!timeline || timeline.length === 0) return null

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderTopWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: colors.border,
        padding: 16,
        gap: 14,
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.heading,
          fontSize: 13,
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        Andamento do relato
      </Text>
      <View>
        {timeline.map((event, idx) => (
          <TimelineRow
            key={event.id}
            event={event}
            isLast={idx === timeline.length - 1}
            onOpenImage={setOpenedImage}
          />
        ))}
      </View>

      <Modal visible={!!openedImage} transparent animationType="fade" onRequestClose={() => setOpenedImage(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000000F2' }}>
          <View style={{ alignItems: 'flex-end', paddingHorizontal: 16 }}>
            <IconButton label="Fechar imagem" onPress={() => setOpenedImage(null)}>
              <X color="#FFFFFF" size={24} />
            </IconButton>
          </View>
          {openedImage && <Image source={openedImage} style={{ flex: 1 }} contentFit="contain" />}
        </SafeAreaView>
      </Modal>
    </View>
  )
}

export function ReportDetailPanel({ report }: { report: Report }) {
  const { colors, theme } = useAppTheme()
  const user = useSession((s) => s.user)
  const activeContext = useSession((s) => s.activeContext)
  const profiles = useMyProfiles(!!user)

  const votes = useQuery({
    queryKey: ['report-votes', report.id, user?.id],
    queryFn: () => api<{ SUPPORT: boolean; ME_TOO: boolean }>(`/reports/${report.id}/votes/me`),
    enabled: !!user,
  })
  const voteMut = useVoteReport(report.id, user?.id)
  const disputeMut = useDisputeReport(report.id)
  const updateStatusMut = useUpdateReportStatus(report.id)
  const advocateMut = useAdvocateReport(report.id)

  const isActorType = activeContext?.type === 'POLITICIAN' || activeContext?.type === 'ENTITY'
  const actorId = activeContext?.id
  const followers = useReportFollowers(report.id)
  const followStatus = useReportFollowStatus(report.id, isActorType)
  const followReport = useToggleFollowReport(report.id)

  const [contextSheetOpen, setContextSheetOpen] = useState(false)

  // Dispute state
  const [showDispute, setShowDispute] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  // Advocate modal state
  const [advocateModalOpen, setAdvocateModalOpen] = useState(false)
  const [publishToFeed, setPublishToFeed] = useState(true)
  const [advocateText, setAdvocateText] = useState(
    'Avocação oficial: assumi o acompanhamento deste relato para cobrar providências. #Fiscalizacao',
  )
  const [promisedInDays, setPromisedInDays] = useState('')

  // Update status state
  const [showUpdateForm, setShowUpdateForm] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('')
  const [noEvidence, setNoEvidence] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [updateContent, setUpdateContent] = useState('')
  const [uploadedMedia, setUploadedMedia] = useState<string[]>([])
  const [uploadingMedia, setUploadingMedia] = useState(false)

  const myAdvocacy = actorId
    ? (report.advocacies ?? []).find((a) => a.orgType === activeContext?.type && a.orgId === actorId && !a.closedAt)
    : undefined

  const canAdvocate =
    isActorType &&
    !!actorId &&
    !myAdvocacy &&
    ([ReportStatus.OPEN, ReportStatus.UNDER_REVIEW, ReportStatus.IN_PROGRESS, ReportStatus.DISPUTED] as string[]).includes(report.status)

  const isRecipient =
    !!actorId &&
    activeContext?.type === report.recipientType &&
    report.recipientId === actorId

  // Quem recebeu ou quem avocou pode publicar; só quem recebeu muda o status (e só para os status permitidos).
  const canGiveUpdate = isRecipient || !!myAdvocacy
  const statusOptions = isRecipient ? recipientStatusOptions(report.status) : []
  const resolving = updateStatus === ReportStatus.RESOLVED
  const archiving = updateStatus === ReportStatus.ARCHIVED
  const minUpdate = resolving ? L.RESOLVE_MIN : L.UPDATE_MIN
  const updateBlocker =
    updateContent.trim().length < minUpdate
      ? `Escreva pelo menos ${minUpdate} letras${resolving ? ' explicando o que foi feito' : ''}.`
      : resolving && uploadedMedia.length === 0 && !noEvidence
        ? 'Anexe uma foto ou marque “sem foto ou documento”.'
        : archiving && !archiveReason
          ? 'Escolha o motivo do arquivamento.'
          : null

  const isAuthor = !!user && !report.anonymous && user.id === report.author?.id
  // Contestar: autor ou quem marcou "Eu também", até 30 dias, uma vez por resolução (a API confere de novo).
  const disputeWindow = checkDisputeWindow({
    status: report.status,
    resolvedAt: report.resolvedAt,
    archivedAt: report.archivedAt,
    disputeDates: (report.timeline ?? []).filter((e) => e.type === EventType.DISPUTED).map((e) => e.createdAt),
  })
  const canDispute = !!user && (isAuthor || !!votes.data?.ME_TOO) && disputeWindow.ok

  // Prompt to switch into org context if user manages the recipient or a politician/entity
  const recipientOrg = report.recipientId
    ? profiles.data?.orgs.find((o) => o.id === report.recipientId && o.type === report.recipientType)
    : undefined
  const fallbackOrg = !activeContext
    ? profiles.data?.orgs.find((o) => o.type === 'ENTITY' || o.type === 'POLITICIAN')
    : undefined
  const promptOrg = recipientOrg && !isRecipient ? recipientOrg : fallbackOrg

  const handleVote = (type: 'SUPPORT' | 'ME_TOO') => {
    if (!user) {
      router.push('/login')
      return
    }
    if (!voteMut.isPending) voteMut.mutate(type)
  }

  const handlePickUpdatePhoto = async () => {
    if (uploadedMedia.length >= 4 || uploadingMedia) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    setUploadingMedia(true)
    try {
      const { url } = await uploadReportMedia({
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        kind: 'image',
        name: asset.fileName || 'foto.jpg',
        size: asset.fileSize ?? undefined,
      })
      setUploadedMedia((prev) => [...prev, url])
    } catch (err) {
      Alert.alert('Erro no envio', errorMessage(err))
    } finally {
      setUploadingMedia(false)
    }
  }

  const handleSubmitUpdate = () => {
    if (updateBlocker || uploadingMedia) return
    const payload = {
      ...(updateStatus ? { status: updateStatus } : {}),
      content: updateContent.trim(),
      media: uploadedMedia,
      ...(resolving && uploadedMedia.length === 0 ? { noEvidence: true } : {}),
      ...(archiving ? { archiveReason } : {}),
    }
    updateStatusMut.mutate(payload, {
      onSuccess: () => {
        setUpdateStatus('')
        setNoEvidence(false)
        setArchiveReason('')
        setUpdateContent('')
        setUploadedMedia([])
        setShowUpdateForm(false)
      },
    })
  }

  const handleSubmitAdvocate = () => {
    if (!isActorType || !actorId) return
    advocateMut.mutate(
      {
        actorType: activeContext.type as 'POLITICIAN' | 'ENTITY',
        actorId,
        publishToFeed,
        postContent: publishToFeed ? advocateText.trim() : undefined,
        promisedInDays: promisedInDays ? Number(promisedInDays) : undefined,
      },
      {
        onSuccess: () => setAdvocateModalOpen(false),
      },
    )
  }

  return (
    <View style={{ gap: 10, paddingTop: 10 }}>
      {/* Votos (Apoiar + Eu também) e Pressão */}
      <View
        style={{
          padding: 16,
          gap: 12,
          backgroundColor: colors.surface,
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={votes.data?.SUPPORT ? 'Retirar meu apoio' : 'Apoiar relato'}
            disabled={!!user && (votes.isPending || voteMut.isPending)}
            onPress={() => handleVote('SUPPORT')}
            style={[
              localStyles.voteChip,
              {
                backgroundColor: votes.data?.SUPPORT ? colors.tint : colors.soft,
                borderColor: votes.data?.SUPPORT ? colors.action : colors.border,
              },
            ]}
          >
            <ArrowUp size={17} color={colors.action} />
            <Text style={{ fontFamily: theme.fonts.medium, color: colors.action, fontSize: 14 }}>
              {votes.data?.SUPPORT ? 'Apoiado' : 'Apoiar'} · {report._count.votes}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={votes.data?.ME_TOO ? 'Retirar Eu também' : 'Marcar Eu também'}
            disabled={!!user && (votes.isPending || voteMut.isPending)}
            onPress={() => handleVote('ME_TOO')}
            style={[
              localStyles.voteChip,
              {
                backgroundColor: votes.data?.ME_TOO ? colors.tint : colors.soft,
                borderColor: votes.data?.ME_TOO ? colors.action : colors.border,
              },
            ]}
          >
            <Users size={16} color={votes.data?.ME_TOO ? colors.action : colors.primary} />
            <Text
              style={{
                fontFamily: theme.fonts.medium,
                color: votes.data?.ME_TOO ? colors.action : colors.primary,
                fontSize: 14,
              }}
            >
              Eu também{typeof report._count.meTooVotes === 'number' ? ` · ${report._count.meTooVotes}` : ''}
            </Text>
          </Pressable>
        </View>

        {(() => {
          const pressurePct = Math.min((report.pressureScore / 200) * 100, 100)
          const pressureColor = report.pressureScore >= 120 ? '#E63946' : report.pressureScore >= 60 ? '#F59E0B' : '#9CA3AF'
          return (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Flame size={14} color={pressureColor} />
                  <Text style={{ color: colors.muted, fontSize: 11, fontFamily: theme.fonts.medium, letterSpacing: 0.6 }}>
                    PRESSÃO
                  </Text>
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  <Text style={{ fontFamily: theme.fonts.medium, color: colors.primary }}>{Math.round(report.pressureScore)} pts</Text> · {formatCount(report._count.comments, 'comentário', 'comentários')}
                </Text>
              </View>
              <View style={{ height: 4, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${pressurePct}%`, borderRadius: 999, backgroundColor: pressureColor }} />
              </View>
            </View>
          )
        })()}

        <ErrorText message={voteMut.isError ? errorMessage(voteMut.error) : undefined} />

        <LifecycleNotice report={report} isAuthor={isAuthor} />
        <AdvocacyCommitments report={report} />
      </View>

      {/* Contato da Imprensa (autor opt-in ou jornalista credenciado) */}
      <PressContactCard reportId={report.id} anonymous={report.anonymous} />

      {/* Prompt para entrar no perfil institucional */}
      {promptOrg && (
        <View
          style={{
            padding: 14,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary }}>
              Atuar como {promptOrg.name}
            </Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>
              Troque para o perfil institucional para avocar, acompanhar ou dar andamento a este relato.
            </Text>
          </View>
          <Button title="Trocar" secondary onPress={() => setContextSheetOpen(true)} />
        </View>
      )}

      {/* Ação Institucional: Avocar relato */}
      {canAdvocate && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
            {activeContext.type === 'POLITICIAN' ? 'Ação política' : 'Ação da entidade'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdvocateModalOpen(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: colors.primary,
              borderRadius: 22,
              minHeight: 42,
              paddingHorizontal: 16,
            }}
          >
            <ShieldCheck size={17} color={colors.onAccent} />
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.onAccent }}>
              Avocar este relato
            </Text>
          </Pressable>
          <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
            {isRecipient
              ? 'Este relato é para você. Ao avocar, você assume o problema em público e ele passa para “Em andamento”.'
              : 'Ao avocar, você assume publicamente o compromisso de cobrar a solução. Quem recebeu continua responsável por resolver.'}
          </Text>
        </View>
      )}

      {/* Avocação ativa: desistir com motivo */}
      {myAdvocacy && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
            Sua avocação
          </Text>
          <WithdrawAdvocacy report={report} mine={myAdvocacy} />
        </View>
      )}

      {/* Ação Institucional: Dar andamento / alterar status */}
      {canGiveUpdate && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
              Dar andamento
            </Text>
            <Pressable onPress={() => setShowUpdateForm((v) => !v)}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.action }}>
                {showUpdateForm ? 'Fechar' : 'Publicar atualização'}
              </Text>
            </Pressable>
          </View>

          {showUpdateForm && (
            <View style={{ gap: 10 }}>
              {isRecipient && statusOptions.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>
                    Novo status (opcional)
                  </Text>
                  <ChoiceChips
                    options={[
                      { value: '', label: `Manter “${getReportStatusLabel(report.status)}”` },
                      ...statusOptions.map((st) => ({ value: st as string, label: getReportStatusLabel(st) })),
                    ]}
                    value={updateStatus}
                    onChange={setUpdateStatus}
                  />
                  {archiving && (
                    <>
                      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: colors.muted }}>
                        Motivo do arquivamento
                      </Text>
                      <ChoiceChips
                        options={Object.values(ArchiveReason).map((r) => ({ value: r as string, label: ARCHIVE_REASON_LABELS[r] }))}
                        value={archiveReason}
                        onChange={setArchiveReason}
                      />
                    </>
                  )}
                </View>
              ) : (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                  {isRecipient
                    ? report.status === ReportStatus.DISPUTED
                      ? 'O relato está contestado. Responda com provas: quem decide é a moderação do Votz.'
                      : 'O relato já foi encerrado. Você ainda pode publicar informações; ele só volta a andar se for contestado.'
                    : 'Como você avocou, pode publicar atualizações. Só quem recebeu o relato muda o status.'}
                </Text>
              )}

              <TextInput
                value={updateContent}
                onChangeText={setUpdateContent}
                placeholder={resolving ? 'O que foi feito para resolver? Quando? Onde?' : 'Conte o que está sendo feito.'}
                placeholderTextColor={colors.muted}
                multiline
                maxLength={500}
                style={{
                  minHeight: 86,
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

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Pressable
                  disabled={uploadedMedia.length >= 4 || uploadingMedia}
                  onPress={() => void handlePickUpdatePhoto()}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: uploadedMedia.length >= 4 ? 0.5 : 1 }}
                >
                  {uploadingMedia ? (
                    <ActivityIndicator size="small" color={colors.action} />
                  ) : (
                    <ImagePlus size={18} color={colors.primary} />
                  )}
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.primary }}>
                    Anexar foto ({uploadedMedia.length}/4)
                  </Text>
                </Pressable>
                <Text style={{ fontSize: 12, color: colors.muted }}>{updateContent.length}/500</Text>
              </View>

              {uploadedMedia.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {uploadedMedia.map((url) => (
                    <View key={url} style={{ position: 'relative' }}>
                      <Image source={url} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                      <Pressable
                        onPress={() => setUploadedMedia((prev) => prev.filter((u) => u !== url))}
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          width: 22,
                          height: 22,
                          borderRadius: 11,
                          backgroundColor: colors.action,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={12} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {resolving && uploadedMedia.length === 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch value={noEvidence} onValueChange={setNoEvidence} accessibilityLabel="Resolver sem foto ou documento" />
                  <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: 12, color: colors.text, lineHeight: 18 }}>
                    Resolver sem foto ou documento (a explicação aparece para todos, e o cidadão pode contestar).
                  </Text>
                </View>
              )}

              {updateContent.trim().length > 0 && updateBlocker && (
                <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted }}>{updateBlocker}</Text>
              )}

              <ErrorText message={updateStatusMut.isError ? errorMessage(updateStatusMut.error) : undefined} />

              <Button
                title={updateStatus ? `Mudar para “${getReportStatusLabel(updateStatus)}”` : 'Publicar atualização'}
                loading={updateStatusMut.isPending}
                disabled={!!updateBlocker || uploadingMedia}
                onPress={handleSubmitUpdate}
              />
            </View>
          )}
        </View>
      )}

      {/* Contestar resolução (autor do relato) */}
      {canDispute && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} color={colors.action} />
            <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.primary, textTransform: 'uppercase' }}>
              Não foi resolvido?
            </Text>
          </View>
          {!showDispute ? (
            <>
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted, lineHeight: 19 }}>
                Você pode contestar {report.status === ReportStatus.ARCHIVED ? 'o arquivamento' : 'a resolução'}
                {disputeWindow.ok ? ` até ${formatDay(disputeWindow.deadline)}` : ''}. A moderação do Votz analisa e decide.
              </Text>
              <Button
                title={report.status === ReportStatus.ARCHIVED ? 'Contestar arquivamento' : 'Contestar resolução'}
                onPress={() => setShowDispute(true)}
              />
            </>
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput
                value={disputeReason}
                onChangeText={setDisputeReason}
                placeholder="Descreva por que o problema ainda não foi resolvido… (mín. 20 caracteres)"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={500}
                style={{
                  minHeight: 86,
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
              <Text style={{ fontSize: 12, color: colors.muted, textAlign: 'right' }}>{disputeReason.length}/500</Text>
              <ErrorText message={disputeMut.isError ? errorMessage(disputeMut.error) : undefined} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Cancelar"
                  secondary
                  style={{ flex: 1 }}
                  disabled={disputeMut.isPending}
                  onPress={() => {
                    setShowDispute(false)
                    setDisputeReason('')
                  }}
                />
                <Button
                  title="Enviar contestação"
                  style={{ flex: 1 }}
                  loading={disputeMut.isPending}
                  disabled={disputeReason.trim().length < L.DISPUTE_MIN}
                  onPress={() =>
                    disputeMut.mutate(
                      { reason: disputeReason.trim() },
                      {
                        onSuccess: () => {
                          setShowDispute(false)
                          setDisputeReason('')
                        },
                      },
                    )
                  }
                />
              </View>
            </View>
          )}
        </View>
      )}

      {/* Acompanhando (atores públicos) */}
      {(isActorType || (followers.data && followers.data.count > 0)) && (
        <View
          style={{
            padding: 16,
            gap: 10,
            backgroundColor: colors.surface,
            borderTopWidth: 0.5,
            borderBottomWidth: 0.5,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.heading, fontSize: 13, color: colors.muted, textTransform: 'uppercase' }}>
            Acompanhando
          </Text>
          {isActorType && (
            <Button
              title={followStatus.data?.following ? 'Deixar de acompanhar' : 'Acompanhar este relato'}
              secondary={!!followStatus.data?.following}
              loading={followReport.follow.isPending || followReport.unfollow.isPending}
              disabled={followStatus.isPending}
              onPress={() =>
                followStatus.data?.following
                  ? followReport.unfollow.mutate()
                  : followReport.follow.mutate()
              }
            />
          )}
          {followers.data && (
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: colors.muted }}>
              {followers.data.count === 0
                ? 'Nenhum político ou entidade acompanha este relato ainda.'
                : `${followers.data.count} ${followers.data.count === 1 ? 'ator público acompanha' : 'atores públicos acompanham'} este relato.`}
            </Text>
          )}
          {followers.data && followers.data.count > 0 && (
            <View style={{ gap: 6 }}>
              {followers.data.politicians.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Landmark size={14} color={colors.muted} />
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>
                    {p.name}
                    <Text style={{ fontFamily: theme.fonts.body, color: colors.muted }}>
                      {' '}· {p.office} – {p.state}
                    </Text>
                  </Text>
                </View>
              ))}
              {followers.data.entities.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Building2 size={14} color={colors.muted} />
                  <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>
                    {e.legalName}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Timeline sempre visível — pareada com o Votz Web */}
      <ReportTimeline timeline={report.timeline} />

      {/* Modal de confirmação de Avocação */}
      <Modal
        visible={advocateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAdvocateModalOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAdvocateModalOpen(false)} />
          <View
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 20,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={20} color={colors.primary} />
                <Text style={{ fontFamily: theme.fonts.heading, fontSize: 18, color: colors.primary }}>
                  Avocar relato
                </Text>
              </View>
              <IconButton label="Fechar" onPress={() => setAdvocateModalOpen(false)}>
                <X size={20} color={colors.muted} />
              </IconButton>
            </View>

            <View style={{ backgroundColor: colors.soft, padding: 12, borderRadius: 10 }}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.primary }} numberOfLines={2}>
                {report.title}
              </Text>
            </View>

            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: colors.text }}>
                Prazo para a solução (opcional)
              </Text>
              <ChoiceChips
                options={[
                  { value: '', label: 'Sem prazo' },
                  ...ADVOCACY_PROMISE_DAYS.map((d) => ({ value: String(d), label: `Até ${d} dias` })),
                ]}
                value={promisedInDays}
                onChange={setPromisedInDays}
              />
              <Text style={{ fontFamily: theme.fonts.body, fontSize: 12, color: colors.muted, lineHeight: 17 }}>
                O prazo aparece para todos. Se vencer sem solução, você e quem fez o relato recebem um aviso.
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.text, flex: 1 }}>
                Publicar avocação no feed
              </Text>
              <Switch value={publishToFeed} onValueChange={setPublishToFeed} />
            </View>

            {publishToFeed && (
              <TextInput
                value={advocateText}
                onChangeText={setAdvocateText}
                multiline
                maxLength={500}
                placeholder="Escreva uma mensagem sobre sua avocação…"
                placeholderTextColor={colors.muted}
                style={{
                  minHeight: 84,
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
            )}

            <ErrorText message={advocateMut.isError ? errorMessage(advocateMut.error) : undefined} />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title="Cancelar"
                secondary
                style={{ flex: 1 }}
                disabled={advocateMut.isPending}
                onPress={() => setAdvocateModalOpen(false)}
              />
              <Button
                title="Confirmar avocação"
                style={{ flex: 1 }}
                loading={advocateMut.isPending}
                onPress={handleSubmitAdvocate}
              />
            </View>
          </View>
        </View>
      </Modal>

      <OrgContextSheet visible={contextSheetOpen} onClose={() => setContextSheetOpen(false)} />
    </View>
  )
}

const localStyles = StyleSheet.create({
  voteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
})
