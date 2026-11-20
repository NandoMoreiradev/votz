import { Pressable, Text, View } from 'react-native'
import { router } from 'expo-router'
import Send from 'lucide-react-native/icons/send'
import { Avatar, Button, ErrorText, Field, IconButton, Label } from './ui'
import { REACTIONS, activeStream } from '../lib/debate-view'
import type { Flash } from '../hooks/use-debates'
import type { Debate, DebateMessage, DebatePoll, DebateQuestion, ReactionType } from '../lib/types'
import { theme } from '../theme'

const empty = (text: string) => <Text style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 13, textAlign: 'center', paddingVertical: 24 }}>{text}</Text>

export function ChatPanel({ messages }: { messages: DebateMessage[] }) {
  if (!messages.length) return empty('Nenhuma mensagem ainda. Seja o primeiro!')
  return <View style={{ gap: 10, padding: 16 }}>
    {messages.slice(-100).map((message) => <View key={message.id} style={{ flexDirection: 'row', gap: 10 }}>
      <Avatar name={message.author.name} uri={message.author.avatarUrl} size={28} />
      <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: 14, lineHeight: 20, color: theme.colors.text }}>
        <Text style={{ fontFamily: theme.fonts.medium, color: theme.colors.primary }}>{message.author.name}  </Text>{message.text}
      </Text>
    </View>)}
  </View>
}

export function QuestionsPanel({ questions, onUpvote }: { questions: DebateQuestion[]; onUpvote: (id: string) => void }) {
  if (!questions.length) return empty('Nenhuma pergunta ainda.')
  return <View style={{ gap: 10, padding: 16 }}>
    {[...questions].sort((a, b) => b.upvotes - a.upvotes).map((question) => <View key={question.id} style={{ gap: 8, padding: 12, borderRadius: theme.radius.md, borderWidth: 0.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
      <Label>{question.text}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 12 }}>{question.author.name}{question.answered ? ' · respondida' : ''}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`Apoiar esta pergunta. ${question.upvotes} apoios`} onPress={() => onUpvote(question.id)}
          style={({ pressed }) => ({ paddingHorizontal: 12, minHeight: 32, borderRadius: 16, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ color: theme.colors.primary, fontFamily: theme.fonts.medium, fontSize: 13 }}>▲ {question.upvotes}</Text>
        </Pressable>
      </View>
    </View>)}
  </View>
}

export function PollPanel({ poll, votedOptionId, onVote, busy }: { poll: DebatePoll | null | undefined; votedOptionId?: string; onVote: (optionId: string) => void; busy: boolean }) {
  if (!poll) return empty('Nenhuma enquete ativa no momento.')
  const total = poll.options.reduce((sum, option) => sum + option.totalVotes, 0)
  const showResult = !!votedOptionId || !poll.active
  return <View style={{ gap: 10, padding: 16 }}>
    <Text style={{ fontFamily: theme.fonts.heading, fontSize: 17, color: theme.colors.primary }}>{poll.question}</Text>
    {poll.options.map((option) => {
      const percent = total > 0 ? Math.round((option.totalVotes / total) * 100) : 0
      const mine = votedOptionId === option.id
      return <Pressable key={option.id} accessibilityRole="button" accessibilityState={{ disabled: showResult || busy, selected: mine }} disabled={showResult || busy} onPress={() => onVote(option.id)}
        style={{ minHeight: 46, borderRadius: theme.radius.sm, borderWidth: mine ? 2 : 1, borderColor: mine ? theme.colors.action : theme.colors.border, overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 14 }}>
        {showResult && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`, backgroundColor: theme.colors.tint }} />}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: theme.fonts.body, fontSize: 15, color: theme.colors.text }}>{option.text}</Text>
          {showResult && <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.muted }}>{percent}%</Text>}
        </View>
      </Pressable>
    })}
    <Text style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 12 }}>{total.toLocaleString('pt-BR')} {total === 1 ? 'voto' : 'votos'}</Text>
  </View>
}

export function ReactionBar({ onReact, flashes }: { onReact: (type: ReactionType) => void; flashes: Flash[] }) {
  return <View style={{ borderBottomWidth: 0.5, borderBottomColor: theme.colors.border }}>
    <View pointerEvents="none" style={{ height: 30 }}>
      {flashes.map((flash) => <Text key={flash.id} style={{ position: 'absolute', left: `${flash.x}%`, bottom: 0, fontSize: 22 }}>{REACTIONS.find((r) => r.type === flash.type)?.emoji}</Text>)}
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 8, paddingHorizontal: 8 }}>
      {REACTIONS.map((reaction) => <IconButton key={reaction.type} label={reaction.label} onPress={() => onReact(reaction.type)}>
        <Text style={{ fontSize: 24 }}>{reaction.emoji}</Text>
      </IconButton>)}
    </View>
  </View>
}

/** Debatedores confirmados, com atalho para a live do canal de cada um (quando ele colocou a dele). */
export function ParticipantsList({ debate, watching, onWatch }: { debate: Debate; watching: string | null; onWatch: (participantId: string | null) => void }) {
  const confirmed = debate.participants.filter((p) => p.inviteStatus === 'CONFIRMED')
  const current = activeStream(debate, watching).participantId
  const hasOwnStreams = debate.streamProvider === 'YOUTUBE' && confirmed.some((p) => p.youtubeVideoId)
  if (!confirmed.length) return null
  return <View style={{ gap: 10 }}>
    <Text style={{ fontFamily: theme.fonts.medium, fontSize: 13, color: theme.colors.muted }}>Quem debate</Text>
    {hasOwnStreams && current && <Button secondary title="Voltar para a transmissão principal" onPress={() => onWatch(null)} />}
    {confirmed.map((p) => <View key={p.id} style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver perfil de ${p.politician.name}`} onPress={() => router.push({ pathname: '/profile/[kind]/[id]', params: { kind: 'politicians', id: p.politicianId } })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar name={p.politician.name} uri={p.politician.avatarUrl} size={36} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.medium, fontSize: 14, color: theme.colors.primary }}>{p.politician.name}</Text>
          <Text numberOfLines={1} style={{ fontFamily: theme.fonts.body, fontSize: 12, color: theme.colors.muted }}>{p.politician.office} · {p.politician.party.abbreviation}</Text>
        </View>
      </Pressable>
      {debate.streamProvider === 'YOUTUBE' && p.youtubeVideoId
        ? <Button secondary disabled={current === p.id} title={current === p.id ? 'Assistindo agora' : `Assistir pelo canal de ${p.youtubeChannelTitle ?? p.politician.name}`} onPress={() => onWatch(p.id)} />
        : null}
    </View>)}
  </View>
}

/** Caixa de texto fixa no pé da tela (chat e perguntas). */
export function Composer({ value, onChangeText, onSend, placeholder, busy, error }: { value: string; onChangeText: (text: string) => void; onSend: () => void; placeholder: string; busy?: boolean; error?: string }) {
  return <View style={{ borderTopWidth: 0.5, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 10, gap: 6 }}>
    <ErrorText message={error} />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1 }}><Field accessibilityLabel={placeholder} placeholder={placeholder} value={value} onChangeText={onChangeText} onSubmitEditing={onSend} returnKeyType="send" maxLength={500} /></View>
      <IconButton label="Enviar" onPress={onSend} disabled={busy || !value.trim()}><Send size={22} color={theme.colors.action} /></IconButton>
    </View>
  </View>
}
