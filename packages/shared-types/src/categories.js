"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATEGORY_LABELS = void 0;
exports.getCategoryLabel = getCategoryLabel;
exports.formatRecurrenceAreaLabel = formatRecurrenceAreaLabel;
const enums_1 = require("./enums");
exports.CATEGORY_LABELS = {
    [enums_1.Category.HEALTH]: 'Saúde',
    [enums_1.Category.MOBILITY]: 'Mobilidade',
    [enums_1.Category.SAFETY]: 'Segurança',
    [enums_1.Category.EDUCATION]: 'Educação',
    [enums_1.Category.SANITATION]: 'Saneamento',
    [enums_1.Category.HOUSING]: 'Habitação',
    [enums_1.Category.ENVIRONMENT]: 'Meio Ambiente',
    [enums_1.Category.INFRASTRUCTURE]: 'Infraestrutura',
    [enums_1.Category.URBAN_SERVICES]: 'Serviços Urbanos',
    [enums_1.Category.CORRUPTION]: 'Corrupção',
    [enums_1.Category.ACCESSIBILITY]: 'Acessibilidade',
    [enums_1.Category.SOCIAL_WELFARE]: 'Assistência Social',
    [enums_1.Category.OTHER]: 'Outros',
};
function getCategoryLabel(category) {
    return exports.CATEGORY_LABELS[category] ?? category;
}
const PT_LOWER_CONNECTORS = new Set(['da', 'de', 'do', 'dos', 'das', 'e', 'em']);
function toTitleCasePt(raw) {
    const words = raw.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    return words
        .map((word, idx) => {
        const lower = word.toLocaleLowerCase('pt-BR');
        if (idx > 0 && PT_LOWER_CONNECTORS.has(lower)) {
            return lower;
        }
        return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
    })
        .join(' ');
}
/**
 * Formats a normalized or raw neighborhood into a readable public area label
 * (without exposing geohash codes or coordinates).
 */
function formatRecurrenceAreaLabel(rawNeighborhood) {
    const trimmed = rawNeighborhood?.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
        return 'Área sem bairro informado';
    }
    const titled = toTitleCasePt(trimmed);
    if (/^bairro\b/i.test(titled)) {
        return titled;
    }
    return `Bairro ${titled}`;
}
//# sourceMappingURL=categories.js.map