import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fetchCities, UF_LIST } from '../lib/ibge'
import type { Page, Recipient, RecipientKind, SimilarReport } from '../lib/types'

export function useDebounced<T>(value: T, delay = 600) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

const MIN_TITLE = 10

export interface SimilarReportsFilters {
  category?: string
  city?: string
  state?: string
}

/** Mesma busca do web: só consulta com título de 10+ caracteres e espera o usuário parar de digitar. */
export function useSimilarReports(
  title: string,
  description: string,
  enabled: boolean,
  filters?: SimilarReportsFilters,
) {
  const debouncedTitle = useDebounced(title.trim())
  const debouncedDescription = useDebounced(description.trim())
  const category = filters?.category?.trim() || undefined
  const rawState = filters?.state?.trim().toUpperCase()
  const state = rawState && /^[A-Z]{2}$/.test(rawState) ? rawState : undefined
  const city = filters?.city?.trim().slice(0, 100) || undefined
  return useQuery({
    queryKey: ['similar-reports', debouncedTitle, debouncedDescription, category ?? '', state ?? '', city ?? ''],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ title: debouncedTitle.slice(0, 300), limit: '5' })
      if (debouncedDescription) params.set('description', debouncedDescription.slice(0, 2000))
      if (category) params.set('category', category)
      if (state) params.set('state', state)
      if (city) params.set('city', city)
      return api<SimilarReport[]>(`/reports/similar?${params}`, { signal })
    },
    enabled: enabled && debouncedTitle.length >= MIN_TITLE,
    staleTime: 30_000,
    retry: 0,
  })
}

/** Lista oficial de cidades do estado. Fica em cache: baixa uma vez por estado enquanto o app estiver aberto. */
export function useIbgeCities(uf: string) {
  return useQuery({
    queryKey: ['ibge-cities', uf],
    queryFn: ({ signal }) => fetchCities(uf, signal),
    enabled: UF_LIST.some((item) => item.uf === uf),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  })
}

export interface RecipientOption extends Recipient { detail: string }

interface RecipientRow {
  id: string; name?: string; legalName?: string; tradeName?: string; office?: string
  city?: string | null; state?: string | null; party?: { abbreviation?: string } | null; sector?: string
}

const PATH: Record<RecipientKind, string> = { ENTITY: 'entities', POLITICIAN: 'politicians', COMPANY: 'companies' }

function toOption(type: RecipientKind, row: RecipientRow): RecipientOption {
  const name = (type === 'COMPANY' ? row.tradeName || row.legalName : type === 'ENTITY' ? row.legalName || row.name : row.name) || 'Sem nome'
  const detail = type === 'POLITICIAN'
    ? [row.office, row.party?.abbreviation, row.state].filter(Boolean).join(' · ')
    : [row.city, row.state].filter(Boolean).join(', ')
  return { type, id: row.id, name, detail }
}

export function useRecipientSearch(type: RecipientKind, search: string) {
  const term = useDebounced(search.trim(), 350)
  return useQuery({
    queryKey: ['recipient-search', type, term],
    queryFn: async ({ signal }) => {
      const page = await api<Page<RecipientRow>>(`/${PATH[type]}?search=${encodeURIComponent(term)}&limit=8`, { signal })
      return page.data.map((row) => toOption(type, row))
    },
    enabled: term.length >= 2,
    staleTime: 30_000,
  })
}
