import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapReportsPath, reportsBounds, validMapReports } from '../src/lib/map-data.ts'

const feature = (coordinates, id = 'report-1') => ({
  type: 'Feature', geometry: { type: 'Point', coordinates },
  properties: { id, title: 'Relato QA', category: 'HEALTH', status: 'OPEN', city: null, pressureScore: 0, votes: 0, comments: 0 },
})

test('preserva coordenadas zero e remove pontos inválidos sem fabricar localização', () => {
  const result = validMapReports({ type: 'FeatureCollection', features: [
    feature([0, 0]), feature([-46.6, -23.5]), feature([NaN, 12]), feature([10, 90]), feature([181, 10]), feature(['0', 0]),
  ] })
  assert.equal(result.features.length, 2)
  assert.deepEqual(result.features[0].geometry.coordinates, [0, 0])
  assert.ok(result.features[0].properties.color)
})

test('enquadra relatos em longitude/latitude e trata resultado vazio', () => {
  assert.equal(reportsBounds([]), null)
  assert.deepEqual(reportsBounds([feature([-46, -23]), feature([-37, -11])]), [-46.005, -23.005, -36.995, -10.995])
  const single = reportsBounds([feature([0, 0])])
  assert.ok(single[0] < single[2] && single[1] < single[3])
})

test('consulta o mesmo endpoint público do web com filtros e viewport limitados', () => {
  const [path, search] = mapReportsPath('HEALTH', 'OPEN', [-46.7, -23.7, -46.5, -23.4]).split('?')
  const params = new URLSearchParams(search)
  assert.equal(path, '/map/reports')
  assert.equal(params.get('limit'), '500')
  assert.equal(params.get('category'), 'HEALTH')
  assert.equal(params.get('status'), 'OPEN')
  assert.equal(params.get('swLng'), '-46.7')
  assert.equal(params.get('neLat'), '-23.4')
  assert.equal(new URLSearchParams(mapReportsPath('', '').split('?')[1]).has('category'), false)
})
