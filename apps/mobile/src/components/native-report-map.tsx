import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Camera, GeoJSONSource, Layer, Map, type CameraRef, type GeoJSONSourceRef, type GeoJSONSourceProps, type MapProps } from '@maplibre/maplibre-react-native'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import * as Location from 'expo-location'
import LocateFixed from 'lucide-react-native/icons/locate-fixed'
import RefreshCw from 'lucide-react-native/icons/refresh-cw'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import X from 'lucide-react-native/icons/x'
import { ChoiceSheet } from './choice-sheet'
import { Button, IconButton, State } from './ui'
import { statusLabels } from './content-row'
import { api, errorMessage } from '../lib/api'
import { mapCategories, mapReportsPath, reportsBounds, validMapReports, type MapBounds, type MapReports } from '../lib/map-data'
import { theme } from '../theme'

const EMPTY: MapReports = { type: 'FeatureCollection', features: [] }
const mapStyle = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/positron'

export default function NativeReportMap() {
  const camera = useRef<CameraRef>(null)
  const source = useRef<GeoJSONSourceRef>(null)
  const viewport = useRef<MapBounds | undefined>(undefined)
  const fitted = useRef(false)
  const zoom = useRef(4)
  const [ready, setReady] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [mapVersion, setMapVersion] = useState(0)
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [sheet, setSheet] = useState<'category' | 'status' | null>(null)
  const [bounds, setBounds] = useState<MapBounds | undefined>(undefined)
  const [moved, setMoved] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [position, setPosition] = useState<[number, number] | null>(null)
  const query = useQuery({
    queryKey: ['map-reports', category, status, bounds],
    queryFn: async ({ signal }) => validMapReports(await api<MapReports>(mapReportsPath(category, status, bounds), { signal })),
    staleTime: 60_000,
  })
  const data = query.data ?? EMPTY
  const selected = data.features.find((feature) => feature.properties.id === selectedId)
  const selectedData = useMemo<MapReports>(() => ({ type: 'FeatureCollection', features: selected ? [selected] : [] }), [selected])
  useEffect(() => {
    if (!ready || !query.data || fitted.current) return
    const initial = reportsBounds(query.data.features)
    if (initial) camera.current?.fitBounds(initial, { padding: { top: 60, right: 40, bottom: 80, left: 40 }, duration: 500 })
    fitted.current = true
  }, [ready, query.data])

  const onRegionChange: NonNullable<MapProps['onRegionDidChange']> = (event) => {
    viewport.current = event.nativeEvent.bounds
    zoom.current = event.nativeEvent.zoom
    if (event.nativeEvent.userInteraction) setMoved(true)
  }
  const onMarkerPress: NonNullable<GeoJSONSourceProps['onPress']> = (event) => {
    event.stopPropagation()
    const feature = event.nativeEvent.features[0]
    if (!feature || feature.geometry.type !== 'Point') return
    const center: [number, number] = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]
    const properties = feature.properties
    if (properties?.cluster) {
      setSelectedId(null)
      void source.current?.getClusterExpansionZoom(Number(properties.cluster_id)).then((level) => {
        camera.current?.easeTo({ center, zoom: Math.min(level + 0.2, 18), duration: 350 })
      }).catch(() => camera.current?.easeTo({ center, zoom: Math.min(zoom.current + 2, 18), duration: 350 }))
    } else if (typeof properties?.id === 'string') {
      setSelectedId(properties.id)
      camera.current?.easeTo({ center, padding: { top: 30, right: 20, bottom: 180, left: 20 }, duration: 300 })
    }
  }
  async function locate() {
    setLocating(true)
    try {
      const permission = await Location.requestForegroundPermissionsAsync()
      if (permission.status !== 'granted') {
        Alert.alert('Localização não autorizada', 'Você pode continuar explorando o mapa com os dedos.')
        return
      }
      const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const center: [number, number] = [result.coords.longitude, result.coords.latitude]
      setPosition(center)
      setSelectedId(null)
      camera.current?.flyTo({ center, zoom: 14, padding: { top: 40, right: 20, bottom: 40, left: 20 }, duration: 700 })
      setMoved(true)
    } catch {
      Alert.alert('Não foi possível localizar', 'Verifique se a localização do celular está ligada e tente novamente.')
    } finally { setLocating(false) }
  }
  function searchArea() {
    setSelectedId(null)
    if (viewport.current) setBounds([...viewport.current])
    setMoved(false)
  }
  function retryMap() {
    setReady(false); setMapError(false); fitted.current = false; setMapVersion((version) => version + 1)
  }
  const choose = (setter: (value: string) => void) => (value: string) => { setter(value); setSelectedId(null) }
  const categoryLabel = category ? mapCategories[category as keyof typeof mapCategories].label : 'Categorias'

  return <View style={{ flex: 1 }}>
    <View style={s.filters}>
      <Pressable accessibilityRole="button" accessibilityLabel="Filtrar categoria" onPress={() => setSheet('category')} style={[s.chip, !!category && s.activeChip]}><Text style={s.chipText}>{categoryLabel}</Text><ChevronDown size={15} color={theme.colors.muted} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Filtrar status" onPress={() => setSheet('status')} style={[s.chip, !!status && s.activeChip]}><Text style={s.chipText}>{status ? statusLabels[status] : 'Status'}</Text><ChevronDown size={15} color={theme.colors.muted} /></Pressable>
      {(!!category || !!status || !!bounds) && <IconButton label="Limpar filtros do mapa" onPress={() => { setCategory(''); setStatus(''); setBounds(undefined); setSelectedId(null); fitted.current = false; setMoved(false) }}><X size={19} color={theme.colors.action} /></IconButton>}
    </View>
    <View style={{ flex: 1, backgroundColor: theme.colors.soft }}>
      <Map key={mapVersion} style={StyleSheet.absoluteFill} mapStyle={mapStyle} androidView="texture" attribution attributionPosition={{ bottom: 8, left: 8 }} logo={false}
        compass compassPosition={{ top: 12, left: 12 }} onDidFinishLoadingMap={() => setReady(true)} onDidFailLoadingMap={() => setMapError(true)}
        onRegionDidChange={onRegionChange} onPress={() => setSelectedId(null)} accessibilityLabel="Mapa de relatos da comunidade">
        <Camera ref={camera} initialViewState={{ center: [-51.9, -14.2], zoom: 3.5 }} minZoom={2} maxZoom={19} />
        <GeoJSONSource id="reports" ref={source} data={data} cluster clusterRadius={44} clusterMaxZoom={15} onPress={onMarkerPress}>
          <Layer id="report-clusters" type="circle" filter={['has', 'point_count']} paint={{ 'circle-color': theme.colors.primary, 'circle-radius': ['step', ['get', 'point_count'], 19, 20, 24, 100, 29], 'circle-stroke-width': 3, 'circle-stroke-color': '#FFFFFF' }} />
          <Layer id="report-cluster-count" type="symbol" filter={['has', 'point_count']} layout={{ 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true }} paint={{ 'text-color': '#FFFFFF' }} />
          <Layer id="report-points" type="circle" filter={['!', ['has', 'point_count']]} paint={{ 'circle-radius': 8, 'circle-color': ['coalesce', ['get', 'color'], theme.colors.action], 'circle-stroke-width': 2.5, 'circle-stroke-color': '#FFFFFF' }} />
        </GeoJSONSource>
        <GeoJSONSource id="selected-report" data={selectedData}>
          <Layer id="selected-report-ring" type="circle" paint={{ 'circle-radius': 14, 'circle-color': 'transparent', 'circle-stroke-width': 3, 'circle-stroke-color': theme.colors.primary }} />
        </GeoJSONSource>
        {position && <GeoJSONSource id="my-location" data={{ type: 'Feature', geometry: { type: 'Point', coordinates: position }, properties: {} }}><Layer id="my-location-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': '#2563EB', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 }} /></GeoJSONSource>}
      </Map>

      <View style={s.controls}>
        <View style={s.control}><IconButton label="Minha localização" disabled={locating || !ready} onPress={() => void locate()}>{locating ? <ActivityIndicator color={theme.colors.action} /> : <LocateFixed size={21} color={theme.colors.primary} />}</IconButton></View>
        <View style={s.control}><IconButton label="Atualizar relatos no mapa" disabled={query.isFetching} onPress={() => void query.refetch()}><RefreshCw size={20} color={theme.colors.primary} /></IconButton></View>
      </View>
      {ready && moved && <View style={s.search}><Button title="Buscar nesta área" loading={query.isFetching} onPress={searchArea} /></View>}
      {!ready && !mapError && <View pointerEvents="none" style={s.loading}><ActivityIndicator color={theme.colors.action} /><Text style={s.meta}>Carregando mapa…</Text></View>}
      {mapError && <View style={s.error}><State title="Não foi possível abrir o mapa" description="Confira sua conexão e tente novamente." retry={retryMap} /></View>}
      {!mapError && <View pointerEvents="box-none" style={s.bottom}>
        {query.isError ? <View style={s.summary}><Text style={s.meta}>{errorMessage(query.error)}</Text><Button secondary title="Tentar novamente" onPress={() => void query.refetch()} /></View>
          : selected ? <View style={s.summary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={[s.kicker, { color: mapCategories[selected.properties.category]?.color ?? theme.colors.action }]}>{mapCategories[selected.properties.category]?.label} · {statusLabels[selected.properties.status]}</Text><IconButton label="Fechar relato no mapa" onPress={() => setSelectedId(null)}><X size={18} color={theme.colors.muted} /></IconButton></View>
            <Text numberOfLines={2} style={s.title}>{selected.properties.title}</Text>
            <Text style={s.meta}>{[selected.properties.city, `${selected.properties.votes} apoios`, `${selected.properties.comments} comentários`].filter(Boolean).join(' · ')}</Text>
            <Button title="Ver relato" onPress={() => router.push({ pathname: '/report/[id]', params: { id: selected.properties.id } })} />
          </View> : <View style={s.summary}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{query.isFetching && <ActivityIndicator size="small" color={theme.colors.action} />}<Text style={s.title}>{query.isPending ? 'Buscando relatos…' : `${data.features.length} relatos no mapa`}</Text></View>
            <Text style={s.meta}>{data.features.length >= 500 ? 'Exibindo até 500 relatos. Aproxime o mapa e busque na área.' : data.features.length ? 'Toque em um marcador para ver o relato.' : 'Nenhum relato com localização neste recorte. Explore outra área ou limpe os filtros.'}</Text>
          </View>}
      </View>}
    </View>
    <ChoiceSheet visible={sheet === 'category'} title="Categoria" value={category} options={[{ value: '', label: 'Todas as categorias' }, ...Object.entries(mapCategories).map(([value, item]) => ({ value, label: item.label }))]} onChange={choose(setCategory)} onClose={() => setSheet(null)} />
    <ChoiceSheet visible={sheet === 'status'} title="Status do relato" value={status} options={[{ value: '', label: 'Todos os status' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} onChange={choose(setStatus)} onClose={() => setSheet(null)} />
  </View>
}

const s = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.surface, borderBottomWidth: 0.5, borderColor: theme.colors.border },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, minHeight: 36, borderRadius: 20, backgroundColor: theme.colors.soft, flexShrink: 1 },
  activeChip: { backgroundColor: '#FDECEE' }, chipText: { color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 12, flexShrink: 1 },
  controls: { position: 'absolute', top: 12, right: 12, gap: 8 }, control: { backgroundColor: theme.colors.surface, borderRadius: 22, elevation: 3 },
  search: { position: 'absolute', top: 12, alignSelf: 'center' },
  loading: { position: 'absolute', top: 16, alignSelf: 'center', backgroundColor: theme.colors.surface, padding: 10, borderRadius: 12, flexDirection: 'row', gap: 8, alignItems: 'center' },
  error: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center', backgroundColor: theme.colors.surface },
  bottom: { position: 'absolute', bottom: 36, left: 12, right: 12 },
  summary: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 14, gap: 8, borderWidth: 0.5, borderColor: theme.colors.border, elevation: 4 },
  title: { fontFamily: theme.fonts.heading, fontSize: 16, lineHeight: 22, color: theme.colors.primary },
  kicker: { fontFamily: theme.fonts.medium, fontSize: 11, flex: 1 },
  meta: { fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 18, color: theme.colors.muted },
})
