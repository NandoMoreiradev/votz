import type { AdRefund } from '@prisma/client'
import type { AdRefundView } from '@votz/shared-types'

export function toView(refund: AdRefund): AdRefundView {
  return {
    id: refund.id,
    amountCents: refund.amountCents,
    status: refund.status,
    reason: refund.reason,
    resolutionNote: refund.resolutionNote,
    requestedAt: refund.requestedAt.toISOString(),
    resolvedAt: refund.resolvedAt?.toISOString() ?? null,
  }
}
