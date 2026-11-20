import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button, ErrorText, Heading, Label, State, TabStrip } from '../components/ui'
import { Screen, Toolbar } from '../components/screen'
import { YoutubePlayer, OpenInYoutube } from '../components/youtube-player'
import { ChatPanel, Composer, ParticipantsList, PollPanel, QuestionsPanel, ReactionBar } from '../components/debate-panels'
import { useDebate, useDebateActivePoll, useDebateQuestions, useDebateRoom, useSubmitQuestion, useUpvoteQuestion, useVotePoll } from '../hooks/use-debates'
import { useSession } from '../lib/session'
import { errorMessage } from '../lib/api'
import { STATUS_LABELS, activeStream, countdownLabel, hostLabel } from '../lib/debate-view'
import type { Debate } from '../lib/types'
import { theme } from '../theme'

type PanelTab = 'chat' | 'questions' | 'poll'
const PANEL_TABS: readonly { value: PanelTab; label: string }[] = [
  { value: 'chat', label: 'Chat' }, { value: 'questions', label: 'Perguntas' }, { value: 'poll', label: 'Enquete' },
]
const VIDEO_BOX = { width: '100%', aspectRatio: 16 / 9, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 } as const

function Stage({ debate, watching }: { debate: Debate; watching: string | null }) {
  const stream = activeStream(debate, watching)
  const message = (title: string, detail?: string) => <View style={VIDEO_BOX}>
    <Text style={{ color: theme.colors.surface, fontFamily: theme.fonts.heading, fontSize: 18, textAlign: 'center' }}>{title}</Text>
    {detail ? <Text style={{ color: theme.colors.border, fontFamily: theme.fonts.body, fontSize: 13, textAlign: 'center' }}>{detail}</Text> : null}
  </View>
  // Debates antigos usavam o vídeo do próprio Votz, que só existe na versão web.
  if (debate.streamProvider !== 'YOUTUBE') return message('Este debate passa no site do Votz', 'Abra o Votz no navegador para assistir.')
  if (debate.status === 'SCHEDULED') return message(countdownLabel(debate.scheduledFor), new Date(debate.scheduledFor).toLocaleString('pt-BR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))
  if (debate.status === 'CANCELLED') return message('Debate cancelado')
  if (!stream.videoId) return message('Debate encerrado')
  return <View>
    <YoutubePlayer key={stream.videoId} videoId={stream.videoId} channelTitle={stream.channelTitle} />
    <View style={{ padding: 10 }}><OpenInYoutube videoId={stream.videoId} /></View>
  </View>
}

export default function DebateScreen({ id }: { id: string }) {
  const user = useSession((s) => s.user)
  const debateQuery = useDebate(id)
  const debate = debateQuery.data
  const live = debate?.status === 'LIVE'
  const room = useDebateRoom(id, live)
  const questions = useDebateQuestions(id, live && !user)
  const poll = useDebateActivePoll(id, live && !user)
  const submitQuestion = useSubmitQuestion(id)
  const upvote = useUpvoteQuestion(id)
  const votePoll = useVotePoll(id)

  const [tab, setTab] = useState<PanelTab>('chat')
  const [watching, setWatching] = useState<string | null>(null)
  const [chatText, setChatText] = useState('')
  const [questionText, setQuestionText] = useState('')
  const [voted, setVoted] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')

  if (!debate) {
    return <Screen><Toolbar back title="Debate" />
      <State loading={debateQuery.isPending} title={debateQuery.isPending ? 'Carregando…' : 'Não foi possível abrir o debate'}
        description={debateQuery.isError ? errorMessage(debateQuery.error) : undefined} retry={debateQuery.isError ? () => { void debateQuery.refetch() } : undefined} />
    </Screen>
  }

  const requireUser = (action: () => void) => (user ? action() : router.push('/login'))
  const sendChat = () => requireUser(() => {
    const text = chatText.trim()
    if (!text) return
    if (room.sendMessage(text, debate.chatCooldownSecs)) { setChatText(''); setNotice('') }
    else setNotice(`Espere ${debate.chatCooldownSecs} segundos entre uma mensagem e outra.`)
  })
  const sendQuestion = () => requireUser(() => {
    const text = questionText.trim()
    if (!text) return
    setNotice('')
    submitQuestion.mutate(text, { onSuccess: () => setQuestionText(''), onError: (error) => setNotice(errorMessage(error)) })
  })
  const vote = (optionId: string) => requireUser(() => {
    const current = poll.data
    if (!current || voted[current.id]) return
    setNotice('')
    votePoll.mutate({ pollId: current.id, optionId }, {
      onSuccess: () => setVoted((map) => ({ ...map, [current.id]: optionId })),
      onError: (error) => setNotice(errorMessage(error)),
    })
  })

  const showChatBar = tab === 'chat' && live
  const showQuestionBar = tab === 'questions'
  return <Screen>
    <Toolbar back title="Debate" />
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      <Stage debate={debate} watching={watching} />
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: live ? theme.colors.action : theme.colors.muted, fontFamily: theme.fonts.medium, fontSize: 12 }}>
            {STATUS_LABELS[debate.status].toUpperCase()}{live && room.viewerCount > 0 ? ` · ${room.viewerCount.toLocaleString('pt-BR')} assistindo` : ''}
          </Text>
          <Heading>{debate.title}</Heading>
          <Label muted>Organizado por {hostLabel(debate)}{debate.streamProvider === 'YOUTUBE' && debate.youtubeChannelTitle ? ` · transmissão pelo canal ${debate.youtubeChannelTitle}` : ''}</Label>
          {debate.description ? <Label>{debate.description}</Label> : null}
        </View>
        <ParticipantsList debate={debate} watching={watching} onWatch={setWatching} />
        {debate.streamProvider === 'YOUTUBE' && <Text style={{ color: theme.colors.muted, fontFamily: theme.fonts.body, fontSize: 12, lineHeight: 17 }}>
          Vídeo hospedado no YouTube. O Votz guarda o registro do debate (quem participou, perguntas, enquetes e resultado), mas não controla o vídeo, que pode sair do ar.
        </Text>}
      </View>
      {live && (user ? <ReactionBar onReact={room.sendReaction} flashes={room.flashes} /> : null)}
      <TabStrip tabs={PANEL_TABS} value={tab} onChange={(next) => { setTab(next); setNotice('') }} />
      {tab === 'chat' && <ChatPanel messages={room.messages} />}
      {tab === 'questions' && <QuestionsPanel questions={questions.data ?? []} onUpvote={(questionId) => requireUser(() => upvote.mutate(questionId))} />}
      {tab === 'poll' && <PollPanel poll={poll.data} votedOptionId={poll.data ? voted[poll.data.id] : undefined} onVote={vote} busy={votePoll.isPending} />}
      {tab === 'poll' && <ErrorText message={notice} />}
      {!user && <View style={{ padding: 16 }}><Button title="Entrar para participar" onPress={() => router.push('/login')} /></View>}
    </ScrollView>
    {user && showChatBar && <Composer value={chatText} onChangeText={setChatText} onSend={sendChat} placeholder="Escreva uma mensagem..." error={notice} />}
    {user && showQuestionBar && <Composer value={questionText} onChangeText={setQuestionText} onSend={sendQuestion} placeholder="Faça uma pergunta..." busy={submitQuestion.isPending} error={notice} />}
  </Screen>
}
