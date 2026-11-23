/**
 * Teste A/B e modo sombra da entrega (Etapa 3 do plano, 6.6). Funções puras: o sorteio do braço, a janela do
 * experimento e a comparação estatística. Nada aqui toca banco ou Redis.
 *
 * Um experimento troca **parâmetros da disputa** (hoje: alvo de exploração e pesos da penalidade de qualidade) para uma
 * parte das pessoas. Dois modos:
 * - `AB`: cada pessoa é servida pelas regras do braço em que caiu, e o braço fica gravado na exibição. O relatório
 *   compara cliques, "esconder", denúncia e receita entre os braços.
 * - `SHADOW`: todo mundo é servido pelo braço de controle (o primeiro); os outros braços **só calculam** o que
 *   escolheriam e a diferença é gravada, sem ninguém ver. Serve para ver o efeito de uma regra nova antes de ela valer.
 *
 * Quem sorteia o braço é o id da pessoa com o nome do experimento: a mesma pessoa cai sempre no mesmo braço, e cada
 * experimento sorteia por conta própria (um não decide o outro).
 */

/** O que um braço pode mudar na disputa. Campo ausente = valor normal. */
export interface DeliveryOverrides {
  /** Parte das entregas disputadas que vai para anúncio novo (`EXPLORATION.TARGET_SHARE`). */
  explorationTargetShare?: number
  /** Quanto uma denúncia pesa em relação a um "esconder" (`QUALITY.REPORT_WEIGHT`). */
  reportWeight?: number
  /** Quanto cada ponto de rejeição acima do normal tira do valor (`QUALITY.WEIGHT`). */
  qualityWeight?: number
  /** Teto da penalidade de qualidade (`QUALITY.MAX_PENALTY`). */
  qualityMaxPenalty?: number
}

export interface ExperimentArm {
  key: string
  /** Peso relativo do braço no sorteio (só a proporção importa). */
  weight: number
  overrides: DeliveryOverrides
}

export interface DeliveryExperiment {
  /** Nome curto e estável, sem ":" (vai gravado na exibição como "nome:braço"). */
  key: string
  mode: 'AB' | 'SHADOW'
  /** Parte das pessoas que entra no experimento (0 a 1); o resto segue as regras normais. */
  trafficShare: number
  /** O primeiro braço é o controle: sem mudança nenhuma (`overrides: {}`). */
  arms: ExperimentArm[]
  startsAt?: string
  endsAt?: string
}

/**
 * Experimentos ativos. **Nenhum hoje.** Para rodar um, acrescente aqui (ex.: dois braços com
 * `explorationTargetShare` 0,075 e 0,15) e suba a API; o relatório (`ads:experiment-report`) lê pelo nome.
 */
export const DELIVERY_EXPERIMENTS: DeliveryExperiment[] = []

export const EXPERIMENT_KEY = /^[a-z0-9][a-z0-9-]{1,40}$/

/** Problemas na definição (devolve a lista; vazia = serve). Experimento inválido nunca roda. */
export function experimentProblems(experiment: DeliveryExperiment): string[] {
  const problems: string[] = []
  if (!EXPERIMENT_KEY.test(experiment.key)) problems.push('o nome precisa ter de 2 a 41 letras minúsculas, números ou hífen')
  if (experiment.mode !== 'AB' && experiment.mode !== 'SHADOW') problems.push('o modo é AB ou SHADOW')
  if (!(experiment.trafficShare > 0 && experiment.trafficShare <= 1)) problems.push('a parte do tráfego fica entre 0 (exclusive) e 1')
  if (experiment.arms.length < 2) problems.push('precisa de pelo menos dois braços (controle e um teste)')
  const keys = new Set<string>()
  for (const arm of experiment.arms) {
    if (!EXPERIMENT_KEY.test(arm.key)) problems.push(`o braço "${arm.key}" tem nome inválido`)
    if (keys.has(arm.key)) problems.push(`o braço "${arm.key}" aparece duas vezes`)
    keys.add(arm.key)
    if (!(arm.weight > 0)) problems.push(`o braço "${arm.key}" precisa de peso maior que zero`)
  }
  if (experiment.arms[0] && Object.keys(experiment.arms[0].overrides).length > 0) problems.push('o primeiro braço é o controle e não muda nada')
  const shares = experiment.arms.flatMap((arm) => (arm.overrides.explorationTargetShare === undefined ? [] : [arm.overrides.explorationTargetShare]))
  if (shares.some((value) => !(value >= 0 && value <= 1))) problems.push('explorationTargetShare fica entre 0 e 1')
  const weights = experiment.arms.flatMap((arm) => [arm.overrides.reportWeight, arm.overrides.qualityWeight].filter((value): value is number => value !== undefined))
  if (weights.some((value) => !(value >= 0))) problems.push('os pesos de qualidade não podem ser negativos')
  const caps = experiment.arms.flatMap((arm) => (arm.overrides.qualityMaxPenalty === undefined ? [] : [arm.overrides.qualityMaxPenalty]))
  if (caps.some((value) => !(value >= 0 && value <= 0.9))) problems.push('qualityMaxPenalty fica entre 0 e 0,9')
  if (experiment.startsAt && experiment.endsAt && Date.parse(experiment.startsAt) >= Date.parse(experiment.endsAt)) problems.push('o fim vem depois do começo')
  return problems
}

/** O primeiro experimento válido e dentro da janela de datas. */
export function activeExperiment(experiments: readonly DeliveryExperiment[], now: Date): DeliveryExperiment | null {
  for (const experiment of experiments) {
    if (experimentProblems(experiment).length) continue
    if (experiment.startsAt && now.getTime() < Date.parse(experiment.startsAt)) continue
    if (experiment.endsAt && now.getTime() >= Date.parse(experiment.endsAt)) continue
    return experiment
  }
  return null
}

/** Número de 0 a 1 que depende só do texto (FNV-1a de 32 bits): a mesma pessoa e o mesmo experimento dão sempre o mesmo. */
export function stableUnit(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  // Mistura final: sem ela os últimos caracteres do texto mexem pouco no resultado.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 2246822507)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 3266489909)
  hash ^= hash >>> 16
  return (hash >>> 0) / 4294967296
}

/** O braço desta pessoa, ou `null` se ela está fora da parte do tráfego do experimento. */
export function assignArm(userId: string, experiment: DeliveryExperiment): ExperimentArm | null {
  if (stableUnit(`${experiment.key}|traffic|${userId}`) >= experiment.trafficShare) return null
  const total = experiment.arms.reduce((sum, arm) => sum + arm.weight, 0)
  let point = stableUnit(`${experiment.key}|arm|${userId}`) * total
  for (const arm of experiment.arms) {
    if (point < arm.weight) return arm
    point -= arm.weight
  }
  return experiment.arms[experiment.arms.length - 1]
}

/** Como o braço fica gravado na exibição. */
export const experimentLabel = (experiment: Pick<DeliveryExperiment, 'key'>, arm: Pick<ExperimentArm, 'key'>) => `${experiment.key}:${arm.key}`

// ─── Comparação entre braços ───────────────────────────────────────────────────────────────────

export interface ProportionComparison {
  /** Taxa do braço de teste menos a do controle. */
  difference: number
  /** Em quantos desvios a diferença está longe de zero (teste de duas proporções). */
  z: number
  /** Diferença com confiança de 95% (|z| ≥ 1,96) e amostra mínima nos dois braços. */
  significant: boolean
  /** Amostra pequena demais para dizer qualquer coisa. */
  tooSmall: boolean
}

/** Amostra mínima por braço para a comparação valer (denominador da taxa). */
export const MIN_SAMPLE_PER_ARM = 200

/**
 * Compara a taxa do teste (`test.success / test.total`) com a do controle. Teste z de duas proporções com variância
 * combinada: o certo quando as duas amostras vêm da mesma população e queremos saber se a diferença passa do acaso.
 */
export function compareProportions(control: { success: number; total: number }, test: { success: number; total: number }): ProportionComparison {
  const controlRate = control.total > 0 ? control.success / control.total : 0
  const testRate = test.total > 0 ? test.success / test.total : 0
  const difference = testRate - controlRate
  const tooSmall = control.total < MIN_SAMPLE_PER_ARM || test.total < MIN_SAMPLE_PER_ARM
  const pooled = control.total + test.total > 0 ? (control.success + test.success) / (control.total + test.total) : 0
  const variance = pooled * (1 - pooled) * (1 / Math.max(control.total, 1) + 1 / Math.max(test.total, 1))
  const z = variance > 0 ? difference / Math.sqrt(variance) : 0
  return { difference, z, significant: !tooSmall && Math.abs(z) >= 1.96, tooSmall }
}
