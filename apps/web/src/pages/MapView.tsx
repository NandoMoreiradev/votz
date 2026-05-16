import { useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { Link } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Navbar } from '../components/layout/Navbar'
import { Category, ReportStatus } from '@votz/shared-types'
import { CATEGORY_CONFIG } from '../components/ui/Badge'

// ── Cores por categoria (mesmas do Badge) ──────────────────────────────────

const CATEGORY_COLORS: Record<Category, string> = {
  [Category.HEALTH]:     '#E63946',
  [Category.MOBILITY]:   '#3B82F6',
  [Category.SAFETY]:     '#F59E0B',
  [Category.EDUCATION]:  '#8B5CF6',
  [Category.SANITATION]: '#10B981',
  [Category.HOUSING]:    '#F97316',
  [Category.OTHER]:      '#6B7280',
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

const FilterBar = styled.div`
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: calc(100vw - 32px);
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

interface GeoJSON {
  type: 'FeatureCollection'
  features: MapFeature[]
}

function useMapReports(category?: Category, status?: ReportStatus) {
  return useQuery({
    queryKey: ['map-reports', category, status],
    queryFn: () =>
      api
        .get<GeoJSON>('/map/reports', {
          params: { ...(category && { category }), ...(status && { status }), limit: 500 },
        })
        .then((r) => r.data),
    staleTime: 60_000,
  })
}

// ── Componente ─────────────────────────────────────────────────────────────

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined

export function MapView() {
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<mapboxgl.Popup | null>(null)
  const popupContainerRef = useRef<HTMLDivElement | null>(null)

  const [categoryFilter, setCategoryFilter] = useState<Category | undefined>()
  const [statusFilter, setStatusFilter] = useState<ReportStatus | undefined>()

  const { data } = useMapReports(categoryFilter, statusFilter)

  // Inicializa o mapa
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [-47.9292, -15.7801], // Brasília
      zoom: 4,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right')
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right')

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Atualiza pins quando os dados mudam
  const updatePins = useCallback(() => {
    const map = mapRef.current
    if (!map || !data) return

    if (!map.isStyleLoaded()) {
      map.once('load', updatePins)
      return
    }

    // Remove camadas e source anteriores
    if (map.getLayer('reports-pins')) map.removeLayer('reports-pins')
    if (map.getLayer('reports-clusters')) map.removeLayer('reports-clusters')
    if (map.getLayer('reports-cluster-count')) map.removeLayer('reports-cluster-count')
    if (map.getSource('reports')) map.removeSource('reports')

    map.addSource('reports', {
      type: 'geojson',
      data: data as GeoJSON.FeatureCollection,
      cluster: true,
      clusterMaxZoom: 13,
      clusterRadius: 50,
    })

    // Clusters
    map.addLayer({
      id: 'reports-clusters',
      type: 'circle',
      source: 'reports',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#1A1A2E', 10, '#E63946', 30, '#9B0F18'],
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 30],
        'circle-opacity': 0.9,
      },
    })

    map.addLayer({
      id: 'reports-cluster-count',
      type: 'symbol',
      source: 'reports',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 13,
      },
      paint: { 'text-color': '#fff' },
    })

    // Pins individuais coloridos por categoria
    map.addLayer({
      id: 'reports-pins',
      type: 'circle',
      source: 'reports',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 9],
        'circle-color': [
          'match', ['get', 'category'],
          'HEALTH',     CATEGORY_COLORS[Category.HEALTH],
          'MOBILITY',   CATEGORY_COLORS[Category.MOBILITY],
          'SAFETY',     CATEGORY_COLORS[Category.SAFETY],
          'EDUCATION',  CATEGORY_COLORS[Category.EDUCATION],
          'SANITATION', CATEGORY_COLORS[Category.SANITATION],
          'HOUSING',    CATEGORY_COLORS[Category.HOUSING],
          CATEGORY_COLORS[Category.OTHER],
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-opacity': 0.92,
      },
    })

    // Clique em cluster → zoom
    map.on('click', 'reports-clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['reports-clusters'] })
      const clusterId = features[0]?.properties?.cluster_id
      if (!clusterId) return
      ;(map.getSource('reports') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || !zoom) return
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
        map.easeTo({ center: coords, zoom })
      })
    })

    // Clique em pin individual → popup
    map.on('click', 'reports-pins', (e) => {
      const feature = e.features?.[0]
      if (!feature) return

      const props = feature.properties as MapFeature['properties']
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number]

      const color = CATEGORY_COLORS[props.category]
      const categoryLabel = CATEGORY_CONFIG[props.category]?.label ?? props.category
      const statusLabel = STATUS_LABELS[props.status] ?? props.status

      const html = `
        <div style="min-width:220px;max-width:280px;font-family:'Inter',sans-serif">
          <p style="font-weight:600;font-size:0.9375rem;color:#0D0D0D;margin:0 0 8px;line-height:1.35">${props.title}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <span style="font-size:0.7rem;font-weight:600;padding:2px 7px;border-radius:99px;background:${color}22;color:${color};text-transform:uppercase;letter-spacing:0.04em">${categoryLabel}</span>
            <span style="font-size:0.7rem;font-weight:600;padding:2px 7px;border-radius:99px;background:#6B728022;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em">${statusLabel}</span>
          </div>
          <div style="display:flex;gap:12px;font-size:0.8125rem;color:#6B7280;font-family:'JetBrains Mono',monospace;margin-bottom:12px">
            <span>▲ ${props.votes}</span>
            <span>💬 ${props.comments}</span>
            <span style="margin-left:auto;font-style:normal">⚡ ${props.pressureScore}</span>
          </div>
          <a href="/relatos/${props.id}" style="display:block;text-align:center;padding:7px 0;border-radius:8px;background:#1A1A2E;color:#fff;font-size:0.875rem;font-weight:600;text-decoration:none">
            Ver relato →
          </a>
        </div>
      `

      if (popupRef.current) popupRef.current.remove()
      popupRef.current = new mapboxgl.Popup({ closeButton: true, maxWidth: '300px' })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map)
    })

    map.on('mouseenter', 'reports-pins', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'reports-pins', () => { map.getCanvas().style.cursor = '' })
    map.on('mouseenter', 'reports-clusters', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'reports-clusters', () => { map.getCanvas().style.cursor = '' })
  }, [data])

  useEffect(() => {
    updatePins()
  }, [updatePins])

  const categories = Object.values(Category)
  const featureCount = data?.features.length ?? 0

  return (
    <Page>
      <Navbar />
      <MapContainer>
        <MapEl ref={containerRef} />

        {!MAPBOX_TOKEN && (
          <TokenWarning>
            <WarningTitle>Token do Mapbox não configurado</WarningTitle>
            <p style={{ color: '#6B7280', fontSize: '0.9375rem' }}>
              Adicione ao arquivo <code>.env</code>:
            </p>
            <WarningCode>VITE_MAPBOX_TOKEN=pk.eyJ1Ij...</WarningCode>
          </TokenWarning>
        )}

        {MAPBOX_TOKEN && (
          <>
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
