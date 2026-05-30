import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
  type CountryCode,
} from 'libphonenumber-js'

// ── Country data ──────────────────────────────────────────────────────────────

const displayNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' })

interface CountryEntry {
  code: CountryCode
  name: string
  callingCode: string
}

function flagUrl(code: CountryCode): string {
  return `https://flagcdn.com/w20/${code.toLowerCase()}.png`
}

const COUNTRIES: CountryEntry[] = getCountries()
  .map((code) => ({
    code,
    name: displayNames.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }))
  .sort((a, b) => {
    if (a.code === 'BR') return -1
    if (b.code === 'BR') return 1
    return a.name.localeCompare(b.name, 'pt-BR')
  })

const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.code === 'BR')!

// ── Styled ─────────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
`

const InputRow = styled.div<{ $error?: boolean }>`
  display: flex;
  align-items: stretch;
  border: 1.5px solid ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.border)};
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.white};
  overflow: hidden;
  transition: border-color 0.15s;

  &:focus-within {
    border-color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.primary)};
  }
`

const CountryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  background: ${({ theme }) => theme.colors.neutral};
  border: none;
  border-right: 1.5px solid ${({ theme }) => theme.colors.border};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const ChevronIcon = styled.span`
  font-size: 0.625rem;
  color: ${({ theme }) => theme.colors.muted};
  margin-left: 2px;
`

const FlagImg = styled.img`
  width: 20px;
  height: 15px;
  object-fit: cover;
  border-radius: 2px;
  flex-shrink: 0;
  display: block;
`

const NationalInput = styled.input`
  flex: 1;
  padding: 10px 12px;
  border: none;
  outline: none;
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
  background: transparent;

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
    font-family: ${({ theme }) => theme.fonts.body};
  }

  &:disabled {
    cursor: not-allowed;
    color: ${({ theme }) => theme.colors.muted};
  }
`

const DropdownBox = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  z-index: 100;
  display: flex;
  flex-direction: column;
  max-height: 300px;
`

const SearchBox = styled.input`
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  outline: none;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.white};

  &::placeholder {
    color: ${({ theme }) => theme.colors.muted};
  }
`

const CountryList = styled.ul`
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
  margin: 0;
`

const CountryItem = styled.li<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ $active, theme }) => ($active ? theme.colors.surfaceHover : 'transparent')};
  transition: background 0.1s;

  &:hover {
    background: ${({ theme }) => theme.colors.surfaceHover};
  }
`

const CountryName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const CallingCode = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  flex-shrink: 0;
`

const ErrorMsg = styled.span`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.action};
`

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  value: string
  onChange: (e164: string) => void
  error?: string
  disabled?: boolean
}

export function PhoneInput({ value, onChange, error, disabled }: Props) {
  const [country, setCountry] = useState<CountryEntry>(DEFAULT_COUNTRY)
  const [nationalInput, setNationalInput] = useState('')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Sync with external value on mount or when value changes externally
  useEffect(() => {
    if (!value) return
    try {
      const parsed = parsePhoneNumber(value)
      if (parsed?.country) {
        const c = COUNTRIES.find((e) => e.code === parsed.country)
        if (c) {
          setCountry(c)
          setNationalInput(parsed.formatNational())
        }
      }
    } catch {}
  }, []) // only on mount to avoid overwriting user input

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    if (open) {
      // Focus search after dropdown opens
      setTimeout(() => searchRef.current?.focus(), 0)
    }
  }, [open])

  function handleNationalChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setNationalInput(raw)

    const digits = raw.replace(/\D/g, '')
    if (digits.length > 0) {
      onChange(`+${country.callingCode}${digits}`)
    } else {
      onChange('')
    }
  }

  function selectCountry(c: CountryEntry) {
    setCountry(c)
    setNationalInput('')
    onChange('')
    setOpen(false)
    setSearch('')
  }

  const filtered = search.trim()
    ? COUNTRIES.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.callingCode.includes(search.replace(/\D/g, '')) ||
          c.code.toLowerCase().includes(search.toLowerCase()),
      )
    : COUNTRIES

  return (
    <Wrapper ref={wrapperRef}>
      <InputRow $error={!!error}>
        <CountryBtn type="button" onClick={() => setOpen((o) => !o)} disabled={disabled}>
          <FlagImg src={flagUrl(country.code)} alt={country.code} />
          +{country.callingCode}
          <ChevronIcon>▾</ChevronIcon>
        </CountryBtn>
        <NationalInput
          type="tel"
          value={nationalInput}
          onChange={handleNationalChange}
          placeholder="(11) 99999-9999"
          disabled={disabled}
          autoComplete="tel-national"
        />
      </InputRow>

      {open && (
        <DropdownBox>
          <SearchBox
            ref={searchRef}
            type="text"
            placeholder="Buscar país..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <CountryList>
            {filtered.map((c) => (
              <CountryItem
                key={c.code}
                $active={c.code === country.code}
                onMouseDown={() => selectCountry(c)}
              >
                <FlagImg src={flagUrl(c.code)} alt={c.code} />
                <CountryName>{c.name}</CountryName>
                <CallingCode>+{c.callingCode}</CallingCode>
              </CountryItem>
            ))}
            {filtered.length === 0 && (
              <CountryItem as="div" style={{ cursor: 'default', color: '#9CA3AF' }}>
                Nenhum país encontrado
              </CountryItem>
            )}
          </CountryList>
        </DropdownBox>
      )}

      {error && <ErrorMsg>{error}</ErrorMsg>}
    </Wrapper>
  )
}
