import { OrgPermission, PrismaClient, RecipientType, SlaState } from '@prisma/client'
import { computeSla } from '@votz/shared-types'

/**
 * Backfill idempotente de SLA e permissão ASSIGN_REPORTS para dados legados (Brief 4D).
 * Execução: `npm run db:backfill-sla --workspace=@votz/database`
 */
async function main() {
  const prisma = new PrismaClient()
  const now = new Date()

  try {
    // 1. Garante ASSIGN_REPORTS nas roles padrão Proprietário e Gestor existentes
    const rolesUpdated = await prisma.$executeRaw`
      UPDATE "org_roles"
      SET "permissions" = array_append("permissions", 'ASSIGN_REPORTS'::"OrgPermission")
      WHERE "name" IN ('Proprietário', 'Gestor')
        AND NOT ('ASSIGN_REPORTS'::"OrgPermission" = ANY("permissions"))
    `

    // 2. Backfill em lotes de relatos de entidades sem slaDueAt
    const entityCache = new Map<
      string,
      {
        slaHours: Record<string, number> | null
        resolutionSlaHours: Record<string, number> | null
        slaEscalationHours: number
      }
    >()

    let processed = 0
    let cursorId: string | undefined
    const BATCH_SIZE = 500

    while (true) {
      const batch = await prisma.report.findMany({
        where: {
          recipientType: RecipientType.ENTITY,
          recipientId: { not: null },
          OR: [{ slaDueAt: null }, { slaState: null }],
        },
        select: {
          id: true,
          category: true,
          status: true,
          recipientId: true,
          createdAt: true,
          firstResponseAt: true,
          resolvedAt: true,
          slaStartedAt: true,
          slaState: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      })

      if (batch.length === 0) break

      const missingEntityIds = Array.from(
        new Set(batch.map((r) => r.recipientId!).filter((id) => !entityCache.has(id))),
      )
      if (missingEntityIds.length > 0) {
        const entities = await prisma.entity.findMany({
          where: { id: { in: missingEntityIds } },
          select: { id: true, slaHours: true, resolutionSlaHours: true, slaEscalationHours: true },
        })
        for (const ent of entities) {
          entityCache.set(ent.id, {
            slaHours: (ent.slaHours as Record<string, number> | null) ?? null,
            resolutionSlaHours: (ent.resolutionSlaHours as Record<string, number> | null) ?? null,
            slaEscalationHours: ent.slaEscalationHours,
          })
        }
      }

      for (const report of batch) {
        const policy = entityCache.get(report.recipientId!) ?? {
          slaHours: null,
          resolutionSlaHours: null,
          slaEscalationHours: 24,
        }
        const computed = computeSla(
          {
            category: report.category as any,
            status: report.status as any,
            createdAt: report.createdAt,
            firstResponseAt: report.firstResponseAt,
            resolvedAt: report.resolvedAt,
            slaStartedAt: report.slaStartedAt ?? report.createdAt,
            slaState: (report.slaState as any) ?? null,
          },
          {
            slaHours: policy.slaHours,
            resolutionSlaHours: policy.resolutionSlaHours,
            escalationHours: policy.slaEscalationHours,
          },
          now,
        )

        await prisma.report.update({
          where: { id: report.id },
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
        processed++
      }

      cursorId = batch[batch.length - 1].id
    }

    console.log(
      `✅ SLA backfill concluído: rolesAtualizadas=${rolesUpdated}, relatosBackfilled=${processed}, defaultRolePerm=${OrgPermission.ASSIGN_REPORTS}`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('❌ Erro no backfill de SLA:', err)
  process.exit(1)
})
