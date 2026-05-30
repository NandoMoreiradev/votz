import { Injectable } from '@nestjs/common'
import { Prisma, RegistrationRequestStatus, RegistrationRequestType, OrgType } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const SELECT = {
  id: true,
  type: true,
  status: true,
  payload: true,
  claimTargetId: true,
  reviewNote: true,
  approvedOrgId: true,
  approvedOrgType: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: { id: true, name: true, email: true } },
  reviewer:  { select: { id: true, name: true } },
} as const

@Injectable()
export class RegistrationRequestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(requesterId: string, data: {
    type: RegistrationRequestType
    payload: Prisma.InputJsonValue
    claimTargetId?: string
    note?: string
  }) {
    return this.prisma.registrationRequest.create({
      data: { requesterId, ...data },
      select: SELECT,
    })
  }

  findAll(status?: RegistrationRequestStatus, page = 1, limit = 20) {
    const where = status ? { status } : {}
    return this.prisma.$transaction([
      this.prisma.registrationRequest.findMany({
        where,
        select: SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.registrationRequest.count({ where }),
    ])
  }

  findById(id: string) {
    return this.prisma.registrationRequest.findUnique({ where: { id }, select: SELECT })
  }

  findByRequester(requesterId: string) {
    return this.prisma.registrationRequest.findMany({
      where: { requesterId },
      select: SELECT,
      orderBy: { createdAt: 'desc' },
    })
  }

  review(
    id: string,
    reviewerId: string,
    status: RegistrationRequestStatus,
    reviewNote?: string,
    approvedOrgId?: string,
    approvedOrgType?: OrgType,
  ) {
    return this.prisma.registrationRequest.update({
      where: { id },
      data: { status, reviewerId, reviewNote, approvedOrgId, approvedOrgType },
      select: SELECT,
    })
  }
}
