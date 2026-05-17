import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { RegistrationRequestStatus, RegistrationRequestType, CompanySector, CompanySize, Prisma } from '@prisma/client'
import * as DOMPurify from 'isomorphic-dompurify'
import { PrismaService } from '../prisma/prisma.service'
import { RegistrationRequestsRepository } from './registration-requests.repository'
import { CreateRegistrationRequestDto } from './dto/create-registration-request.dto'

@Injectable()
export class RegistrationRequestsService {
  constructor(
    private readonly repo: RegistrationRequestsRepository,
    private readonly prisma: PrismaService,
  ) {}

  create(requesterId: string, dto: CreateRegistrationRequestDto) {
    const sanitizedPayload = this.sanitizePayload(dto.payload) as unknown as Prisma.InputJsonValue
    return this.repo.create(requesterId, {
      type: dto.type as unknown as RegistrationRequestType,
      payload: sanitizedPayload,
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
    if (!request) throw new NotFoundException('Request not found')
    if (request.status !== RegistrationRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed')
    }

    if (request.type === RegistrationRequestType.COMPANY) {
      await this.createCompanyFromPayload(request.payload as Record<string, unknown>)
    }

    return this.repo.review(id, reviewerId, RegistrationRequestStatus.APPROVED, reviewNote)
  }

  async reject(id: string, reviewerId: string, reviewNote: string) {
    const request = await this.repo.findById(id)
    if (!request) throw new NotFoundException('Request not found')
    if (request.status !== RegistrationRequestStatus.PENDING) {
      throw new BadRequestException('Request already reviewed')
    }

    return this.repo.review(id, reviewerId, RegistrationRequestStatus.REJECTED, reviewNote)
  }

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      result[key] = typeof value === 'string' ? DOMPurify.sanitize(value) : value
    }
    return result
  }

  private async createCompanyFromPayload(payload: Record<string, unknown>) {
    const cnpj = payload['cnpj'] as string
    if (!cnpj) return

    const existing = await this.prisma.company.findUnique({ where: { cnpj } })
    if (existing) return

    await this.prisma.company.create({
      data: {
        legalName:  (payload['legalName']  as string) ?? '',
        tradeName:  (payload['tradeName']  as string) ?? (payload['legalName'] as string) ?? '',
        cnpj,
        sector:     (payload['sector']     as CompanySector) ?? CompanySector.OTHER,
        size:       (payload['size']       as CompanySize)   ?? CompanySize.SMALL,
        website:    payload['website']     as string | undefined,
      },
    })
  }
}
