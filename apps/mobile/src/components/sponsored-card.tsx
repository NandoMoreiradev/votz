import { useEffect, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Info from 'lucide-react-native/icons/info'
import EyeOff from 'lucide-react-native/icons/eye-off'
import Flag from 'lucide-react-native/icons/flag'
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal'
import { AD_WHATSAPP_COPY, type AdSurface, type SponsoredAdView } from '@votz/shared-types'
import { api } from '../lib/api'
import { trackAdEvent, trackAdEventOnce } from '../lib/ad-events'
import { useAppTheme } from '../theme-context'
import { ActionSheet } from './action-sheet'
import { ConfirmModal } from './confirm-modal'
import { FEED_MEDIA_MAX_HEIGHT } from '../lib/media-kind'
import { MediaCarousel } from './media-carousel'
import { Avatar } from './ui'

type CardState = 'shown' | 'hidden' | 'advertiserHidden' | 'reported'

/**
 * Espaço de anúncio no feed. O anúncio só é pedido quando o espaço é desenhado (a lista já desenha só o que está
 * perto da tela), e fica o mesmo enquanto a lista o mantém: refazer o pedido contaria outra exibição.
 * `onLoaded` avisa a lista, que mede a visibilidade (50% por 1 segundo) e manda o evento.
 */
export function SponsoredSlot({ slotId, surface, position, near, onLoaded }: { slotId: string; surface: AdSurface; position: number; near: string[]; onLoaded: (slotId: string, ad: SponsoredAdView | null) => void }) {
  const nearParam = near.join(',')
  const query = useQuery({
    // Os vizinhos entram na chave: se o que está em volta do espaço mudar, o anúncio é conferido de novo.
    queryKey: ['ads', 'next', surface, position, nearParam],
    queryFn: ({ signal }) => api<{ ad: SponsoredAdView | null }>(`/ads/next?surface=${surface}&position=${position}${nearParam ? `&nearPostIds=${nearParam}` : ''}`, { signal }).then((response) => response.ad),
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
  const { colors, theme } = useAppTheme()
  const [state, setState] = useState<CardState>('shown')
  const [showWhy, setShowWhy] = useState(false)
  const [menu, setMenu] = useState(false)
  const [confirmWhatsApp, setConfirmWhatsApp] = useState(false)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const base = { impressionId: ad.impressionId, adId: ad.adId, surface, position }

  if (state !== 'shown') {
    return <View accessibilityLabel="Anúncio escondido" style={{ backgroundColor: colors.surface, padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Text style={{ fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 20, color: colors.muted }}>
        {state === 'reported' ? 'Obrigado. Recebemos a sua denúncia e você não verá este anúncio de novo.' : state === 'advertiserHidden' ? `Você não verá mais anúncios de ${ad.advertiser.name}.` : 'Pronto, você não verá este anúncio de novo.'}
      </Text>
      {state === 'hidden' && <Pressable accessibilityRole="button" onPress={() => { trackAdEvent({ ...base, type: 'HIDE_ADVERTISER' }, { immediate: true }); setState('advertiserHidden') }} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.action }}>Não ver mais anúncios de {ad.advertiser.name}</Text>
      </Pressable>}
    </View>
  }

  // Anúncio de mensagens: o botão abre o chat da página por dentro do app (sem navegador) e leva o identificador do clique.
  const chat = ad.destination?.kind === 'PAGE_MESSAGE' && ad.destination.orgId && ad.clickId ? ad.destination : null
  const openLink = () => void Linking.openURL(ad.clickUrl).catch(() => setNotice({ title: 'Não foi possível abrir', message: 'Tente de novo em instantes.' }))
  const open = () => {
    // WhatsApp: a pessoa é avisada de que a empresa vai ver o número dela. O clique (cobrado) só conta ao confirmar.
    if (ad.destination?.kind === 'WHATSAPP') {
      setConfirmWhatsApp(true)
      return
    }
    trackAdEvent({ ...base, type: 'CLICK' }, { immediate: true })
    if (chat) {
      router.push({ pathname: '/conversation/page', params: { orgType: 'COMPANY', orgId: chat.orgId as string, name: ad.advertiser.name, adClickId: ad.clickId } })
      return
    }
    openLink()
  }
  return <View accessibilityLabel="Anúncio patrocinado" style={{ backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <Avatar name={ad.advertiser.name} uri={ad.advertiser.logoUrl} size={38} />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 15, color: colors.primary, flexShrink: 1 }}>{ad.advertiser.name}</Text>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: colors.muted, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.soft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' }}>Patrocinado</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Opções do anúncio" onPress={() => setMenu(true)} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={20} color={colors.muted} /></Pressable>
    </View>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: colors.text, marginBottom: 4 }}>{ad.headline}</Text>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 22, color: colors.text, marginBottom: 12 }}>{ad.body}</Text>
    {(() => { const items = ad.mediaItems ?? (ad.media ? [ad.media] : []); return items.length > 0 ? <View style={{ marginBottom: 12 }}><MediaCarousel items={items} maxHeight={FEED_MEDIA_MAX_HEIGHT} /></View> : null })()}
    <Pressable accessibilityRole={chat ? 'button' : 'link'} accessibilityLabel={chat ? `${ad.ctaLabel}, abre uma conversa com ${ad.advertiser.name}` : ad.destination?.kind === 'WHATSAPP' ? `${ad.ctaLabel}, abre o WhatsApp de ${ad.advertiser.name}` : `${ad.ctaLabel}, abre o site do anunciante`} onPress={open} style={({ pressed }) => ({ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: colors.badgeBg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: colors.onAccent }}>{ad.ctaLabel}</Text>
    </Pressable>
    {showWhy && <Text style={{ marginTop: 12, padding: 10, borderRadius: theme.radius.sm, backgroundColor: colors.soft, fontFamily: theme.fonts.body, fontSize: 13, lineHeight: 19, color: colors.text }}>{ad.why}</Text>}
    <ActionSheet visible={menu} title="Anúncio" onClose={() => setMenu(false)} items={[
      { key: 'why', label: 'Por que estou vendo isto?', icon: <Info size={20} color={colors.primary} />, onPress: () => setShowWhy((current) => !current) },
      { key: 'hide', label: 'Esconder este anúncio', icon: <EyeOff size={20} color={colors.primary} />, onPress: () => { trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true }); setState('hidden') } },
      { key: 'report', label: 'Denunciar anúncio', danger: true, icon: <Flag size={20} color={colors.action} />, onPress: () => { trackAdEvent({ ...base, type: 'REPORT' }, { immediate: true }); trackAdEvent({ ...base, type: 'HIDE' }, { immediate: true }); setState('reported') } },
    ]} />
    <ConfirmModal
      visible={confirmWhatsApp}
      title={AD_WHATSAPP_COPY.title}
      message={AD_WHATSAPP_COPY.body(ad.advertiser.name)}
      cancelLabel={AD_WHATSAPP_COPY.cancel}
      confirmLabel={AD_WHATSAPP_COPY.continue}
      onClose={() => setConfirmWhatsApp(false)}
      onConfirm={() => {
        setConfirmWhatsApp(false)
        trackAdEvent({ ...base, type: 'CLICK' }, { immediate: true })
        openLink()
      }}
    />
    <ConfirmModal visible={!!notice} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
  </View>
}
