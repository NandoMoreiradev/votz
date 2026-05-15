import { Categoria, DestinatarioTipo, StatusRelato } from './enums'

export interface RelatoPublico {
  id: string
  titulo: string
  descricao: string
  categoria: Categoria
  status: StatusRelato
  anonimo: boolean
  latitude?: number
  longitude?: number
  enderecoNormalizado?: string
  cidade?: string
  estado?: string
  bairro?: string
  midias: string[]
  scorePressao: number
  destinatarioTipo?: DestinatarioTipo
  destinatarioId?: string
  totalApoios: number
  totalEuTambem: number
  totalComentarios: number
  createdAt: string
  updatedAt: string
  autor?: {
    id: string
    nome: string
    avatarUrl?: string
  }
}

export interface TimelineEventoPublico {
  id: string
  tipo: string
  descricao: string
  metadados?: Record<string, unknown>
  createdAt: string
  autor?: {
    id: string
    nome: string
  }
}
