import { CanActivate, ExecutionContext, Injectable, ForbiddenException, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { OrgPermission, OrgType } from '@prisma/client'
import { OrgMembershipsRepository } from './org-memberships.repository'

export const REQUIRE_ORG_PERMISSION = 'require_org_permission'

export const RequireOrgPermission = (permission: OrgPermission) =>
  SetMetadata(REQUIRE_ORG_PERMISSION, permission)

@Injectable()
export class OrgPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repo: OrgMembershipsRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<OrgPermission>(REQUIRE_ORG_PERMISSION, ctx.getHandler())
    if (!required) return true

    const req = ctx.switchToHttp().getRequest()
    const user = req.user
    if (!user) throw new ForbiddenException('Autenticação necessária')

    const orgType = (req.params.orgType ?? req.body?.orgType) as OrgType
    const orgId = (req.params.orgId ?? req.body?.orgId) as string

    if (!orgType || !orgId) throw new ForbiddenException('orgType e orgId obrigatórios')

    const membership = await this.repo.findMembership(user.id, orgType, orgId)
    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('Você não é membro desta organização')
    }

    if (!membership.role.permissions.includes(required)) {
      throw new ForbiddenException('Permissão insuficiente')
    }

    return true
  }
}
