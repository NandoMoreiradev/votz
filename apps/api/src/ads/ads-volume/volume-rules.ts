/** As tabelas de anúncio que crescem com o tráfego e quando cada uma passa a merecer atenção. */
export const VOLUME_WATCH = [
  // Eventos do aparelho: a que mais cresce (vários por exibição). Folha da árvore: ninguém aponta para ela, é a primeira a particionar.
  { table: 'ad_events', warnRows: 20_000_000, warnBytes: 8 * 1024 ** 3, partitionable: true },
  // Exibições: cada entrega gera uma linha. Tem `click_token` único e é apontada por eventos e conversões: particionar exige redesenho.
  { table: 'ad_impressions', warnRows: 20_000_000, warnBytes: 8 * 1024 ** 3, partitionable: false },
  { table: 'ad_shadow_decisions', warnRows: 10_000_000, warnBytes: 4 * 1024 ** 3, partitionable: true },
] as const

export interface TableVolume {
  table: string
  /** Estimativa do planejador do banco (não é contagem exata, mas basta para saber a ordem de grandeza). */
  rows: number
  bytes: number
}

export interface VolumeAlert {
  table: string
  rows: number
  bytes: number
  message: string
}

const gigabytes = (bytes: number) => (bytes / 1024 ** 3).toFixed(1).replace('.', ',')
const millions = (rows: number) => (rows / 1_000_000).toFixed(1).replace('.', ',')

/** Quais tabelas passaram do limite, com a frase que diz o que fazer. */
export function volumeAlerts(volumes: readonly TableVolume[]): VolumeAlert[] {
  return VOLUME_WATCH.flatMap((rule) => {
    const volume = volumes.find((item) => item.table === rule.table)
    if (!volume) return []
    if (volume.rows < rule.warnRows && volume.bytes < rule.warnBytes) return []
    const next = rule.partitionable
      ? 'Hora de particionar por mês (veja docs/dev/anuncios-particionamento-eventos.md).'
      : 'Particionar exige redesenhar o clique e as ligações (veja docs/dev/anuncios-particionamento-eventos.md); antes disso, avalie apagar o que passou do prazo.'
    return [{ table: rule.table, rows: volume.rows, bytes: volume.bytes, message: `${rule.table} tem cerca de ${millions(volume.rows)} milhões de linhas e ${gigabytes(volume.bytes)} GB. ${next}` }]
  })
}
