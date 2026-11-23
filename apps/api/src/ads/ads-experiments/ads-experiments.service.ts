import { Injectable } from '@nestjs/common'
import { DELIVERY_EXPERIMENTS } from '../ads-delivery/experiments'
import { AdsExperimentsRepository } from './ads-experiments.repository'
import { buildArmReport, buildShadowReport, compareArms, type ArmComparison, type ArmReport, type ShadowReport } from './experiment-report'

export interface ExperimentReport {
  key: string
  days: number
  arms: ArmReport[]
  /** Cada braço de teste contra o controle. */
  comparisons: ArmComparison[]
  /** Modo sombra: o que cada braço teria escolhido. */
  shadow: ShadowReport[]
}

/** Relatório de um experimento da entrega: o que cada braço fez, e se a diferença passa do acaso. */
@Injectable()
export class AdsExperimentsService {
  constructor(private readonly repo: AdsExperimentsRepository) {}

  /**
   * `controlArm`: o braço de controle. Sem ele, vale o primeiro braço do experimento na lista de ativos; se o
   * experimento já saiu da lista (terminou), o primeiro em ordem alfabética.
   */
  async report(key: string, days = 14, controlArm?: string, now = new Date()): Promise<ExperimentReport> {
    const since = new Date(now.getTime() - days * 86_400_000)
    const labels = await this.repo.armLabels(key, since)
    const arms = await Promise.all(
      labels.map(async (label) => buildArmReport(label.slice(key.length + 1), await this.repo.armTotals(label, since))),
    )
    const declared = DELIVERY_EXPERIMENTS.find((experiment) => experiment.key === key)?.arms[0]?.key
    const controlKey = controlArm ?? declared ?? arms[0]?.arm
    const control = arms.find((arm) => arm.arm === controlKey)
    const comparisons = control ? arms.filter((arm) => arm.arm !== control.arm).map((arm) => compareArms(control, arm)) : []
    const shadow = [...(await this.repo.shadowTotals(key, since)).entries()].map(([arm, totals]) => buildShadowReport(arm, totals)).sort((a, b) => a.arm.localeCompare(b.arm))
    return { key, days, arms, comparisons, shadow }
  }
}
