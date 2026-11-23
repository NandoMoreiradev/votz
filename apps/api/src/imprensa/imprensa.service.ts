import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Category } from '@votz/shared-types'
import { ImprensaRepository } from './imprensa.repository'
import { PressAccessService, type PressAccess } from './press-access.service'
import { CSV_BOM, csvDate, csvNumber, csvText, filenamePart } from './csv'
import { buildSeries, type SeriesGranularity } from './press-series'
import { TtlCache } from './ttl-cache'

/** Quanto tempo cada agregado público fica guardado. Surtos mudam mais rápido que o resto. */
const CACHE_MS = {
  resumo: 5 * 60_000,
  tendencias: 10 * 60_000,
  destaque: 5 * 60_000,
  ranking: 10 * 60_000,
  surtos: 60_000,
}

const CSV_COLUMNS = [
  'id', 'link', 'titulo', 'categoria', 'status', 'cidade', 'estado', 'bairro',
  'pressao', 'apoios', 'comentarios', 'criado_em', 'primeira_resposta_em', 'resolvido_em', 'prazo_resposta',
]
/** Colunas a mais do plano Pro. */
const CSV_RICH_COLUMNS = ['descricao', 'destinatario_tipo']

export interface ExportFilters {
  days?: number
  state?: string
  city?: string
  category?: string
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.trunc(value), min), max)
}

@Injectable()
export class ImprensaService {
  private readonly cache = new TtlCache()

  constructor(
    private readonly repo: ImprensaRepository,
    private readonly access: PressAccessService,
    private readonly config: ConfigService,
  ) {}

  getResumo() {
    return this.cache.get('resumo', CACHE_MS.resumo, () => this.repo.getResumo())
  }

  getTendencias(days = 30) {
    const d = clamp(days, 7, 365)
    return this.cache.get(`tendencias:${d}`, CACHE_MS.tendencias, () => this.repo.getTendencias(d))
  }

  getRelatosDestaque(limit = 20) {
    const n = clamp(limit, 1, 50)
    return this.cache.get(`destaque:${n}`, CACHE_MS.destaque, () => this.repo.getRelatosDestaque(n))
  }

  getEntidadesRanking(limit = 20) {
    const n = clamp(limit, 1, 50)
    return this.cache.get(`ranking:${n}`, CACHE_MS.ranking, () => this.repo.getEntidadesRanking(n))
  }

  getSurtosAtivos() {
    return this.cache.get('surtos', CACHE_MS.surtos, () => this.repo.getSurtosAtivos())
  }

  // ── Exportação (credencial aprovada; o plano define o alcance) ────────────────

  async exportCsv(userId: string, days = 30, state?: string, city?: string, category?: string) {
    const { rows, rich, filename } = await this.loadExport(userId, 'csv', { days, state, city, category })
    const baseUrl = this.baseUrl()
    const header = (rich ? [...CSV_COLUMNS, ...CSV_RICH_COLUMNS] : CSV_COLUMNS).join(',')
    const lines = rows.map((r) =>
      [
        csvText(r.id),
        csvText(`${baseUrl}/relatos/${r.id}`),
        csvText(r.title),
        csvText(r.category),
        csvText(r.status),
        csvText(r.city),
        csvText(r.state),
        csvText(r.neighborhood),
        csvNumber(r.pressureScore, 2),
        csvNumber(r._count.votes),
        csvNumber(r._count.comments),
        csvDate(r.createdAt),
        csvDate(r.firstResponseAt),
        csvDate(r.resolvedAt),
        csvText(r.slaState),
        ...(rich ? [csvText(r.description), csvText(r.recipientType)] : []),
      ].join(','),
    )
    return { filename, csv: CSV_BOM + [header, ...lines].join('\r\n') + '\r\n' }
  }

  async exportJson(userId: string, days = 30, state?: string, city?: string, category?: string) {
    const { access, rows, filename, clampedDays, cleanCity } = await this.loadExport(
      userId, 'json', { days, state, city, category },
    )
    if (!access.limits.jsonExport) {
      throw new ForbiddenException('A exportação em JSON é do plano Imprensa Pro.')
    }
    const baseUrl = this.baseUrl()
    const body = {
      geradoEm: new Date().toISOString(),
      filtros: { dias: clampedDays, estado: state?.toUpperCase() ?? null, cidade: cleanCity ?? null, categoria: category ?? null },
      total: rows.length,
      relatos: rows.map((r) => ({
        id: r.id,
        link: `${baseUrl}/relatos/${r.id}`,
        titulo: r.title,
        descricao: r.description ?? null,
        categoria: r.category,
        status: r.status,
        cidade: r.city,
        estado: r.state,
        bairro: r.neighborhood,
        pressao: Math.round(r.pressureScore * 100) / 100,
        apoios: r._count.votes,
        comentarios: r._count.comments,
        criadoEm: r.createdAt.toISOString(),
        primeiraRespostaEm: r.firstResponseAt ? r.firstResponseAt.toISOString() : null,
        resolvidoEm: r.resolvedAt ? r.resolvedAt.toISOString() : null,
        prazoResposta: r.slaState,
        destinatarioTipo: r.recipientType,
      })),
    }
    return { filename, json: JSON.stringify(body, null, 2) }
  }

  async exportSerie(
    userId: string,
    days = 90,
    granularity: string = 'week',
    state?: string,
    city?: string,
    category?: string,
  ) {
    const access = await this.access.require(userId)
    if (!access.limits.timeSeries) {
      throw new ForbiddenException('A série histórica é do plano Imprensa Pro.')
    }
    if (granularity !== 'week' && granularity !== 'month') {
      throw new BadRequestException('Escolha "week" (semana) ou "month" (mês).')
    }
    const { clampedDays, cleanCity } = this.validateFilters(access, { days, state, city, category })

    const rows = await this.repo.getReportsForSeries(clampedDays, state, cleanCity, category)
    const to = new Date()
    const from = new Date(to.getTime() - clampedDays * 86_400_000)
    const series = buildSeries(rows, granularity as SeriesGranularity, from, to)

    const header = ['periodo', 'relatos', 'respondidos', 'resolvidos', 'pressao_media'].join(',')
    const lines = series.map((s) =>
      [csvText(s.period), csvNumber(s.reports), csvNumber(s.answered), csvNumber(s.resolved), csvNumber(s.avgPressure, 2)].join(','),
    )
    return {
      filename: this.filename('votz-serie', 'csv', state, cleanCity, granularity === 'month' ? 'mensal' : 'semanal'),
      csv: CSV_BOM + [header, ...lines].join('\r\n') + '\r\n',
    }
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private baseUrl() {
    return String(this.config.get('APP_URL', 'http://localhost:5173')).replace(/\/+$/, '')
  }

  private validateFilters(access: PressAccess, f: ExportFilters) {
    const { state, category } = f
    if (state && !/^[A-Za-z]{2}$/.test(state)) {
      throw new BadRequestException('Estado inválido. Use a sigla com 2 letras, por exemplo SP.')
    }
    if (category && !(Object.values(Category) as string[]).includes(category)) {
      throw new BadRequestException('Categoria inválida.')
    }
    const requested = clamp(f.days ?? 30, 7, 365)
    if (requested > access.limits.exportMaxDays) {
      throw new ForbiddenException(
        `A credencial gratuita exporta até ${access.limits.exportMaxDays} dias. O plano Imprensa Pro vai até 365.`,
      )
    }
    return { clampedDays: requested, cleanCity: f.city?.trim().slice(0, 100) || undefined }
  }

  private filename(prefix: string, ext: string, state?: string, city?: string, extra?: string) {
    const datePart = new Date().toISOString().slice(0, 10)
    const locationPart = [filenamePart(state), filenamePart(city), extra].filter(Boolean).join('-')
    return `${prefix}-${datePart}${locationPart ? `-${locationPart}` : ''}.${ext}`
  }

  private async loadExport(userId: string, ext: 'csv' | 'json', f: ExportFilters) {
    const access = await this.access.require(userId)
    const { clampedDays, cleanCity } = this.validateFilters(access, f)
    const rich = access.limits.richExport
    const rows = await this.repo.getReportsForExport(
      clampedDays, f.state, cleanCity, f.category, access.limits.exportMaxRows, rich,
    )
    return {
      access,
      rows: rows as Array<(typeof rows)[number] & { description?: string }>,
      rich,
      clampedDays,
      cleanCity,
      filename: this.filename('votz-relatos', ext, f.state, cleanCity),
    }
  }
}
