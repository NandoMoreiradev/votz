import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common'
import {
  RegistrationRequestStatus,
  RegistrationRequestType,
  CompanySector,
  CompanySize,
  EntityType,
  OrgType,
  OrgPermission,
  UserType,
  Prisma,
  PrismaClient,
} from '@prisma/client'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MailService } from '../mail/mail.service'
import { RegistrationRequestsRepository } from './registration-requests.repository'
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto'

type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

const DEFAULT_ROLES = {
  OWNER: Object.values(OrgPermission),
  MANAGER: [
    OrgPermission.RESPOND_REPORTS,
    OrgPermission.MANAGE_MEMBERS,
    OrgPermission.MANAGE_PROFILE,
    OrgPermission.VIEW_ANALYTICS,
    OrgPermission.EXPORT_DATA,
  ],
  AGENT: [OrgPermission.RESPOND_REPORTS, OrgPermission.VIEW_ANALYTICS],
  VIEWER: [OrgPermission.VIEW_ANALYTICS],
} as const

@Injectable()
export class RegistrationRequestsService {
  constructor(
    private readonly repo: RegistrationRequestsRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  async create(requesterId: string, dto: CreateRegistrationRequestDto) {
    const sanitized = this.sanitizePayload(dto.payload) as unknown as Prisma.InputJsonValue

    // Verificação de duplicidade antes de criar o request
    await this.checkForDuplicate(dto.type as RegistrationRequestType, dto.payload)

    return this.repo.create(requesterId, {
      type: dto.type as unknown as RegistrationRequestType,
      payload: sanitized,
      ...(dto.note && { note: DOMPurify.sanitize(dto.note) }),
    })
  }

  async findAll(status?: string, page = 1, limit = 20) {
    const statusEnum = status as RegistrationRequestStatus | undefined
    const [data, total] = await this.repo.findAll(statusEnum, page, limit)
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } }
  }

  async findMyRequests(requesterId: string) {
    return this.repo.findByRequester(requesterId)
  }

  async approve(id: string, reviewerId: string, reviewNote?: string) {
    const request = await this.repo.findById(id)
    if (!request) throw new NotFoundException('Solicitação não encontrada')
    if (request.status !== RegistrationRequestStatus.PENDING) {
      throw new BadRequestException('Solicitação já foi revisada')
    }

    const payload = request.payload as Record<string, unknown>
    let approvedOrgId: string | undefined
    let approvedOrgType: OrgType | undefined

    if (request.type === RegistrationRequestType.ENTITY) {
      const entity = await this.createEntityFromPayload(payload, request.requester.id)
      approvedOrgId = entity.id
      approvedOrgType = OrgType.ENTITY
    } else if (request.type === RegistrationRequestType.POLITICIAN) {
      const politician = await this.createPoliticianFromPayload(payload, request.requester.id)
      approvedOrgId = politician.id
      approvedOrgType = OrgType.POLITICIAN
    } else if (request.type === RegistrationRequestType.COMPANY) {
      const company = await this.createCompanyFromPayload(payload, request.requester.id)
      approvedOrgId = company.id
      approvedOrgType = OrgType.COMPANY
    }

    const reviewed = await this.repo.review(id, reviewerId, RegistrationRequestStatus.APPROVED, reviewNote, approvedOrgId, approvedOrgType)

    const orgName = (
      request.type === RegistrationRequestType.POLITICIAN
        ? payload['name']
        : payload['legalName']
    ) as string ?? ''

    this.mail.sendRegistrationApproved(
      request.requester.email,
      request.requester.name,
      request.type as 'ENTITY' | 'POLITICIAN' | 'COMPANY',
      orgName,
    )

    return reviewed
  }

  async reject(id: string, reviewerId: string, reviewNote: string) {
    const request = await this.repo.findById(id)
    if (!request) throw new NotFoundException('Solicitação não encontrada')
    if (request.status !== RegistrationRequestStatus.PENDING) {
      throw new BadRequestException('Solicitação já foi revisada')
    }

    const reviewed = await this.repo.review(id, reviewerId, RegistrationRequestStatus.REJECTED, reviewNote)

    this.mail.sendRegistrationRejected(
      request.requester.email,
      request.requester.name,
      request.type as 'ENTITY' | 'POLITICIAN' | 'COMPANY',
      reviewNote,
    )

    return reviewed
  }

  async getDocumentUrls(id: string): Promise<Record<string, string>> {
    const request = await this.repo.findById(id)
    if (!request) throw new NotFoundException('Solicitação não encontrada')

    const docs = (request.payload as Record<string, unknown>)?.['documents'] as Record<string, string> | undefined
    if (!docs || typeof docs !== 'object') return {}

    const result: Record<string, string> = {}
    for (const [field, key] of Object.entries(docs)) {
      if (typeof key === 'string' && key.startsWith('verification/')) {
        result[field] = await this.storage.getSignedDownloadUrl(key, 3600)
      }
    }
    return result
  }

  // ─────────────────────────────────────────────
  // DEDUPLICAÇÃO
  // ─────────────────────────────────────────────

  private async checkForDuplicate(type: RegistrationRequestType, payload: Record<string, unknown>) {
    if (type === RegistrationRequestType.ENTITY || type === RegistrationRequestType.COMPANY) {
      const cnpj = (payload['cnpj'] as string)?.replace(/\D/g, '')
      if (!cnpj) return

      const model = type === RegistrationRequestType.ENTITY ? 'entity' : 'company'
      const existing = await (this.prisma[model] as any).findUnique({ where: { cnpj } })
      if (existing?.verified) {
        throw new ConflictException(
          `${type === RegistrationRequestType.ENTITY ? 'Entidade' : 'Empresa'} com este CNPJ já está cadastrada e verificada no Votz. Solicite acesso à equipe gestora.`,
        )
      }
      if (existing) {
        throw new ConflictException(
          `Já existe um cadastro em análise para este CNPJ. Aguarde a revisão ou entre em contato com o suporte.`,
        )
      }

      // Verifica também se há request pendente para o mesmo CNPJ
      const pendingRequest = await this.prisma.registrationRequest.findFirst({
        where: {
          type,
          status: RegistrationRequestStatus.PENDING,
        },
      })
      if (pendingRequest) {
        const pendingCnpj = (pendingRequest.payload as Record<string, unknown>)?.['cnpj'] as string
        if (pendingCnpj?.replace(/\D/g, '') === cnpj) {
          throw new ConflictException(
            `Já existe uma solicitação pendente para este CNPJ. Aguarde a revisão.`,
          )
        }
      }
    }

    if (type === RegistrationRequestType.POLITICIAN) {
      const cpf = (payload['cpf'] as string)?.replace(/\D/g, '')
      if (!cpf) return

      // CPF é armazenado criptografado — comparação feita em app layer
      // Por ora, checamos no payload de requests pendentes
      const pendingRequest = await this.prisma.registrationRequest.findFirst({
        where: { type, status: RegistrationRequestStatus.PENDING },
      })
      if (pendingRequest) {
        const pendingCpf = (pendingRequest.payload as Record<string, unknown>)?.['cpf'] as string
        if (pendingCpf?.replace(/\D/g, '') === cpf) {
          throw new ConflictException(
            `Já existe uma solicitação pendente para este CPF. Aguarde a revisão.`,
          )
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // CRIAÇÃO DE ORGS NA APROVAÇÃO
  // ─────────────────────────────────────────────

  private async createEntityFromPayload(payload: Record<string, unknown>, requesterId: string) {
    const cnpj = (payload['cnpj'] as string)?.replace(/\D/g, '')
    if (!cnpj) throw new BadRequestException('CNPJ ausente no payload')

    const existing = await this.prisma.entity.findUnique({ where: { cnpj } })
    if (existing) throw new ConflictException(`Entidade com CNPJ ${cnpj} já cadastrada`)

    return this.prisma.$transaction(async (tx) => {
      const entity = await tx.entity.create({
        data: {
          legalName:       (payload['legalName'] as string) ?? '',
          cnpj,
          type:            (payload['entityType'] as EntityType) ?? EntityType.OTHER,
          city:            payload['city']    as string | undefined,
          state:           payload['state']   as string | undefined,
          website:         payload['website'] as string | undefined,
          createdByUserId: requesterId,
        },
      })

      const ownerRole = await this.seedDefaultRoles(tx, OrgType.ENTITY, entity.id)

      await tx.orgMembership.create({
        data: {
          userId:  requesterId,
          orgType: OrgType.ENTITY,
          orgId:   entity.id,
          roleId:  ownerRole.id,
        },
      })

      await tx.user.update({
        where: { id: requesterId },
        data:  { type: UserType.ENTITY },
      })

      return entity
    })
  }

  private async createPoliticianFromPayload(payload: Record<string, unknown>, requesterId: string) {
    const partyId     = payload['partyId']     as string | undefined
    const partySigla  = payload['partySigla']  as string | undefined
    const name        = (payload['fullName'] ?? payload['name']) as string
    const office      = payload['office']      as string
    const termStart   = new Date(payload['termStart'] as string)
    const termEnd     = new Date(payload['termEnd']   as string)
    const electoralZone = payload['electoralZone'] as string
    const state       = payload['state'] as string
    const city        = payload['city']  as string | undefined
    const cpf         = (payload['cpf'] as string | undefined)?.replace(/\D/g, '')
    const tseId       = payload['tseId'] as string | undefined

    if (!name) throw new BadRequestException('Nome do político ausente no payload')

    // Resolve o partido: pelo ID direto ou pela sigla
    let resolvedPartyId = partyId
    if (!resolvedPartyId && partySigla) {
      const party = await this.prisma.party.findFirst({ where: { abbreviation: partySigla.toUpperCase() } })
      if (!party) throw new BadRequestException(`Partido "${partySigla}" não encontrado`)
      resolvedPartyId = party.id
    }
    if (!resolvedPartyId) throw new BadRequestException('Partido não identificado no payload')

    return this.prisma.$transaction(async (tx) => {
      const politician = await tx.politician.create({
        data: {
          name,
          partyId:        resolvedPartyId!,
          office,
          termStart,
          termEnd,
          electoralZone,
          state,
          city,
          createdByUserId: requesterId,
          ...(cpf   && { cpf }),
          ...(tseId && { tseId }),
        },
      })

      const ownerRole = await this.seedDefaultRoles(tx, OrgType.POLITICIAN, politician.id)

      await tx.orgMembership.create({
        data: {
          userId:  requesterId,
          orgType: OrgType.POLITICIAN,
          orgId:   politician.id,
          roleId:  ownerRole.id,
        },
      })

      await tx.user.update({
        where: { id: requesterId },
        data:  { type: UserType.POLITICIAN },
      })

      return politician
    })
  }

  private async createCompanyFromPayload(payload: Record<string, unknown>, requesterId: string) {
    const cnpj = (payload['cnpj'] as string)?.replace(/\D/g, '')
    if (!cnpj) throw new BadRequestException('CNPJ ausente no payload')

    const existing = await this.prisma.company.findUnique({ where: { cnpj } })
    if (existing) throw new ConflictException(`Empresa com CNPJ ${cnpj} já cadastrada`)

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          legalName: (payload['legalName'] as string) ?? '',
          tradeName: (payload['tradeName'] as string) ?? (payload['legalName'] as string) ?? '',
          cnpj,
          sector:    (payload['sector'] as CompanySector) ?? CompanySector.OTHER,
          size:      (payload['size']   as CompanySize)   ?? CompanySize.SMALL,
          website:   payload['website'] as string | undefined,
        },
      })

      const ownerRole = await this.seedDefaultRoles(tx, OrgType.COMPANY, company.id)

      await tx.orgMembership.create({
        data: {
          userId:  requesterId,
          orgType: OrgType.COMPANY,
          orgId:   company.id,
          roleId:  ownerRole.id,
        },
      })

      return company
    })
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async seedDefaultRoles(tx: PrismaTx, orgType: OrgType, orgId: string) {
    const roles = await Promise.all(
      Object.entries(DEFAULT_ROLES).map(([name, permissions]) =>
        tx.orgRole.create({
          data: { orgType, orgId, name, permissions: [...permissions], isDefault: true },
        }),
      ),
    )
    return roles[0] // OWNER é sempre o primeiro
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        result[key] = DOMPurify.sanitize(value)
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.sanitizePayload(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }
}
