export declare const ANALYTICS_DEFINITION_VERSION = "v1.1.2";
export declare const ANALYTICS_DEFINITION_DATE = "2026-11-16";
export declare const ANALYTICS_TIMEZONE = "America/Sao_Paulo";
export declare const MIN_CELL_SIZE = 10;
export declare const MAX_ANALYTICS_RANGE_MONTHS = 24;
export declare const RECURRENCE_WINDOW_DAYS = 90;
export declare const RECURRENCE_MIN_REPORTS = 2;
/**
 * Limites superiores (em horas) para os 8 buckets de histograma de tempos:
 * [0-1h, 1-4h, 4-12h, 12-24h, 24-48h, 48h-7d (168h), 7d-30d (720h), >30d]
 */
export declare const RESPONSE_TIME_BUCKET_BOUNDS_HOURS: readonly [1, 4, 12, 24, 48, 168, 720];
export declare const RESPONSE_TIME_BUCKET_LABELS: readonly ["Até 1h", "1h a 4h", "4h a 12h", "12h a 24h", "24h a 48h", "2d a 7d", "7d a 30d", "Mais de 30d"];
/**
 * Limites superiores para os 9 buckets de pressão (`pressureScore`):
 * [0-5, 5-10, 10-25, 25-50, 50-100, 100-250, 250-500, 500-1000, >1000]
 */
export declare const PRESSURE_BUCKET_BOUNDS: readonly [5, 10, 25, 50, 100, 250, 500, 1000];
/**
 * Normaliza cidade ou bairro para chave determinística de agrupamento territorial:
 * remove diacríticos, colapsa espaços e converte para minúsculas.
 */
export declare function normalizeLocationKey(value?: string | null): string;
export declare function encodeGeohash7(latitude: number | null | undefined, longitude: number | null | undefined, precision?: number): string | null;
export interface GeohashCellBounds {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
    centerLat: number;
    centerLng: number;
}
export declare function decodeGeohashBounds(geohash: string): GeohashCellBounds | null;
export declare function computePercentileFromBuckets(counts: readonly number[], upperBounds: readonly number[], percentile: number, openTailUpperMultiplier?: number): number | null;
export type AnalyticsMetricKey = 'volume' | 'resolution_rate' | 'first_response_median_h' | 'first_response_p90_h' | 'response_rate' | 'resolution_time_median_h' | 'resolution_time_p90_h' | 'backlog' | 'backlog_age_p50_h' | 'backlog_age_p90_h' | 'contest_rate' | 'reincidence' | 'recurrence_index' | 'trend' | 'pressure_p50_p90' | 'category_mix' | 'support_volume' | 'comment_volume' | 'outbreak_history' | 'sla_compliance_rate';
export interface MetricDictionaryEntry {
    key: AnalyticsMetricKey;
    name: string;
    definition: string;
    formula: string;
    version: string;
}
export declare const ANALYTICS_METRIC_DICTIONARY: Record<AnalyticsMetricKey, MetricDictionaryEntry>;
//# sourceMappingURL=analytics.d.ts.map