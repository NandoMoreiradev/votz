import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import styled, { useTheme } from 'styled-components'
import { AnalyticsHeatmapResponse } from '../../hooks/useAnalytics'
import { MetricInfoModal } from './MetricInfoModal'

maplibregl.setWorkerUrl(workerUrl)

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

const Card = styled.section`
  background: ${({ theme }) => theme.colors.white};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing[5]};
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
  height: 440px;
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

interface AnalyticsHeatmapProps {
  data: AnalyticsHeatmapResponse
}

export function AnalyticsHeatmap({ data }: AnalyticsHeatmapProps) {
  const theme = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    if (!MAPTILER_KEY || !containerRef.current || mapRef.current) return

    const firstCell = data.cells[0]
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
    mapRef.current = map

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const applyGeoJson = () => {
      if (map.getLayer('analytics-cells-fill')) map.removeLayer('analytics-cells-fill')
      if (map.getLayer('analytics-cells-line')) map.removeLayer('analytics-cells-line')
      if (map.getSource('analytics-cells')) map.removeSource('analytics-cells')

      const geojson = {
        type: 'FeatureCollection' as const,
        features: data.cells.map((cell) => ({
          type: 'Feature' as const,
          properties: {
            cell7: cell.cell7,
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

      map.on('click', 'analytics-cells-fill', (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (!feature?.properties) return
        const props = feature.properties as Record<string, string | number>

        const wrapper = document.createElement('div')
        wrapper.style.fontFamily = theme.fonts.body
        wrapper.style.fontSize = '12px'

        const heading = document.createElement('strong')
        heading.textContent = `Célula ${String(props.cell7 ?? '')}`
        wrapper.appendChild(heading)

        const lines = [
          props.cityDisplay ? `Cidade: ${String(props.cityDisplay)}` : null,
          `Relatos: ${String(props.count ?? 0)}`,
          `Em aberto: ${String(props.openCount ?? 0)}`,
          `Resolvidos: ${String(props.resolvedCount ?? 0)}`,
          `Pressão média: ${String(props.avgPressure ?? 0)}`,
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

      if (data.cells.length > 0) {
        const bounds = new maplibregl.LngLatBounds()
        for (const cell of data.cells) {
          bounds.extend([cell.bounds.minLng, cell.bounds.minLat])
          bounds.extend([cell.bounds.maxLng, cell.bounds.maxLat])
        }
        map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 300 })
      }
    }

    if (map.isStyleLoaded()) {
      applyGeoJson()
    } else {
      map.once('load', applyGeoJson)
    }
  }, [data.cells, theme])

  return (
    <Card>
      <Header>
        <div>
          <TitleRow>
            <Title>Mapa de calor por células geohash-7 (~150 m)</Title>
            <MetricInfoModal metricKey="reincidence" />
          </TitleRow>
          <Subtitle>
            O que isso mostra: concentração geográfica agregada sem expor coordenadas individuais ou autores.
          </Subtitle>
        </div>
        <SuppressionNotice>
          Suprimidas (&lt; {data.minCellSize}): {data.suppressedCells} célula(s) · Visíveis: {data.cells.length}
        </SuppressionNotice>
      </Header>

      {data.cells.length === 0 ? (
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

      {data.cells.length > 0 && (
        <>
          <TableToggle type="button" onClick={() => setShowTable((v) => !v)}>
            {showTable ? 'Ocultar tabela de células' : 'Ver tabela de células'}
          </TableToggle>
          {showTable && (
            <CellsTable>
              <thead>
                <tr>
                  <th>Célula (geohash-7)</th>
                  <th>Município</th>
                  <th style={{ textAlign: 'right' }}>Relatos</th>
                  <th style={{ textAlign: 'right' }}>Em aberto</th>
                  <th style={{ textAlign: 'right' }}>Pressão média</th>
                </tr>
              </thead>
              <tbody>
                {data.cells.slice(0, 50).map((cell) => (
                  <tr key={cell.cell7}>
                    <td style={{ fontFamily: theme.fonts.mono }}>{cell.cell7}</td>
                    <td>{cell.cityDisplay || '-'}</td>
                    <td className="num">{cell.count}</td>
                    <td className="num">{cell.openCount}</td>
                    <td className="num">{cell.avgPressure}</td>
                  </tr>
                ))}
              </tbody>
            </CellsTable>
          )}
        </>
      )}
    </Card>
  )
}
