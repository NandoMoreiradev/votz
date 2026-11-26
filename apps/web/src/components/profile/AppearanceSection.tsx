import styled from 'styled-components'
import { Monitor, Moon, Sun } from '@phosphor-icons/react'
import { THEME_PREFERENCE_LABELS, type ThemePreference } from '@votz/shared-types'
import { useAppTheme } from '../../theme/ThemeContext'

const Card = styled.section`
  margin-top: 24px;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 28px 32px;

  @media (max-width: 600px) {
    padding: 20px 16px;
  }
`

const Title = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 6px;
`

const Desc = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin-bottom: 18px;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`

const Choice = styled.button<{ $active: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1.5px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}14` : theme.colors.surface)};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.875rem;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
  cursor: pointer;
  transition: border-color 0.14s, background 0.14s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const OPTIONS: { value: ThemePreference; Icon: typeof Sun }[] = [
  { value: 'SYSTEM', Icon: Monitor },
  { value: 'LIGHT', Icon: Sun },
  { value: 'DARK', Icon: Moon },
]

export function AppearanceSection() {
  const { preference, saving, setPreference } = useAppTheme()

  return (
    <Card id="aparencia">
      <Title>Aparência</Title>
      <Desc>
        Escolha entre tema claro, escuro ou automático conforme o seu dispositivo. Sua preferência fica salva no seu perfil.
      </Desc>
      <Grid role="radiogroup" aria-label="Tema do Votz">
        {OPTIONS.map(({ value, Icon }) => {
          const active = preference === value
          return (
            <Choice
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              $active={active}
              disabled={saving}
              onClick={() => setPreference(value)}
            >
              <Icon size={22} weight={active ? 'fill' : 'regular'} />
              <span>{THEME_PREFERENCE_LABELS[value]}</span>
            </Choice>
          )
        })}
      </Grid>
    </Card>
  )
}
