import styled from 'styled-components'
import {
  AD_INTERESTS,
  AD_MAX_DECLARED_INTERESTS,
  AD_PREFERENCES_COPY as COPY,
  USER_GENDER_LABELS,
  type AdInterestId,
} from '@votz/shared-types'
import { useAdPreferences, useUpdateAdPreferences } from '../../hooks/useAdPreferences'

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

const Intro = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
  margin-bottom: 20px;
`

const SwitchRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const SwitchInfo = styled.div`
  flex: 1;
  min-width: 0;
`

const SwitchLabel = styled.p`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const Hint = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.5;
`

const Switch = styled.button<{ $on: boolean }>`
  flex: none;
  position: relative;
  width: 48px;
  height: 28px;
  border: none;
  border-radius: 14px;
  cursor: pointer;
  background: ${({ $on, theme }) => ($on ? theme.colors.positive : theme.colors.border)};
  transition: background 0.15s;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: ${({ $on }) => ($on ? '23px' : '3px')};
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: ${({ theme }) => theme.colors.white};
    transition: left 0.15s;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Block = styled.div`
  margin-top: 20px;
`

const BlockTitle = styled.h3`
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`

const List = styled.ul`
  margin: 0;
  padding-left: 20px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.6;
`

const GroupName = styled.p`
  font-size: 0.75rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 14px 0 6px;
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const Chip = styled.button<{ $selected: boolean }>`
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 0.875rem;
  cursor: pointer;
  border: 1.5px solid ${({ $selected, theme }) => ($selected ? theme.colors.primary : theme.colors.border)};
  background: ${({ $selected, theme }) => ($selected ? theme.colors.primary : 'transparent')};
  color: ${({ $selected, theme }) => ($selected ? theme.colors.white : theme.colors.text)};

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Feedback = styled.p<{ $error?: boolean }>`
  font-size: 0.875rem;
  margin-top: 12px;
  color: ${({ $error, theme }) => ($error ? theme.colors.action : theme.colors.positive)};
`

const INTEREST_GROUPS = [...new Set(AD_INTERESTS.map((interest) => interest.group))]

/** "Preferências de anúncios": aceite da personalização (opt-in) e interesses. Mesmos textos do celular. */
export function AdPreferencesSection() {
  const { data, isLoading, isError } = useAdPreferences()
  const update = useUpdateAdPreferences()

  if (isLoading) return null
  if (isError || !data) return null

  const selected = new Set<AdInterestId>(data.interests)
  const full = selected.size >= AD_MAX_DECLARED_INTERESTS

  function toggleInterest(id: AdInterestId) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (!full) next.add(id)
    else return
    update.mutate({ interests: [...next] })
  }

  const demographics = [data.ageBand ? `${data.ageBand} anos` : null, data.gender ? USER_GENDER_LABELS[data.gender] : null].filter(Boolean).join(' · ')

  return (
    <Card aria-labelledby="ad-preferences-title">
      <Title id="ad-preferences-title">{COPY.title}</Title>
      <Intro>{COPY.intro}</Intro>

      <SwitchRow>
        <SwitchInfo>
          <SwitchLabel id="ad-personalization-label">{COPY.toggleLabel}</SwitchLabel>
          <Hint>{data.personalizationConsent ? COPY.toggleOn : COPY.toggleOff}</Hint>
        </SwitchInfo>
        <Switch
          type="button"
          role="switch"
          aria-checked={data.personalizationConsent}
          aria-labelledby="ad-personalization-label"
          $on={data.personalizationConsent}
          disabled={update.isPending}
          onClick={() => update.mutate({ personalizationConsent: !data.personalizationConsent })}
        />
      </SwitchRow>

      <Block>
        <BlockTitle>{COPY.usedTitle}</BlockTitle>
        <List>{COPY.usedItems.map((item) => <li key={item}>{item}</li>)}</List>
        {demographics && <Hint style={{ marginTop: 8 }}>Hoje: {demographics}. {COPY.demographicsHint}</Hint>}
      </Block>

      <Block>
        <BlockTitle>{COPY.neverTitle}</BlockTitle>
        <List>{COPY.neverItems.map((item) => <li key={item}>{item}</li>)}</List>
      </Block>

      <Block>
        <BlockTitle>{COPY.interestsTitle}</BlockTitle>
        <Hint>{COPY.interestsHint}</Hint>
        {INTEREST_GROUPS.map((group) => (
          <div key={group}>
            <GroupName>{group}</GroupName>
            <Chips>
              {AD_INTERESTS.filter((interest) => interest.group === group).map((interest) => {
                const isSelected = selected.has(interest.id)
                return (
                  <Chip
                    key={interest.id}
                    type="button"
                    aria-pressed={isSelected}
                    $selected={isSelected}
                    disabled={update.isPending || (full && !isSelected)}
                    onClick={() => toggleInterest(interest.id)}
                  >
                    {interest.label}
                  </Chip>
                )
              })}
            </Chips>
          </div>
        ))}
        {full && <Hint style={{ marginTop: 10 }}>{COPY.interestsLimit}</Hint>}
      </Block>

      {update.isError && <Feedback $error role="alert">{COPY.saveError}</Feedback>}
      {update.isSuccess && !update.isPending && <Feedback role="status">{COPY.saved}</Feedback>}
    </Card>
  )
}
