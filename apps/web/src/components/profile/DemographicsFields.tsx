import styled from 'styled-components'
import { MIN_AGE, PROFILE_DEMOGRAPHICS_PURPOSE, USER_GENDERS, USER_GENDER_LABELS, type UserGender } from '@votz/shared-types'

/** Data mais recente aceita: quem completa 18 anos hoje (a API confere de novo). */
export function maxBirthDate(today: Date = new Date()): string {
  const limit = new Date(Date.UTC(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()))
  return limit.toISOString().slice(0, 10)
}

interface DemographicsFieldsProps {
  birthDate: string
  gender: UserGender | ''
  onBirthDateChange: (value: string) => void
  onGenderChange: (value: UserGender | '') => void
  error?: string
  disabled?: boolean
}

/**
 * Data de nascimento e gênero: opcionais, nunca aparecem no perfil público. Para anúncios só circulam como faixa de
 * idade e só com a personalização ligada (plano de anúncios, decisão 3). Mesmo texto no site e no celular.
 */
export function DemographicsFields({ birthDate, gender, onBirthDateChange, onGenderChange, error, disabled }: DemographicsFieldsProps) {
  return (
    <Group>
      <Purpose id="demographics-purpose">{PROFILE_DEMOGRAPHICS_PURPOSE}</Purpose>
      <Row>
        <Field>
          <Label htmlFor="birth-date">Data de nascimento <Optional>(opcional)</Optional></Label>
          <Input
            id="birth-date"
            type="date"
            value={birthDate}
            max={maxBirthDate()}
            min="1900-01-01"
            disabled={disabled}
            aria-describedby="demographics-purpose"
            aria-invalid={!!error}
            onChange={(event) => onBirthDateChange(event.target.value)}
          />
        </Field>
        <Field>
          <Label htmlFor="gender">Gênero <Optional>(opcional)</Optional></Label>
          <Select
            id="gender"
            value={gender}
            disabled={disabled}
            aria-describedby="demographics-purpose"
            onChange={(event) => onGenderChange(event.target.value as UserGender | '')}
          >
            <option value="">Não informar</option>
            {USER_GENDERS.map((option) => <option key={option} value={option}>{USER_GENDER_LABELS[option]}</option>)}
          </Select>
        </Field>
      </Row>
      {error && <Error role="alert">{error}</Error>}
    </Group>
  )
}

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

const Purpose = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  @media (max-width: 480px) { grid-template-columns: 1fr; }
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
`

const Optional = styled.span`
  font-weight: ${({ theme }) => theme.fontWeights.regular};
  color: ${({ theme }) => theme.colors.muted};
`

const Input = styled.input`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  &:focus { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 1px; }
`

const Select = styled.select`
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-family: ${({ theme }) => theme.fonts.body};
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  &:focus { outline: 2px solid ${({ theme }) => theme.colors.primary}; outline-offset: 1px; }
`

const Error = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.action};
`
