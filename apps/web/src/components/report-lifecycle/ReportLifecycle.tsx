import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { CheckCircle, Clock, Scales, ShieldCheck, Warning, Archive } from '@phosphor-icons/react'
import {
  ArchiveReason,
  ARCHIVE_REASON_LABELS,
  EventType,
  REPORT_LIFECYCLE_LIMITS as L,
  ReportStatus,
  checkDisputeWindow,
  getArchiveReasonLabel,
  getReportStatusLabel,
  recipientStatusOptions,
} from '@votz/shared-types'
import { Button } from '../ui/Button'
import { AdvocateConfirmModal } from '../posts/AdvocateConfirmModal'
import { useConfirmResolution, useDisputeReport, useUpdateReportStatus, useWithdrawAdvocacy } from '../../hooks/useReports'
import { uploadReportMedia } from '../../lib/report-upload'
import { apiErrorMessage } from '../../lib/api-error'
import type { Report, ReportAdvocacyCard } from '../../types/api'

// ── Estilos (só tokens do tema) ────────────────────────────────────────────────

export const LcCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 20px;
`

const Title = styled.h3`
  margin: 0 0 12px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  gap: 8px;
`

const Help = styled.p`
  margin: 0 0 12px;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.muted};
`

const ErrorText = styled.p`
  margin: 8px 0 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

const Field = styled.label`
  display: block;
  margin-bottom: 10px;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Select = styled.select`
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 9px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const Textarea = styled.textarea`
  display: block;
  width: 100%;
  min-height: 96px;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.body};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  resize: vertical;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primaryText}; }
`

const Count = styled.span<{ $warn: boolean }>`
  display: block;
  text-align: right;
  margin-top: 4px;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ $warn, theme }) => ($warn ? theme.colors.action : theme.colors.muted)};
`

const CheckRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 10px 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  input { margin-top: 2px; accent-color: ${({ theme }) => theme.colors.primaryText}; }
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
`

const FileLabel = styled.label`
  display: inline-flex;
  margin-top: 10px;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.info};
  cursor: pointer;
  input { display: none; }
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
`

const Chip = styled.span<{ $error?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  button { border: none; background: transparent; cursor: pointer; color: ${({ theme }) => theme.colors.muted}; padding: 0; }
`

const Notice = styled.div<{ $tone: 'info' | 'warning' | 'positive' | 'muted' }>`
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid
    ${({ $tone, theme }) =>
      $tone === 'info' ? theme.colors.info : $tone === 'warning' ? theme.colors.warning : $tone === 'positive' ? theme.colors.positive : theme.colors.muted};
  background: ${({ theme }) => theme.colors.surface};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
  color: ${({ theme }) => theme.colors.text};
  margin-top: 16px;
  svg { flex-shrink: 0; margin-top: 2px; }
  b { font-weight: ${({ theme }) => theme.fontWeights.semibold}; }
`

const NoticeBody = styled.div`
  flex: 1;
  min-width: 0;
`

const CommitList = styled.ul`
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`

const CommitItem = styled.li`
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.surface};
`

const Avatar = styled.div<{ $src: string | null }>`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : theme.colors.neutral)};
  color: ${({ theme }) => theme.colors.muted};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: ${({ theme }) => theme.fontWeights.bold};
`

const CommitName = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  text-decoration: none;
  &:hover { text-decoration: underline; }
`

const CommitMeta = styled.div`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-top: 2px;
`

const Late = styled.span`
  color: ${({ theme }) => theme.colors.warning};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

function formatDay(iso: string | Date) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function orgProfilePath(orgType: string, orgId: string | null | undefined) {
  if (!orgId) return null
  return orgType === 'POLITICIAN' ? `/politico/${orgId}` : orgType === 'ENTITY' ? `/entidade/${orgId}` : null
}

/** Datas das contestações já feitas, para a regra de "uma contestação por resolução". */
export function disputeDatesOf(report: Report): string[] {
  return (report.timeline ?? []).filter((e) => e.type === EventType.DISPUTED).map((e) => e.createdAt)
}

// ── Compromissos públicos (avocações) ─────────────────────────────────────────

export function AdvocacyCommitments({ report }: { report: Report }) {
  const active = (report.advocacies ?? []).filter((a) => !a.closedAt)
  if (active.length === 0) return null
  const open = report.status !== ReportStatus.RESOLVED && report.status !== ReportStatus.ARCHIVED
  return (
    <CommitList aria-label="Quem assumiu este relato">
      {active.map((a: ReportAdvocacyCard) => {
        const path = orgProfilePath(a.orgType, a.orgId)
        const late = open && a.promisedFor && new Date(a.promisedFor).getTime() < Date.now()
        return (
          <CommitItem key={`${a.orgType}:${a.orgId}`}>
            <Avatar $src={a.avatarUrl}>{!a.avatarUrl && <ShieldCheck size={20} weight="duotone" />}</Avatar>
            <div>
              <div>
                {path ? <CommitName to={path}>{a.name}</CommitName> : <b>{a.name}</b>} avocou este relato e assumiu o
                compromisso público de acompanhá-lo até a solução.
              </div>
              <CommitMeta>
                {a.subtitle ? `${a.subtitle} · ` : ''}desde {formatDay(a.createdAt)}
                {a.promisedFor && (
                  <>
                    {' · '}
                    {late ? <Late>prazo prometido venceu em {formatDay(a.promisedFor)}</Late> : `prazo prometido: ${formatDay(a.promisedFor)}`}
                  </>
                )}
              </CommitMeta>
              {a.message && <CommitMeta>“{a.message}”</CommitMeta>}
            </div>
          </CommitItem>
        )
      })}
    </CommitList>
  )
}

// ── Situação do relato (resolvido, arquivado, contestado) ─────────────────────

export function LifecycleNotice({ report, isAuthor }: { report: Report; isAuthor: boolean }) {
  const confirm = useConfirmResolution(report.id)

  if (report.status === ReportStatus.DISPUTED) {
    return (
      <Notice $tone="warning" role="status">
        <Scales size={20} weight="duotone" />
        <NoticeBody>
          <b>Em análise pela moderação do Votz.</b> Alguém contestou a resolução. Quem recebeu o relato pode responder
          com provas; a moderação decide se o relato volta a andar ou se a resolução vale.
        </NoticeBody>
      </Notice>
    )
  }

  if (report.status === ReportStatus.ARCHIVED) {
    return (
      <Notice $tone="muted" role="status">
        <Archive size={20} weight="duotone" />
        <NoticeBody>
          <b>Arquivado</b>
          {report.archiveReason ? `: ${getArchiveReasonLabel(report.archiveReason)}.` : '.'} Quem fez o relato ou marcou
          “Eu também” pode contestar até 30 dias depois do arquivamento.
        </NoticeBody>
      </Notice>
    )
  }

  if (report.status !== ReportStatus.RESOLVED) return null

  return (
    <Notice $tone={report.resolutionConfirmedAt ? 'positive' : 'info'} role="status">
      <CheckCircle size={20} weight="duotone" />
      <NoticeBody>
        {report.resolutionConfirmedAt ? (
          <>
            <b>Resolução confirmada</b> por quem fez o relato.
          </>
        ) : (
          <>
            <b>Marcado como resolvido</b>
            {report.resolvedWithoutEvidence ? ', sem foto ou documento (a explicação está no andamento).' : '.'}{' '}
            {isAuthor ? 'Foi resolvido mesmo? Confirme ou conteste.' : 'Quem fez o relato ainda não confirmou.'}
          </>
        )}
        {isAuthor && !report.resolutionConfirmedAt && (
          <Row>
            <Button size="sm" variant="primary" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
              {confirm.isPending ? 'Confirmando…' : 'Sim, foi resolvido'}
            </Button>
          </Row>
        )}
        {confirm.isError && <ErrorText>{apiErrorMessage(confirm.error, 'Não foi possível confirmar. Tente de novo.')}</ErrorText>}
      </NoticeBody>
    </Notice>
  )
}

// ── Contestar ─────────────────────────────────────────────────────────────────

export function DisputeCard({ report, canDispute }: { report: Report; canDispute: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const dispute = useDisputeReport(report.id)

  if (!canDispute) return null
  const check = checkDisputeWindow({
    status: report.status,
    resolvedAt: report.resolvedAt,
    archivedAt: report.archivedAt,
    disputeDates: disputeDatesOf(report),
  })
  if (!check.ok) return null

  const what = report.status === ReportStatus.ARCHIVED ? 'o arquivamento' : 'a resolução'
  const text = reason.trim()

  return (
    <LcCard>
      <Title>
        <Warning size={18} weight="duotone" /> Não foi resolvido?
      </Title>
      {!open ? (
        <>
          <Help>
            Você pode contestar {what} até {formatDay(check.deadline)}. A moderação do Votz analisa e decide.
          </Help>
          <Button variant="action" size="sm" onClick={() => setOpen(true)}>
            Contestar {what}
          </Button>
        </>
      ) : (
        <>
          <Help>Conte o que você viu. Quanto mais concreto, melhor (por exemplo: “o buraco continua lá, passei hoje”).</Help>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={L.DISPUTE_MAX}
            placeholder={`Por que o problema não foi resolvido? (mínimo ${L.DISPUTE_MIN} letras)`}
            aria-label="Motivo da contestação"
          />
          <Count $warn={text.length > 0 && text.length < L.DISPUTE_MIN}>
            {reason.length}/{L.DISPUTE_MAX}
          </Count>
          {dispute.isError && <ErrorText>{apiErrorMessage(dispute.error, 'Não foi possível contestar. Tente de novo.')}</ErrorText>}
          <Row>
            <Button
              variant="action"
              size="sm"
              disabled={text.length < L.DISPUTE_MIN || dispute.isPending}
              onClick={() =>
                dispute.mutate({ reason: text }, { onSuccess: () => { setOpen(false); setReason('') } })
              }
            >
              {dispute.isPending ? 'Enviando…' : 'Enviar contestação'}
            </Button>
            <Button variant="outline" size="sm" disabled={dispute.isPending} onClick={() => { setOpen(false); setReason('') }}>
              Cancelar
            </Button>
          </Row>
        </>
      )}
    </LcCard>
  )
}

// ── Dar andamento (destinatário ou quem avocou) ───────────────────────────────

interface UploadItem {
  id: string
  name: string
  url: string | null
  uploading: boolean
  error: boolean
}

export function ProgressCard({ report, isRecipient }: { report: Report; isRecipient: boolean }) {
  const [status, setStatus] = useState('')
  const [content, setContent] = useState('')
  const [noEvidence, setNoEvidence] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [files, setFiles] = useState<UploadItem[]>([])
  const mutation = useUpdateReportStatus(report.id)

  const options = isRecipient ? recipientStatusOptions(report.status) : []
  const uploading = files.some((f) => f.uploading)
  const media = files.filter((f) => f.url).map((f) => f.url!)
  const text = content.trim()
  const resolving = status === ReportStatus.RESOLVED
  const archiving = status === ReportStatus.ARCHIVED
  const minLen = resolving ? L.RESOLVE_MIN : L.UPDATE_MIN

  const blocker =
    text.length < minLen
      ? `Escreva pelo menos ${minLen} letras${resolving ? ' explicando o que foi feito' : ''}.`
      : resolving && media.length === 0 && !noEvidence
        ? 'Anexe uma foto ou documento, ou marque “sem foto ou documento”.'
        : archiving && !archiveReason
          ? 'Escolha o motivo do arquivamento.'
          : uploading
            ? 'Aguarde o envio dos arquivos.'
            : null

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []).slice(0, L.MEDIA_MAX - files.length)
    e.target.value = ''
    const items = list.map((f) => ({ id: Math.random().toString(36).slice(2), name: f.name, url: null, uploading: true, error: false }))
    setFiles((prev) => [...prev, ...items])
    await Promise.all(
      list.map(async (file, i) => {
        try {
          const { url } = await uploadReportMedia(file)
          setFiles((prev) => prev.map((it) => (it.id === items[i].id ? { ...it, url, uploading: false } : it)))
        } catch {
          setFiles((prev) => prev.map((it) => (it.id === items[i].id ? { ...it, uploading: false, error: true } : it)))
        }
      }),
    )
  }

  function submit() {
    if (blocker) return
    mutation.mutate(
      {
        ...(status ? { status } : {}),
        content: text,
        media,
        ...(resolving && media.length === 0 ? { noEvidence: true } : {}),
        ...(archiving ? { archiveReason } : {}),
      },
      {
        onSuccess: () => {
          setStatus('')
          setContent('')
          setNoEvidence(false)
          setArchiveReason('')
          setFiles([])
        },
      },
    )
  }

  return (
    <LcCard>
      <Title>
        <Clock size={18} weight="duotone" /> Dar andamento
      </Title>
      {!isRecipient && (
        <Help>Como você avocou, pode publicar atualizações. Só quem recebeu o relato muda o status.</Help>
      )}
      {isRecipient && report.status === ReportStatus.DISPUTED && (
        <Help>O relato está contestado. Responda com provas: quem decide é a moderação do Votz.</Help>
      )}
      {isRecipient && (report.status === ReportStatus.RESOLVED || report.status === ReportStatus.ARCHIVED) && (
        <Help>O relato já foi encerrado. Você ainda pode publicar informações; ele só volta a andar se for contestado.</Help>
      )}

      {options.length > 0 && (
        <Field>
          Status
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Manter “{getReportStatusLabel(report.status)}”</option>
            {options.map((s) => (
              <option key={s} value={s}>
                {getReportStatusLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {archiving && (
        <Field>
          Motivo do arquivamento
          <Select value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)}>
            <option value="">Escolha o motivo</option>
            {Object.values(ArchiveReason).map((r) => (
              <option key={r} value={r}>
                {ARCHIVE_REASON_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={L.UPDATE_MAX}
        aria-label="Texto do andamento"
        placeholder={resolving ? 'O que foi feito para resolver? Quando? Onde?' : 'Conte o que está sendo feito.'}
      />
      <Count $warn={text.length > 0 && text.length < minLen}>
        {content.length}/{L.UPDATE_MAX}
      </Count>

      {files.length < L.MEDIA_MAX && (
        <FileLabel>
          Anexar foto, vídeo ou PDF ({files.length}/{L.MEDIA_MAX})
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf" onChange={onFiles} />
        </FileLabel>
      )}
      {files.length > 0 && (
        <Chips>
          {files.map((f) => (
            <Chip key={f.id} $error={f.error}>
              {f.uploading ? 'Enviando… ' : f.error ? 'Falhou: ' : ''}
              {f.name}
              {!f.uploading && (
                <button type="button" aria-label={`Tirar ${f.name}`} onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>
                  ✕
                </button>
              )}
            </Chip>
          ))}
        </Chips>
      )}

      {resolving && media.length === 0 && (
        <CheckRow>
          <input type="checkbox" checked={noEvidence} onChange={(e) => setNoEvidence(e.target.checked)} />
          Resolver sem foto ou documento (a explicação acima vai aparecer para todos, e o cidadão pode contestar).
        </CheckRow>
      )}

      {mutation.isError && <ErrorText>{apiErrorMessage(mutation.error, 'Não foi possível publicar. Tente de novo.')}</ErrorText>}
      {text.length > 0 && blocker && <Help style={{ marginTop: 8, marginBottom: 0 }}>{blocker}</Help>}

      <Row>
        <Button variant="primary" size="sm" fullWidth disabled={!!blocker || mutation.isPending} onClick={submit}>
          {mutation.isPending ? 'Enviando…' : status ? `Mudar para “${getReportStatusLabel(status)}”` : 'Publicar atualização'}
        </Button>
      </Row>
    </LcCard>
  )
}

// ── Avocar ou desistir ────────────────────────────────────────────────────────

export function AdvocacyActionsCard({
  report,
  actorType,
  actorId,
}: {
  report: Report
  actorType: 'POLITICIAN' | 'ENTITY'
  actorId: string
}) {
  const [modal, setModal] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [reason, setReason] = useState('')
  const withdraw = useWithdrawAdvocacy(report.id)

  const mine = (report.advocacies ?? []).find((a) => a.orgType === actorType && a.orgId === actorId && !a.closedAt)
  const canAdvocate =
    report.status === ReportStatus.OPEN ||
    report.status === ReportStatus.UNDER_REVIEW ||
    report.status === ReportStatus.IN_PROGRESS ||
    report.status === ReportStatus.DISPUTED

  if (!mine && !canAdvocate) return null
  const title = actorType === 'POLITICIAN' ? 'Ação política' : 'Ação da entidade'

  if (mine) {
    return (
      <LcCard>
        <Title>
          <ShieldCheck size={18} weight="duotone" /> {title}
        </Title>
        <Help>
          Você avocou este relato em {formatDay(mine.createdAt)}
          {mine.promisedFor ? ` e prometeu uma solução até ${formatDay(mine.promisedFor)}` : ''}. Publique atualizações
          em “Dar andamento”.
        </Help>
        {!withdrawing ? (
          <Button variant="outline" size="sm" onClick={() => setWithdrawing(true)}>
            Desistir da avocação
          </Button>
        ) : (
          <>
            <Help>A desistência fica na Memória do relato, com o motivo, e conta no Mandatômetro.</Help>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-label="Motivo da desistência"
              placeholder={`Por que você está desistindo? (mínimo ${L.WITHDRAW_MIN} letras)`}
            />
            {withdraw.isError && <ErrorText>{apiErrorMessage(withdraw.error, 'Não foi possível desistir. Tente de novo.')}</ErrorText>}
            <Row>
              <Button
                variant="action"
                size="sm"
                disabled={reason.trim().length < L.WITHDRAW_MIN || withdraw.isPending}
                onClick={() => withdraw.mutate(reason.trim(), { onSuccess: () => { setWithdrawing(false); setReason('') } })}
              >
                {withdraw.isPending ? 'Enviando…' : 'Confirmar desistência'}
              </Button>
              <Button variant="outline" size="sm" disabled={withdraw.isPending} onClick={() => setWithdrawing(false)}>
                Voltar
              </Button>
            </Row>
          </>
        )}
      </LcCard>
    )
  }

  const isRecipient = report.recipientType === actorType && report.recipientId === actorId
  return (
    <LcCard>
      <Title>
        <ShieldCheck size={18} weight="duotone" /> {title}
      </Title>
      <Help>
        {isRecipient
          ? 'Este relato é para você. Ao avocar, você assume publicamente o problema e ele passa para “Em andamento”.'
          : 'Ao avocar, você assume publicamente o compromisso de cobrar a solução. Quem recebeu o relato continua responsável por resolver.'}
      </Help>
      <Button variant="primary" size="sm" fullWidth onClick={() => setModal(true)}>
        Avocar este relato
      </Button>
      <AdvocateConfirmModal
        isOpen={modal}
        reportId={report.id}
        reportTitle={report.title}
        actorType={actorType}
        actorId={actorId}
        onClose={() => setModal(false)}
      />
    </LcCard>
  )
}
