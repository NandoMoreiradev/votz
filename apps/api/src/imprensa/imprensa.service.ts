import { Injectable } from '@nestjs/common'
import { ImprensaRepository } from './imprensa.repository'

@Injectable()
export class ImprensaService {
  constructor(private readonly repo: ImprensaRepository) {}

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
}
