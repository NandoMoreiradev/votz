import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLocationPayload, draftFromGps, editLocation, emptyLocation, formatCep, locationError, locationIsEmpty, parseCepResponse, ufFromRegion,
} from '../src/lib/report-location.ts'
import { mediaSlots, prepareMedia, uploadTimeoutMs } from '../src/lib/report-media.ts'
import { filterPlaces, findCity, parseCities, placeKey, UF_LIST } from '../src/lib/ibge.ts'
import { shouldAutoDownload } from '../src/lib/network-policy.ts'

const draft = (patch) => ({ ...emptyLocation, ...patch })

test('localização vazia não envia nada e não gera erro', () => {
  assert.equal(locationIsEmpty(emptyLocation), true)
  assert.equal(locationError(emptyLocation), null)
  assert.deepEqual(buildLocationPayload(emptyLocation), {})
  // CEP digitado sem busca concluída não é localização
  assert.deepEqual(buildLocationPayload(draft({ cep: '01310100' })), {})
})

test('endereço parcial exige cidade e UF (a API recusa string vazia)', () => {
  assert.match(locationError(draft({ street: 'Rua A' })), /cidade/i)
  assert.match(locationError(draft({ city: 'Recife' })), /2 letras/)
  assert.match(locationError(draft({ city: 'Recife', state: 'P' })), /2 letras/)
  assert.equal(locationError(draft({ city: 'Recife', state: 'pe' })), null)
  assert.deepEqual(buildLocationPayload(draft({ street: 'Rua A' })), {})
})

test('payload igual ao do web: só campos preenchidos e endereço formatado', () => {
  const payload = buildLocationPayload(draft({ street: ' Av. Paulista ', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'sp', latitude: -23.56, longitude: -46.65 }))
  assert.deepEqual(payload, { city: 'São Paulo', state: 'SP', neighborhood: 'Bela Vista', latitude: -23.56, longitude: -46.65, typedAddress: 'Av. Paulista, Bela Vista, São Paulo, SP' })
  const semBairro = buildLocationPayload(draft({ city: 'Recife', state: 'PE' }))
  assert.equal('neighborhood' in semBairro, false)
  assert.equal('latitude' in semBairro, false)
  assert.equal(buildLocationPayload(draft({ city: 'Recife', state: 'PE', street: 'x'.repeat(400) })).typedAddress.length, 300)
})

test('coordenadas inválidas nunca são enviadas', () => {
  assert.equal('latitude' in buildLocationPayload(draft({ city: 'A', state: 'SP', latitude: NaN, longitude: 1 })), false)
  // zero é coordenada válida
  assert.equal(buildLocationPayload(draft({ city: 'A', state: 'SP', latitude: 0, longitude: 0 })).latitude, 0)
})

test('trocar cidade ou UF descarta o ponto do GPS/CEP; rua e bairro mantêm', () => {
  const gps = draft({ city: 'São Paulo', state: 'SP', latitude: -23.5, longitude: -46.6 })
  assert.equal(editLocation(gps, 'street', 'Rua B').latitude, -23.5)
  assert.equal(editLocation(gps, 'neighborhood', 'Centro').longitude, -46.6)
  assert.equal(editLocation(gps, 'city', 'Rio de Janeiro').latitude, undefined)
  assert.equal(editLocation(gps, 'state', 'rj').latitude, undefined)
  assert.equal(editLocation(gps, 'state', 'rj').state, 'RJ')
  assert.equal(editLocation(gps, 'city', 'São Paulo').latitude, -23.5)
})

test('GPS aceita UF e nome do estado (Android e iOS) e preenche o endereço', () => {
  assert.equal(ufFromRegion('SP'), 'SP')
  assert.equal(ufFromRegion('São Paulo'), 'SP')
  assert.equal(ufFromRegion('Ceará'), 'CE')
  assert.equal(ufFromRegion('Distrito Federal'), 'DF')
  assert.equal(ufFromRegion('Narnia'), '')
  assert.equal(ufFromRegion(null), '')
  const result = draftFromGps({ latitude: -8.05, longitude: -34.9 }, { street: 'Rua da Aurora', district: 'Boa Vista', city: null, subregion: 'Recife', region: 'Pernambuco' })
  assert.deepEqual(result, { cep: '', street: 'Rua da Aurora', neighborhood: 'Boa Vista', city: 'Recife', state: 'PE', latitude: -8.05, longitude: -34.9 })
  assert.equal(draftFromGps({ latitude: 1, longitude: 2 }, null).state, '')
})

test('CEP: máscara e leitura da BrasilAPI como no web', () => {
  assert.equal(formatCep('01310100'), '01310-100')
  assert.equal(formatCep('01310-1009999'), '01310-100')
  assert.equal(formatCep('013'), '013')
  const ok = parseCepResponse({ street: 'Avenida Paulista', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', location: { coordinates: { latitude: '-23.56', longitude: '-46.65' } } })
  assert.deepEqual(ok, { street: 'Avenida Paulista', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP', latitude: -23.56, longitude: -46.65 })
  assert.equal('latitude' in parseCepResponse({ city: 'Cidade', state: 'SP', location: {} }), false)
  assert.equal(parseCepResponse({ city: '', state: 'SP' }), null)
  assert.equal(parseCepResponse({ city: 'X', state: 'São Paulo' }), null)
  assert.equal(parseCepResponse(null), null)
})

test('mídia: mesmos tipos e limites do web e do storage', () => {
  const jpg = prepareMedia({ uri: 'file:///a/b.jpg', size: 1024 })
  assert.equal(jpg.item.kind, 'image')
  assert.equal(jpg.item.mimeType, 'image/jpeg')
  assert.equal(prepareMedia({ uri: 'file:///a/v.mov', type: 'video' }).item.mimeType, 'video/quicktime')
  assert.equal(prepareMedia({ uri: 'file:///a/doc', name: 'laudo', mimeType: 'application/pdf' }).item.name, 'laudo.pdf')
  assert.match(prepareMedia({ uri: 'file:///a/b.jpg', size: 10 * 1024 * 1024 + 1 }).error, /10 MB/)
  assert.match(prepareMedia({ uri: 'file:///a/v.mp4', size: 100 * 1024 * 1024 + 1 }).error, /100 MB/)
  assert.match(prepareMedia({ uri: 'file:///a/d.pdf', size: 50 * 1024 * 1024 + 1 }).error, /50 MB/)
  assert.ok(prepareMedia({ uri: 'file:///a/d.pdf', size: 50 * 1024 * 1024 }).item)
  assert.match(prepareMedia({ uri: 'file:///a/x.heic', mimeType: 'image/heic' }).error, /não é aceito/)
  assert.match(prepareMedia({ uri: 'file:///a/x.zip', name: 'x.zip' }).error, /não é aceito/)
})

test('limite de arquivos e tempo de envio por tipo', () => {
  assert.equal(mediaSlots(5, 3), 2)
  assert.equal(mediaSlots(5, 9), 0)
  assert.ok(uploadTimeoutMs('video') > uploadTimeoutMs('pdf'))
  assert.ok(uploadTimeoutMs('pdf') > 20_000)
})

test('trocar o estado limpa a cidade (ela era do estado anterior) e descarta o ponto', () => {
  const sp = draft({ city: 'São Paulo', state: 'SP', latitude: -23.5, longitude: -46.6 })
  const rj = editLocation(sp, 'state', 'rj')
  assert.equal(rj.state, 'RJ')
  assert.equal(rj.city, '')
  assert.equal(rj.latitude, undefined)
  // escolher o mesmo estado de novo não apaga nada
  assert.equal(editLocation(sp, 'state', 'SP').city, 'São Paulo')
})

test('lista do IBGE: 27 estados e comparação sem acento, caixa, hífen ou apóstrofo', () => {
  assert.equal(UF_LIST.length, 27)
  assert.equal(new Set(UF_LIST.map((item) => item.uf)).size, 27)
  assert.equal(placeKey("Santa Bárbara d'Oeste"), placeKey('SANTA BARBARA D OESTE'))
  assert.equal(placeKey('Embu-Guaçu'), placeKey('embu guacu'))
  const cities = ["Santa Bárbara d'Oeste", 'São Paulo', 'Embu das Artes', 'Embu-Guaçu']
  assert.equal(findCity(cities, 'sao paulo'), 'São Paulo')
  assert.equal(findCity(cities, 'SANTA BARBARA D OESTE'), "Santa Bárbara d'Oeste")
  assert.equal(findCity(cities, 'Sao Paulooo'), undefined)
  assert.equal(findCity(cities, ''), undefined)
  assert.equal(findCity(cities, null), undefined)
})

test('busca de cidade: quem começa com o texto vem primeiro', () => {
  const cities = ['Bela Vista', 'Vista Alegre', 'Vista Serrana', 'Boa Vista']
  assert.deepEqual(filterPlaces(cities, 'vis'), ['Vista Alegre', 'Vista Serrana', 'Bela Vista', 'Boa Vista'])
  assert.deepEqual(filterPlaces(cities, ''), cities)
  assert.deepEqual(filterPlaces(cities, 'xyz'), [])
})

test('leitura da resposta do IBGE ignora linhas inválidas, repetidas e ordena', () => {
  const rows = [{ 'municipio-nome': 'Zé Doca' }, { 'municipio-nome': 'Açailândia' }, { 'municipio-nome': 'Zé Doca' }, { 'municipio-nome': '' }, { outro: 1 }, null]
  assert.deepEqual(parseCities(rows), ['Açailândia', 'Zé Doca'])
  assert.deepEqual(parseCities({ erro: true }), [])
})

test('download automático de mídia respeita a rede', () => {
  assert.equal(shouldAutoDownload('NEVER', 'WIFI'), false)
  assert.equal(shouldAutoDownload('ALWAYS', 'CELLULAR'), true)
  assert.equal(shouldAutoDownload('WIFI_ONLY', 'WIFI'), true)
  assert.equal(shouldAutoDownload('WIFI_ONLY', 'ETHERNET'), true)
  assert.equal(shouldAutoDownload('WIFI_ONLY', 'CELLULAR'), false)
  assert.equal(shouldAutoDownload('WIFI_ONLY', 'UNKNOWN'), false)
  assert.equal(shouldAutoDownload('WIFI_ONLY', undefined), false)
})
