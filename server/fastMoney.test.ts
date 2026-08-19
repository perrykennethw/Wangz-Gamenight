import assert from 'node:assert/strict'
import { starterFeudPack } from '../src/gameData.js'
import type { FastMoneyCommand, Participant } from '../src/roomTypes.js'
import {
  applyFastMoneyCommand,
  createFastMoneyState,
  expireFastMoney,
  viewFastMoney,
  type FastMoneyActor,
  type FastMoneyState,
} from './fastMoney.js'

const pack = starterFeudPack.fastMoney
assert.ok(pack)

const participants: Participant[] = [
  { id: 'p1', name: 'Avery', avatarId: 'Avery.svg', team: 'one' },
  { id: 'p2', name: 'Blake', avatarId: 'Blake.svg', team: 'one' },
  { id: 'bench', name: 'Casey', avatarId: null, team: 'one' },
  { id: 'opponent', name: 'Devon', avatarId: null, team: 'two' },
]
const host: FastMoneyActor = { role: 'host', participantId: null, team: null }
const player = (participantId: string): FastMoneyActor => ({
  role: 'player',
  participantId,
  team: participants.find((participant) => participant.id === participantId)?.team ?? null,
})

let state = createFastMoneyState('one')
const run = (actor: FastMoneyActor, command: Exclude<FastMoneyCommand, { type: 'start' }>, now = 1_000) => {
  const result = applyFastMoneyCommand(state, pack, participants, actor, command, now)
  if (!result.ok) throw new Error(result.error)
  state = result.state
  return state
}
const rejects = (actor: FastMoneyActor, command: Exclude<FastMoneyCommand, { type: 'start' }>, pattern: RegExp) => {
  const result = applyFastMoneyCommand(state, pack, participants, actor, command, 1_000)
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, pattern)
}

rejects(player('opponent'), { type: 'vote', participantIds: ['p1', 'p2'] }, /winning team/i)
run(player('p1'), { type: 'vote', participantIds: ['p1', 'p2'] })
run(player('p2'), { type: 'vote', participantIds: ['p2', 'bench'] })
const selectionView = viewFastMoney(state, pack, participants, host)
assert.deepEqual(selectionView.voteCounts, { p1: 1, p2: 2, bench: 1 })

run(host, { type: 'set-lineup', contestantIds: ['p1', 'p2'] })
run(host, { type: 'confirm-lineup' })
assert.equal(state.phase, 'ready-one')
run(host, { type: 'replace-contestant', contestant: 0, participantId: 'bench' })
assert.equal(state.lineup[0], 'bench')
run(host, { type: 'replace-contestant', contestant: 0, participantId: 'p1' })
rejects(player('p1'), { type: 'start-attempt' }, /only the host/i)
run(host, { type: 'start-attempt' }, 10_000)
assert.equal(state.timer.deadline, 30_000)
run(host, { type: 'pause-timer' }, 11_000)
rejects(player('p1'), { type: 'submit', answer: 'Phone' }, /resume the clock/i)
rejects(player('p1'), { type: 'pass' }, /resume the clock/i)
run(host, { type: 'resume-timer' }, 12_000)

const isolated = viewFastMoney(state, pack, participants, player('p2'))
assert.equal(isolated.isIsolated, true)
assert.equal(isolated.questions.every((question) => question.prompt === null), true)
assert.equal(JSON.stringify(isolated).includes('Check their phone'), false)
assert.equal(isolated.questions.every((question) => question.answerOptions === null), true)

const activeOne = viewFastMoney(state, pack, participants, player('p1'))
assert.equal(activeOne.currentQuestionIndex, 0)
assert.equal(activeOne.questions[0].prompt, pack.questions[0].prompt)
assert.equal(activeOne.questions[1].prompt, null)
assert.ok(viewFastMoney(state, pack, participants, host).questions[0].answerOptions)

for (const question of pack.questions) {
  run(player('p1'), { type: 'submit', answer: question.answers[0].label })
}
assert.equal(state.phase, 'review-one')
run(host, { type: 'lock-review' })
assert.equal(state.phase, 'ready-two')
const beforeTwo = viewFastMoney(state, pack, participants, player('p2'))
assert.equal(beforeTwo.questions.every((question) => question.responses[0].text === null), true)
assert.deepEqual(beforeTwo.subtotals, [null, null])

run(host, { type: 'start-attempt' }, 40_000)
assert.equal(state.timer.deadline, 65_000)
rejects(player('p2'), { type: 'submit', answer: 'Phone' }, /repeat answer/i)
assert.equal(state.attempts[1].queue[0], 0)

for (const question of pack.questions) {
  run(player('p2'), { type: 'submit', answer: question.answers[1].label })
}
assert.equal(state.phase, 'review-two')
run(host, {
  type: 'score-response',
  contestant: 1,
  questionIndex: 2,
  text: pack.questions[2].answers[0].label,
  answerId: pack.questions[2].answers[0].id,
  repeated: false,
})
assert.equal(state.attempts[1].responses[2]?.repeated, true)
assert.equal(state.attempts[1].responses[2]?.points, 0)
run(host, { type: 'lock-review' })
assert.equal(state.phase, 'reveal')

run(host, { type: 'reveal-next' })
const publicReveal = viewFastMoney(state, pack, participants, player('opponent'))
assert.equal(publicReveal.questions[0].revealed, true)
assert.equal(publicReveal.questions[1].revealed, false)
assert.equal(publicReveal.questions[0].responses[0].text, pack.questions[0].answers[0].label)
assert.equal(publicReveal.questions[1].responses[0].text, null)

for (let index = 1; index < 5; index++) run(host, { type: 'reveal-next' })
assert.equal(state.phase, 'complete')
const completed = viewFastMoney(state, pack, participants, player('opponent'))
assert.equal(completed.outcome, completed.combinedScore >= 200 ? 'win' : 'short')
assert.equal(completed.questions.every((question) => question.revealed), true)
assert.deepEqual(completed.subtotals, [
  state.attempts[0].responses.reduce((total, response) => total + (response?.points ?? 0), 0),
  state.attempts[1].responses.reduce((total, response) => total + (response?.points ?? 0), 0),
])

let expiringState: FastMoneyState = createFastMoneyState('one')
const advance = (command: Exclude<FastMoneyCommand, { type: 'start' }>, now = 0) => {
  const result = applyFastMoneyCommand(expiringState, pack, participants, host, command, now)
  assert.equal(result.ok, true)
  if (result.ok) expiringState = result.state
}
advance({ type: 'set-lineup', contestantIds: ['p1', 'p2'] })
advance({ type: 'confirm-lineup' })
advance({ type: 'start-attempt' }, 5_000)
const unchanged = expireFastMoney(expiringState, 24_999)
assert.equal(unchanged, expiringState)
expiringState = expireFastMoney(expiringState, 25_000)
assert.equal(expiringState.phase, 'review-one')
assert.equal(expiringState.timer.status, 'idle')

console.log('Fast Money transitions, timers, repeat handling, scoring, reveal, and viewer redaction passed.')
