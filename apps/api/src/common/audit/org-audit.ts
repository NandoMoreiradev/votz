import { ModerationActionType, OrgType, Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

type PrismaTx = Prisma.TransactionClient | PrismaService

export interface OrgAuditEntry {
  action: 'CREATED' | 'DELETED'
  orgType: OrgType
  orgId: string
  itemType: string
  itemId: string
  actorId?: string | null
  summary: string
}

/**
 * Grava auditoria de criação/exclusão de itens organizacionais no mecanismo único
 * já existente no projeto (`ModerationAction`), evitando tabela paralela.
 */
export async function recordOrgAudit(prisma: PrismaTx, entry: OrgAuditEntry): Promise<void> {
  const action =
    entry.action === 'CREATED'
      ? ModerationActionType.ORG_ITEM_CREATED
      : ModerationActionType.ORG_ITEM_DELETED

  const sanitizedSummary = String(entry.summary).replace(/\s+/g, ' ').trim().slice(0, 240)
  await prisma.moderationAction.create({
    data: {
      action,
      targetType: `${entry.orgType}:${entry.itemType}`,
      targetId: entry.itemId,
      actorId: entry.actorId ?? null,
      reason: `[${entry.orgType}:${entry.orgId}] ${sanitizedSummary}`,
    },
  })
}
