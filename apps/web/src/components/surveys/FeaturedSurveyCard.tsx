import { useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { LockSimple, ShieldCheck, X } from '@phosphor-icons/react'
import { SURVEY_KIND_LABELS, SURVEY_ORIGIN_LABELS } from '@votz/shared-types'
import { useFeaturedSurveys } from '../../hooks/useSurveys'

const DISMISS_KEY = 'votz:dismissed-surveys'

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: 14px;
  padding: 16px 18px;
  margin: 12px 16px;
  position: relative;
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
`

const BadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const OfficialBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

const KindPill = styled.span`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.muted};
`

const DismissBtn = styled.button`
  border: none;
  background: transparent;
  color: ${({ theme }) => theme.colors.muted};
  padding: 4px;
  border-radius: ${({ theme }) => theme.radii.sm};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.text}; background: ${({ theme }) => theme.colors.neutral}; }
`

const Title = styled.h3`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 1.0625rem;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`

const Subtitle = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.muted};
  line-height: 1.45;
  margin-bottom: 12px;
`

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`

const TrustNote = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.positiveText};
  font-weight: 600;
`

const CtaLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.text};
  color: ${({ theme }) => theme.colors.white};
  font-size: 0.875rem;
  font-weight: 600;
  &:hover { opacity: 0.88; }
`

export function FeaturedSurveyCard() {
  const { data } = useFeaturedSurveys()
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const survey = (data ?? []).find((s) => !dismissed.includes(s.id))
  if (!survey) return null

  function dismiss() {
    const next = [...dismissed, survey!.id]
    setDismissed(next)
    try {
      sessionStorage.setItem(DISMISS_KEY, JSON.stringify(next))
    } catch {
      // ignore storage errors
    }
  }

  return (
    <Card aria-label="Pesquisa Votz em destaque">
      <TopRow>
        <BadgeRow>
          <OfficialBadge>
            <ShieldCheck size={13} weight="fill" />
            {SURVEY_ORIGIN_LABELS[survey.origin]}
          </OfficialBadge>
          <KindPill>
            {SURVEY_KIND_LABELS[survey.kind]}
            {survey.scope === 'STATE' && survey.targetState ? ` · ${survey.targetState}` : ''}
            {survey.scope === 'MUNICIPAL' && survey.targetCity ? ` · ${survey.targetCity}/${survey.targetState}` : ''}
          </KindPill>
        </BadgeRow>
        <DismissBtn type="button" onClick={dismiss} title="Dispensar por agora" aria-label="Dispensar pesquisa por agora">
          <X size={16} />
        </DismissBtn>
      </TopRow>

      <Title>{survey.title}</Title>
      {survey.subtitle && <Subtitle>{survey.subtitle}</Subtitle>}

      <Footer>
        <TrustNote>
          <LockSimple size={14} weight="bold" />
          Voto anônimo e seguro
        </TrustNote>
        <CtaLink to={`/pesquisas/${survey.slug}`}>
          {survey.hasVoted ? 'Ver pesquisa' : 'Participar'}
        </CtaLink>
      </Footer>
    </Card>
  )
}
