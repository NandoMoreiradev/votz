"use strict";
/**
 * Utilitários puros e compartilhados para importação e sincronização de dados eleitorais brasileiros
 * (TSE, Câmara dos Deputados e Senado Federal).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARTY_ABBREVIATION_ALIASES = exports.TSE_MUNICIPAL_CARGOS = exports.TSE_OFFICE_LABEL = exports.TSE_ELEITO_SITUATIONS = void 0;
exports.normalizePersonName = normalizePersonName;
exports.normalizePartyAbbreviation = normalizePartyAbbreviation;
exports.normalizeOfficeCategory = normalizeOfficeCategory;
exports.getLatestConcludedElectionYear = getLatestConcludedElectionYear;
exports.getTseConsultaCandUrl = getTseConsultaCandUrl;
exports.getTseFotoZipUrl = getTseFotoZipUrl;
exports.getTermDatesForCargo = getTermDatesForCargo;
exports.deriveElectionYearFromTerm = deriveElectionYearFromTerm;
exports.parseTseCsvLine = parseTseCsvLine;
exports.filterTseElectedRows = filterTseElectedRows;
exports.TSE_ELEITO_SITUATIONS = new Set([
    'ELEITO',
    'ELEITO POR QP',
    'ELEITO POR MÉDIA',
    'ELEITO POR MEDIA',
]);
exports.TSE_OFFICE_LABEL = {
    'PRESIDENTE': 'Presidente da República',
    'VICE-PRESIDENTE': 'Vice-Presidente da República',
    'GOVERNADOR': 'Governador',
    'GOVERNADOR DO DISTRITO FEDERAL': 'Governador',
    'VICE-GOVERNADOR': 'Vice-Governador',
    'SENADOR': 'Senador(a)',
    'DEPUTADO FEDERAL': 'Deputado Federal',
    'DEPUTADO ESTADUAL': 'Deputado Estadual',
    'DEPUTADO DISTRITAL': 'Deputado Distrital',
    'PREFEITO': 'Prefeito',
    'VICE-PREFEITO': 'Vice-Prefeito',
    'VEREADOR': 'Vereador',
};
exports.TSE_MUNICIPAL_CARGOS = new Set(['PREFEITO', 'VICE-PREFEITO', 'VEREADOR']);
exports.PARTY_ABBREVIATION_ALIASES = {
    'PODEMOS': 'PODE',
    'PATRI': 'PATRIOTA',
    'PC DO B': 'PCdoB',
    'PCDOB': 'PCdoB',
    'UNIAO': 'UNIÃO',
    'UNIAO BRASIL': 'UNIÃO',
    'UNIÃO BRASIL': 'UNIÃO',
    'SOLIDARIEDADE': 'SOLIDARIEDADE',
};
/**
 * Normaliza nome de pessoa/político para reconciliação entre fontes (TSE, Câmara, Senado):
 * remove acentos, pontuação e espaços duplicados, convertendo para maiúsculas.
 */
function normalizePersonName(name) {
    return (name ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
/**
 * Normaliza sigla partidária aplicando aliases conhecidos entre Senado, Câmara e TSE.
 */
function normalizePartyAbbreviation(sigla) {
    const cleaned = (sigla ?? '').trim();
    const upper = cleaned.toUpperCase();
    return exports.PARTY_ABBREVIATION_ALIASES[upper] ?? cleaned;
}
/**
 * Normaliza o nome de cargo para comparação equivalente (ex: Senador / Senadora / Senador(a)).
 */
function normalizeOfficeCategory(office) {
    const norm = normalizePersonName(office);
    if (norm.startsWith('SENADOR'))
        return 'SENADOR';
    if (norm.startsWith('PRESIDENTE'))
        return 'PRESIDENTE';
    if (norm.startsWith('GOVERNADOR'))
        return 'GOVERNADOR';
    if (norm.startsWith('DEPUTADO FEDERAL'))
        return 'DEPUTADO FEDERAL';
    if (norm.startsWith('DEPUTADO ESTADUAL'))
        return 'DEPUTADO ESTADUAL';
    if (norm.startsWith('DEPUTADO DISTRITAL'))
        return 'DEPUTADO DISTRITAL';
    if (norm.startsWith('PREFEITO'))
        return 'PREFEITO';
    if (norm.startsWith('VEREADOR'))
        return 'VEREADOR';
    return norm;
}
/**
 * Retorna o ano da última eleição brasileira concluída para o tipo informado.
 * Eleições gerais ocorrem em anos Y % 4 === 2 (2022, 2026, 2030...) com 2º turno no fim de outubro.
 * Eleições municipais ocorrem em anos Y % 4 === 0 (2024, 2028, 2032...) com 2º turno no fim de outubro.
 */
function getLatestConcludedElectionYear(kind, referenceDate = new Date()) {
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth(); // 0-11 (9 = outubro, 10 = novembro)
    const day = referenceDate.getUTCDate();
    const electionsConcludedThisYear = month > 9 || (month === 9 && day >= 28);
    const maxYear = electionsConcludedThisYear ? year : year - 1;
    const targetMod = kind === 'general' ? 2 : 0;
    for (let y = maxYear; y >= 2018; y--) {
        if (y % 4 === targetMod)
            return y;
    }
    return kind === 'general' ? 2022 : 2024;
}
/**
 * URL oficial do pacote ZIP consolidado de candidaturas do TSE para determinado ano eleitoral.
 */
function getTseConsultaCandUrl(electionYear) {
    return `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${electionYear}.zip`;
}
/**
 * URL oficial do pacote ZIP de fotos de candidatos do TSE por ano e UF.
 */
function getTseFotoZipUrl(electionYear, uf) {
    return `https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes${electionYear}/fotos/foto_cand${electionYear}_${uf}_div.zip`;
}
/**
 * Calcula início e fim oficiais de mandato no Brasil conforme cargo e ano da eleição.
 */
function getTermDatesForCargo(cargoUpper, electionYear) {
    const cargo = cargoUpper.trim().toUpperCase();
    if (cargo === 'SENADOR') {
        return {
            termStart: new Date(`${electionYear + 1}-02-01T00:00:00.000Z`),
            termEnd: new Date(`${electionYear + 9}-01-31T23:59:59.999Z`),
        };
    }
    if (cargo === 'DEPUTADO FEDERAL' ||
        cargo === 'DEPUTADO ESTADUAL' ||
        cargo === 'DEPUTADO DISTRITAL') {
        return {
            termStart: new Date(`${electionYear + 1}-02-01T00:00:00.000Z`),
            termEnd: new Date(`${electionYear + 5}-01-31T23:59:59.999Z`),
        };
    }
    // Presidente, Governador, Prefeito, Vereador (posse em 1º de janeiro, 4 anos)
    return {
        termStart: new Date(`${electionYear + 1}-01-01T00:00:00.000Z`),
        termEnd: new Date(`${electionYear + 4}-12-31T23:59:59.999Z`),
    };
}
/**
 * Deriva o ano eleitoral do TSE a partir do cargo e datas do mandato.
 * Usa `termEnd` como referência principal para suportar políticos reeleitos
 * que preservaram o `termStart` original do primeiro mandato.
 */
function deriveElectionYearFromTerm(office, termStart, termEnd) {
    const category = normalizeOfficeCategory(office);
    const endYear = termEnd.getUTCFullYear();
    if (category === 'SENADOR')
        return endYear - 9;
    if (category === 'DEPUTADO FEDERAL' ||
        category === 'DEPUTADO ESTADUAL' ||
        category === 'DEPUTADO DISTRITAL') {
        return endYear - 5;
    }
    if (category === 'PRESIDENTE' ||
        category === 'GOVERNADOR' ||
        category === 'PREFEITO' ||
        category === 'VEREADOR') {
        return endYear - 4;
    }
    return termStart.getUTCFullYear() - 1;
}
/**
 * Parser RFC-4180 para linha CSV separada por ponto e vírgula (padrão TSE),
 * preservando ';' dentro de campos entre aspas duplas e convertendo "" em ".
 */
function parseTseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (ch === ';' && !inQuotes) {
            result.push(current.trim());
            current = '';
        }
        else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}
/**
 * Filtra candidatos eleitos de um CSV consolidado do TSE (`consulta_cand_*_BRASIL.csv`),
 * deduplicando por SQ_CANDIDATO (mantendo o registro do turno mais recente).
 */
function filterTseElectedRows(csv, cargos) {
    const lines = csv.split(/\r?\n/);
    if (lines.length === 0)
        return [];
    const headers = parseTseCsvLine(lines[0]);
    const cargoIdx = headers.indexOf('DS_CARGO');
    const sitIdx = headers.indexOf('DS_SIT_TOT_TURNO');
    const sqIdx = headers.indexOf('SQ_CANDIDATO');
    const turnoIdx = headers.indexOf('NR_TURNO');
    if (cargoIdx === -1 || sitIdx === -1 || sqIdx === -1) {
        throw new Error('CSV do TSE com cabeçalho inválido (DS_CARGO / DS_SIT_TOT_TURNO / SQ_CANDIDATO ausentes)');
    }
    const targetSet = new Set(cargos.map((c) => c.toUpperCase()));
    const bySq = new Map();
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line)
            continue;
        const cols = parseTseCsvLine(line);
        if (cols.length < headers.length - 2)
            continue;
        const cargo = (cols[cargoIdx] ?? '').toUpperCase();
        const sit = (cols[sitIdx] ?? '').toUpperCase();
        if (!targetSet.has(cargo))
            continue;
        if (!exports.TSE_ELEITO_SITUATIONS.has(sit))
            continue;
        const sq = cols[sqIdx] ?? '';
        if (!sq)
            continue;
        const turno = turnoIdx >= 0 ? Number(cols[turnoIdx] ?? '1') || 1 : 1;
        const prev = bySq.get(sq);
        if (prev && prev.turno > turno)
            continue;
        const row = {};
        headers.forEach((h, idx) => {
            row[h] = cols[idx] ?? '';
        });
        bySq.set(sq, { turno, row });
    }
    return Array.from(bySq.values()).map((entry) => entry.row);
}
//# sourceMappingURL=election.js.map