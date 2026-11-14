/**
 * Utilitários puros e compartilhados para importação e sincronização de dados eleitorais brasileiros
 * (TSE, Câmara dos Deputados e Senado Federal).
 */
export type TseCandidateRow = Record<string, string>;
export declare const TSE_ELEITO_SITUATIONS: Set<string>;
export declare const TSE_OFFICE_LABEL: Record<string, string>;
export declare const TSE_MUNICIPAL_CARGOS: Set<string>;
export declare const PARTY_ABBREVIATION_ALIASES: Record<string, string>;
/**
 * Normaliza nome de pessoa/político para reconciliação entre fontes (TSE, Câmara, Senado):
 * remove acentos, pontuação e espaços duplicados, convertendo para maiúsculas.
 */
export declare function normalizePersonName(name: string): string;
/**
 * Normaliza sigla partidária aplicando aliases conhecidos entre Senado, Câmara e TSE.
 */
export declare function normalizePartyAbbreviation(sigla: string): string;
/**
 * Normaliza o nome de cargo para comparação equivalente (ex: Senador / Senadora / Senador(a)).
 */
export declare function normalizeOfficeCategory(office: string): string;
/**
 * Retorna o ano da última eleição brasileira concluída para o tipo informado.
 * Eleições gerais ocorrem em anos Y % 4 === 2 (2022, 2026, 2030...) com 2º turno no fim de outubro.
 * Eleições municipais ocorrem em anos Y % 4 === 0 (2024, 2028, 2032...) com 2º turno no fim de outubro.
 */
export declare function getLatestConcludedElectionYear(kind: 'general' | 'municipal', referenceDate?: Date): number;
/**
 * URL oficial do pacote ZIP consolidado de candidaturas do TSE para determinado ano eleitoral.
 */
export declare function getTseConsultaCandUrl(electionYear: number): string;
/**
 * URL oficial do pacote ZIP de fotos de candidatos do TSE por ano e UF.
 */
export declare function getTseFotoZipUrl(electionYear: number | string, uf: string): string;
/**
 * Calcula início e fim oficiais de mandato no Brasil conforme cargo e ano da eleição.
 */
export declare function getTermDatesForCargo(cargoUpper: string, electionYear: number): {
    termStart: Date;
    termEnd: Date;
};
/**
 * Deriva o ano eleitoral do TSE a partir do cargo e datas do mandato.
 * Usa `termEnd` como referência principal para suportar políticos reeleitos
 * que preservaram o `termStart` original do primeiro mandato.
 */
export declare function deriveElectionYearFromTerm(office: string, termStart: Date, termEnd: Date): number;
/**
 * Parser RFC-4180 para linha CSV separada por ponto e vírgula (padrão TSE),
 * preservando ';' dentro de campos entre aspas duplas e convertendo "" em ".
 */
export declare function parseTseCsvLine(line: string): string[];
/**
 * Filtra candidatos eleitos de um CSV consolidado do TSE (`consulta_cand_*_BRASIL.csv`),
 * deduplicando por SQ_CANDIDATO (mantendo o registro do turno mais recente).
 */
export declare function filterTseElectedRows(csv: string, cargos: string[]): TseCandidateRow[];
//# sourceMappingURL=election.d.ts.map