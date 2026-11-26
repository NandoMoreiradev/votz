import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { SimilarReport } from '../types/api'

const DEBOUNCE_MS = 600
const MIN_TITLE_LENGTH = 10

export interface SimilarReportsFilters {
  category?: string
  city?: string
  state?: string
}

export function useSimilarReports(title: string, description?: string, filters?: SimilarReportsFilters) {
  const [debouncedTitle, setDebouncedTitle] = useState(title.trim())
  const [debouncedDesc, setDebouncedDesc] = useState(description?.trim() ?? '')

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedTitle(title.trim())
      setDebouncedDesc(description?.trim() ?? '')
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [title, description])

  const category = filters?.category?.trim() || undefined
  const rawState = filters?.state?.trim().toUpperCase()
  const state = rawState && /^[A-Z]{2}$/.test(rawState) ? rawState : undefined
  const city = filters?.city?.trim().slice(0, 100) || undefined

  const enabled = debouncedTitle.length >= MIN_TITLE_LENGTH

  return useQuery({
    queryKey: ['similar-reports', debouncedTitle, debouncedDesc, category ?? '', state ?? '', city ?? ''],
    queryFn: () =>
      api
        .get<SimilarReport[]>('/reports/similar', {
          params: {
            title: debouncedTitle,
            ...(debouncedDesc ? { description: debouncedDesc } : {}),
            ...(category ? { category } : {}),
            ...(state ? { state } : {}),
            ...(city ? { city } : {}),
            limit: 5,
          },
        })
        .then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 0,
  })
}
