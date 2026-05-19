import { Injectable, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImprensaRepository } from './imprensa.repository'

@Injectable()
export class ImprensaService {
  constructor(
    private readonly repo: ImprensaRepository,
    private readonly prisma: PrismaService,
  ) {}

  getResumo() {
    return this.repo.getResumo()
  }

  getTendencias(days = 30) {
    return this.repo.getTendencias(Math.min(Math.max(days, 7), 365))
  }

  getRelatosDestaque(limit = 20) {
    return this.repo.getRelatosDestaque(Math.min(limit, 50))
  }

  getEntidadesRanking(limit = 20) {
    return this.repo.getEntidadesRanking(Math.min(limit, 50))
  }

  getSurtosAtivos() {
    return this.repo.getSurtosAtivos()
  }

  async exportCsv(
    userId: string,
    days = 30,
    state?: string,
    city?: string,
    category?: string,
  ): Promise<{ filename: string; csv: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { type: true, verified: true },
    })

    if (user?.type !== 'PRESS' || !user.verified) {
      throw new ForbiddenException('Exportação CSV exclusiva para jornalistas verificados (PRESS)')
    }

    const clampedDays = Math.min(Math.max(days, 7), 365)
    const reports = await this.repo.getReportsForExport(clampedDays, state, city, category)

    const header = 'id,titulo,categoria,status,cidade,estado,bairro,pressao,votos,comentarios,criado_em'
    const rows = reports.map((r) => [
      r.id,
      `"${(r.title ?? '').replace(/"/g, '""')}"`,
      r.category,
      r.status,
      r.city ?? '',
      r.state ?? '',
      r.neighborhood ?? '',
      r.pressureScore.toFixed(2),
      r._count.votes,
      r._count.comments,
      new Date(r.createdAt).toISOString(),
    ].join(','))

    const csv = [header, ...rows].join('\n')
    const datePart = new Date().toISOString().slice(0, 10)
    const locationPart = [state?.toLowerCase(), city?.toLowerCase().replace(/\s+/g, '-')].filter(Boolean).join('-')
    const filename = `votz-relatos-${datePart}${locationPart ? `-${locationPart}` : ''}.csv`

    return { filename, csv }
  }
}
