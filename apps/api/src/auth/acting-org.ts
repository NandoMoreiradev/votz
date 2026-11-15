import { ForbiddenException } from '@nestjs/common'
import { MembershipStatus, OrgPermission, OrgType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ActiveContextPayload } from './strategies/jwt.strategy'

export type ActingOrgType = 'ENTITY' | 'POLITICIAN' | 'COMPANY'

export interface ActingUser {
  id: string
  type: string
  ctx?: ActiveContextPayload | null
}

export interface ActingOrgResult {
  orgType: ActingOrgType
  orgId: string
  permissions: OrgPermission[]
}

export const MISSING_ORG_CONTEXT_MESSAGE =
  'Troque para o perfil de entidade/político (com verificação em duas etapas) para realizar esta ação.'

async function findActiveMembership(
  prisma: PrismaService,
  userId: string,
  orgType: ActingOrgType,
  orgId: string,
) {
  const membership = await prisma.orgMembership.findUnique({
    where: {
      userId_orgType_orgId: {
        userId,
        orgType: orgType as OrgType,
        orgId,
      },
    },
    select: {
      status: true,
      role: { select: { permissions: true } },
    },
  })

  if (!membership || membership.status !== MembershipStatus.ACTIVE) {
    return null
  }

  return membership
}

/**
 * Authorizes an institutional action strictly from the user's active JWT context (`user.ctx`),
 * re-checking in PostgreSQL that the OrgMembership is still ACTIVE and holds the required permission.
 */
export async function requireActingOrg(
  prisma: PrismaService,
  user: ActingUser | undefined | null,
  allowedOrgTypes: ActingOrgType | readonly ActingOrgType[],
  requiredPermission: OrgPermission,
  options?: { expectedOrgId?: string },
): Promise<ActingOrgResult> {
  const types = Array.isArray(allowedOrgTypes) ? allowedOrgTypes : [allowedOrgTypes]
  const ctx = user?.ctx

  if (!user || !ctx || !types.includes(ctx.type)) {
    throw new ForbiddenException(MISSING_ORG_CONTEXT_MESSAGE)
  }

  if (options?.expectedOrgId && ctx.id !== options.expectedOrgId) {
    throw new ForbiddenException('Contexto ativo não corresponde à organização solicitada.')
  }

  const membership = await findActiveMembership(prisma, user.id, ctx.type, ctx.id)
  if (!membership) {
    throw new ForbiddenException('Associação ativa com esta organização não encontrada.')
  }

  const hasDbPerm = membership.role.permissions.includes(requiredPermission)
  const hasCtxPerm = Array.isArray(ctx.permissions)
    ? ctx.permissions.includes(requiredPermission)
    : true

  if (!hasDbPerm || !hasCtxPerm) {
    throw new ForbiddenException('Você não tem permissão nesta organização para realizar esta ação.')
  }

  return {
    orgType: ctx.type,
    orgId: ctx.id,
    permissions: membership.role.permissions,
  }
}

/**
 * Resolves the acting organization only if the user currently has a matching active context
 * and active DB membership; returns null cleanly otherwise (for citizen/viewer read endpoints).
 */
export async function resolveOptionalActingOrg(
  prisma: PrismaService,
  user: ActingUser | undefined | null,
  allowedOrgTypes: ActingOrgType | readonly ActingOrgType[],
): Promise<ActingOrgResult | null> {
  const types = Array.isArray(allowedOrgTypes) ? allowedOrgTypes : [allowedOrgTypes]
  const ctx = user?.ctx

  if (!user || !ctx || !types.includes(ctx.type)) {
    return null
  }

  const membership = await findActiveMembership(prisma, user.id, ctx.type, ctx.id)
  if (!membership) {
    return null
  }

  return {
    orgType: ctx.type,
    orgId: ctx.id,
    permissions: membership.role.permissions,
  }
}
