import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.party.findMany({
      where: { active: true },
      select: { id: true, name: true, abbreviation: true, number: true, logoUrl: true },
      orderBy: { abbreviation: 'asc' },
    })
  }
}
