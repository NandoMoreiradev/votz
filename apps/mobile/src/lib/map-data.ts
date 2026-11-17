import type { Category, ReportStatus } from '@votz/shared-types'

export type MapBounds = [west: number, south: number, east: number, north: number]
export interface MapReportFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: {
    id: string; title: string; category: Category; status: ReportStatus
    pressureScore: number; city: string | null; votes: number; comments: number; color?: string
  }
}
export interface MapReports { type: 'FeatureCollection'; features: MapReportFeature[] }

export const mapCategories: Record<Category, { label: string; color: string }> = {
  HEALTH: { label: 'Saúde', color: '#D97706' }, MOBILITY: { label: 'Mobilidade', color: '#2563EB' },
  SAFETY: { label: 'Segurança', color: '#DC2626' }, EDUCATION: { label: 'Educação', color: '#7C3AED' },
  SANITATION: { label: 'Saneamento', color: '#059669' }, HOUSING: { label: 'Moradia', color: '#EA580C' },
  ENVIRONMENT: { label: 'Meio ambiente', color: '#15803D' }, INFRASTRUCTURE: { label: 'Infraestrutura', color: '#78716C' },
  URBAN_SERVICES: { label: 'Serviços urbanos', color: '#0891B2' }, CORRUPTION: { label: 'Corrupção', color: '#9F1239' },
  ACCESSIBILITY: { label: 'Acessibilidade', color: '#7C3AED' }, SOCIAL_WELFARE: { label: 'Assistência social', color: '#BE185D' },
  OTHER: { label: 'Outro', color: '#6B7280' },
}

export function validMapReports(data: MapReports): MapReports {
  return { type: 'FeatureCollection', features: data.features.filter(({ geometry, properties }) => {
    const [lng, lat] = geometry.coordinates
    return !!properties.id && Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -85 && lat <= 85
  }).map((feature) => ({ ...feature, properties: { ...feature.properties, color: mapCategories[feature.properties.category]?.color ?? '#6B7280' } })) }
}

export function reportsBounds(features: MapReportFeature[]): MapBounds | null {
  if (!features.length) return null
  let west = 180, south = 90, east = -180, north = -90
  for (const { geometry: { coordinates: [lng, lat] } } of features) {
    west = Math.min(west, lng); south = Math.min(south, lat)
    east = Math.max(east, lng); north = Math.max(north, lat)
  }
  return [west - 0.005, south - 0.005, east + 0.005, north + 0.005]
}

export function mapReportsPath(category: string, status: string, bounds?: MapBounds) {
  const query = new URLSearchParams({ limit: '500' })
  if (category) query.set('category', category)
  if (status) query.set('status', status)
  if (bounds) {
    const [west, south, east, north] = bounds
    query.set('swLng', String(Math.max(-180, west)))
    query.set('swLat', String(Math.max(-85, south)))
    query.set('neLng', String(Math.min(180, east)))
    query.set('neLat', String(Math.min(85, north)))
  }
  return `/map/reports?${query.toString()}`
}
