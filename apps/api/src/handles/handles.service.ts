import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { OrgType, Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** 3 a 30 letras minúsculas, números e _ (mesma regra do perfil do cidadão). */
export const HANDLE_REGEX = /^[a-z0-9_]{3,30}$/

/** Nomes que ninguém pode usar, para não parecer o próprio Votz ou a moderação. */
const RESERVED = new Set([
  'votz', 'admin', 'administrador', 'suporte', 'moderacao', 'oficial', 'equipe', 'sistema', 'api',
])

export type HandleOwner =
  | { kind: 'USER'; id: string }
  | { kind: 'ENTITY' | 'POLITICIAN' | 'COMPANY'; id: string }

export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase()
}

/**
 * Nome de usuário único em todo o Votz: cidadão, político, entidade e empresa
 * dividem o mesmo espaço, como no Instagram. Cada tabela tem a própria trava
 * `@unique`; aqui conferimos as quatro juntas.
 */
@Injectable()
export class HandlesService {
  constructor(private readonly prisma: PrismaService) {}

  async isTaken(handle: string, except?: HandleOwner): Promise<boolean> {
    const where = (kind: HandleOwner['kind']) => ({
      username: handle,
      ...(except && except.kind === kind ? { NOT: { id: except.id } } : {}),
    })
    const [user, entity, politician, company] = await Promise.all([
      this.prisma.user.findFirst({ where: where('USER'), select: { id: true } }),
      this.prisma.entity.findFirst({ where: where('ENTITY'), select: { id: true } }),
      this.prisma.politician.findFirst({ where: where('POLITICIAN'), select: { id: true } }),
      this.prisma.company.findFirst({ where: where('COMPANY'), select: { id: true } }),
    ])
    return !!(user || entity || politician || company)
  }

  /** Lança 409 se o nome é reservado ou já está em uso por outro perfil. */
  async assertAvailable(handle: string, except?: HandleOwner) {
    if (RESERVED.has(handle) || (await this.isTaken(handle, except))) {
      throw new ConflictException('Este nome de usuário já está em uso')
    }
  }

  async setForOrg(orgType: OrgType, orgId: string, raw: string) {
    const handle = normalizeHandle(raw)
    await this.assertAvailable(handle, { kind: orgType, id: orgId })
    const args = { where: { id: orgId }, data: { username: handle }, select: { id: true, username: true } }
    try {
      switch (orgType) {
        case OrgType.ENTITY:
          return await this.prisma.entity.update(args)
        case OrgType.POLITICIAN:
          return await this.prisma.politician.update(args)
        default:
          return await this.prisma.company.update(args)
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Dois pedidos ao mesmo tempo pelo mesmo nome: o banco barra o segundo.
        if (err.code === 'P2002') throw new ConflictException('Este nome de usuário já está em uso')
        if (err.code === 'P2025') throw new NotFoundException('Página não encontrada')
      }
      throw err
    }
  }

  /** Resolve @nome para o perfil dono dele (cidadão ou página). */
  async resolve(raw: string) {
    const handle = normalizeHandle(raw)
    const [user, entity, politician, company] = await Promise.all([
      this.prisma.user.findUnique({ where: { username: handle }, select: { id: true } }),
      this.prisma.entity.findUnique({ where: { username: handle }, select: { id: true } }),
      this.prisma.politician.findUnique({ where: { username: handle }, select: { id: true } }),
      this.prisma.company.findUnique({ where: { username: handle }, select: { id: true } }),
    ])
    const hit = user
      ? { kind: 'USER', id: user.id }
      : entity
        ? { kind: 'ENTITY', id: entity.id }
        : politician
          ? { kind: 'POLITICIAN', id: politician.id }
          : company
            ? { kind: 'COMPANY', id: company.id }
            : null
    if (!hit) throw new NotFoundException('Perfil não encontrado')
    return hit
  }
}
