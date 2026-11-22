import { useEffect, useRef, useState } from 'react'
import type { AdSurface } from '@votz/shared-types'
import { useSponsoredAd } from '../../hooks/useAds'
import { SponsoredCard } from './SponsoredCard'

interface SponsoredSlotProps {
  surface: AdSurface
  /** Posição do espaço no feed (índice do item depois do qual ele aparece). */
  position: number
  state?: string
  city?: string
  /** Publicações em volta do espaço (para não pôr anúncio perto de relato contra o anunciante). */
  nearPostIds?: string[]
}

/**
 * Espaço de anúncio no feed. Só pede o anúncio quando chega perto da tela, para não gastar uma exibição (nem o
 * limite de 3 por pessoa) com espaço que a pessoa nem rolou até ver. Sem anúncio, não ocupa lugar nenhum.
 */
export function SponsoredSlot({ surface, position, state, city, nearPostIds }: SponsoredSlotProps) {
  const holder = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const element = holder.current
    if (!element || near) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setNear(true)
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near])

  const { data: ad } = useSponsoredAd({ surface, position, state, city, nearPostIds, enabled: near })

  return (
    <div ref={holder}>
      {ad ? <SponsoredCard ad={ad} surface={surface} position={position} /> : null}
    </div>
  )
}
