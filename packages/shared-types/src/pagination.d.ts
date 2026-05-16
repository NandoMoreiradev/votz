export interface PaginationQuery {
    page?: number;
    limit?: number;
}
export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginationMeta;
}
//# sourceMappingURL=pagination.d.ts.map