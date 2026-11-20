import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'

maplibregl.setWorkerUrl(workerUrl)
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Navbar } from '../components/layout/Navbar'
import { Category, ReportStatus } from '@votz/shared-types'
import { CATEGORY_CONFIG } from '../components/ui/Badge'

// ── Cores por categoria (mesmas do Badge) ──────────────────────────────────

const CATEGORY_COLORS: Record<Category, string> = {
  [Category.HEALTH]:         '#F59E0B',
  [Category.MOBILITY]:       '#3B82F6',
  [Category.SAFETY]:         '#EF4444',
  [Category.EDUCATION]:      '#8B5CF6',
  [Category.SANITATION]:     '#10B981',
  [Category.HOUSING]:        '#F97316',
  [Category.ENVIRONMENT]:    '#16A34A',
  [Category.INFRASTRUCTURE]: '#78716C',
  [Category.URBAN_SERVICES]: '#0891B2',
  [Category.CORRUPTION]:     '#9F1239',
  [Category.ACCESSIBILITY]:  '#7C3AED',
  [Category.SOCIAL_WELFARE]: '#DB2777',
  [Category.OTHER]:          '#6B7280',
}

const STATUS_LABELS: Record<ReportStatus, string> = {
  [ReportStatus.OPEN]:         'Aberto',
  [ReportStatus.UNDER_REVIEW]: 'Em análise',
  [ReportStatus.IN_PROGRESS]:  'Em andamento',
  [ReportStatus.RESOLVED]:     'Resolvido',
  [ReportStatus.DISPUTED]:     'Contestado',
  [ReportStatus.ARCHIVED]:     'Arquivado',
}

// ── Styled ─────────────────────────────────────────────────────────────────

const Page = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
`

const MapContainer = styled.div`
  flex: 1;
  position: relative;
`

const MapEl = styled.div`
  width: 100%;
  height: 100%;
`

// ── Filtros ────────────────────────────────────────────────────────────────

// Barra do topo: filtros à esquerda e alternador à direita, na mesma linha,
// para que um nunca fique por trás do outro.
const TopBar = styled.div`
  position: absolute;
  top: 16px;
  left: 16px;
  right: 56px; /* deixa livre o controle de créditos do mapa */
  z-index: 10;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  pointer-events: none;
  & > * { pointer-events: auto; }
  @media (max-width: 640px) { flex-direction: column; right: 16px; gap: 8px; }
`

const FilterBar = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const FilterChip = styled.button<{ $active: boolean; $color?: string }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radii.full};
  border: 1.5px solid ${({ $active, $color, theme }) =>
    $active ? ($color ?? theme.colors.primary) : theme.colors.border};
  background: ${({ $active, $color, theme }) =>
    $active ? ($color ?? theme.colors.primary) + '22' : theme.colors.white};
  color: ${({ $active, $color, theme }) =>
    $active ? ($color ?? theme.colors.primary) : theme.colors.text};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  cursor: pointer;
  box-shadow: ${({ theme }) => theme.shadows.sm};
  transition: all 0.15s;
  white-space: nowrap;

  &:hover {
    border-color: ${({ $color, theme }) => $color ?? theme.colors.primary};
  }
`

// ── Popup ─────────────────────────────────────────────────────────────────

const PopupCard = styled.div`
  min-width: 220px;
  max-width: 280px;
`

const PopupTitle = styled.p`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: 0.9375rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
  line-height: 1.35;
`

const PopupMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
`

const PopupBadge = styled.span<{ $color: string }>`
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background: ${({ $color }) => $color + '22'};
  color: ${({ $color }) => $color};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const PopupStats = styled.div`
  display: flex;
  gap: 12px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  margin-bottom: 12px;
`

const PopupLink = styled(Link)`
  display: block;
  text-align: center;
  padding: 7px 0;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  transition: opacity 0.15s;
  &:hover { opacity: 0.88; }
`

// ── Token ausente ──────────────────────────────────────────────────────────

const TokenWarning = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: ${({ theme }) => theme.colors.neutral};
  z-index: 20;
`

const WarningTitle = styled.h2`
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.xl};
  font-weight: ${({ theme }) => theme.fontWeights.bold};
  color: ${({ theme }) => theme.colors.text};
`

const WarningCode = styled.code`
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 0.875rem;
  background: ${({ theme }) => theme.colors.border};
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text};
`

// ── Contador ───────────────────────────────────────────────────────────────

const ReportCount = styled.div`
  position: absolute;
  bottom: 36px;
  left: 16px;
  z-index: 10;
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 6px 14px;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.muted};
  font-family: ${({ theme }) => theme.fonts.mono};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

// ── Toggle mapa ────────────────────────────────────────────────────────────

const ViewToggle = styled.div`
  flex-shrink: 0;
  display: flex;
  border-radius: ${({ theme }) => theme.radii.full};
  overflow: hidden;
  border: 1.5px solid ${({ theme }) => theme.colors.border};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`

const ToggleBtn = styled.button<{ $active: boolean }>`
  padding: 6px 14px;
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.fontWeights.medium};
  border: none;
  cursor: pointer;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.white)};
  color: ${({ $active }) => ($active ? '#fff' : '#6B7280')};
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
`

// ── Hook de dados ──────────────────────────────────────────────────────────

interface MapFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string
    title: string
    category: Category
    status: ReportStatus
    pressureScore: number
    city: string | null
    votes: number
    comments: number
  }
}

interface MapGeoJSON {
  type: 'FeatureCollection'
  features: MapFeature[]
}

function useMapReports(category?: Category, status?: ReportStatus) {
  return useQuery({
    queryKey: ['map-reports', category, status],
    queryFn: () =>
      api
        .get<MapGeoJSON>('/map/reports', {
          params: { ...(category && { category }), ...(status && { status }), limit: 500 },
        })
        .then((r) => r.data),
    staleTime: 60_000,
  })
}

// ── Componente ─────────────────────────────────────────────────────────────

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

function buildReportPopupNode(params: {
  id: string
  title: string
  categoryLabel: string
  statusLabel: string
  color: string
  votes: number
  comments: number
  pressureScore: number
}): HTMLDivElement {
  const container = document.createElement('div')
  container.style.minWidth = '220px'
  container.style.maxWidth = '280px'
  container.style.fontFamily = "'Inter',sans-serif"

  const titleEl = document.createElement('p')
  titleEl.style.fontWeight = '600'
  titleEl.style.fontSize = '0.9375rem'
  titleEl.style.color = '#0D0D0D'
  titleEl.style.margin = '0 0 8px'
  titleEl.style.lineHeight = '1.35'
  titleEl.textContent = params.title
  container.appendChild(titleEl)

  const badges = document.createElement('div')
  badges.style.display = 'flex'
  badges.style.gap = '6px'
  badges.style.flexWrap = 'wrap'
  badges.style.marginBottom = '10px'

  const catBadge = document.createElement('span')
  catBadge.style.fontSize = '0.7rem'
  catBadge.style.fontWeight = '600'
  catBadge.style.padding = '2px 7px'
  catBadge.style.borderRadius = '99px'
  catBadge.style.background = `${params.color}22`
  catBadge.style.color = params.color
  catBadge.style.textTransform = 'uppercase'
  catBadge.style.letterSpacing = '0.04em'
  catBadge.textContent = params.categoryLabel
  badges.appendChild(catBadge)

  const statusBadge = document.createElement('span')
  statusBadge.style.fontSize = '0.7rem'
  statusBadge.style.fontWeight = '600'
  statusBadge.style.padding = '2px 7px'
  statusBadge.style.borderRadius = '99px'
  statusBadge.style.background = '#6B728022'
  statusBadge.style.color = '#6B7280'
  statusBadge.style.textTransform = 'uppercase'
  statusBadge.style.letterSpacing = '0.04em'
  statusBadge.textContent = params.statusLabel
  badges.appendChild(statusBadge)

  container.appendChild(badges)

  const stats = document.createElement('div')
  stats.style.display = 'flex'
  stats.style.gap = '12px'
  stats.style.fontSize = '0.8125rem'
  stats.style.color = '#6B7280'
  stats.style.fontFamily = "'JetBrains Mono',monospace"
  stats.style.marginBottom = '12px'

  const votesEl = document.createElement('span')
  votesEl.textContent = `▲ ${params.votes}`
  stats.appendChild(votesEl)

  const commentsEl = document.createElement('span')
  commentsEl.textContent = `💬 ${params.comments}`
  stats.appendChild(commentsEl)

  const pressureEl = document.createElement('span')
  pressureEl.style.marginLeft = 'auto'
  pressureEl.style.fontStyle = 'normal'
  pressureEl.textContent = `⚡ ${params.pressureScore}`
  stats.appendChild(pressureEl)

  container.appendChild(stats)

  const link = document.createElement('a')
  link.href = `/relatos/${encodeURIComponent(String(params.id ?? ''))}`
  link.style.display = 'block'
  link.style.textAlign = 'center'
  link.style.padding = '7px 0'
  link.style.borderRadius = '8px'
  link.style.background = '#1A1A2E'
  link.style.color = '#fff'
  link.style.fontSize = '0.875rem'
  link.style.fontWeight = '600'
  link.style.textDecoration = 'none'
  link.textContent = 'Ver relato →'
  container.appendChild(link)

  return container
}

type ViewMode = 'clusters' | 'heatmap'

const CLUSTER_LAYERS = ['reports-clusters', 'reports-cluster-count', 'reports-pins'] as const
const HEAT_LAYERS = ['reports-heatmap'] as const

export function MapView() {
  const mapRef = useRef<maplibregl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)

  const [categoryFilter, setCategoryFilter] = useState<Category | undefined>()
  const [statusFilter, setStatusFilter] = useState<ReportStatus | undefined>()
  const [viewMode, setViewMode] = useState<ViewMode>('clusters')
  const viewModeRef = useRef<ViewMode>('clusters')

  const { data } = useMapReports(categoryFilter, statusFilter)

  // Inicializa o mapa
  useEffect(() => {
    if (!MAPTILER_KEY || !containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/positron/style.json?key=${MAPTILER_KEY}`,
      center: [-47.9292, -15.7801], // Brasília
      zoom: 4,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right')

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Atualiza camadas quando dados mudam
  const updateLayers = useCallback(() => {
    const map = mapRef.current
    if (!map || !data) return

    if (!map.isStyleLoaded()) {
      map.once('load', updateLayers)
      return
    }

    // Remove camadas e sources anteriores
    for (const id of [...CLUSTER_LAYERS, ...HEAT_LAYERS]) {
      if (map.getLayer(id)) map.removeLayer(id)
    }
    if (map.getSource('reports-cl')) map.removeSource('reports-cl')
    if (map.getSource('reports-raw')) map.removeSource('reports-raw')

    const geoData = data as unknown as Parameters<maplibregl.GeoJSONSource['setData']>[0]

    // Source para clusters
    map.addSource('reports-cl', {
      type: 'geojson',
      data: geoData,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 50,
    })

    // Source para heatmap (sem clustering)
    map.addSource('reports-raw', {
      type: 'geojson',
      data: geoData,
    })

    const clusterVis = viewModeRef.current === 'clusters' ? 'visible' : 'none'
    const heatVis = viewModeRef.current === 'heatmap' ? 'visible' : 'none'

    // Camadas de cluster
    map.addLayer({
      id: 'reports-clusters',
      type: 'circle',
      source: 'reports-cl',
      filter: ['has', 'point_count'],
      layout: { visibility: clusterVis },
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#1A1A2E', 10, '#E63946', 30, '#9B0F18'],
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
        'circle-opacity': 0.9,
      },
    })

    map.addLayer({
      id: 'reports-cluster-count',
      type: 'symbol',
      source: 'reports-cl',
      filter: ['has', 'point_count'],
      layout: {
        visibility: clusterVis,
        'text-field': '{point_count_abbreviated}',
        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': '#fff' },
    })

    map.addLayer({
      id: 'reports-pins',
      type: 'circle',
      source: 'reports-cl',
      filter: ['!', ['has', 'point_count']],
      layout: { visibility: clusterVis },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9],
        'circle-color': [
          'match', ['get', 'category'],
          'HEALTH',         CATEGORY_COLORS[Category.HEALTH],
          'MOBILITY',       CATEGORY_COLORS[Category.MOBILITY],
          'SAFETY',         CATEGORY_COLORS[Category.SAFETY],
          'EDUCATION',      CATEGORY_COLORS[Category.EDUCATION],
          'SANITATION',     CATEGORY_COLORS[Category.SANITATION],
          'HOUSING',        CATEGORY_COLORS[Category.HOUSING],
          'ENVIRONMENT',    CATEGORY_COLORS[Category.ENVIRONMENT],
          'INFRASTRUCTURE', CATEGORY_COLORS[Category.INFRASTRUCTURE],
          'URBAN_SERVICES', CATEGORY_COLORS[Category.URBAN_SERVICES],
          'CORRUPTION',     CATEGORY_COLORS[Category.CORRUPTION],
          'ACCESSIBILITY',  CATEGORY_COLORS[Category.ACCESSIBILITY],
          'SOCIAL_WELFARE', CATEGORY_COLORS[Category.SOCIAL_WELFARE],
          CATEGORY_COLORS[Category.OTHER],
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.92,
      },
    })

    // Camada heatmap
    map.addLayer({
      id: 'reports-heatmap',
      type: 'heatmap',
      source: 'reports-raw',
      layout: { visibility: heatVis },
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'pressureScore'], 0, 0, 200, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(33,102,172,0)',
          0.2, '#67a9cf',
          0.4, '#f7f7f7',
          0.6, '#fdbf6f',
          0.8, '#E63946',
          1,   '#9B0F18',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 16, 9, 32],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 9, 0.85],
      },
    })

    // Interações de cluster
    map.on('click', 'reports-clusters', (e: maplibregl.MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['reports-clusters'] })
      const clusterId = features[0]?.properties?.cluster_id as number | undefined
      if (!clusterId) return
      const coords = (features[0].geometry as { coordinates: [number, number] }).coordinates
      ;(map.getSource('reports-cl') as maplibregl.GeoJSONSource)
        .getClusterExpansionZoom(clusterId)
        .then((zoom: number) => map.easeTo({ center: coords, zoom }))
        .catch(() => {})
    })

    map.on('click', 'reports-pins', (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature) return

      const props = feature.properties as MapFeature['properties']
      const coords = (feature.geometry as { coordinates: [number, number] }).coordinates

      const color = CATEGORY_COLORS[props.category] ?? '#6B7280'
      const categoryLabel = CATEGORY_CONFIG[props.category]?.label ?? props.category
      const statusLabel = STATUS_LABELS[props.status] ?? props.status

      const popupNode = buildReportPopupNode({
        id: props.id,
        title: props.title,
        categoryLabel,
        statusLabel,
        color,
        votes: props.votes,
        comments: props.comments,
        pressureScore: props.pressureScore,
      })

      if (popupRef.current) popupRef.current.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(coords)
        .setDOMContent(popupNode)
        .addTo(map)
    })

    map.on('mouseenter', 'reports-pins', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'reports-pins', () => { map.getCanvas().style.cursor = '' })
    map.on('mouseenter', 'reports-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'reports-clusters', () => { map.getCanvas().style.cursor = '' })
  }, [data])

  useEffect(() => {
    updateLayers()
  }, [updateLayers])

  // Alterna visibilidade das camadas quando viewMode muda
  useEffect(() => {
    viewModeRef.current = viewMode
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    const clusterVis = viewMode === 'clusters' ? 'visible' : 'none'
    const heatVis = viewMode === 'heatmap' ? 'visible' : 'none'

    for (const id of CLUSTER_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', clusterVis)
    }
    for (const id of HEAT_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', heatVis)
    }

    if (viewMode !== 'clusters' && popupRef.current) {
      popupRef.current.remove()
      popupRef.current = null
    }
  }, [viewMode])

  const categories = Object.values(Category)
  const featureCount = data?.features.length ?? 0

  return (
    <Page>
      <Navbar />
      <MapContainer>
        <MapEl ref={containerRef} />

        {!MAPTILER_KEY && (
          <TokenWarning>
            <WarningTitle>Chave do Maptiler não configurada</WarningTitle>
            <p style={{ color: '#6B7280', fontSize: '0.9375rem' }}>
              Adicione ao arquivo <code>.env</code>:
            </p>
            <WarningCode>VITE_MAPTILER_KEY=sua_chave_aqui</WarningCode>
          </TokenWarning>
        )}

        {MAPTILER_KEY && (
          <>
            <TopBar>
            <FilterBar>
              {categories.map((cat) => {
                const cfg = CATEGORY_CONFIG[cat]
                return (
                  <FilterChip
                    key={cat}
                    $active={categoryFilter === cat}
                    $color={cfg?.color}
                    onClick={() => setCategoryFilter((c) => (c === cat ? undefined : cat))}
                  >
                    {cfg?.label ?? cat}
                  </FilterChip>
                )
              })}
            </FilterBar>

            <ViewToggle>
              <ToggleBtn $active={viewMode === 'clusters'} onClick={() => setViewMode('clusters')}>
                Clusters
              </ToggleBtn>
              <ToggleBtn $active={viewMode === 'heatmap'} onClick={() => setViewMode('heatmap')}>
                Heatmap
              </ToggleBtn>
            </ViewToggle>
            </TopBar>

            {featureCount > 0 && (
              <ReportCount>
                {featureCount} relato{featureCount !== 1 ? 's' : ''} no mapa
              </ReportCount>
            )}
          </>
        )}
      </MapContainer>
    </Page>
  )
}
