import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import Info from 'lucide-react-native/icons/info'
import EyeOff from 'lucide-react-native/icons/eye-off'
import Flag from 'lucide-react-native/icons/flag'
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal'
import type { AdSurface, SponsoredAdView } from '@votz/shared-types'
import { api } from '../lib/api'
import { trackAdEvent, trackAdEventOnce } from '../lib/ad-events'
import { theme } from '../theme'
import { ActionSheet } from './action-sheet'
import { Avatar } from './ui'

type CardState = 'shown' | 'hidden' | 'advertiserHidden' | 'reported'

/**
 * Espaço de anúncio no feed. O anúncio só é pedido quando o espaço é desenhado (a lista já desenha só o que está
 * perto da tela), e fica o mesmo enquanto a lista o mantém: refazer o pedido contaria outra exibição.
 * `onLoaded` avisa a lista, que mede a visibilidade (50% por 1 segundo) e manda o evento.
 */
export function SponsoredSlot({ slotId, surface, position, onLoaded }: { slotId: string; surface: AdSurface; position: number; onLoaded: (slotId: string, ad: SponsoredAdView | null) => void }) {
  const query = useQuery({
    queryKey: ['ads', 'next', surface, position],
    queryFn: ({ signal }) => api<{ ad: SponsoredAdView | null }>(`/ads/next?surface=${surface}&position=${position}`, { signal }).then((response) => response.ad),
    staleTime: Infinity, retry: false, refetchOnWindowFocus: false,
  })
  const ad = query.data ?? null
  useEffect(() => { onLoaded(slotId, ad) }, [slotId, ad, onLoaded])
  useEffect(() => {
    if (ad) trackAdEventOnce({ impressionId: ad.impressionId, adId: ad.adId, surface, position, type: 'IMPRESSION' })
  }, [ad, surface, position])
  return ad ? <SponsoredCard ad={ad} surface={surface} position={position} /> : null
}

export function SponsoredCard({ ad, surface, position }: { ad: SponsoredAdView; surface: AdSurface; position: number }) {
  const [state, setState] = useState<CardState>('shown')
  const [showWhy, setShowWhy] = useState(false)
  const [menu, setMenu] = useState(false)
  const base = { impressionId: ad.impressionId, adId: ad.adId, surface, position }

  if (state !== 'shown') {
    return <View accessibilityLabel="Anúncio escondido" style={{ backgroundColor: theme.colors.surface, padding: 16, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 20, color: theme.colors.muted }}>
        {state === 'reported' ? 'Obrigado. Recebemos a sua denúncia e você não verá este anúncio de novo.' : state === 'advertiserHidden' ? `Você não verá mais anúncios de ${ad.advertiser.name}.` : 'Pronto, você não verá este anúncio de novo.'}
      </Text>
      {state === 'hidden' && <Pressable accessibilityRole="button" onPress={() => { trackAdEvent({ ...base, type: 'HIDE_ADVERTISER' }, { immediate: true }); setState('advertiserHidden') }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.action }}>Não ver mais anúncios de {ad.advertiser.name}</Text>
      </Pressable>}
    </View>
  }

  const open = () => {
    trackAdEvent({ ...base, type: 'CLICK' }, { immediate: true })
    void Linking.openURL(ad.destinationUrl).catch(() => Alert.alert('Não foi possível abrir', 'Tente de novo em instantes.'))
  }
  return <View accessibilityLabel="Anúncio patrocinado" style={{ backgroundColor: theme.colors.surface, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <Avatar name={ad.advertiser.name} uri={ad.advertiser.logoUrl} size={38} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: theme.colors.primary, flexShrink: 1 }}>{ad.advertiser.name}</Text>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: theme.colors.muted, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' }}>Patrocinado</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Opções do anúncio" onPress={() => setMenu(true)} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={20} color={theme.colors.muted} /></Pressable>
    </View>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: theme.colors.text, marginBottom: 4 }}>{ad.headline}</Text>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 22, color: theme.colors.text, marginBottom: 12 }}>{ad.body}</Text>
    <Pressable accessibilityRole="link" accessibilityLabel={`${ad.ctaLabel}, abre o site do anunciante`} onPress={open} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: '#FFFFFF' }}>{ad.ctaLabel}</Text>
    </Pressable>
    {showWhy && <Text style={{ marginTop: 12, padding: 10, borderRadius: theme.radius.sm, backgroundColor: theme.colors.soft, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19, color: theme.colors.text }}>{ad.why}</Text>}
    <ActionSheet visible={menu} title="Anúncio" onClose={() => setMenu(false)} items={[
      { key: 'why', label: 'Por que estou vendo isto?', icon: <Info size={20} color={theme.colors.primary} />, onPress: () => setShowWhy((current) => !current) },
      { key: 'hide', label: 'Esconder este anúncio', icon: <EyeOff size={20} color={theme.colors.primary} />, onPress: () => { trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true }); setState('hidden') } },
      { key: 'report', label: 'Denunciar anúncio', danger: true, icon: <Flag size={20} color={theme.colors.action} />, onPress: () => { trackAdEvent({ ...base, type: 'REPORT' }, { immediate: true }); trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true }); setState('reported') } },
    ]} />
  </View>
}
