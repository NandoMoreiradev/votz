import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import {
  CONTEXT_NOTE_KINDS_BY_TARGET,
  CONTEXT_NOTE_KIND_LABELS,
  CONTEXT_NOTE_RATING_LABELS,
  CONTEXT_NOTE_RATING_REASONS,
  CONTEXT_NOTE_SOURCES_MAX,
  CONTEXT_NOTE_TEXT_MAX,
  CONTEXT_NOTE_TEXT_MIN,
  CONTEXT_NOTE_WRITING_RULES,
  CONTEXT_NOTES_BRAND,
  ContextNoteRatingValue,
  type ContextNoteKind,
} from '@votz/shared-types'
import { Button, ErrorText, Field, State } from '../components/ui'
import { FormScroll, Screen, Toolbar } from '../components/screen'
import {
  useContextNotesEnabled,
  useContextQueue,
  useContributorStatus,
  useCreateContextNote,
  useJoinContributor,
  useRateContextNote,
  type QueueNote,
  type QueueTarget,
} from '../hooks/use-context-notes'
import { errorMessage } from '../lib/api'
import { useSession } from '../lib/session'
import { theme } from '../theme'

const RATINGS: ContextNoteRatingValue[] = [ContextNoteRatingValue.HELPFUL, ContextNoteRatingValue.SOMEWHAT, ContextNoteRatingValue.NOT_HELPFUL]
const muted = { color: theme.colors.muted, fontSize: 13, lineHeight: 19 } as const
const h2 = { fontFamily: theme.fonts.heading, fontSize: 16, color: theme.colors.primary } as const
const box = { borderWidth: 0.5, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 14, gap: 8, backgroundColor: theme.colors.surface } as const

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={{ paddingHorizontal: 12, minHeight: 36, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: on ? theme.colors.primary : theme.colors.border, backgroundColor: on ? theme.colors.primary : theme.colors.surface }}>
    <Text style={{ fontFamily: theme.fonts.body, fontSize: 13, color: on ? theme.colors.surface : theme.colors.text }}>{label}</Text>
  </Pressable>
}
function Sources({ sources }: { sources: string[] }) {
  return <>{sources.map((s) => <Pressable key={s} accessibilityRole="link" accessibilityLabel={`Abrir a fonte ${s}`} onPress={() => { void Linking.openURL(s).catch(() => Alert.alert('Não foi possível abrir o link', s)) }}>
    <Text style={{ fontSize: 12, color: theme.colors.primary, textDecorationLine: 'underline' }}>{s}</Text>
  </Pressable>)}</>
}
function TargetBox({ target }: { target: QueueTarget }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${target.title}`} onPress={() => router.push(target.type === 'POST' ? { pathname: '/post/[id]', params: { id: target.id } } : { pathname: '/report/[id]', params: { id: target.id } })} style={{ backgroundColor: theme.colors.soft, borderRadius: theme.radius.sm, padding: 10, gap: 3 }}>
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 12, color: theme.colors.primary }}>{target.title}</Text>
    <Text numberOfLines={3} style={{ fontSize: 12, color: theme.colors.text }}>{target.excerpt}</Text>
  </Pressable>
}

function RateItem({ item }: { item: QueueNote }) {
  const [value, setValue] = useState<ContextNoteRatingValue | null>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const rate = useRateContextNote()
  const side = value === ContextNoteRatingValue.NOT_HELPFUL ? 'not_helpful' : 'helpful'
  return <View style={box}>
    <TargetBox target={item.target} />
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 11, color: theme.colors.muted }}>{CONTEXT_NOTE_KIND_LABELS[item.note.kind].label}</Text>
    <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.text }}>{item.note.text}</Text>
    <Sources sources={item.note.sources} />
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.text }}>A nota ajuda a entender melhor? Abra a fonte antes de responder.</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{RATINGS.map((v) => <Chip key={v} label={CONTEXT_NOTE_RATING_LABELS[v]} on={value === v} onPress={() => { setValue(v); setReasons([]) }} />)}</View>
    {value && <>
      <Text style={muted}>Por quê? (opcional, até 3)</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CONTEXT_NOTE_RATING_REASONS.filter((r) => r.side === side).map((r) => <Chip key={r.value} label={r.label} on={reasons.includes(r.value)} onPress={() => setReasons((prev) => prev.includes(r.value) ? prev.filter((x) => x !== r.value) : prev.length < 3 ? [...prev, r.value] : prev)} />)}</View>
      <Button title="Enviar avaliação" loading={rate.isPending} onPress={() => rate.mutate({ noteId: item.note.id, value, reasons })} />
    </>}
    {rate.isError && <ErrorText message={errorMessage(rate.error)} />}
  </View>
}

function WriteModal({ target, onClose }: { target: QueueTarget | null; onClose: () => void }) {
  const kinds = target ? CONTEXT_NOTE_KINDS_BY_TARGET[target.type] : []
  const [kind, setKind] = useState<ContextNoteKind | null>(null)
  const [text, setText] = useState('')
  const [sources, setSources] = useState<string[]>([''])
  const [done, setDone] = useState(false)
  const create = useCreateContextNote()
  const chosen = kind ?? kinds[0]
  const filled = sources.map((s) => s.trim()).filter(Boolean)
  const close = () => { setKind(null); setText(''); setSources(['']); setDone(false); create.reset(); onClose() }
  return <Modal visible={!!target} animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Toolbar title="Escrever contexto" back={false} left={<Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={close} style={{ minHeight: 40, justifyContent: 'center' }}><Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.medium }}>Fechar</Text></Pressable>} />
      {done ? <State title="Nota enviada" description="Agora outras pessoas vão avaliar. Ela só aparece depois que avaliarem como útil." retry={close} />
        : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 14 }}>
          {target && <TargetBox target={target} />}
          <Text style={h2}>O que a sua nota faz?</Text>
          <View style={{ gap: 8 }}>{kinds.map((k) => <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: chosen === k }} onPress={() => setKind(k)} style={{ ...box, borderColor: chosen === k ? theme.colors.primary : theme.colors.border, borderWidth: chosen === k ? 1.5 : 0.5, padding: 10 }}>
            <Text style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.text }}>{CONTEXT_NOTE_KIND_LABELS[k].label}</Text>
            <Text style={muted}>{CONTEXT_NOTE_KIND_LABELS[k].hint}</Text>
          </Pressable>)}</View>
          <Field label={`A nota (${text.length}/${CONTEXT_NOTE_TEXT_MAX})`} multiline maxLength={CONTEXT_NOTE_TEXT_MAX} value={text} onChangeText={setText} placeholder="Explique o fato em poucas linhas." />
          <Text style={h2}>Fontes (links que qualquer pessoa consiga abrir)</Text>
          {sources.map((value, i) => <Field key={i} accessibilityLabel={`Fonte ${i + 1}`} autoCapitalize="none" autoCorrect={false} keyboardType="url" value={value} placeholder="https://..." onChangeText={(next) => setSources((prev) => prev.map((s, j) => j === i ? next : s))} />)}
          {sources.length < CONTEXT_NOTE_SOURCES_MAX && <Pressable accessibilityRole="button" onPress={() => setSources((prev) => [...prev, ''])}><Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.medium }}>+ Adicionar outra fonte</Text></Pressable>}
          <View style={{ backgroundColor: theme.colors.soft, borderRadius: theme.radius.sm, padding: 12, gap: 4 }}>{CONTEXT_NOTE_WRITING_RULES.map((rule) => <Text key={rule} style={muted}>• {rule}</Text>)}</View>
          {create.isError && <ErrorText message={errorMessage(create.error)} />}
          <Button title="Enviar nota" loading={create.isPending} disabled={!target || !chosen || text.trim().length < CONTEXT_NOTE_TEXT_MIN || filled.length === 0}
            onPress={() => target && chosen && create.mutate({ targetType: target.type, targetId: target.id, kind: chosen, text: text.trim(), sources: filled }, { onSuccess: () => setDone(true) })} />
        </ScrollView>}
    </KeyboardAvoidingView>
  </Modal>
}

/** Contexto da Comunidade no celular: entrar como colaborador, avaliar notas e escrever. Mesmos textos do site. */
export default function ContextNotesScreen() {
  const user = useSession((s) => s.user)
  const enabled = useContextNotesEnabled()
  const status = useContributorStatus(enabled && !!user)
  const active = !!status.data?.canRate
  const queue = useContextQueue(active)
  const join = useJoinContributor()
  const [accepted, setAccepted] = useState(false)
  const [writeTarget, setWriteTarget] = useState<QueueTarget | null>(null)
  if (!user) return <Redirect href="/login" />
  const s = status.data

  return <Screen>
    <Toolbar title={CONTEXT_NOTES_BRAND.feature} back />
    <FormScroll>
      <Text style={{ fontSize: 14, lineHeight: 21, color: theme.colors.text }}>Às vezes uma publicação ou um relato precisa de um complemento: uma informação que falta, uma correção com fonte, uma prova a mais. Aqui, pessoas do Votz escrevem esse complemento, sempre com link de fonte, e outras pessoas avaliam se ele ajuda.</Text>
      <View style={{ gap: 4 }}>
        <Text style={muted}>• A nota só aparece para todo mundo depois que várias pessoas avaliam como útil.</Text>
        <Text style={muted}>• A nota não tira nada do ar. Se o conteúdo quebra as regras, use "Denunciar".</Text>
        <Text style={muted}>• Em relato, a nota só pode trazer prova a mais, novidade sobre o caso ou aviso de relato repetido. Nunca "isso é falso".</Text>
        <Text style={muted}>• Quem escreveu o conteúdo, ou é do órgão a que ele se refere, não escreve nem avalia nota sobre ele.</Text>
      </View>

      {!enabled ? <State title="Ainda não está aberto" description="Este recurso abre em breve." />
        : status.isPending ? <State loading title="Carregando" />
        : status.isError || !s ? <State title="Não foi possível carregar" description={errorMessage(status.error)} retry={() => status.refetch()} />
        : s.blockedReason ? <View style={box}><Text style={{ fontSize: 14, color: theme.colors.text }}>{s.blockedReason}</Text></View>
        : !s.joined ? <View style={box}>
          <Text style={h2}>Quero colaborar</Text>
          <Text style={muted}>• Tenho 18 anos ou mais.</Text>
          {CONTEXT_NOTE_WRITING_RULES.map((rule) => <Text key={rule} style={muted}>• {rule}</Text>)}
          <Text style={muted}>• Minhas avaliações podem ser usadas para medir se eu avalio com atenção, e só isso.</Text>
          <Text style={muted}>• Meu nome não aparece nas notas, mas o Votz guarda quem escreveu, para responder a ordem judicial.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
            <Switch accessibilityLabel="Li e aceito o termo do colaborador" value={accepted} onValueChange={setAccepted} trackColor={{ false: theme.colors.border, true: theme.colors.positive }} />
            <Text style={{ flex: 1, fontSize: 14, color: theme.colors.text }}>Li e aceito o termo do colaborador.</Text>
          </View>
          <Button title="Entrar como colaborador" loading={join.isPending} disabled={!accepted} onPress={() => join.mutate(s.termsVersion)} />
          {join.isError && <ErrorText message={errorMessage(join.error)} />}
        </View>
        : <>
          {s.suspended && <View style={box}><Text style={{ fontSize: 14, color: theme.colors.text }}>Sua participação como colaborador está suspensa.</Text></View>}
          {active && <View style={box}>
            <Text style={h2}>Seu andamento</Text>
            <Text style={{ fontSize: 14, color: theme.colors.text }}>Você avaliou {s.progress.ratingsGiven} notas. {s.canWrite ? 'Você já pode escrever notas pelos pedidos de contexto abaixo ou pelo menu "⋯" de uma publicação ou relato.' : `Avalie pelo menos ${s.progress.ratingsNeededToWrite} para liberar a escrita de notas.`}</Text>
          </View>}
          {active && <View style={{ gap: 10 }}>
            <Text style={h2}>Notas para avaliar</Text>
            {queue.isPending ? <State loading title="Carregando" /> : queue.isError ? <ErrorText message={errorMessage(queue.error)} />
              : queue.data.toRate.length === 0 ? <Text style={muted}>Nenhuma nota esperando você agora.</Text>
              : queue.data.toRate.map((item) => <RateItem key={item.note.id} item={item} />)}
          </View>}
          {active && s.canWrite && !!queue.data?.requested.length && <View style={{ gap: 10 }}>
            <Text style={h2}>Pedidos de contexto</Text>
            {queue.data.requested.map(({ count, target }) => <View key={`${target.type}-${target.id}`} style={box}>
              <TargetBox target={target} />
              <Text style={muted}>{count} {count === 1 ? 'pessoa pediu' : 'pessoas pediram'} contexto.</Text>
              <Button title="Escrever nota" onPress={() => setWriteTarget(target)} />
            </View>)}
          </View>}
        </>}
    </FormScroll>
    <WriteModal target={writeTarget} onClose={() => setWriteTarget(null)} />
  </Screen>
}
