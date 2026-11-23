import { ContextNoteKind, ContextNoteRatingValue as V, ContextNoteStatus as S } from '@prisma/client'
import { ContextNoteTargetType } from '@votz/shared-types'
import {
  RULES,
  accountOldEnough,
  canWriteNotes,
  checkDraft,
  emptyTally,
  evaluateNote,
  helpfulShare,
  isAligned,
  kindAllowedFor,
  normalizeSourceUrl,
} from './context-notes.rules'

const tally = (h: number, s: number, n: number) => ({ ...emptyTally(), HELPFUL: h, SOMEWHAT: s, NOT_HELPFUL: n })

describe('helpfulShare', () => {
  it('é nulo sem avaliação', () => {
    expect(helpfulShare(emptyTally())).toBeNull()
  })
  it('pesa ajuda=1, ajuda um pouco=0,5, não ajuda=0', () => {
    expect(helpfulShare(tally(5, 2, 3))).toBe(0.6) // (5 + 1) / 10
    expect(helpfulShare(tally(0, 0, 4))).toBe(0)
    expect(helpfulShare(tally(4, 0, 0))).toBe(1)
  })
})

describe('evaluateNote', () => {
  it('espera enquanto tem menos avaliações que o mínimo, mesmo com 100% útil', () => {
    expect(evaluateNote({ status: S.NEEDS_RATINGS, ratingsCount: 6, share: 1, badStreak: 0 }).status).toBe(S.NEEDS_RATINGS)
  })
  it('passa a exibir com o mínimo de avaliações e 70% útil', () => {
    expect(evaluateNote({ status: S.NEEDS_RATINGS, ratingsCount: 7, share: 0.7, badStreak: 0 }).status).toBe(S.SHOWN)
  })
  it('não exibe com 69%', () => {
    expect(evaluateNote({ status: S.NEEDS_RATINGS, ratingsCount: 7, share: 0.69, badStreak: 0 }).status).toBe(S.NEEDS_RATINGS)
  })
  it('vira "não exibida" quando é claramente ruim', () => {
    expect(evaluateNote({ status: S.NEEDS_RATINGS, ratingsCount: 8, share: 0.3, badStreak: 0 }).status).toBe(S.NOT_SHOWN)
  })
  it('desiste depois de muitas avaliações sem chegar à régua', () => {
    expect(evaluateNote({ status: S.NEEDS_RATINGS, ratingsCount: RULES.GIVE_UP_AT_RATINGS, share: 0.6, badStreak: 0 }).status).toBe(S.NOT_SHOWN)
  })
  it('"não exibida" volta a aparecer se as novas avaliações chegarem à régua', () => {
    expect(evaluateNote({ status: S.NOT_SHOWN, ratingsCount: 20, share: 0.75, badStreak: 0 }).status).toBe(S.SHOWN)
  })
  it('inércia: nota exibida só sai na segunda rodada ruim seguida', () => {
    const first = evaluateNote({ status: S.SHOWN, ratingsCount: 12, share: 0.5, badStreak: 0 })
    expect(first).toEqual({ status: S.SHOWN, badStreak: 1 })
    const second = evaluateNote({ status: S.SHOWN, ratingsCount: 12, share: 0.5, badStreak: first.badStreak })
    expect(second.status).toBe(S.NOT_SHOWN)
  })
  it('uma rodada boa no meio zera a contagem ruim', () => {
    const bad = evaluateNote({ status: S.SHOWN, ratingsCount: 12, share: 0.5, badStreak: 0 })
    const good = evaluateNote({ status: S.SHOWN, ratingsCount: 12, share: 0.8, badStreak: bad.badStreak })
    expect(good).toEqual({ status: S.SHOWN, badStreak: 0 })
  })
  it('entre 60% e 70% a nota exibida se mantém (histerese)', () => {
    expect(evaluateNote({ status: S.SHOWN, ratingsCount: 12, share: 0.65, badStreak: 0 })).toEqual({ status: S.SHOWN, badStreak: 0 })
  })
  it('nota removida pela moderação nunca volta', () => {
    expect(evaluateNote({ status: S.REMOVED, ratingsCount: 50, share: 1, badStreak: 0 }).status).toBe(S.REMOVED)
  })
})

describe('isAligned', () => {
  it('em nota exibida, acerta quem disse que ajuda (ou ajuda um pouco)', () => {
    expect(isAligned(V.HELPFUL, S.SHOWN)).toBe(true)
    expect(isAligned(V.SOMEWHAT, S.SHOWN)).toBe(true)
    expect(isAligned(V.NOT_HELPFUL, S.SHOWN)).toBe(false)
  })
  it('em nota não exibida, acerta quem disse que não ajuda', () => {
    expect(isAligned(V.NOT_HELPFUL, S.NOT_SHOWN)).toBe(true)
    expect(isAligned(V.HELPFUL, S.NOT_SHOWN)).toBe(false)
  })
})

describe('canWriteNotes', () => {
  const base = { ratingsGiven: 0, ratingsResolved: 0, ratingsAligned: 0, writeGrantedAt: null }
  it('exige o mínimo de avaliações dadas', () => {
    expect(canWriteNotes({ ...base, ratingsGiven: 4 })).toBe(false)
    expect(canWriteNotes({ ...base, ratingsGiven: 5 })).toBe(true)
  })
  it('só cobra coincidência quando há avaliações resolvidas suficientes', () => {
    expect(canWriteNotes({ ...base, ratingsGiven: 10, ratingsResolved: 4, ratingsAligned: 0 })).toBe(true)
    expect(canWriteNotes({ ...base, ratingsGiven: 10, ratingsResolved: 10, ratingsAligned: 5 })).toBe(false)
    expect(canWriteNotes({ ...base, ratingsGiven: 10, ratingsResolved: 10, ratingsAligned: 6 })).toBe(true)
  })
  it('convite da moderação vale sem cumprir a régua', () => {
    expect(canWriteNotes({ ...base, writeGrantedAt: new Date() })).toBe(true)
  })
})

describe('accountOldEnough', () => {
  const now = new Date('2026-11-23T12:00:00Z')
  it('exige 30 dias de conta', () => {
    expect(accountOldEnough(new Date('2026-10-24T12:00:00Z'), now)).toBe(true) // exatamente 30 dias
    expect(accountOldEnough(new Date('2026-10-25T12:00:00Z'), now)).toBe(false) // 29 dias
  })
})

describe('kindAllowedFor', () => {
  it('publicação aceita correção, mas relato não aceita "corrige" (nunca "é falso")', () => {
    expect(kindAllowedFor(ContextNoteTargetType.POST, ContextNoteKind.CORRECTION)).toBe(true)
    expect(kindAllowedFor(ContextNoteTargetType.REPORT, ContextNoteKind.CORRECTION)).toBe(false)
    expect(kindAllowedFor(ContextNoteTargetType.REPORT, ContextNoteKind.MISSING_CONTEXT)).toBe(false)
  })
  it('relato aceita prova, novidade e duplicado', () => {
    for (const kind of [ContextNoteKind.EXTRA_EVIDENCE, ContextNoteKind.UPDATE, ContextNoteKind.DUPLICATE]) {
      expect(kindAllowedFor(ContextNoteTargetType.REPORT, kind)).toBe(true)
      expect(kindAllowedFor(ContextNoteTargetType.POST, kind)).toBe(false)
    }
  })
})

describe('normalizeSourceUrl', () => {
  it('aceita http e https de site de verdade e tira o fragmento', () => {
    expect(normalizeSourceUrl('https://www.exemplo.gov.br/noticia/1#topo')).toBe('https://www.exemplo.gov.br/noticia/1')
    expect(normalizeSourceUrl('http://exemplo.com')).toBe('http://exemplo.com/')
  })
  it.each([
    'ftp://exemplo.com/a',
    'javascript:alert(1)',
    'https://user:senha@exemplo.com',
    'https://localhost/x',
    'https://192.168.0.1/x',
    'https://[::1]/x',
    'https://intranet/x',
    'https://servidor.internal/x',
    'não é link',
    '',
  ])('recusa %s', (raw) => {
    expect(normalizeSourceUrl(raw)).toBeNull()
  })
})

describe('checkDraft', () => {
  const text = 'A obra citada foi entregue em 2024, conforme o diário oficial do município.'
  it('aceita texto com fonte e remove fonte repetida', () => {
    const r = checkDraft(text, ['https://exemplo.com/a', 'https://exemplo.com/a'])
    expect(r.ok).toBe(true)
    expect(r.sources).toEqual(['https://exemplo.com/a'])
  })
  it('exige pelo menos uma fonte', () => {
    expect(checkDraft(text, []).ok).toBe(false)
  })
  it('recusa fonte inválida e texto curto ou longo', () => {
    expect(checkDraft(text, ['isso não é link']).ok).toBe(false)
    expect(checkDraft('curto', ['https://exemplo.com/a']).ok).toBe(false)
    expect(checkDraft('x'.repeat(501), ['https://exemplo.com/a']).ok).toBe(false)
  })
  it('limita a 3 fontes', () => {
    const many = ['a', 'b', 'c', 'd'].map((x) => `https://exemplo.com/${x}`)
    expect(checkDraft(text, many).ok).toBe(false)
  })
})
