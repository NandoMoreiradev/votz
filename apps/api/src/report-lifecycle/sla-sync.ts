import { SlaState } from '@prisma/client'
import { Category, RecipientType, ReportStatus, computeSla } from '@votz/shared-types'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Recalcula o estado de SLA (resposta e resolução) de um relato destinado a uma entidade.
 * Chamado depois de toda mudança de status ou primeira resposta, para o painel não esperar a rodada de 15 min.
 */
export async function syncReportSlaState(prisma: PrismaService, id: string, now = new Date()): Promise<void> {
  const row = await prisma.report.findUnique({
    where: { id },
    select: {
      category: true,
      status: true,
      recipientType: true,
      recipientId: true,
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
      slaStartedAt: true,
      slaDueAt: true,
      slaState: true,
      resolutionSlaDueAt: true,
    },
  })
  if (!row || row.recipientType !== RecipientType.ENTITY || !row.recipientId) return

  const entity = await prisma.entity.findUnique({
    where: { id: row.recipientId },
    select: { slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
  })

  const policy = {
    slaHours: row.slaDueAt && row.slaStartedAt
      ? {
          [row.category]: Math.max(
            1,
            Math.round((row.slaDueAt.getTime() - row.slaStartedAt.getTime()) / 3_600_000),
          ),
        }
      : ((entity?.slaHours as Record<string, number> | null) ?? null),
    resolutionSlaHours: row.resolutionSlaDueAt && row.slaStartedAt
      ? {
          [row.category]: Math.max(
            1,
            Math.round((row.resolutionSlaDueAt.getTime() - row.slaStartedAt.getTime()) / 3_600_000),
          ),
        }
      : ((entity?.resolutionSlaHours as Record<string, number> | null) ?? null),
    escalationHours: entity?.slaEscalationHours ?? 24,
  }

  const computed = computeSla(
    {
      category: row.category as Category,
      status: row.status as ReportStatus,
      createdAt: row.createdAt,
      firstResponseAt: row.firstResponseAt,
      resolvedAt: row.resolvedAt,
      slaStartedAt: row.slaStartedAt ?? row.createdAt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slaState: (row.slaState as any) ?? null,
    },
    policy,
    now,
  )

  await prisma.report.update({
    where: { id },
    data: {
      slaStartedAt: computed.slaStartedAt,
      slaDueAt: computed.slaDueAt,
      slaState: (computed.slaState as SlaState | null) ?? null,
      slaMetAt: computed.slaMetAt,
      resolutionSlaDueAt: computed.resolution?.dueAt ?? null,
      resolutionSlaState: (computed.resolution?.state as SlaState | null) ?? null,
      resolutionSlaMetAt: computed.resolution?.metAt ?? null,
    },
  })
}
