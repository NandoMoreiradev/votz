import { create } from 'zustand'
import { Debate, DebateMessage, DebatePoll, DebateQuestion, ReactionType } from '../types/api'

export interface ReactionBurst {
  id: string
  type: ReactionType
  x: number
}

interface DebateStore {
  debate: Debate | null
  setDebate: (d: Debate) => void
  updateDebateStatus: (status: Debate['status'], extra?: Partial<Debate>) => void

  playerReady: boolean
  setPlayerReady: (v: boolean) => void

  viewerCount: number
  setViewerCount: (n: number) => void

  reactionBursts: ReactionBurst[]
  addReactionBurst: (type: ReactionType) => void
  removeReactionBurst: (id: string) => void

  messages: DebateMessage[]
  addMessage: (msg: DebateMessage) => void

  questions: DebateQuestion[]
  setQuestions: (qs: DebateQuestion[]) => void
  upvoteQuestionOptimistic: (id: string) => void

  activePoll: DebatePoll | null
  setActivePoll: (p: DebatePoll | null) => void
  updatePollResult: (poll: DebatePoll) => void

  chatCooldownUntil: number
  setChatCooldownUntil: (ts: number) => void

  reset: () => void
}

const initialState = {
  debate: null,
  playerReady: false,
  viewerCount: 0,
  reactionBursts: [],
  messages: [],
  questions: [],
  activePoll: null,
  chatCooldownUntil: 0,
}

export const useDebateStore = create<DebateStore>((set) => ({
  ...initialState,

  setDebate: (debate) => set({ debate }),

  updateDebateStatus: (status, extra = {}) =>
    set((s) => ({ debate: s.debate ? { ...s.debate, status, ...extra } : null })),

  setPlayerReady: (playerReady) => set({ playerReady }),

  setViewerCount: (viewerCount) => set({ viewerCount }),

  addReactionBurst: (type) => {
    const burst: ReactionBurst = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      x: Math.random() * 80 + 10,
    }
    set((s) => ({ reactionBursts: [...s.reactionBursts, burst] }))
    setTimeout(() => {
      set((s) => ({ reactionBursts: s.reactionBursts.filter((b) => b.id !== burst.id) }))
    }, 2500)
  },

  removeReactionBurst: (id) =>
    set((s) => ({ reactionBursts: s.reactionBursts.filter((b) => b.id !== id) })),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages.slice(-199), msg] })),

  setQuestions: (questions) => set({ questions }),

  upvoteQuestionOptimistic: (id) =>
    set((s) => ({
      questions: s.questions.map((q) => (q.id === id ? { ...q, upvotes: q.upvotes + 1 } : q)),
    })),

  setActivePoll: (activePoll) => set({ activePoll }),

  updatePollResult: (poll) =>
    set((s) => ({ activePoll: s.activePoll?.id === poll.id ? poll : s.activePoll })),

  setChatCooldownUntil: (chatCooldownUntil) => set({ chatCooldownUntil }),

  reset: () => set(initialState),
}))
