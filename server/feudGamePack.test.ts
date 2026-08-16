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

console.log('Family Feud game-pack normalization, import, and validation passed.')
