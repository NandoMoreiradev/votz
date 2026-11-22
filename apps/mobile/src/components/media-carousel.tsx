import { useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useEvent } from 'expo'
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video'
import FileText from 'lucide-react-native/icons/file-text'
import Maximize from 'lucide-react-native/icons/maximize'
import Pause from 'lucide-react-native/icons/pause'
import Play from 'lucide-react-native/icons/play'
import Volume2 from 'lucide-react-native/icons/volume-2'
import VolumeX from 'lucide-react-native/icons/volume-x'
import X from 'lucide-react-native/icons/x'
import { IconButton } from './ui'
import type { MediaItemDto } from '@votz/shared-types'
import { carouselFormat, carouselFromMediaItems, carouselItems, DEFAULT_MEDIA_RATIO, formatHeightRatio, mediaRatio, pageIndex, posterUrlOf, type CarouselItem } from '../lib/media-kind'
import { theme } from '../theme'

const OVERLAY = '#000000AA'

// Fora do componente: o player é um objeto nativo mutável, e o lint do React não aceita alterá-lo dentro dele.
function applyMuted(player: VideoPlayer, muted: boolean) { player.muted = muted }
function restartIfFinished(player: VideoPlayer) { if (player.duration > 0 && player.currentTime >= player.duration - 0.2) player.currentTime = 0 }

/**
 * Vídeo dentro do carrossel com controles próprios. Os controles nativos ficam desligados aqui porque
 * disputam o toque com o deslizar do carrossel e com o card do relato (o primeiro toque se perdia).
 * A tela cheia abre o player nativo completo (velocidade, ajustes, arrastar para avançar).
 */
function InlineVideo({ url, autoplay }: { url: string; autoplay: boolean }) {
  const player = useVideoPlayer(url, (instance) => { instance.timeUpdateEventInterval = 0.25; if (autoplay) instance.play() })
  const view = useRef<VideoView>(null)
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing })
  const time = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: -1 })
  const [muted, setMuted] = useState(false)
  const progress = player.duration > 0 ? Math.min(1, time.currentTime / player.duration) : 0
  const toggle = () => {
    if (player.playing) { player.pause(); return }
    // Terminou? Começa de novo.
    restartIfFinished(player)
    player.play()
  }
  return <View style={{ flex: 1, backgroundColor: '#000' }}>
    <VideoView ref={view} player={player} nativeControls={false} contentFit="contain" fullscreenOptions={{ enable: true }} style={{ flex: 1 }} accessibilityLabel="Vídeo" />
    <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pausar vídeo' : 'Tocar vídeo'} onPress={(event) => { event.stopPropagation(); toggle() }} style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {!isPlaying && <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: OVERLAY, alignItems: 'center', justifyContent: 'center' }}><Play size={30} color="#FFFFFF" fill="#FFFFFF" /></View>}
    </Pressable>
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pausar vídeo' : 'Tocar vídeo'} hitSlop={6} onPress={(event) => { event.stopPropagation(); toggle() }} style={controlStyle}>{isPlaying ? <Pause size={18} color="#FFFFFF" /> : <Play size={18} color="#FFFFFF" />}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Ligar o som' : 'Tirar o som'} hitSlop={6} onPress={(event) => { event.stopPropagation(); applyMuted(player, !muted); setMuted(!muted) }} style={controlStyle}>{muted ? <VolumeX size={18} color="#FFFFFF" /> : <Volume2 size={18} color="#FFFFFF" />}</Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver o vídeo em tela cheia" hitSlop={6} onPress={(event) => { event.stopPropagation(); void view.current?.enterFullscreen() }} style={controlStyle}><Maximize size={18} color="#FFFFFF" /></Pressable>
      </View>
      <View style={{ height: 3, backgroundColor: '#FFFFFF44' }}><View style={{ height: 3, width: `${Math.round(progress * 100)}%`, backgroundColor: theme.colors.action }} /></View>
    </View>
  </View>
}
const controlStyle = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const

function PlayBadge() {
  return <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: OVERLAY, alignItems: 'center', justifyContent: 'center' }}><Play size={30} color="#FFFFFF" fill="#FFFFFF" /></View>
}

/** Fundo desfocado da própria imagem, atrás de uma foto que aparece inteira (relatos, GIFs, publicações antigas). */
function Backdrop({ source }: { source: string }) {
  return <Image source={source} recyclingKey={`blur-${source}`} style={[StyleSheet.absoluteFill, { opacity: 0.55, transform: [{ scale: 1.15 }] }]} contentFit="cover" blurRadius={24} accessible={false} />
}

/**
 * Vídeo no carrossel: mostra a capa com um play grande e só carrega o vídeo quando a pessoa toca (não gasta
 * dados no feed). Vídeo antigo, sem capa, mostra o primeiro quadro assim que a página fica visível.
 * Vídeo de publicação ainda processando aparece como aviso, já na moldura certa.
 */
function VideoSlide({ item, active, started, width, height, onStart, onSize }: { item: CarouselItem; active: boolean; started: boolean; width: number; height: number; onStart: () => void; onSize?: (width: number, height: number) => void }) {
  const [posterFailed, setPosterFailed] = useState(false)
  if (item.processing || !item.url) {
    return <View accessibilityRole="text" accessibilityLabel="Preparando o vídeo" style={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: theme.colors.soft }}>
      <ActivityIndicator color={theme.colors.action} />
      <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.primary, textAlign: 'center' }}>Preparando o vídeo. Ele aparece aqui em instantes.</Text>
    </View>
  }
  const url = item.url
  const poster = item.posterUrl ?? posterUrlOf(url)
  const showPlayer = active && (started || posterFailed)
  return <View style={{ width, height, backgroundColor: item.fit === 'cover' ? theme.colors.primary : theme.colors.soft }}>
    {item.fit === 'contain' && poster && !posterFailed && <Backdrop source={poster} />}
    {showPlayer ? <InlineVideo url={url} autoplay={started} /> : <Pressable accessibilityRole="button" accessibilityLabel="Tocar vídeo" onPress={(event) => { event.stopPropagation(); onStart() }} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {poster && !posterFailed && <Image source={poster} recyclingKey={poster} style={StyleSheet.absoluteFill} contentFit={item.fit} onError={() => setPosterFailed(true)} onLoad={(event) => onSize?.(event.source.width, event.source.height)} />}
      <PlayBadge />
    </Pressable>}
  </View>
}

function Slide({ item, active, started, width, height, onOpenImage, onImageSize, onStartVideo }: { item: CarouselItem; active: boolean; started: boolean; width: number; height: number; onOpenImage: (url: string) => void; onImageSize?: (width: number, height: number) => void; onStartVideo: () => void }) {
  if (item.kind === 'image' && item.url) {
    const url = item.url
    // `cover`: a foto já tem a proporção da moldura. `contain`: aparece inteira, com fundo desfocado. Toque para ampliar.
    return <Pressable accessibilityRole="imagebutton" accessibilityLabel="Ampliar imagem" onPress={(event) => { event.stopPropagation(); onOpenImage(item.fullUrl ?? url) }} style={{ width, height, overflow: 'hidden' }}>
      {item.fit === 'contain' && <Backdrop source={item.thumbUrl ?? url} />}
      <Image source={url} recyclingKey={url} style={{ flex: 1 }} contentFit={item.fit} onLoad={(event) => onImageSize?.(event.source.width, event.source.height)} />
    </Pressable>
  }
  if (item.kind === 'video') return <VideoSlide item={item} active={active} started={started} width={width} height={height} onStart={onStartVideo} onSize={onImageSize} />
  const pdfUrl = item.url ?? ''
  return <Pressable accessibilityRole="link" accessibilityLabel="Abrir PDF anexado" onPress={(event) => { event.stopPropagation(); void Linking.openURL(pdfUrl).catch(() => Alert.alert('Não foi possível abrir', 'Tente de novo em instantes.')) }} style={{ width, height, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.soft }}>
    <FileText size={40} color={theme.colors.action} />
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>Abrir PDF anexado</Text>
  </Pressable>
}

/**
 * Fotos, vídeos e PDFs do relato ou da publicação, num carrossel que desliza para o lado, sempre numa das três
 * molduras do padrão (1:1, 4:5 ou 16:9). Com `items` (da API), a moldura já vem certa e a tela não pula; só com
 * `urls` (resposta antiga), a moldura é escolhida pela primeira foto ao carregar.
 */
export function MediaCarousel({ urls, items: mediaItems, limit = 5 }: { urls?: readonly string[] | null; items?: readonly MediaItemDto[] | null; limit?: number }) {
  const items = useMemo(
    () => (mediaItems && mediaItems.length ? carouselFromMediaItems(mediaItems, urls, limit) : carouselItems(urls, limit)),
    [mediaItems, urls, limit],
  )
  const known = useMemo(() => carouselFormat(items), [items])
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  const [measured, setMeasured] = useState(DEFAULT_MEDIA_RATIO)
  const [opened, setOpened] = useState<string | null>(null)
  const [started, setStarted] = useState<string | null>(null)
  if (!items.length) return null
  const ratio = known ? formatHeightRatio(known) : measured
  const height = Math.round(width * ratio)
  const keyOf = (item: CarouselItem, position: number) => item.url ?? `processando-${position}`
  const firstVisual = items.findIndex((item) => item.kind !== 'pdf')
  return <>
    <View onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))} style={{ marginTop: 10, width: '100%', aspectRatio: 1 / ratio, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.soft }}>
      {width > 0 && <FlatList horizontal pagingEnabled nestedScrollEnabled data={items} keyExtractor={keyOf} showsHorizontalScrollIndicator={false} extraData={`${ratio}-${index}-${started}`}
        getItemLayout={(_, position) => ({ length: width, offset: width * position, index: position })}
        onMomentumScrollEnd={(event) => { const next = pageIndex(event.nativeEvent.contentOffset.x, width, items.length); if (next !== index) { setStarted(null); setIndex(next) } }}
        renderItem={({ item, index: position }) => <Slide item={item} active={position === index} started={started === keyOf(item, position)} width={width} height={height} onOpenImage={setOpened} onStartVideo={() => setStarted(keyOf(item, position))} onImageSize={!known && position === firstVisual ? (w, h) => setMeasured(mediaRatio(w, h)) : undefined} />} />}
      {items.length > 1 && <>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={{ position: 'absolute', top: 8, right: 8, backgroundColor: OVERLAY, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: theme.fonts.medium }}>{index + 1}/{items.length}</Text>
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no" style={{ position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', gap: 5, backgroundColor: OVERLAY, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 7 }}>
            {items.map((item, position) => <View key={keyOf(item, position)} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: position === index ? '#FFFFFF' : '#FFFFFF77' }} />)}
          </View>
        </View>
      </>}
    </View>
    <Modal visible={!!opened} transparent animationType="fade" onRequestClose={() => setOpened(null)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.primary }}>
        <View style={{ alignItems: 'flex-end', paddingHorizontal: 16 }}><IconButton label="Fechar imagem" onPress={() => setOpened(null)}><X color={theme.colors.surface} size={24} /></IconButton></View>
        <Image source={opened} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Imagem ampliada" />
      </SafeAreaView>
    </Modal>
  </>
}
