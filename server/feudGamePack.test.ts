import assert from 'node:assert/strict'
import { GamePackError, normalizeFeudGamePack, parseFeudGamePack } from '../src/feudGamePack.js'
import { starterFeudPack } from '../src/gameData.js'

const normalized = normalizeFeudGamePack(starterFeudPack)
assert.notEqual(normalized, starterFeudPack)
assert.equal(normalized.title, 'Wangz Originals')
assert.equal(normalized.questions.length, 8)
assert.equal(normalized.questions[0].answers[0].points, 34)

const imported = parseFeudGamePack(JSON.stringify(starterFeudPack))
assert.deepEqual(imported, normalized)

const alternateImported = parseFeudGamePack(JSON.stringify({
  settings: { theme: 'default' },
  rounds: [{
    question: 'Name a popular breakfast food.',
    answers: [
      { ans: 'Eggs', pnt: 30 },
      { ans: 'Cereal', pnt: 25 },
    ],
    multiply: 2,
  }],
  final_round: Array.from({ length: 5 }, (_, index) => ({
    question: index === 0
      ? 'Name something people do first thing in the morning.'
      : `Final question ${index + 1}`,
    answers: [['Check their phone', 32]],
  })),
  final_round_timers: [20, 25],
}))
assert.equal(alternateImported.version, 1)
assert.equal(alternateImported.kind, 'feud')
assert.equal(alternateImported.title, 'Imported Family Feud')
assert.equal(alternateImported.questions.length, 1)
assert.equal(alternateImported.questions[0].prompt, 'Name a popular breakfast food.')
assert.deepEqual(
  alternateImported.questions[0].answers.map(({ label, points }) => ({ label, points })),
  [{ label: 'Eggs', points: 30 }, { label: 'Cereal', points: 25 }],
)
assert.match(alternateImported.questions[0].id, /^question-1-/)
assert.equal(alternateImported.fastMoney?.questions.length, 5)
assert.equal(alternateImported.fastMoney?.questions[0].prompt, 'Name something people do first thing in the morning.')
assert.deepEqual(alternateImported.fastMoney?.timers, { first: 20, second: 25 })

assert.throws(
  () => parseFeudGamePack(JSON.stringify({
    settings: { theme: 'default' },
    rounds: [{ question: 'Main question', answers: [{ ans: 'Answer', pnt: 20 }] }],
    final_round: [{ question: 'Only one finale question', answers: [['Answer', 20]] }],
  })),
  (cause) => cause instanceof GamePackError
    && cause.issues.includes('Fast Money needs exactly 5 questions.'),
)

const completeAlternate = parseFeudGamePack(JSON.stringify({
  rounds: [{ question: 'Main question', answers: [{ ans: 'Answer', pnt: 20 }] }],
  final_round: Array.from({ length: 5 }, (_, index) => ({
    question: `Final question ${index + 1}`,
    answers: [['Top answer', 40], ['Second answer', 25]],
  })),
  final_round_timers: [30, 35],
}))
assert.deepEqual(completeAlternate.fastMoney?.timers, { first: 30, second: 35 })
assert.equal(completeAlternate.fastMoney?.questions[4].answers[1].points, 25)
assert.match(completeAlternate.fastMoney?.questions[0].id ?? '', /^fast-money-1-/)

assert.throws(
  () => parseFeudGamePack(JSON.stringify({
    rounds: [{ question: '', answers: [{ ans: '', pnt: 0 }] }],
  })),
  (cause) => cause instanceof GamePackError
    && cause.issues.includes('Question 1 needs a prompt.')
    && cause.issues.includes('Question 1, answer 1 needs text.')
    && cause.issues.includes('Question 1, answer 1 needs a whole-number score from 1 to 100.'),
)

assert.throws(
  () => normalizeFeudGamePack({ ...starterFeudPack, questions: [] }),
  (cause) => cause instanceof GamePackError && cause.issues.includes('Add at least one question.'),
)

assert.throws(
  () => normalizeFeudGamePack({
    ...starterFeudPack,
    questions: [{ ...starterFeudPack.questions[0], answers: [{ id: 'bad', label: '', points: 0 }] }],
  }),
  (cause) => cause instanceof GamePackError && cause.issues.length === 2,
)

assert.throws(
  () => parseFeudGamePack('{ definitely not json'),
  (cause) => cause instanceof GamePackError && cause.message === 'That file is not valid JSON.',
)

console.log('Family Feud canonical and alternate game-pack import validation passed.')
