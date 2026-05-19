import { forwardRef } from 'react'
import { useQuery } from '@tanstack/react-query'

// ── Data ──────────────────────────────────────────────────────────────────────

export const UF_DATA = [
  { uf: 'AC', name: 'Acre' },
  { uf: 'AL', name: 'Alagoas' },
  { uf: 'AP', name: 'Amapá' },
  { uf: 'AM', name: 'Amazonas' },
  { uf: 'BA', name: 'Bahia' },
  { uf: 'CE', name: 'Ceará' },
  { uf: 'DF', name: 'Distrito Federal' },
  { uf: 'ES', name: 'Espírito Santo' },
  { uf: 'GO', name: 'Goiás' },
  { uf: 'MA', name: 'Maranhão' },
  { uf: 'MT', name: 'Mato Grosso' },
  { uf: 'MS', name: 'Mato Grosso do Sul' },
  { uf: 'MG', name: 'Minas Gerais' },
  { uf: 'PA', name: 'Pará' },
  { uf: 'PB', name: 'Paraíba' },
  { uf: 'PR', name: 'Paraná' },
  { uf: 'PE', name: 'Pernambuco' },
  { uf: 'PI', name: 'Piauí' },
  { uf: 'RJ', name: 'Rio de Janeiro' },
  { uf: 'RN', name: 'Rio Grande do Norte' },
  { uf: 'RS', name: 'Rio Grande do Sul' },
  { uf: 'RO', name: 'Rondônia' },
  { uf: 'RR', name: 'Roraima' },
  { uf: 'SC', name: 'Santa Catarina' },
  { uf: 'SP', name: 'São Paulo' },
  { uf: 'SE', name: 'Sergipe' },
  { uf: 'TO', name: 'Tocantins' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

const PREPOSITIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'])

export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i === 0 || !PREPOSITIONS.has(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// ── IBGE hook ─────────────────────────────────────────────────────────────────

interface IbgeMunicipio {
  nome: string
  codigo_ibge: string
}

export function useIbgeCities(uf: string) {
  return useQuery({
    queryKey: ['ibge-cities', uf],
    queryFn: async () => {
      const res = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${uf}`)
      if (!res.ok) throw new Error('ibge_error')
      return res.json() as Promise<IbgeMunicipio[]>
    },
    enabled: !!uf,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

// ── StateSelect ───────────────────────────────────────────────────────────────

interface StateSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value: string
  onChange: (uf: string) => void
  placeholder?: string
}

export const StateSelect = forwardRef<HTMLSelectElement, StateSelectProps>(function StateSelect(
  { value, onChange, placeholder = 'Estado', ...rest },
  ref,
) {
  return (
    <select ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">{placeholder}</option>
      {UF_DATA.map(({ uf, name }) => (
        <option key={uf} value={uf}>{uf} — {name}</option>
      ))}
    </select>
  )
})

// ── CitySelect ────────────────────────────────────────────────────────────────

interface CitySelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  uf: string
  value: string
  onChange: (city: string) => void
  placeholder?: string
}

export const CitySelect = forwardRef<HTMLSelectElement, CitySelectProps>(function CitySelect(
  { uf, value, onChange, placeholder = 'Cidade', disabled, ...rest },
  ref,
) {
  const { data: cities, isLoading, isError, refetch } = useIbgeCities(uf)
  const isDisabled = disabled || !uf || isLoading

  const emptyLabel = !uf
    ? 'Selecione um estado'
    : isLoading
    ? 'Carregando…'
    : isError
    ? 'Falha ao carregar — clique para tentar'
    : placeholder

  return (
    <select
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isDisabled && !isError}
      onClick={() => { if (isError && uf) refetch() }}
      {...rest}
    >
      <option value="">{emptyLabel}</option>
      {cities?.map((c) => {
        const label = toTitleCase(c.nome)
        return (
          <option key={c.codigo_ibge} value={label}>
            {label}
          </option>
        )
      })}
    </select>
  )
})
