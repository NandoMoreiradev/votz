import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { SimilarReport } from '../types/api'

const DEBOUNCE_MS = 600
const MIN_TITLE_LENGTH = 10

export function useSimilarReports(title: string, description?: string) {
  const [debouncedTitle, setDebouncedTitle] = useState(title)
  const [debouncedDesc, setDebouncedDesc] = useState(description)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedTitle(title)
      setDebouncedDesc(description)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [title, description])

  const enabled = debouncedTitle.length >= MIN_TITLE_LENGTH

  return useQuery({
    queryKey: ['similar-reports', debouncedTitle, debouncedDesc],
    queryFn: () =>
      api
        .get<SimilarReport[]>('/reports/similar', {
          params: { title: debouncedTitle, description: debouncedDesc, limit: 5 },
        })
        .then((r) => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: [],
  })
}
