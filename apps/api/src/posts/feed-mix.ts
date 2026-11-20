import {
  rerankCandidatesForViewer,
  type RankableCandidate,
  type ViewerRankingContext,
} from './feed-ranking.service'

/**
 * Mistura do feed "Para você". Fica só aqui: web e mobile só desenham o que vem do servidor.
 * Os números abaixo são ponto de partida e podem ser ajustados sem mexer na lógica.
 */
export const FOR_YOU_MIX = {
  /** Tamanho do bloco: as proporções valem a cada N itens. */
  WINDOW: 10,
  /** Quem segue menos contas que isto é tratado como "poucos seguidos". */
  FEW_FOLLOWS_BELOW: 5,
  /** Itens por bloco: de quem a pessoa segue / da cidade ou estado dela / descoberta. */
  NORMAL: { circle: 5, local: 3, discovery: 2 },
  FEW_FOLLOWS: { circle: 2, local: 4, discovery: 4 },
  /** Anti-monopólio: o mesmo autor aparece no máximo isto vezes a cada bloco. */
  MAX_PER_AUTHOR_IN_WINDOW: 2,
  /** O cartão de perfis sugeridos entra depois deste item (quem segue poucas contas). */
  SUGGESTIONS_AFTER: 3,
  /** Textos que o cidadão lê no card de descoberta. */
  REASON_CITY: 'Em alta na sua cidade',
  REASON_SUGGESTED: 'Sugerido para você',
} as const

export interface MixCandidate extends RankableCandidate {
  /** Conta verificada ou e-mail confirmado, e sem denúncia aberta: só esse conteúdo vira descoberta. */
  authorTrusted: boolean
}

export interface MixedItem<T> {
  post: T
  /** Preenchido só em itens de descoberta. */
  reason: string | null
}

type Slot = 'circle' | 'local' | 'discovery'

export function countFollowedAccounts(viewer: ViewerRankingContext): number {
  return viewer.followedUserIds.size + viewer.followedPoliticianIds.size + viewer.followedEntityIds.size
}

export function hasFewFollows(viewer: ViewerRankingContext): boolean {
  return countFollowedAccounts(viewer) < FOR_YOU_MIX.FEW_FOLLOWS_BELOW
}

function authorKeyOf(post: RankableCandidate): string {
  return post.authorOrgType && post.authorOrgId ? `${post.authorOrgType}:${post.authorOrgId}` : `USER:${post.authorUserId}`
}

function isCircle(post: RankableCandidate, viewer: ViewerRankingContext): boolean {
  if (viewer.userId && post.authorUserId === viewer.userId) return true
  if (viewer.followedUserIds.has(post.authorUserId)) return true
  if (post.authorOrgType === 'POLITICIAN' && post.authorOrgId && viewer.followedPoliticianIds.has(post.authorOrgId)) return true
  if (post.authorOrgType === 'ENTITY' && post.authorOrgId && viewer.followedEntityIds.has(post.authorOrgId)) return true
  return post.topicIds.some((id) => viewer.followedTopicIds.has(id))
}

function sameCity(post: RankableCandidate, viewer: ViewerRankingContext): boolean {
  return !!viewer.cityKey && !!post.cityKey && viewer.cityKey === post.cityKey
}

function isLocal(post: RankableCandidate, viewer: ViewerRankingContext): boolean {
  return sameCity(post, viewer) || (!!viewer.state && !!post.state && viewer.state === post.state)
}

/** Ordem das vagas de um bloco: descoberta espalhada (nunca duas coladas), o resto alternando círculo e local. */
export function planWindow(shares: { circle: number; local: number; discovery: number }, size: number = FOR_YOU_MIX.WINDOW): Slot[] {
  const total = shares.circle + shares.local + shares.discovery
  const discovery = Math.min(Math.round((shares.discovery / total) * size), Math.floor((size + 1) / 2))
  const slots: (Slot | null)[] = Array(size).fill(null)
  for (let i = 0; i < discovery; i++) slots[Math.floor(((i + 0.5) * size) / discovery)] = 'discovery'
  const rest = slots.filter((slot) => slot === null).length
  const local = Math.round((shares.local / (shares.circle + shares.local)) * rest)
  let acc = 0.5
  for (let i = 0; i < size; i++) {
    if (slots[i]) continue
    acc += local / rest
    if (acc >= 1) { slots[i] = 'local'; acc -= 1 } else slots[i] = 'circle'
  }
  return slots as Slot[]
}

const FALLBACK: Record<Slot, Slot[]> = {
  circle: ['circle', 'local', 'discovery'],
  local: ['local', 'circle', 'discovery'],
  discovery: ['discovery', 'local', 'circle'],
}

/**
 * Monta a lista completa já misturada (a paginação fatia depois).
 * Regras: proporção por bloco, descoberta só de conteúdo confiável e nunca duas seguidas
 * (só quebra se não sobrou mais nada de círculo ou local), e no máximo MAX_PER_AUTHOR_IN_WINDOW por autor a cada bloco.
 */
export function mixForYouFeed<T extends MixCandidate>(candidates: T[], viewer: ViewerRankingContext): MixedItem<T>[] {
  const ranked = rerankCandidatesForViewer(candidates, viewer)
  const pools: Record<Slot, T[]> = {
    circle: ranked.filter((post) => isCircle(post, viewer)),
    local: ranked.filter((post) => !isCircle(post, viewer) && isLocal(post, viewer)),
    discovery: candidates
      .filter((post) => !isCircle(post, viewer) && post.authorTrusted)
      .sort((a, b) => b.hotScore - a.hotScore || b.createdAt.getTime() - a.createdAt.getTime()),
  }
  const used = new Set<string>()
  const out: MixedItem<T>[] = []
  const shares = hasFewFollows(viewer) ? FOR_YOU_MIX.FEW_FOLLOWS : FOR_YOU_MIX.NORMAL
  const plan = planWindow(shares)
  const remaining = (slot: Slot) => pools[slot].some((post) => !used.has(post.id))

  const authorCount = (key: string) => {
    let n = 0
    for (const item of out.slice(-(FOR_YOU_MIX.WINDOW - 1))) if (authorKeyOf(item.post) === key) n++
    return n
  }
  const take = (slot: Slot, relaxAuthor: boolean): MixedItem<T> | null => {
    if (slot === 'discovery' && out.length > 0 && out[out.length - 1].reason !== null && (remaining('circle') || remaining('local'))) return null
    const post = pools[slot].find((p) => !used.has(p.id) && (relaxAuthor || authorCount(authorKeyOf(p)) < FOR_YOU_MIX.MAX_PER_AUTHOR_IN_WINDOW))
    if (!post) return null
    used.add(post.id)
    return { post, reason: slot === 'discovery' ? (sameCity(post, viewer) ? FOR_YOU_MIX.REASON_CITY : FOR_YOU_MIX.REASON_SUGGESTED) : null }
  }

  const total = new Set(candidates.map((c) => c.id)).size
  for (let i = 0; used.size < total; i++) {
    const slot = plan[i % plan.length]
    let picked: MixedItem<T> | null = null
    for (const relax of [false, true]) {
      for (const source of FALLBACK[slot]) {
        picked = take(source, relax)
        if (picked) break
      }
      if (picked) break
    }
    // Só sobraram posts que não podem entrar (ex.: conteúdo sem confiança fora do círculo): fim da lista.
    if (!picked) break
    out.push(picked)
  }
  return out
}
