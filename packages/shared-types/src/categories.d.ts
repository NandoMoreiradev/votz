import { Category } from './enums';
export declare const CATEGORY_LABELS: Record<Category, string>;
export declare function getCategoryLabel(category: string): string;
/**
 * Formats a normalized or raw neighborhood into a readable public area label
 * (without exposing geohash codes or coordinates).
 */
export declare function formatRecurrenceAreaLabel(rawNeighborhood?: string | null): string;
//# sourceMappingURL=categories.d.ts.map