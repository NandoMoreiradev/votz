import {
  computeNullifierHash,
  generateSurveySaltHex,
  normalizeCpfDigits,
  roundToHourBucket,
  shuffleSurveyOptions,
  surveyAgeBandOf,
} from './surveys.crypto'
import {
  computeAggregatesFromBallots,
  evaluateEligibility,
  filterKAnonymousSegments,
  formatSurveyResultsCsv,
  validateBallotAnswers,
  validateTsePublishLock,
} from './surveys.rules'

describe('Pesquisa Votz: criptografia e anonimização (surveys.crypto)', () => {
  const masterKey = Buffer.from('a'.repeat(64), 'hex')

  it('nullifierHash é determinístico para o mesmo sujeito/pesquisa e isolado entre pesquisas e salts', () => {
    const salt1 = generateSurveySaltHex()
    const salt2 = generateSurveySaltHex()
    expect(salt1).toHaveLength(64)
    expect(salt1).not.toBe(salt2)

    const h1a = computeNullifierHash(masterKey, salt1, 'survey-1', 'cpf:12345678901')
    const h1b = computeNullifierHash(masterKey, salt1, 'survey-1', 'cpf:12345678901')
    const hOtherSurvey = computeNullifierHash(masterKey, salt1, 'survey-2', 'cpf:12345678901')
    const hOtherSalt = computeNullifierHash(masterKey, salt2, 'survey-1', 'cpf:12345678901')

    expect(h1a).toHaveLength(64)
    expect(h1a).toBe(h1b)
    expect(h1a).not.toBe(hOtherSurvey)
    expect(h1a).not.toBe(hOtherSalt)
  })

  it('normalizeCpfDigits remove pontuação e rejeita tamanhos inválidos', () => {
    expect(normalizeCpfDigits('123.456.789-01')).toBe('12345678901')
    expect(normalizeCpfDigits('12345')).toBe('')
    expect(normalizeCpfDigits(null)).toBe('')
  })

  it('roundToHourBucket zera minutos, segundos e milissegundos para prevenir timing attack', () => {
    const bucket = roundToHourBucket(new Date('2026-11-26T14:37:52.981Z'))
    expect(bucket.toISOString()).toBe('2026-11-26T14:00:00.000Z')
  })

  it('shuffleSurveyOptions mantém opções isPinnedBottom sempre no final', () => {
    const options = [
      { id: 'c1', isPinnedBottom: false },
      { id: 'c2', isPinnedBottom: false },
      { id: 'c3', isPinnedBottom: false },
      { id: 'branco', isPinnedBottom: true },
      { id: 'indeciso', isPinnedBottom: true },
    ]
    const result = shuffleSurveyOptions(options, true)
    expect(result).toHaveLength(5)
    expect(result.slice(3).map((o) => o.id)).toEqual(['branco', 'indeciso'])
    expect(new Set(result.slice(0, 3).map((o) => o.id))).toEqual(new Set(['c1', 'c2', 'c3']))
  })

  it('surveyAgeBandOf calcula faixas etárias grosseiras e ignora menores de 16', () => {
    const today = new Date('2026-11-26T12:00:00Z')
    expect(surveyAgeBandOf('2011-01-01', today)).toBeNull()
    expect(surveyAgeBandOf('2010-11-26', today)).toBe('16-24')
    expect(surveyAgeBandOf('1995-05-10', today)).toBe('25-34')
    expect(surveyAgeBandOf('1985-05-10', today)).toBe('35-44')
    expect(surveyAgeBandOf('1970-05-10', today)).toBe('45-59')
    expect(surveyAgeBandOf('1960-05-10', today)).toBe('60+')
  })
})

describe('Pesquisa Votz: elegibilidade, cédula, TSE e k-anonimato (surveys.rules)', () => {
  const now = new Date('2026-11-26T15:00:00Z')
  const baseSurvey = {
    status: 'OPEN' as const,
    scope: 'NATIONAL' as const,
    targetState: null,
    targetCity: null,
    verificationLevel: 'STANDARD' as const,
    minAccountAgeDays: 7,
    distributionMode: 'OPEN' as const,
    startsAt: new Date('2026-11-20T00:00:00Z'),
    endsAt: new Date('2026-12-01T00:00:00Z'),
  }
  const baseUser = {
    emailVerified: true,
    banned: false,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    hasValidCpf: true,
    state: 'SP',
    city: 'São Paulo',
  }

  it('avalia corretamente todos os critérios de elegibilidade', () => {
    expect(evaluateEligibility(baseSurvey, baseUser, false, now)).toEqual({ eligible: true, reason: null })
    expect(evaluateEligibility({ ...baseSurvey, status: 'CLOSED' }, baseUser, false, now)).toEqual({
      eligible: false,
      reason: 'SURVEY_NOT_OPEN',
    })
    expect(evaluateEligibility(baseSurvey, null, false, now)).toEqual({
      eligible: false,
      reason: 'UNAUTHENTICATED',
    })
    expect(evaluateEligibility(baseSurvey, baseUser, true, now)).toEqual({
      eligible: false,
      reason: 'ALREADY_VOTED',
    })
    expect(evaluateEligibility({ ...baseSurvey, distributionMode: 'INVITED_SAMPLE' }, baseUser, false, now, false)).toEqual({
      eligible: false,
      reason: 'INVITE_REQUIRED',
    })
    expect(evaluateEligibility({ ...baseSurvey, distributionMode: 'INVITED_SAMPLE' }, baseUser, false, now, true)).toEqual({
      eligible: true,
      reason: null,
    })
    expect(evaluateEligibility(baseSurvey, { ...baseUser, emailVerified: false }, false, now)).toEqual({
      eligible: false,
      reason: 'EMAIL_NOT_VERIFIED',
    })
    expect(
      evaluateEligibility(baseSurvey, { ...baseUser, createdAt: new Date('2026-11-24T00:00:00Z') }, false, now),
    ).toEqual({ eligible: false, reason: 'ACCOUNT_TOO_NEW' })
    expect(
      evaluateEligibility({ ...baseSurvey, verificationLevel: 'VERIFIED_CPF' }, { ...baseUser, hasValidCpf: false }, false, now),
    ).toEqual({ eligible: false, reason: 'CPF_REQUIRED' })
    expect(
      evaluateEligibility({ ...baseSurvey, scope: 'STATE', targetState: 'RJ' }, baseUser, false, now),
    ).toEqual({ eligible: false, reason: 'OUT_OF_TERRITORY' })
    expect(
      evaluateEligibility(
        { ...baseSurvey, scope: 'MUNICIPAL', targetState: 'SP', targetCity: 'Sao Paulo' },
        baseUser,
        false,
        now,
      ),
    ).toEqual({ eligible: true, reason: null })
  })

  it('valida cédula de respostas (obrigatórias, limite de escolhas, opções válidas)', () => {
    const questions = [
      { id: 'q1', type: 'SINGLE_CHOICE' as const, required: true, maxSelections: 1, optionIds: ['o1', 'o2'] },
      { id: 'q2', type: 'MULTIPLE_CHOICE' as const, required: false, maxSelections: 2, optionIds: ['o3', 'o4', 'o5'] },
    ]

    expect(validateBallotAnswers(questions, { q1: ['o1'], q2: ['o3', 'o5'] })).toEqual({
      ok: true,
      normalized: { q1: ['o1'], q2: ['o3', 'o5'] },
    })
    expect(validateBallotAnswers(questions, {}).ok).toBe(false)
    expect(validateBallotAnswers(questions, { q1: ['o1', 'o2'] }).ok).toBe(false)
    expect(validateBallotAnswers(questions, { q1: ['o1'], q2: ['o3', 'o4', 'o5'] }).ok).toBe(false)
    expect(validateBallotAnswers(questions, { q1: ['invalida'] }).ok).toBe(false)
    expect(validateBallotAnswers(questions, { q1: ['o1'], desconhecida: ['o1'] }).ok).toBe(false)
  })

  it('trava TSE bloqueia publicação eleitoral sem PesqEle/CONRE quando ligada', () => {
    expect(
      validateTsePublishLock({ isElectoral: true, tseRegistrationCode: null, statisticianConre: null }, true).ok,
    ).toBe(false)
    expect(
      validateTsePublishLock(
        { isElectoral: true, tseRegistrationCode: 'BR-01234/2026', statisticianConre: 'CONRE-3 9999' },
        true,
      ).ok,
    ).toBe(true)
    expect(
      validateTsePublishLock({ isElectoral: false, tseRegistrationCode: null, statisticianConre: null }, true).ok,
    ).toBe(true)
    expect(
      validateTsePublishLock({ isElectoral: true, tseRegistrationCode: null, statisticianConre: null }, false).ok,
    ).toBe(true)
  })

  it('calcula agregados e filtra recortes abaixo de k-anonimato e quórum', () => {
    const ballots = Array.from({ length: 35 }, (_, i) => ({
      answersJson: { q1: [i < 25 ? 'o1' : 'o2'] },
      ageBand: i < 30 ? '25-34' : '60+',
      gender: 'FEMALE',
      state: i < 32 ? 'SP' : 'AC',
    }))

    const aggs = computeAggregatesFromBallots(ballots)
    const totals = new Map<string, number>()
    for (const row of aggs) totals.set(row.segmentKey, row.segmentTotal)

    expect(totals.get('ALL')).toBe(35)
    expect(totals.get('STATE:SP')).toBe(32)
    expect(totals.get('STATE:AC')).toBe(3)
    expect(totals.get('AGE:25-34')).toBe(30)
    expect(totals.get('AGE:60+')).toBe(5)

    // Quórum não atingido (100) -> nenhum segmento liberado
    expect(filterKAnonymousSegments(totals, 35, 100, 30)).toEqual([])

    // Quórum atingido (30), k=30 -> libera ALL, STATE:SP, AGE:25-34, GENDER:FEMALE; suprime STATE:AC e AGE:60+
    expect(filterKAnonymousSegments(totals, 35, 30, 30)).toEqual(['ALL', 'AGE:25-34', 'GENDER:FEMALE', 'STATE:SP'])
  })

  it('formatSurveyResultsCsv gera CSV com BOM UTF-8, ponto-e-vírgula e proteção contra formula injection', () => {
    const csv = formatSurveyResultsCsv({
      surveyTitle: '=HYPERLINK("evil")',
      segmentKey: 'ALL',
      totalBallots: 120,
      questions: [
        {
          prompt: 'Em quem votaria?',
          options: [{ label: 'Candidato A', subtitle: 'PT', votesCount: 60, percentage: 50 }],
        },
      ],
    })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(`"'=HYPERLINK(""evil"")";`)
    expect(csv).toContain('50,0')
  })
})
