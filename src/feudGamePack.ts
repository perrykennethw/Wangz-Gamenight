import type { FeudAnswer, FeudGamePack, FeudQuestion } from './roomTypes.js'

export const MAX_GAME_PACK_BYTES = 256 * 1024
export const MAX_FEUD_QUESTIONS = 30
export const MAX_FEUD_ANSWERS = 8

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
  }
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

  const questions: FeudQuestion[] = rawQuestions.slice(0, MAX_FEUD_QUESTIONS).map((rawQuestion, questionIndex) => {
    const question = isRecord(rawQuestion) ? rawQuestion : {}
    const prompt = cleanText(question.prompt)
    if (!prompt) issues.push(`Question ${questionIndex + 1} needs a prompt.`)
    if (prompt.length > 180) issues.push(`Question ${questionIndex + 1} must be 180 characters or fewer.`)

    const rawAnswers = Array.isArray(question.answers) ? question.answers : []
    if (rawAnswers.length === 0) issues.push(`Question ${questionIndex + 1} needs at least one answer.`)
    if (rawAnswers.length > MAX_FEUD_ANSWERS) issues.push(`Question ${questionIndex + 1} can have at most ${MAX_FEUD_ANSWERS} answers.`)

    const answers: FeudAnswer[] = rawAnswers.slice(0, MAX_FEUD_ANSWERS).map((rawAnswer, answerIndex) => {
      const answer = isRecord(rawAnswer) ? rawAnswer : {}
      const label = cleanText(answer.label)
      const points = typeof answer.points === 'number' ? answer.points : Number.NaN
      if (!label) issues.push(`Question ${questionIndex + 1}, answer ${answerIndex + 1} needs text.`)
      if (label.length > 60) issues.push(`Question ${questionIndex + 1}, answer ${answerIndex + 1} must be 60 characters or fewer.`)
      if (!Number.isInteger(points) || points < 1 || points > 100) {
        issues.push(`Question ${questionIndex + 1}, answer ${answerIndex + 1} needs a whole-number score from 1 to 100.`)
      }
      return {
        id: cleanText(answer.id) || makeId('answer', answerIndex, label),
        label,
        points: Number.isInteger(points) ? points : 0,
      }
    })

    return {
      id: cleanText(question.id) || makeId('question', questionIndex, prompt),
      prompt,
      answers,
    }
  })

  if (issues.length > 0) throw new GamePackError(issues)
  return { version: 1, kind: 'feud', title, questions }
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
      answers: question.answers.map((answer) => ({ ...answer })),
    })),
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
