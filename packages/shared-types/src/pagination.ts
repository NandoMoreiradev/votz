export interface PaginacaoQuery {
  page?: number
  limit?: number
}

export interface PaginacaoMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginacaoResposta<T> {
  data: T[]
  meta: PaginacaoMeta
}
