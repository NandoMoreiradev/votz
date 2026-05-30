import { useState, useRef } from 'react'
import styled from 'styled-components'

export interface CepAddressResult {
  zipCode: string        // digits only
  street: string
  neighborhood: string
  city: string
  state: string          // UF 2 chars
  latitude?: number
  longitude?: number
}

interface Props {
  value: string
  onChange: (raw: string) => void
  onAddressFetched: (data: CepAddressResult) => void
  error?: string
  disabled?: boolean
}

// ── Styled ─────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`

const StyledInput = styled.input<{ $error?: boolean; $loading?: boolean }>`
  width: 160px;
  padding: 10px 14px;
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};
  outline: none;
  transition: border-color 0.15s;
  letter-spacing: 0.05em;

  &:focus {
    border-color: ${({ theme }) => theme.colors.primary};
  }
  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    letter-spacing: 0;
  }
  &:disabled {
    background: ${({ theme }) => theme.colors.neutral};
    cursor: not-allowed;
  }
`

const StatusText = styled.span<{ $error?: boolean }>`
  font-size: 0.8125rem;
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.muted)};
`

const AddressPreview = styled.div`
  padding: 10px 14px;
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
`

const EditLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  align-self: flex-start;
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

// ── Utils ─────────────────────────────────────────────────────────────────

function formatCepMask(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

// ── Component ─────────────────────────────────────────────────────────────

export function CepInput({ value, onChange, onAddressFetched, error, disabled }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [preview, setPreview] = useState<CepAddressResult | null>(null)
  const lastFetched = useRef<string>('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    onChange(digits)
    if (digits.length < 8) {
      setStatus('idle')
      setPreview(null)
    }
  }

  async function handleBlur() {
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 8 || digits === lastFetched.current) return

    lastFetched.current = digits
    setStatus('loading')

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`)
      if (!res.ok) throw new Error('not_found')
      const data = await res.json()

      const result: CepAddressResult = {
        zipCode: digits,
        street: data.street ?? '',
        neighborhood: data.neighborhood ?? '',
        city: data.city ?? '',
        state: data.state ?? '',
        latitude: data.location?.coordinates?.latitude
          ? Number(data.location.coordinates.latitude)
          : undefined,
        longitude: data.location?.coordinates?.longitude
          ? Number(data.location.coordinates.longitude)
          : undefined,
      }

      setPreview(result)
      setStatus('ok')
      onAddressFetched(result)
    } catch {
      setStatus('error')
      setPreview(null)
    }
  }

  const previewLine = preview
    ? [preview.street, preview.neighborhood].filter(Boolean).join(', ') +
      (preview.city ? ` — ${preview.city}, ${preview.state}` : '')
    : ''

  return (
    <Wrapper>
      <Row>
        <StyledInput
          type="text"
          inputMode="numeric"
          placeholder="00000-000"
          value={formatCepMask(value)}
          onChange={handleChange}
          onBlur={handleBlur}
          $error={!!error || status === 'error'}
          disabled={disabled}
          maxLength={9}
          autoComplete="postal-code"
        />
        {status === 'loading' && <StatusText>Buscando...</StatusText>}
        {status === 'error' && <StatusText $error>CEP não encontrado</StatusText>}
      </Row>

      {status === 'ok' && preview && (
        <>
          <AddressPreview>{previewLine || 'Endereço encontrado'}</AddressPreview>
        </>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}
    </Wrapper>
  )
}

// ─── ManualAddressFields — campos expandidos para correção manual ──────────

interface ManualFieldsProps {
  street: string
  neighborhood: string
  onStreetChange: (v: string) => void
  onNeighborhoodChange: (v: string) => void
  city: string          // readonly
  state: string         // readonly
}

const ManualGrid = styled.div`
  display: grid;
  gap: 12px;
`

const InlineField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`

const InlineLabel = styled.label`
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  color: ${({ theme }) => theme.colors.muted};
`

const InlineInput = styled.input<{ $readonly?: boolean }>`
  height: 40px;
  padding: 0 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ $readonly, theme }) => ($readonly ? theme.colors.neutral : theme.colors.white)};
  cursor: ${({ $readonly }) => ($readonly ? 'default' : 'text')};
  outline: none;
  transition: border-color 0.15s;

  &:focus {
    border-color: ${({ $readonly, theme }) =>
      $readonly ? theme.colors.border : theme.colors.primary};
  }
`

const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 80px;
  gap: 12px;
`

export function ManualAddressFields({
  street,
  neighborhood,
  onStreetChange,
  onNeighborhoodChange,
  city,
  state,
}: ManualFieldsProps) {
  return (
    <ManualGrid>
      <InlineField>
        <InlineLabel>Logradouro</InlineLabel>
        <InlineInput
          type="text"
          value={street}
          onChange={(e) => onStreetChange(e.target.value)}
          maxLength={200}
          autoComplete="street-address"
        />
      </InlineField>

      <InlineField>
        <InlineLabel>Bairro</InlineLabel>
        <InlineInput
          type="text"
          value={neighborhood}
          onChange={(e) => onNeighborhoodChange(e.target.value)}
          maxLength={100}
        />
      </InlineField>

      <TwoCol>
        <InlineField>
          <InlineLabel>Cidade</InlineLabel>
          <InlineInput type="text" value={city} $readonly readOnly tabIndex={-1} />
        </InlineField>
        <InlineField>
          <InlineLabel>Estado</InlineLabel>
          <InlineInput type="text" value={state} $readonly readOnly tabIndex={-1} />
        </InlineField>
      </TwoCol>
    </ManualGrid>
  )
}

export { EditLink }

// ─── FullManualAddressFields — todos os campos editáveis (sem CEP) ────────────

interface FullManualProps {
  street: string
  neighborhood: string
  city: string
  state: string
  onStreetChange: (v: string) => void
  onNeighborhoodChange: (v: string) => void
  onCityChange: (v: string) => void
  onStateChange: (v: string) => void
}

const StateInput = styled(InlineInput)`
  text-transform: uppercase;
  width: 80px;
`

export function FullManualAddressFields({
  street,
  neighborhood,
  city,
  state,
  onStreetChange,
  onNeighborhoodChange,
  onCityChange,
  onStateChange,
}: FullManualProps) {
  return (
    <ManualGrid>
      <InlineField>
        <InlineLabel>Logradouro</InlineLabel>
        <InlineInput
          type="text"
          value={street}
          onChange={(e) => onStreetChange(e.target.value)}
          maxLength={200}
          autoComplete="street-address"
          placeholder="Av. Paulista"
        />
      </InlineField>

      <InlineField>
        <InlineLabel>Bairro</InlineLabel>
        <InlineInput
          type="text"
          value={neighborhood}
          onChange={(e) => onNeighborhoodChange(e.target.value)}
          maxLength={100}
          placeholder="Bela Vista"
        />
      </InlineField>

      <TwoCol>
        <InlineField>
          <InlineLabel>Cidade</InlineLabel>
          <InlineInput
            type="text"
            value={city}
            onChange={(e) => onCityChange(e.target.value)}
            maxLength={100}
            placeholder="São Paulo"
          />
        </InlineField>
        <InlineField>
          <InlineLabel>Estado (UF)</InlineLabel>
          <StateInput
            type="text"
            value={state}
            onChange={(e) => onStateChange(e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
            placeholder="SP"
          />
        </InlineField>
      </TwoCol>
    </ManualGrid>
  )
}
