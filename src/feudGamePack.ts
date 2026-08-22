import type { FeudAnswer, FeudFastMoneyPack, FeudGamePack, FeudQuestion } from './roomTypes.js'

export const MAX_GAME_PACK_BYTES = 256 * 1024
export const MAX_FEUD_QUESTIONS = 30
export const MAX_FEUD_ANSWERS = 8
export const FAST_MONEY_QUESTION_COUNT = 5
export const DEFAULT_FAST_MONEY_TIMERS = { first: 35, second: 40 } as const

export class GamePackError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues[0] ?? 'This game pack is not valid.')
    this.name = 'GamePackError'
    this.issues = issues
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const cleanText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const makeId = (prefix: string, index: number, value: string) => {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return `${prefix}-${index + 1}-${slug || 'item'}`
}

function adaptImportedFeudGamePack(value: unknown): unknown {
  if (!isRecord(value) || Array.isArray(value.questions) || !Array.isArray(value.rounds)) return value

  const rawFinalRound = Array.isArray(value.final_round) ? value.final_round : []
  const rawTimers = Array.isArray(value.final_round_timers) ? value.final_round_timers : []
  return {
    version: 1,
    kind: 'feud',
    title: cleanText(value.title) || 'Imported Family Feud',
    questions: value.rounds.map((rawRound) => {
      const round = isRecord(rawRound) ? rawRound : {}
      const rawAnswers = Array.isArray(round.answers) ? round.answers : []
      return {
        id: round.id,
        prompt: round.question,
        answers: rawAnswers.map((rawAnswer) => {
          const answer = isRecord(rawAnswer) ? rawAnswer : {}
          return {
            id: answer.id,
            label: typeof answer.ans === 'string' ? answer.ans : answer.label,
            points: typeof answer.pnt === 'number' ? answer.pnt : answer.points,
          }
        }),
      }
    }),
    ...(rawFinalRound.length > 0 ? {
      fastMoney: {
        questions: rawFinalRound.map((rawQuestion) => {
          const question = isRecord(rawQuestion) ? rawQuestion : {}
          const rawAnswers = Array.isArray(question.answers) ? question.answers : []
          return {
            id: question.id,
            prompt: question.question,
            answers: rawAnswers.map((rawAnswer) => {
              if (Array.isArray(rawAnswer)) {
                return { label: rawAnswer[0], points: rawAnswer[1] }
              }
              const answer = isRecord(rawAnswer) ? rawAnswer : {}
              return {
                id: answer.id,
                label: typeof answer.ans === 'string' ? answer.ans : answer.label,
                points: typeof answer.pnt === 'number' ? answer.pnt : answer.points,
                aliases: answer.aliases,
              }
            }),
          }
        }),
        timers: {
          first: rawTimers[0] ?? DEFAULT_FAST_MONEY_TIMERS.first,
          second: rawTimers[1] ?? DEFAULT_FAST_MONEY_TIMERS.second,
        },
      },
    } : {}),
  }
}

function normalizeQuestions(
  value: unknown,
  issues: string[],
  section: 'Question' | 'Fast Money question',
  maximum: number,
): FeudQuestion[] {
  const rawQuestions = Array.isArray(value) ? value : []
  const questions: FeudQuestion[] = rawQuestions.slice(0, maximum).map((rawQuestion, questionIndex) => {
    const question = isRecord(rawQuestion) ? rawQuestion : {}
    const prompt = cleanText(question.prompt)
    if (!prompt) issues.push(`${section} ${questionIndex + 1} needs a prompt.`)
    if (prompt.length > 180) issues.push(`${section} ${questionIndex + 1} must be 180 characters or fewer.`)

    const rawAnswers = Array.isArray(question.answers) ? question.answers : []
    if (rawAnswers.length === 0) issues.push(`${section} ${questionIndex + 1} needs at least one answer.`)
    if (rawAnswers.length > MAX_FEUD_ANSWERS) issues.push(`${section} ${questionIndex + 1} can have at most ${MAX_FEUD_ANSWERS} answers.`)

    const normalizedAliases = new Set<string>()
    const answers: FeudAnswer[] = rawAnswers.slice(0, MAX_FEUD_ANSWERS).map((rawAnswer, answerIndex) => {
      const answer = isRecord(rawAnswer) ? rawAnswer : {}
      const label = cleanText(answer.label)
      const points = typeof answer.points === 'number' ? answer.points : Number.NaN
      if (!label) issues.push(`${section} ${questionIndex + 1}, answer ${answerIndex + 1} needs text.`)
      if (label.length > 60) issues.push(`${section} ${questionIndex + 1}, answer ${answerIndex + 1} must be 60 characters or fewer.`)
      if (!Number.isInteger(points) || points < 1 || points > 100) {
        issues.push(`${section} ${questionIndex + 1}, answer ${answerIndex + 1} needs a whole-number score from 1 to 100.`)
      }
      const aliases = Array.isArray(answer.aliases)
        ? answer.aliases.map(cleanText).filter(Boolean).slice(0, 12)
        : []
      for (const candidate of [label, ...aliases]) {
        const normalized = candidate.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        if (normalized && normalizedAliases.has(normalized)) {
          issues.push(`${section} ${questionIndex + 1} uses the answer or alias “${candidate}” more than once.`)
        }
        if (normalized) normalizedAliases.add(normalized)
      }
      return {
        id: cleanText(answer.id) || makeId('answer', answerIndex, label),
        label,
        points: Number.isInteger(points) ? points : 0,
        ...(aliases.length > 0 ? { aliases } : {}),
      }
    }).sort((left, right) => right.points - left.points)

    return {
      id: cleanText(question.id) || makeId(section === 'Question' ? 'question' : 'fast-money', questionIndex, prompt),
      prompt,
      answers,
    }
  })

  return questions
}

export function normalizeFeudGamePack(value: unknown): FeudGamePack {
  const issues: string[] = []
  if (!isRecord(value)) throw new GamePackError(['The file must contain a game-pack object.'])

  if (value.version !== 1) issues.push('Use game-pack version 1.')
  if (value.kind !== 'feud') issues.push('This file is not a Family Feud game pack.')

  const title = cleanText(value.title)
  if (!title) issues.push('Give the game pack a title.')
  if (title.length > 60) issues.push('Keep the game-pack title to 60 characters or fewer.')

  const rawQuestions = Array.isArray(value.questions) ? value.questions : []
  if (rawQuestions.length === 0) issues.push('Add at least one question.')
  if (rawQuestions.length > MAX_FEUD_QUESTIONS) issues.push(`Use no more than ${MAX_FEUD_QUESTIONS} questions.`)

  const questions = normalizeQuestions(rawQuestions, issues, 'Question', MAX_FEUD_QUESTIONS)

  let fastMoney: FeudFastMoneyPack | undefined
  if (value.fastMoney !== undefined) {
    if (!isRecord(value.fastMoney)) {
      issues.push('Fast Money must be a game-pack object.')
    } else {
      const rawFastMoneyQuestions = Array.isArray(value.fastMoney.questions) ? value.fastMoney.questions : []
      if (rawFastMoneyQuestions.length !== FAST_MONEY_QUESTION_COUNT) {
        issues.push(`Fast Money needs exactly ${FAST_MONEY_QUESTION_COUNT} questions.`)
      }
      const timerValue = isRecord(value.fastMoney.timers) ? value.fastMoney.timers : {}
      const first = typeof timerValue.first === 'number' ? timerValue.first : DEFAULT_FAST_MONEY_TIMERS.first
      const second = typeof timerValue.second === 'number' ? timerValue.second : DEFAULT_FAST_MONEY_TIMERS.second
      if (!Number.isInteger(first) || first < 10 || first > 90) issues.push('Fast Money’s first timer must be 10 to 90 seconds.')
      if (!Number.isInteger(second) || second < 10 || second > 90) issues.push('Fast Money’s second timer must be 10 to 90 seconds.')
      fastMoney = {
        questions: normalizeQuestions(rawFastMoneyQuestions, issues, 'Fast Money question', FAST_MONEY_QUESTION_COUNT),
        timers: { first, second },
      }
    }
  }

  if (issues.length > 0) throw new GamePackError(issues)
  return { version: 1, kind: 'feud', title, questions, ...(fastMoney ? { fastMoney } : {}) }
}

export function parseFeudGamePack(text: string): FeudGamePack {
  if (new TextEncoder().encode(text).byteLength > MAX_GAME_PACK_BYTES) {
    throw new GamePackError(['Keep game-pack files under 256 KB.'])
  }

  try {
    return normalizeFeudGamePack(adaptImportedFeudGamePack(JSON.parse(text)))
  } catch (cause) {
    if (cause instanceof GamePackError) throw cause
    throw new GamePackError(['That file is not valid JSON.'])
  }
}

export function cloneFeudGamePack(pack: FeudGamePack): FeudGamePack {
  return {
    ...pack,
    questions: pack.questions.map((question) => ({
      ...question,
      answers: question.answers.map((answer) => ({
        ...answer,
        ...(answer.aliases ? { aliases: [...answer.aliases] } : {}),
      })),
    })),
    ...(pack.fastMoney ? {
      fastMoney: {
        timers: { ...pack.fastMoney.timers },
        questions: pack.fastMoney.questions.map((question) => ({
          ...question,
          answers: question.answers.map((answer) => ({
            ...answer,
            ...(answer.aliases ? { aliases: [...answer.aliases] } : {}),
          })),
        })),
      },
    } : {}),
  }
}

export function createBlankFeudGamePack(): FeudGamePack {
  return {
    version: 1,
    kind: 'feud',
    title: 'My Game Night',
    questions: [{
      id: crypto.randomUUID(),
      prompt: '',
      answers: [
        { id: crypto.randomUUID(), label: '', points: 40 },
        { id: crypto.randomUUID(), label: '', points: 25 },
      ],
    }],
  }
}
