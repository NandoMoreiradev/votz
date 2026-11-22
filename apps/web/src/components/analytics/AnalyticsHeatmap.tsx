import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import styled, { useTheme } from 'styled-components'
import { formatCountPtBr, formatDecimalPtBr } from '@votz/shared-types'
import { AnalyticsHeatmapResponse } from '../../hooks/useAnalytics'
import { MetricInfoModal } from './MetricInfoModal'

maplibregl.setWorkerUrl(workerUrl)

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: 18px 20px;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing[3]};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing[3]};
`

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
`

const Title = styled.h3`
  margin: 0;
  font-family: ${({ theme }) => theme.fonts.heading};
  font-size: ${({ theme }) => theme.fontSizes.md};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.primary};
`

const Subtitle = styled.p`
  margin: 2px 0 0;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const SuppressionNotice = styled.div`
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 8px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  font-family: ${({ theme }) => theme.fonts.mono};
`

const MapContainer = styled.div`
  width: 100%;
  height: clamp(380px, 62vh, 600px);
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.neutral};
  position: relative;
`

const FallbackBox = styled.div`
  padding: ${({ theme }) => theme.spacing[8]};
  text-align: center;
  border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.fontSizes.sm};
`

const TableToggle = styled.button`
  margin-top: ${({ theme }) => theme.spacing[3]};
  background: ${({ theme }) => theme.colors.neutral};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: 5px 12px;
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
`

const CellsTable = styled.table`
  width: 100%;
  margin-top: ${({ theme }) => theme.spacing[3]};
  border-collapse: collapse;
  font-size: ${({ theme }) => theme.fontSizes.xs};

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
    text-align: left;
  }

  td.num {
    font-family: ${({ theme }) => theme.fonts.mono};
    text-align: right;
  }
`

const LegendBar = styled.div`
  margin-top: ${({ theme }) => theme.spacing[3]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing[3]};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  color: ${({ theme }) => theme.colors.muted};
`

const LegendScale = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing[2]};
`

const ScaleGradient = styled.span`
  display: inline-block;
  width: 96px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radii.full};
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.colors.primary}40 0%,
    ${({ theme }) => theme.colors.action}c0 100%
  );
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const ModeToggleRow = styled.div`
  display: inline-flex;
  gap: 4px;
  background: ${({ theme }) => theme.colors.neutral};
  padding: 3px;
  border-radius: ${({ theme }) => theme.radii.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const ModeBtn = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radii.sm};
  border: none;
  background: ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.colors.white : theme.colors.text)};
  font-size: ${({ theme }) => theme.fontSizes.xs};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
`

interface AnalyticsHeatmapProps {
  data: AnalyticsHeatmapResponse
}

export function AnalyticsHeatmap({ data }: AnalyticsHeatmapProps) {
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [showTable, setShowTable] = useState(false)

  const hasCoarse = (data.coarseCells?.length ?? 0) > 0
  const preferredMode: 'detail' | 'coarse' =
    data.recommendedMode ?? (data.cells.length < 5 && hasCoarse ? 'coarse' : 'detail')
  const [viewMode, setViewMode] = useState<'detail' | 'coarse'>(preferredMode)

  useEffect(() => {
    setViewMode(preferredMode)
  }, [data.computedAt, preferredMode])

  const isCoarse = viewMode === 'coarse' && hasCoarse
  const activeCells = isCoarse ? (data.coarseCells ?? []) : data.cells
  const activeSuppressed = isCoarse ? (data.coarseSuppressedCells ?? 0) : data.suppressedCells
  const hasVisibleCells = activeCells.length > 0

  useEffect(() => {
    if (!MAPTILER_KEY || !hasVisibleCells || !containerRef.current || mapRef.current) return

    const firstCell = activeCells[0]
    const initialCenter: [number, number] = firstCell
      ? [firstCell.bounds.centerLng, firstCell.bounds.centerLat]
      : [-47.9292, -15.7801]

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/positron/style.json?key=${MAPTILER_KEY}`,
      center: initialCenter,
      zoom: firstCell ? 12 : 4,
      attributionControl: false,
    })

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right')
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')

    map.on('click', 'analytics-cells-fill', (e: maplibregl.MapLayerMouseEvent) => {
      const feature = e.features?.[0]
      if (!feature?.properties) return
      const props = feature.properties as Record<string, string | number>

      const wrapper = document.createElement('div')
      wrapper.style.fontFamily = theme.fonts.body
      wrapper.style.fontSize = '12px'

      const heading = document.createElement('strong')
      heading.textContent = String(props.areaHeader ?? 'Célula agregada')
      wrapper.appendChild(heading)

      const lines = [
        props.cityDisplay ? `Cidade: ${String(props.cityDisplay)}` : null,
        `Relatos: ${formatCountPtBr(Number(props.count ?? 0))}`,
        `Em aberto: ${formatCountPtBr(Number(props.openCount ?? 0))}`,
        `Resolvidos: ${formatCountPtBr(Number(props.resolvedCount ?? 0))}`,
        `Pressão média: ${formatDecimalPtBr(Number(props.avgPressure ?? 0), 1)}`,
      ].filter((l): l is string => l !== null)

      for (const text of lines) {
        const p = document.createElement('div')
        p.textContent = text
        wrapper.appendChild(p)
      }

      popupRef.current?.remove()
      popupRef.current = new maplibregl.Popup({ closeButton: true })
        .setLngLat(e.lngLat)
        .setDOMContent(wrapper)
        .addTo(map)
    })

    mapRef.current = map

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [hasVisibleCells, theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyGeoJson = () => {
      popupRef.current?.remove()
      if (map.getLayer('analytics-cells-fill')) map.removeLayer('analytics-cells-fill')
      if (map.getLayer('analytics-cells-line')) map.removeLayer('analytics-cells-line')
      if (map.getSource('analytics-cells')) map.removeSource('analytics-cells')

      const geojson = {
        type: 'FeatureCollection' as const,
        features: activeCells.map((cell) => ({
          type: 'Feature' as const,
          properties: {
            areaHeader: isCoarse ? 'Área ampla (~1,2 km)' : 'Área de detalhe (~150 m)',
            cellCode: cell.cell6 ?? cell.cell7 ?? '',
            cityDisplay: cell.cityDisplay,
            count: cell.count,
            openCount: cell.openCount,
            resolvedCount: cell.resolvedCount,
            avgPressure: cell.avgPressure,
            intensity: cell.intensity,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [cell.bounds.minLng, cell.bounds.minLat],
                [cell.bounds.maxLng, cell.bounds.minLat],
                [cell.bounds.maxLng, cell.bounds.maxLat],
                [cell.bounds.minLng, cell.bounds.maxLat],
                [cell.bounds.minLng, cell.bounds.minLat],
              ],
            ],
          },
        })),
      }

      map.addSource('analytics-cells', {
        type: 'geojson',
        data: geojson,
      })

      map.addLayer({
        id: 'analytics-cells-fill',
        type: 'fill',
        source: 'analytics-cells',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'intensity'],
            0,
            theme.colors.primary,
            0.5,
            theme.colors.action,
            1,
            theme.colors.action,
          ],
          'fill-opacity': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0.25, 1, 0.72],
        },
      })

      map.addLayer({
        id: 'analytics-cells-line',
        type: 'line',
        source: 'analytics-cells',
        paint: {
          'line-color': theme.colors.primary,
          'line-width': 1,
          'line-opacity': 0.5,
        },
      })

      if (activeCells.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const cell of activeCells) {
          bounds.extend([cell.bounds.minLng, cell.bounds.minLat])
          bounds.extend([cell.bounds.maxLng, cell.bounds.maxLat])
        }
        map.fitBounds(bounds, {
          padding: 40,
          maxZoom: isCoarse ? 13 : 14,
          duration: 300,
        })
      }
    }

    if (map.isStyleLoaded()) {
      applyGeoJson()
    } else {
      map.once('load', applyGeoJson)
    }
  }, [activeCells, isCoarse, theme])

  return (
    <Card>
      <Header>
        <div>
          <TitleRow>
            <Title>
              {isCoarse
                ? 'Mapa de calor — visão ampla geohash-6 (~1,2 km)'
                : 'Mapa de calor por células geohash-7 (~150 m)'}
            </Title>
            <MetricInfoModal metricKey="reincidence" />
          </TitleRow>
          <Subtitle>
            O que isso mostra: concentração geográfica agregada (mínimo {data.minCellSize} relatos por célula) sem expor coordenadas individuais ou autores.
          </Subtitle>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {hasCoarse && (
            <ModeToggleRow role="group" aria-label="Resolução do mapa de calor">
              <ModeBtn
                type="button"
                $active={!isCoarse}
                onClick={() => setViewMode('detail')}
              >
                Detalhe (150 m)
              </ModeBtn>
              <ModeBtn
                type="button"
                $active={isCoarse}
                onClick={() => setViewMode('coarse')}
              >
                Visão ampla (1,2 km)
              </ModeBtn>
            </ModeToggleRow>
          )}
          <SuppressionNotice>
            Suprimidas (&lt; {data.minCellSize}): {activeSuppressed} célula(s) · Visíveis: {activeCells.length}
          </SuppressionNotice>
        </div>
      </Header>

      {!hasVisibleCells ? (
        <FallbackBox>
          Poucos relatos para mostrar com segurança neste recorte (mínimo de {data.minCellSize} relatos por célula).
        </FallbackBox>
      ) : !MAPTILER_KEY ? (
        <FallbackBox>
          Chave MapTiler não configurada neste ambiente (`VITE_MAPTILER_KEY`). Use a tabela acessível abaixo para consultar as células visíveis.
        </FallbackBox>
      ) : (
        <MapContainer ref={containerRef} aria-label="Mapa de calor por células geográficas" />
      )}

      {hasVisibleCells && (
        <LegendBar>
          <LegendScale>
            <span>Menor concentração</span>
            <ScaleGradient aria-hidden="true" />
            <span>Maior concentração</span>
          </LegendScale>
          <span>Clique em uma célula no mapa para ver a contagem agregada.</span>
        </LegendBar>
      )}

      {hasVisibleCells && (
        <>
          <TableToggle type="button" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ocultar tabela de células' : 'Ver tabela de células'}
          </TableToggle>
          {showTable && (
            <CellsTable>
              <thead>
                <tr>
                  <th>{isCoarse ? 'Célula (geohash-6 · ~1,2 km)' : 'Célula (geohash-7 · ~150 m)'}</th>
                  <th>Município</th>
                  <th style={{ textAlign: 'right' }}>Relatos</th>
                  <th style={{ textAlign: 'right' }}>Em aberto</th>
                  <th style={{ textAlign: 'right' }}>Pressão média</th>
                </tr>
              </thead>
              <tbody>
                {activeCells.slice(0, 50).map((cell) => {
                  const code = cell.cell6 ?? cell.cell7 ?? ''
                  return (
                    <tr key={code}>
                      <td style={{ fontFamily: theme.fonts.mono }}>{code}</td>
                      <td>{cell.cityDisplay || '-'}</td>
                      <td className="num">{formatCountPtBr(cell.count)}</td>
                      <td className="num">{formatCountPtBr(cell.openCount)}</td>
                      <td className="num">{formatDecimalPtBr(cell.avgPressure, 1)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </CellsTable>
          )}
        </>
      )}
    </Card>
  )
}
