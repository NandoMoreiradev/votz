import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import * as Location from 'expo-location'
import { router } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import TriangleAlert from 'lucide-react-native/icons/triangle-alert'
import X from 'lucide-react-native/icons/x'
import ChevronDown from 'lucide-react-native/icons/chevron-down'
import Video from 'lucide-react-native/icons/video'
import FileText from 'lucide-react-native/icons/file-text'
import { Button, ErrorText, Field } from './ui'
import { ChoiceSheet } from './choice-sheet'
import { SearchSheet } from './search-sheet'
import { statusLabels } from './content-row'
import { useIbgeCities, useRecipientSearch, useSimilarReports } from '../hooks/use-report-compose'
import { findCity, UF_LIST } from '../lib/ibge'
import { digitsOnly, draftFromGps, editLocation, emptyLocation, formatCep, locationError, lookupCep, type LocationDraft } from '../lib/report-location'
import type { MediaItem } from '../lib/report-media'
import type { Recipient, RecipientKind } from '../lib/types'
import { theme } from '../theme'

const box = { borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: 12, padding: 12, gap: 10 } as const
const pill = (active: boolean) => ({ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: active ? theme.colors.action : theme.colors.border, backgroundColor: active ? theme.colors.tint : 'transparent' }) as const
const pillText = (active: boolean) => ({ fontSize: 13, fontFamily: theme.fonts.medium, color: active ? theme.colors.action : theme.colors.muted }) as const

function SectionTitle({ title, optional }: { title: string; optional?: boolean }) {
  return <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>{title}{optional && <Text style={{ fontFamily: theme.fonts.body, color: theme.colors.muted }}> (opcional)</Text>}</Text>
}

// ── Relatos parecidos ───────────────────────────────────────────────────────

export function SimilarReportsCard({
  title,
  description,
  enabled,
  category,
  city,
  state,
}: {
  title: string
  description: string
  enabled: boolean
  category?: string
  city?: string
  state?: string
}) {
  const similar = useSimilarReports(title, description, enabled, { category, city, state })
  if (!enabled || (similar.isFetching && !similar.data)) return null
  if (similar.isError) return <Text style={{ color: theme.colors.muted, fontSize: 12 }}>Não foi possível checar relatos parecidos agora.</Text>
  if (!similar.data?.length) return null
  return <View accessibilityRole="summary" style={{ ...box, borderColor: theme.colors.action, backgroundColor: theme.colors.tint }}>
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <TriangleAlert size={18} color={theme.colors.action} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>Já existem relatos parecidos</Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: theme.colors.muted }}>Apoiar um relato que já existe junta mais pressão e acelera a resposta. Veja antes de criar outro.</Text>
      </View>
    </View>
    {similar.data.map((report) => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Abrir relato parecido: ${report.title}`} onPress={() => router.push({ pathname: '/report/[id]', params: { id: report.id } })} style={{ paddingVertical: 6, gap: 2 }}>
      <Text numberOfLines={2} style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>{report.title}</Text>
      <Text style={{ fontSize: 11, color: theme.colors.muted }}>{[statusLabels[report.status], [report.city, report.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</Text>
    </Pressable>)}
  </View>
}

// ── Destinatário ────────────────────────────────────────────────────────────

const RECIPIENT_TABS: { value: RecipientKind; label: string; placeholder: string }[] = [
  { value: 'ENTITY', label: 'Entidade pública', placeholder: 'Buscar por nome (ex.: Prefeitura de…)' },
  { value: 'POLITICIAN', label: 'Político', placeholder: 'Buscar por nome do político' },
  { value: 'COMPANY', label: 'Empresa', placeholder: 'Buscar por nome da empresa' },
]

export function RecipientPicker({ value, onChange, disabled }: { value: Recipient | null; onChange: (value: Recipient | null) => void; disabled?: boolean }) {
  const [tab, setTab] = useState<RecipientKind>(value?.type ?? 'ENTITY')
  const [search, setSearch] = useState('')
  const results = useRecipientSearch(tab, search)
  const current = RECIPIENT_TABS.find((item) => item.value === tab)!
  return <View style={box}>
    <SectionTitle title="Direcionar para" optional />
    <Text style={{ fontSize: 12, color: theme.colors.muted }}>Quem deve responder por isso.</Text>
    {value ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderColor: theme.colors.action, backgroundColor: theme.colors.tint, borderRadius: theme.radius.sm, paddingVertical: 8, paddingLeft: 12, paddingRight: 4 }}>
      <Text numberOfLines={2} style={{ flex: 1, fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>{value.name}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Remover destinatário ${value.name}`} disabled={disabled} onPress={() => onChange(null)} style={{ minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' }}><Text style={{ fontSize: 13, color: theme.colors.action, fontFamily: theme.fonts.medium }}>Remover</Text></Pressable>
    </View> : <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{RECIPIENT_TABS.map((item) => <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: tab === item.value }} disabled={disabled} onPress={() => { setTab(item.value); setSearch('') }} style={pill(tab === item.value)}><Text style={pillText(tab === item.value)}>{item.label}</Text></Pressable>)}</View>
      <Field accessibilityLabel={`Buscar ${current.label}`} placeholder={current.placeholder} value={search} onChangeText={setSearch} autoCorrect={false} maxLength={80} editable={!disabled} />
      {results.isFetching && search.trim().length >= 2 && <ActivityIndicator color={theme.colors.action} />}
      {results.isError && <ErrorText message="Não foi possível buscar agora. Tente de novo." />}
      {results.data?.length === 0 && !results.isFetching && <Text style={{ fontSize: 12, color: theme.colors.muted }}>Nada encontrado com esse nome.</Text>}
      {results.data?.map((option) => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`Escolher ${option.name}`} disabled={disabled} onPress={() => { onChange({ type: option.type, id: option.id, name: option.name }); setSearch('') }} style={{ paddingVertical: 8, gap: 2 }}>
        <Text style={{ fontSize: 14, color: theme.colors.primary }}>{option.name}</Text>
        {!!option.detail && <Text style={{ fontSize: 11, color: theme.colors.muted }}>{option.detail}</Text>}
      </Pressable>)}
    </>}
  </View>
}

// ── Localização ─────────────────────────────────────────────────────────────

function PickerRow({ label, value, placeholder, onPress, disabled }: { label: string; value: string; placeholder: string; onPress: () => void; disabled?: boolean }) {
  return <View style={{ gap: 6 }}>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 15, lineHeight: 23, color: theme.colors.text }}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value || placeholder}`} disabled={disabled} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, opacity: disabled ? 0.5 : 1 }}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: value ? theme.colors.text : theme.colors.muted }}>{value || placeholder}</Text>
      <ChevronDown size={18} color={theme.colors.muted} />
    </Pressable>
  </View>
}

type LocationMode = 'cep' | 'manual'

export function LocationPanel({ draft, onChange, disabled }: { draft: LocationDraft; onChange: (draft: LocationDraft) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<LocationMode>('cep')
  const [resolved, setResolved] = useState(false)
  const [fromGps, setFromGps] = useState(false)
  const [stateSheet, setStateSheet] = useState(false)
  const [citySheet, setCitySheet] = useState(false)
  const requested = useRef('')
  // No modo manual a cidade tem que existir na lista oficial do estado (vale também para o que veio do GPS).
  const cities = useIbgeCities(mode === 'manual' ? draft.state : '')
  useEffect(() => {
    if (mode !== 'manual' || !cities.data || !draft.city) return
    const official = findCity(cities.data, draft.city)
    if (official !== draft.city) onChange({ ...draft, city: official ?? '' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cities.data, draft.city, mode])
  const cep = useMutation({
    mutationFn: (digits: string) => lookupCep(digits),
    onSuccess: (result, digits) => {
      if (requested.current !== digits) return // o usuário já mudou o CEP
      setResolved(true)
      onChange({ ...emptyLocation, cep: digits, ...result })
    },
  })
  const gps = useMutation({
    mutationFn: async () => {
      if ((await Location.requestForegroundPermissionsAsync()).status !== 'granted') throw new Error('Sem acesso à localização. Você pode informar o endereço à mão.')
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const addresses = await Location.reverseGeocodeAsync(position.coords).catch(() => [])
      return draftFromGps({ latitude: position.coords.latitude, longitude: position.coords.longitude }, addresses[0])
    },
    onSuccess: (next) => { setMode('manual'); setResolved(false); setFromGps(true); cep.reset(); onChange(next) },
  })
  const error = locationError(draft)
  const changeMode = (next: LocationMode) => { if (next === mode) return; setMode(next); setResolved(false); setFromGps(false); requested.current = ''; cep.reset(); gps.reset(); onChange(emptyLocation) }
  const changeCep = (raw: string) => {
    const digits = digitsOnly(raw).slice(0, 8)
    requested.current = digits
    setFromGps(false)
    if (resolved) setResolved(false)
    onChange({ ...emptyLocation, cep: digits })
    if (digits.length === 8) cep.mutate(digits)
    else cep.reset()
  }
  const clear = () => { setResolved(false); setFromGps(false); requested.current = ''; cep.reset(); gps.reset(); onChange(emptyLocation) }
  const hasAnything = !!(draft.cep || draft.street || draft.neighborhood || draft.city || draft.state || draft.latitude !== undefined)
  const edit = (field: 'street' | 'neighborhood' | 'city' | 'state') => (value: string) => onChange(editLocation(draft, field, value))
  return <View style={box}>
    <SectionTitle title="Localização do problema" optional />
    <Text style={{ fontSize: 12, color: theme.colors.muted }}>Com o local, o relato aparece no mapa e ajuda a detectar surtos.</Text>
    <Button secondary title={fromGps ? 'Localização do aparelho adicionada' : 'Usar minha localização'} loading={gps.isPending} disabled={disabled || cep.isPending} onPress={() => gps.mutate()} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'cep' }} disabled={disabled} onPress={() => changeMode('cep')} style={pill(mode === 'cep')}><Text style={pillText(mode === 'cep')}>Tenho o CEP</Text></Pressable>
      <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'manual' }} disabled={disabled} onPress={() => changeMode('manual')} style={pill(mode === 'manual')}><Text style={pillText(mode === 'manual')}>Não sei o CEP</Text></Pressable>
    </View>
    {mode === 'cep' ? <>
      <Field label="CEP" accessibilityLabel="CEP do local" placeholder="00000-000" keyboardType="number-pad" inputMode="numeric" autoComplete="postal-code" value={formatCep(draft.cep)} onChangeText={changeCep} maxLength={9} editable={!disabled} />
      {cep.isPending && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><ActivityIndicator color={theme.colors.action} /><Text style={{ fontSize: 12, color: theme.colors.muted }}>Buscando endereço…</Text></View>}
      <ErrorText message={cep.isError ? cep.error.message : undefined} />
      {resolved && <>
        <Field label="Rua" value={draft.street} onChangeText={edit('street')} maxLength={200} editable={!disabled} />
        <Field label="Bairro" value={draft.neighborhood} onChangeText={edit('neighborhood')} maxLength={100} editable={!disabled} />
        <Text style={{ fontSize: 13, color: theme.colors.muted }}>{draft.city} — {draft.state}</Text>
        <Text style={{ fontSize: 11, color: theme.colors.muted }}>Cidade e estado vêm do CEP. Rua e bairro você pode ajustar, mas não são conferidos.</Text>
      </>}
    </> : <>
      <Field label="Rua" placeholder="Av. Paulista" value={draft.street} onChangeText={edit('street')} maxLength={200} editable={!disabled} />
      <Field label="Bairro" placeholder="Bela Vista" value={draft.neighborhood} onChangeText={edit('neighborhood')} maxLength={100} editable={!disabled} />
      <PickerRow label="Estado" value={draft.state ? `${draft.state} — ${UF_LIST.find((item) => item.uf === draft.state)?.name ?? ''}` : ''} placeholder="Escolher estado" disabled={disabled} onPress={() => setStateSheet(true)} />
      <PickerRow label="Cidade" value={draft.city} placeholder={draft.state ? 'Escolher cidade' : 'Escolha o estado primeiro'} disabled={disabled || !draft.state} onPress={() => setCitySheet(true)} />
      <Text style={{ fontSize: 11, color: theme.colors.muted }}>Estado e cidade vêm da lista oficial do IBGE. Rua e bairro são informados por você e não são conferidos.</Text>
      <ChoiceSheet visible={stateSheet} title="Estado" options={UF_LIST.map((item) => ({ value: item.uf, label: `${item.uf} — ${item.name}` }))} value={draft.state || null} onChange={(uf) => onChange(editLocation(draft, 'state', uf))} onClose={() => setStateSheet(false)} />
      <SearchSheet visible={citySheet} title="Cidade" options={cities.data ?? []} value={draft.city} loading={cities.isPending && cities.fetchStatus !== 'idle'} error={cities.isError ? cities.error.message : undefined} onRetry={() => { void cities.refetch() }} onSelect={(city) => onChange(editLocation(draft, 'city', city))} onClose={() => setCitySheet(false)} />
    </>}
    <ErrorText message={gps.isError ? gps.error.message : error ?? undefined} />
    {hasAnything && <Pressable accessibilityRole="button" accessibilityLabel="Remover localização" disabled={disabled} onPress={clear} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}><Text style={{ fontSize: 13, color: theme.colors.muted, textDecorationLine: 'underline' }}>Remover localização</Text></Pressable>}
  </View>
}

// ── Mídia ───────────────────────────────────────────────────────────────────

export function MediaTiles({ items, onRemove, disabled }: { items: MediaItem[]; onRemove: (index: number) => void; disabled?: boolean }) {
  if (!items.length) return null
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{items.map((item, index) => <View key={`${item.uri}-${index}`} style={{ width: '48%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.soft }}>
    {item.kind === 'image' ? <Image source={item.uri} style={{ flex: 1 }} contentFit="cover" accessibilityLabel={`Foto ${index + 1}`} /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10 }}>
      {item.kind === 'video' ? <Video size={30} color={theme.colors.primary} /> : <FileText size={30} color={theme.colors.primary} />}
      <Text numberOfLines={2} style={{ fontSize: 11, textAlign: 'center', color: theme.colors.muted }}>{item.kind === 'video' ? 'Vídeo' : 'PDF'} · {item.name}</Text>
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={`Remover arquivo ${index + 1}`} disabled={disabled} onPress={() => onRemove(index)} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' }}><X color={theme.colors.surface} size={16} /></Pressable>
  </View>)}</View>
}
