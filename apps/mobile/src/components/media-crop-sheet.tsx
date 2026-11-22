import { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import Minus from 'lucide-react-native/icons/minus'
import Plus from 'lucide-react-native/icons/plus'
import X from 'lucide-react-native/icons/x'
import {
  MEDIA_FORMATS,
  MEDIA_FORMAT_ORDER,
  cropFromView,
  maxCropZoom,
  type MediaAssetKind,
  type MediaCrop,
  type MediaFormat,
} from '@votz/shared-types'
import { Button, IconButton } from './ui'
import { theme } from '../theme'

export interface CropView {
  zoom: number
  centerX: number
  centerY: number
}

export const INITIAL_VIEW: CropView = { zoom: 1, centerX: 0.5, centerY: 0.5 }

/** Um arquivo no editor (as mesmas contas do site, do pacote compartilhado). */
export interface CropItem {
  key: string
  uri: string
  kind: MediaAssetKind
  width: number
  height: number
  view: CropView
}

/** Recorte (frações do original) do que o editor mostra. GIF não é recortado. */
export function cropOf(item: Pick<CropItem, 'kind' | 'width' | 'height' | 'view'>, format: MediaFormat): MediaCrop | undefined {
  if (item.kind === 'GIF') return undefined
  return cropFromView(item.width, item.height, format, item.view)
}

function VideoFrame({ uri }: { uri: string }) {
  // Prévia parada e sem som: só para enquadrar.
  const player = useVideoPlayer(uri, (instance) => { instance.muted = true })
  return <VideoView player={player} nativeControls={false} contentFit="fill" style={{ width: '100%', height: '100%' }} accessible={false} />
}

/**
 * O arquivo dentro da moldura, exatamente como vai ficar no feed: o original é posicionado para que a parte
 * recortada ocupe a moldura inteira. GIF aparece inteiro.
 */
export function CroppedPreview({ item, format }: { item: Pick<CropItem, 'uri' | 'kind' | 'width' | 'height' | 'view'>; format: MediaFormat }) {
  const crop = cropOf(item, format)
  const box = crop
    ? { position: 'absolute' as const, width: `${100 / crop.w}%` as const, height: `${100 / crop.h}%` as const, left: `${(-crop.x / crop.w) * 100}%` as const, top: `${(-crop.y / crop.h) * 100}%` as const }
    : { position: 'absolute' as const, width: '100%' as const, height: '100%' as const, left: 0, top: 0 }
  return <View style={box} pointerEvents="none">
    {item.kind === 'VIDEO' ? <VideoFrame uri={item.uri} /> : <Image source={item.uri} style={{ width: '100%', height: '100%' }} contentFit={crop ? 'fill' : 'contain'} accessible={false} />}
  </View>
}

const distance = (event: GestureResponderEvent) => {
  const [a, b] = event.nativeEvent.touches
  return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0
}

/**
 * Editor de formato e enquadramento: Quadrado, Retrato ou Paisagem (vale para todos os itens), arraste com um dedo
 * para enquadrar e use dois dedos (ou os botões + e −) para aproximar. A prévia é exatamente o que o servidor gera.
 */
export function MediaCropSheet({ visible, items, format, startIndex = 0, onFormatChange, onViewChange, onClose }: {
  visible: boolean
  items: CropItem[]
  format: MediaFormat
  startIndex?: number
  onFormatChange: (format: MediaFormat) => void
  onViewChange: (key: string, view: CropView) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(startIndex)
  const [frame, setFrame] = useState({ width: 0, height: 0 })
  // Início do gesto: vista e posição do dedo (ou distância entre os dois dedos) quando começou.
  const gesture = useRef<{ view: CropView; x: number; y: number; distance: number } | null>(null)

  const item = items[Math.min(selected, items.length - 1)]
  if (!item) return null
  const spec = MEDIA_FORMATS[format]
  const croppable = item.kind !== 'GIF'
  const maxZoom = croppable ? maxCropZoom(item.width, item.height, format) : 1
  const onLayout = (event: LayoutChangeEvent) => setFrame({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })

  /** Aplica a vista já ajustada (a moldura nunca sai da imagem). */
  const apply = (view: CropView) => {
    if (!croppable) return
    const zoom = Math.min(maxZoom, Math.max(1, view.zoom))
    const next = cropFromView(item.width, item.height, format, { ...view, zoom })
    onViewChange(item.key, { zoom, centerX: next.x + next.w / 2, centerY: next.y + next.h / 2 })
  }

  const begin = (event: GestureResponderEvent) => {
    gesture.current = { view: item.view, x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, distance: distance(event) }
  }
  const move = (event: GestureResponderEvent) => {
    const start = gesture.current
    if (!start || !frame.width) return
    if (event.nativeEvent.touches.length >= 2) {
      // Dois dedos: aproxima pela razão entre a distância atual e a do início.
      const now = distance(event)
      if (!start.distance) { gesture.current = { ...start, view: item.view, distance: now }; return }
      apply({ ...start.view, zoom: start.view.zoom * (now / start.distance) })
      return
    }
    // Um dedo: arrastar `dx` pixels move o centro em `dx × largura do recorte ÷ largura da moldura`.
    const crop = cropOf({ ...item, view: start.view }, format)
    if (!crop) return
    const dx = event.nativeEvent.pageX - start.x
    const dy = event.nativeEvent.pageY - start.y
    apply({ ...start.view, centerX: start.view.centerX - (dx / frame.width) * crop.w, centerY: start.view.centerY - (dy / frame.height) * crop.h })
  }
  const end = () => { gesture.current = null }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => setSelected(Math.min(startIndex, Math.max(0, items.length - 1)))}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.surface }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 4 }}>
        <IconButton label="Fechar editor" onPress={onClose}><X size={22} color={theme.colors.primary} /></IconButton>
        <Text accessibilityRole="header" style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: theme.colors.primary }}>Formato e enquadramento</Text>
        <View style={{ width: 44 }} />
      </View>

      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
        {MEDIA_FORMAT_ORDER.map((option) => {
          const optionSpec = MEDIA_FORMATS[option]
          const active = option === format
          return <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={`${optionSpec.label} ${optionSpec.ratioLabel}`} onPress={() => onFormatChange(option)} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: active ? theme.colors.action : theme.colors.border, backgroundColor: active ? theme.colors.tint : theme.colors.surface }}>
            <View style={{ height: 24, width: Math.round(24 * optionSpec.ratio), borderWidth: 2, borderColor: theme.colors.primary, borderRadius: 3 }} />
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.primary }}>{optionSpec.label}</Text>
            <Text style={{ fontFamily: theme.fonts.body, fontSize: 11, color: theme.colors.muted }}>{optionSpec.ratioLabel}</Text>
          </Pressable>
        })}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.soft, marginHorizontal: 16, borderRadius: 12, padding: 8 }}>
        <View
          onLayout={onLayout}
          onStartShouldSetResponder={() => croppable}
          onMoveShouldSetResponder={() => croppable}
          onResponderTerminationRequest={() => false}
          onResponderGrant={begin}
          onResponderMove={move}
          onResponderRelease={end}
          onResponderTerminate={end}
          accessible
          accessibilityLabel={croppable ? 'Área de enquadramento. Arraste com um dedo para mover; use dois dedos ou os botões para aproximar.' : 'GIF: aparece inteiro, sem recorte.'}
          style={{ width: spec.ratio >= 1 ? '100%' : undefined, height: spec.ratio < 1 ? '100%' : undefined, maxWidth: '100%', maxHeight: '100%', aspectRatio: spec.ratio, overflow: 'hidden', borderRadius: 6, backgroundColor: theme.colors.primary }}
        >
          <CroppedPreview item={item} format={format} />
        </View>
      </View>

      <Text style={{ color: theme.colors.muted, fontSize: 12, textAlign: 'center', paddingHorizontal: 24, paddingTop: 10 }}>
        {croppable ? 'Arraste para enquadrar. Todos os itens da publicação usam o mesmo formato.' : 'GIF aparece inteiro dentro da moldura, sem recorte.'}
      </Text>

      {croppable && <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, paddingTop: 6 }}>
        <IconButton label="Afastar" disabled={item.view.zoom <= 1.001} onPress={() => apply({ ...item.view, zoom: item.view.zoom / 1.2 })}><Minus size={20} color={theme.colors.primary} /></IconButton>
        <Text accessibilityLabel={`Aproximação ${Math.round(item.view.zoom * 100)} por cento`} style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted, minWidth: 48, textAlign: 'center' }}>{item.view.zoom.toFixed(1)}×</Text>
        <IconButton label="Aproximar" disabled={item.view.zoom >= maxZoom - 0.001} onPress={() => apply({ ...item.view, zoom: item.view.zoom * 1.2 })}><Plus size={20} color={theme.colors.primary} /></IconButton>
      </View>}

      {items.length > 1 && <ScrollView horizontal contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }} showsHorizontalScrollIndicator={false}>
        {items.map((entry, position) => <Pressable key={entry.key} accessibilityRole="tab" accessibilityState={{ selected: position === selected }} accessibilityLabel={`Item ${position + 1}${entry.kind === 'VIDEO' ? ', vídeo' : ''}`} onPress={() => setSelected(position)} style={{ width: 56, aspectRatio: spec.ratio, overflow: 'hidden', borderRadius: 6, borderWidth: 2, borderColor: position === selected ? theme.colors.action : 'transparent', backgroundColor: theme.colors.primary }}>
          <CroppedPreview item={entry} format={format} />
        </Pressable>)}
      </ScrollView>}

      <View style={{ padding: 16 }}><Button title="Concluir" onPress={onClose} /></View>
    </SafeAreaView>
  </Modal>
}
