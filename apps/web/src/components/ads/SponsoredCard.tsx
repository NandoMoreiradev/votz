import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { ArrowSquareOut, EyeSlash, Flag, Info } from '@phosphor-icons/react'
import { AD_VIEWABILITY, type AdSurface, type SponsoredAdView } from '@votz/shared-types'
import { trackAdEvent, trackAdEventOnce } from '../../lib/ad-events'
import { socialRow } from '../ui/social'
import { OptionsMenu, type MenuItem } from '../ui/OptionsMenu'
import { AdMedia, adMediaItems } from './AdMedia'

interface SponsoredCardProps {
  ad: SponsoredAdView
  surface: AdSurface
  position: number
}

const Card = styled.article`
  ${socialRow}
  position: relative;
  padding: 16px 16px 16px 68px;
  @media (max-width: 480px) { padding: 16px 12px 16px 60px; }
`

const Avatar = styled.div<{ $src: string | null }>`
  position: absolute;
  top: 16px;
  left: 16px;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: ${({ $src, theme }) => ($src ? `url(${$src}) center/cover` : `${theme.colors.primary}14`)};
  color: ${({ theme }) => theme.colors.primary};
  font-family: ${({ theme }) => theme.fonts.heading};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  @media (max-width: 480px) { left: 12px; width: 36px; height: 36px; }
`

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`

const Who = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
`

const Name = styled(Link)`
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  &:hover { text-decoration: underline; }
`

const Label = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
`

const Headline = styled.h3`
  margin: 0 0 4px;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.lg};
  color: ${({ theme }) => theme.colors.text};
`

const Body = styled.p`
  margin: 0 0 12px;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.5;
  overflow-wrap: anywhere;
`

const Cta = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.white};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  &:hover { opacity: 0.9; }
`

const Why = styled.p`
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.45;
`

const Done = styled.div`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  line-height: 1.5;
`

const TextButton = styled.button`
  margin-top: 8px;
  padding: 0;
  border: none;
  background: none;
  color: ${({ theme }) => theme.colors.action};
  font: inherit;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
  &:hover { text-decoration: underline; }
`

type CardState = 'shown' | 'hidden' | 'advertiserHidden' | 'reported'

/**
 * Anúncio no feed, sempre marcado "Patrocinado". Conta como visto só com metade do card na tela por 1 segundo
 * (padrão de mercado). Os eventos vão em lote para a API, que confere tudo e cobra no servidor: aqui nada de preço.
 */
export function SponsoredCard({ ad, surface, position }: SponsoredCardProps) {
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<CardState>('shown')
  const [showWhy, setShowWhy] = useState(false)

  const base = { impressionId: ad.impressionId, adId: ad.adId, surface, position }

  // Cartão desenhado na tela.
  useEffect(() => {
    trackAdEventOnce({ ...base, type: 'IMPRESSION' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.impressionId])

  // Visibilidade: 50% do card na tela por 1 segundo seguido, com a aba aberta.
  useEffect(() => {
    const element = ref.current
    if (!element || state !== 'shown') return
    let timer: ReturnType<typeof setTimeout> | undefined
    let startedAt = 0
    let sent = false

    const stop = () => {
      if (timer) clearTimeout(timer)
      timer = undefined
    }
    const start = () => {
      if (timer || sent) return
      startedAt = Date.now()
      timer = setTimeout(() => {
        sent = true
        timer = undefined
        trackAdEvent({ ...base, type: 'VIEWABLE_IMPRESSION', visibleMs: Math.max(AD_VIEWABILITY.MIN_VISIBLE_MS, Date.now() - startedAt) })
      }, AD_VIEWABILITY.MIN_VISIBLE_MS)
    }

    let ratioOk = false
    const evaluate = () => {
      if (ratioOk && document.visibilityState === 'visible') start()
      else stop()
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        ratioOk = entry.intersectionRatio >= AD_VIEWABILITY.MIN_VISIBLE_RATIO
        evaluate()
      },
      { threshold: [0, AD_VIEWABILITY.MIN_VISIBLE_RATIO, 1] },
    )
    observer.observe(element)
    document.addEventListener('visibilitychange', evaluate)
    return () => {
      stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', evaluate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.impressionId, state])

  const menu: MenuItem[] = [
    { key: 'why', label: 'Por que estou vendo isto?', icon: <Info size={16} />, onSelect: () => { setShowWhy((current) => !current) } },
    {
      key: 'hide',
      label: 'Esconder este anúncio',
      icon: <EyeSlash size={16} />,
      onSelect: () => {
        trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true })
        setState('hidden')
      },
    },
    {
      key: 'report',
      label: 'Denunciar anúncio',
      icon: <Flag size={16} />,
      danger: true,
      onSelect: () => {
        trackAdEvent({ ...base, type: 'REPORT' }, { immediate: true })
        // Denunciar também esconde: a pessoa não precisa ver de novo o que denunciou.
        trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true })
        setState('reported')
      },
    },
  ]

  if (state !== 'shown') {
    return (
      <Card ref={ref} aria-label="Anúncio escondido">
        <Done>
          {state === 'reported' ? 'Obrigado. Recebemos a sua denúncia e você não verá este anúncio de novo.' : 'Pronto, você não verá este anúncio de novo.'}
          {state === 'hidden' && (
            <>
              <br />
              <TextButton
                type="button"
                onClick={() => {
                  trackAdEvent({ ...base, type: 'HIDE_ADVERTISER' }, { immediate: true })
                  setState('advertiserHidden')
                }}
              >
                Não ver mais anúncios de {ad.advertiser.name}
              </TextButton>
            </>
          )}
          {state === 'advertiserHidden' && <> Você não verá mais anúncios de {ad.advertiser.name}.</>}
        </Done>
      </Card>
    )
  }

  const profile = `/empresa/${ad.advertiser.id}`
  return (
    <Card ref={ref} aria-label="Anúncio patrocinado">
      <Avatar $src={ad.advertiser.logoUrl} aria-hidden="true">
        {ad.advertiser.logoUrl ? null : ad.advertiser.name.slice(0, 1).toUpperCase()}
      </Avatar>
      <Head>
        <Who>
          <Name to={profile}>{ad.advertiser.name}</Name>
          <Label>Patrocinado</Label>
        </Who>
        <OptionsMenu label="Opções do anúncio" items={menu} />
      </Head>
      <Headline>{ad.headline}</Headline>
      <Body>{ad.body}</Body>
      <AdMedia items={adMediaItems(ad)} />
      <Cta
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => trackAdEvent({ ...base, type: 'CLICK' }, { immediate: true })}
      >
        {ad.ctaLabel}
        <ArrowSquareOut size={16} aria-hidden="true" />
      </Cta>
      {showWhy && (
        <Why>
          {ad.why} <Link to="/anuncios/biblioteca">Ver a biblioteca de anúncios</Link>
        </Why>
      )}
    </Card>
  )
}
