import assert from 'node:assert/strict'
import type { SpinSolveGameConfig } from '../src/roomTypes.js'
import { applySpinSolveCommand, createSpinSolveGame, viewSpinSolveGame, type SpinSolveDependencies } from './spinSolve.js'

const values = [0, 0, 0]
const dependencies: SpinSolveDependencies = {
  random: () => values.shift() ?? 0,
  now: () => 1_000,
}
const config: SpinSolveGameConfig = {
  kind: 'spin-solve',
  teamOne: 'Comets',
  teamTwo: 'Rockets',
  rounds: 1,
}
const host = { role: 'host' as const, team: null }
const teamTwo = { role: 'player' as const, team: 'two' as const }

let state = createSpinSolveGame(config, dependencies)
assert.equal(state.phase, 'regular')
assert.equal(viewSpinSolveGame(state).maskedPuzzle.includes('KEEP'), false)
assert.equal('puzzle' in viewSpinSolveGame(state), false)

const forbidden = applySpinSolveCommand(state, teamTwo, { type: 'spin' }, dependencies)
assert.equal(forbidden.ok, false)
const forbiddenAward = applySpinSolveCommand(state, teamTwo, { type: 'award-solve' }, dependencies)
assert.equal(forbiddenAward.ok, false)

const spun = applySpinSolveCommand(state, host, { type: 'spin' }, dependencies)
assert.equal(spun.ok, true)
if (!spun.ok) throw new Error('Expected spin to succeed.')
state = spun.state
assert.equal(state.phase, 'choosing-letter')
assert.deepEqual(state.pendingWedge, { kind: 'points', value: 500 })

const guessed = applySpinSolveCommand(state, host, { type: 'guess-letter', letter: 'T' }, dependencies)
assert.equal(guessed.ok, true)
if (!guessed.ok) throw new Error('Expected consonant guess to succeed.')
state = guessed.state
assert.equal(state.roundBanks.one, 1_000)
assert.match(viewSpinSolveGame(state).maskedPuzzle, /T/)

const solved = applySpinSolveCommand(state, host, { type: 'solve', solution: 'keep it under your hat' }, dependencies)
assert.equal(solved.ok, true)
if (!solved.ok) throw new Error('Expected regular solve to succeed.')
state = solved.state
assert.equal(state.phase, 'round-complete')
assert.equal(state.totals.one, 1_000)

const bonus = applySpinSolveCommand(state, host, { type: 'next-round' }, dependencies)
assert.equal(bonus.ok, true)
if (!bonus.ok) throw new Error('Expected bonus round to start.')
state = bonus.state
assert.equal(state.phase, 'bonus-letters')
assert.equal(state.winnerTeam, 'one')

const letters = applySpinSolveCommand(state, host, { type: 'choose-bonus-letters', consonants: 'QCK', vowel: 'I' }, dependencies)
assert.equal(letters.ok, true)
if (!letters.ok) throw new Error('Expected bonus letters to lock.')
state = letters.state
assert.equal(state.phase, 'bonus-solving')
assert.equal(state.bonusDeadline, 11_000)

const finale = applySpinSolveCommand(state, host, { type: 'bonus-solve', solution: 'quick on your feet' }, dependencies)
assert.equal(finale.ok, true)
if (!finale.ok) throw new Error('Expected bonus solve to succeed.')
state = finale.state
assert.equal(state.phase, 'complete')
assert.equal(state.bonusWon, true)
assert.equal(state.totals.one, 6_000)
assert.equal(viewSpinSolveGame(state).maskedPuzzle, 'QUICK ON YOUR FEET')

const undone = applySpinSolveCommand(state, host, { type: 'undo' }, dependencies)
assert.equal(undone.ok, true)
if (!undone.ok) throw new Error('Expected undo to succeed.')
assert.equal(undone.state.phase, 'bonus-solving')
assert.equal(undone.state.totals.one, 1_000)

console.log('Spin & Solve state transitions and redaction passed.')
