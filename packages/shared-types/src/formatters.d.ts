/**
 * Formata uma data ISO (`YYYY-MM-DD`) ou timestamp ISO em `dd/mm/aaaa` (America/Sao_Paulo).
 */
export declare function formatDateBr(value: string | null | undefined): string;
/**
 * Formata buckets/datas ISO para rótulos curtos de eixo (`YYYY-MM-DD` -> `dd/mm`, `YYYY-MM` -> `mm/aaaa`).
 * Textos não-ISO (ex.: nomes de categoria ou faixas) são preservados sem alteração.
 */
export declare function formatShortDateBr(value: string | null | undefined): string;
/**
 * Formata buckets/datas ISO para exibição completa em tabelas/tooltips (`YYYY-MM-DD` -> `dd/mm/aaaa`, `YYYY-MM` -> `mm/aaaa`).
 */
export declare function formatMonthOrDateBr(value: string | null | undefined): string;
/**
 * Formata timestamp ISO em `dd/mm/aaaa HH:mm` (America/Sao_Paulo).
 */
export declare function formatDateTimeBr(value: string | null | undefined): string;
/**
 * Formata número decimal em pt-BR com separador de milhar (`.`) e vírgula decimal.
 */
export declare function formatDecimalPtBr(value: number | null | undefined, maxDecimals?: number): string;
export interface FormatDurationOptions {
    /** Limiar em horas a partir do qual passa a exibir em dias (padrão: 48h). */
    dayThresholdHours?: number;
    /** Unidade de dias exibida acima do limiar (padrão: 'dias'). */
    dayUnit?: 'dias' | 'd';
}
/**
 * Formata durações em pt-BR (`"18,5 h"`, `"14 h"`, `"5,9 dias"`, ou `"1,6 d"` com `dayUnit: 'd'`).
 */
export declare function formatDurationPtBr(hours: number | null | undefined, options?: FormatDurationOptions): string;
/**
 * Formata um intervalo médio em dias para tabela de reincidência (`"0,9 dia"`, `"1 dia"`, `"2,5 dias"`).
 */
export declare function formatGapDaysPtBr(days: number | null | undefined): string;
/**
 * Formata percentual em pt-BR com vírgula decimal e separador de milhar (`"52,2%"`, `"29,79%"`, `"1.000%"`).
 */
export declare function formatPercentPtBr(percent: number | null | undefined, maxDecimals?: number): string;
/**
 * Formata contagens inteiras em pt-BR com separador de milhar (`1248` -> `"1.248"`).
 */
export declare function formatCountPtBr(value: number | null | undefined): string;
//# sourceMappingURL=formatters.d.ts.map