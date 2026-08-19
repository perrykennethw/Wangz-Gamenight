import type {
  SpinSolveCommand,
  SpinSolveGameConfig,
  SpinSolvePhase,
  SpinSolveView,
  TeamId,
  WheelSegment,
} from '../src/roomTypes.js'
import { bonusPuzzles, regularPuzzles, type SpinSolvePuzzle } from './spinSolveData.js'

export interface GameActor {
  role: 'host' | 'player'
  team: TeamId | null
}

export interface SpinSolveDependencies {
  random: () => number
  now: () => number
}

interface SpinSolveCoreState {
  kind: 'spin-solve'
  phase: SpinSolvePhase
  round: number
  totalRounds: number
  puzzle: SpinSolvePuzzle
  revealedLetters: string[]
  usedLetters: string[]
  activeTeam: TeamId
  roundBanks: Record<TeamId, number>
  totals: Record<TeamId, number>
  wheelIndex: number | null
  spinId: number
  pendingWedge: WheelSegment | null
  message: string
  winnerTeam: TeamId | null
  bonusDeadline: number | null
  bonusWon: boolean | null
  regularPuzzleIds: string[]
}

export interface SpinSolveState extends SpinSolveCoreState {
  history: SpinSolveCoreState[]
}

export type GameCommandResult =
  | { ok: true; state: SpinSolveState }
  | { ok: false; error: string }

export const wheelSegments: readonly WheelSegment[] = [
  { kind: 'points', value: 500 }, { kind: 'points', value: 350 }, { kind: 'bankrupt' },
  { kind: 'points', value: 600 }, { kind: 'points', value: 400 }, { kind: 'points', value: 700 },
  { kind: 'lose-turn' }, { kind: 'points', value: 450 }, { kind: 'points', value: 800 },
  { kind: 'points', value: 300 }, { kind: 'points', value: 550 }, { kind: 'points', value: 650 },
  { kind: 'points', value: 400 }, { kind: 'bankrupt' }, { kind: 'points', value: 500 },
  { kind: 'points', value: 350 }, { kind: 'points', value: 700 }, { kind: 'points', value: 450 },
  { kind: 'points', value: 600 }, { kind: 'points', value: 300 }, { kind: 'lose-turn' },
  { kind: 'points', value: 800 }, { kind: 'points', value: 500 }, { kind: 'points', value: 650 },
]

const vowels = new Set(['A', 'E', 'I', 'O', 'U'])
const bonusBaseLetters = ['R', 'S', 'T', 'L', 'N', 'E']
const otherTeam = (team: TeamId): TeamId => team === 'one' ? 'two' : 'one'
const normalizeSolution = (value: string): string => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')

const cloneCore = (state: SpinSolveCoreState): SpinSolveCoreState => ({
  ...state,
  puzzle: { ...state.puzzle },
  revealedLetters: [...state.revealedLetters],
  usedLetters: [...state.usedLetters],
  roundBanks: { ...state.roundBanks },
  totals: { ...state.totals },
  pendingWedge: state.pendingWedge ? { ...state.pendingWedge } : null,
  regularPuzzleIds: [...state.regularPuzzleIds],
})

function pickPuzzle(pool: readonly SpinSolvePuzzle[], random: () => number, excluded: readonly string[] = []): SpinSolvePuzzle {
  const available = pool.filter((puzzle) => !excluded.includes(puzzle.id))
  const choices = available.length > 0 ? available : pool
  return choices[Math.floor(random() * choices.length)]
}

const countLetter = (solution: string, letter: string): number => [...solution].filter((character) => character === letter).length

function allConsonantsRevealed(state: SpinSolveCoreState): boolean {
  return [...new Set(state.puzzle.solution.match(/[A-Z]/g) ?? [])]
    .filter((letter) => !vowels.has(letter))
    .every((letter) => state.revealedLetters.includes(letter))
}

function canAct(state: SpinSolveState, actor: GameActor, bonus = false): boolean {
  if (actor.role === 'host') return true
  return actor.team === (bonus ? state.winnerTeam : state.activeTeam)
}

function saveHistory(state: SpinSolveState): SpinSolveState {
  const { history: _history, ...core } = state
  return { ...state, history: [...state.history.slice(-19), cloneCore(core)] }
}

function maskPuzzle(state: SpinSolveCoreState): string {
  const showAll = state.phase === 'round-complete' || state.phase === 'complete'
  return [...state.puzzle.solution].map((character) => {
    if (!/[A-Z]/.test(character)) return character
    return showAll || state.revealedLetters.includes(character) ? character : '_'
  }).join('')
}

export function createSpinSolveGame(config: SpinSolveGameConfig, dependencies: SpinSolveDependencies): SpinSolveState {
  const puzzle = pickPuzzle(regularPuzzles, dependencies.random)
  return {
    kind: 'spin-solve', phase: 'regular', round: 1, totalRounds: config.rounds, puzzle,
    revealedLetters: [], usedLetters: [], activeTeam: 'one',
    roundBanks: { one: 0, two: 0 }, totals: { one: 0, two: 0 },
    wheelIndex: null, spinId: 0, pendingWedge: null,
    message: 'Team one starts. Spin, buy a vowel, or solve.',
    winnerTeam: null, bonusDeadline: null, bonusWon: null,
    regularPuzzleIds: [puzzle.id], history: [],
  }
}

export function applySpinSolveCommand(
  current: SpinSolveState,
  actor: GameActor,
  command: SpinSolveCommand,
  dependencies: SpinSolveDependencies,
): GameCommandResult {
  if (command.type === 'undo') {
    if (actor.role !== 'host') return { ok: false, error: 'Only the host can undo a move.' }
    const previous = current.history.at(-1)
    if (!previous) return { ok: false, error: 'There is nothing to undo yet.' }
    return { ok: true, state: { ...cloneCore(previous), history: current.history.slice(0, -1) } }
  }

  let state = saveHistory(current)

  if (command.type === 'spin') {
    if (state.phase !== 'regular') return { ok: false, error: 'The wheel is not available right now.' }
    if (!canAct(state, actor)) return { ok: false, error: 'Wait for your team’s turn.' }
    if (allConsonantsRevealed(state)) return { ok: false, error: 'Only vowels remain. Buy a vowel or solve.' }
    const wheelIndex = Math.floor(dependencies.random() * wheelSegments.length)
    const wedge = wheelSegments[wheelIndex]
    state = { ...state, wheelIndex, spinId: state.spinId + 1, pendingWedge: wedge }
    if (wedge.kind === 'bankrupt') {
      state = {
        ...state, phase: 'regular', roundBanks: { ...state.roundBanks, [state.activeTeam]: 0 },
        activeTeam: otherTeam(state.activeTeam), message: 'Bankrupt. The round bank is gone and control passes.',
      }
    } else if (wedge.kind === 'lose-turn') {
      state = { ...state, phase: 'regular', activeTeam: otherTeam(state.activeTeam), message: 'Lose a turn. Control passes.' }
    } else {
      state = { ...state, phase: 'choosing-letter', message: `${wedge.value} points per match. Choose a consonant.` }
    }
    return { ok: true, state }
  }

  if (command.type === 'guess-letter') {
    if (state.phase !== 'choosing-letter' || state.pendingWedge?.kind !== 'points') return { ok: false, error: 'Spin before choosing a consonant.' }
    if (!canAct(state, actor)) return { ok: false, error: 'Wait for your team’s turn.' }
    const letter = command.letter.trim().toUpperCase()
    if (!/^[A-Z]$/.test(letter) || vowels.has(letter)) return { ok: false, error: 'Choose one unused consonant.' }
    if (state.usedLetters.includes(letter)) return { ok: false, error: `${letter} has already been called.` }
    const matches = countLetter(state.puzzle.solution, letter)
    const usedLetters = [...state.usedLetters, letter]
    const revealedLetters = matches > 0 ? [...state.revealedLetters, letter] : state.revealedLetters
    if (matches === 0) {
      state = {
        ...state, phase: 'regular', usedLetters, revealedLetters, pendingWedge: null,
        activeTeam: otherTeam(state.activeTeam), message: `No ${letter}. Control passes.`,
      }
    } else {
      const points = state.pendingWedge.value * matches
      state = {
        ...state, phase: 'regular', usedLetters, revealedLetters,
        roundBanks: { ...state.roundBanks, [state.activeTeam]: state.roundBanks[state.activeTeam] + points },
        pendingWedge: null, message: `${matches} ${letter}${matches === 1 ? '' : 's'} for ${points} points.`,
      }
    }
    return { ok: true, state }
  }

  if (command.type === 'buy-vowel') {
    if (state.phase !== 'regular') return { ok: false, error: 'Finish the current spin first.' }
    if (!canAct(state, actor)) return { ok: false, error: 'Wait for your team’s turn.' }
    if (state.roundBanks[state.activeTeam] < 250) return { ok: false, error: 'Your round bank needs 250 points to buy a vowel.' }
    const letter = command.letter.trim().toUpperCase()
    if (!/^[A-Z]$/.test(letter) || !vowels.has(letter)) return { ok: false, error: 'Choose one unused vowel.' }
    if (state.usedLetters.includes(letter)) return { ok: false, error: `${letter} has already been called.` }
    const matches = countLetter(state.puzzle.solution, letter)
    state = {
      ...state,
      usedLetters: [...state.usedLetters, letter],
      revealedLetters: matches > 0 ? [...state.revealedLetters, letter] : state.revealedLetters,
      roundBanks: { ...state.roundBanks, [state.activeTeam]: state.roundBanks[state.activeTeam] - 250 },
      activeTeam: matches > 0 ? state.activeTeam : otherTeam(state.activeTeam),
      message: matches > 0 ? `${matches} ${letter}${matches === 1 ? '' : 's'} on the board.` : `No ${letter}. Control passes.`,
    }
    return { ok: true, state }
  }

  if (command.type === 'solve') {
    if (state.phase !== 'regular') return { ok: false, error: 'The puzzle cannot be solved at this moment.' }
    if (!canAct(state, actor)) return { ok: false, error: 'Wait for your team’s turn.' }
    if (!command.solution.trim()) return { ok: false, error: 'Enter a complete solution.' }
    if (normalizeSolution(command.solution) !== normalizeSolution(state.puzzle.solution)) {
      return { ok: true, state: { ...state, activeTeam: otherTeam(state.activeTeam), message: 'That is not the puzzle. Control passes.' } }
    }
    const winnings = state.roundBanks[state.activeTeam]
    state = {
      ...state, phase: 'round-complete', revealedLetters: [...new Set(state.puzzle.solution.match(/[A-Z]/g) ?? [])],
      totals: { ...state.totals, [state.activeTeam]: state.totals[state.activeTeam] + winnings },
      message: `Puzzle solved. ${winnings} points are banked.`, pendingWedge: null,
    }
    return { ok: true, state }
  }

  if (command.type === 'award-solve') {
    if (actor.role !== 'host') return { ok: false, error: 'Only the host can accept a spoken solve.' }
    if (state.phase !== 'regular') return { ok: false, error: 'The puzzle cannot be awarded at this moment.' }
    const winnings = state.roundBanks[state.activeTeam]
    state = {
      ...state, phase: 'round-complete', revealedLetters: [...new Set(state.puzzle.solution.match(/[A-Z]/g) ?? [])],
      totals: { ...state.totals, [state.activeTeam]: state.totals[state.activeTeam] + winnings },
      message: `Spoken solve accepted. ${winnings} points are banked.`, pendingWedge: null,
    }
    return { ok: true, state }
  }

  if (command.type === 'next-round') {
    if (actor.role !== 'host') return { ok: false, error: 'Only the host can advance the game.' }
    if (state.phase !== 'round-complete') return { ok: false, error: 'Finish the current round first.' }
    if (state.round < state.totalRounds) {
      const puzzle = pickPuzzle(regularPuzzles, dependencies.random, state.regularPuzzleIds)
      const round = state.round + 1
      state = {
        ...state, phase: 'regular', round, puzzle, revealedLetters: [], usedLetters: [],
        activeTeam: round % 2 === 0 ? 'two' : 'one', roundBanks: { one: 0, two: 0 },
        wheelIndex: null, pendingWedge: null,
        message: `${round % 2 === 0 ? 'Team two' : 'Team one'} starts round ${round}.`,
        regularPuzzleIds: [...state.regularPuzzleIds, puzzle.id],
      }
      return { ok: true, state }
    }
    const winnerTeam: TeamId = state.totals.one === state.totals.two
      ? (dependencies.random() < 0.5 ? 'one' : 'two')
      : state.totals.one > state.totals.two ? 'one' : 'two'
    const puzzle = pickPuzzle(bonusPuzzles, dependencies.random)
    state = {
      ...state, phase: 'bonus-letters', puzzle, revealedLetters: [...bonusBaseLetters], usedLetters: [...bonusBaseLetters],
      activeTeam: winnerTeam, roundBanks: { one: 0, two: 0 }, winnerTeam,
      wheelIndex: null, pendingWedge: null,
      message: `${winnerTeam === 'one' ? 'Team one' : 'Team two'} reaches the bonus finale. Choose three consonants and one vowel.`,
    }
    return { ok: true, state }
  }

  if (command.type === 'choose-bonus-letters') {
    if (state.phase !== 'bonus-letters') return { ok: false, error: 'Bonus letters are not being chosen right now.' }
    if (!canAct(state, actor, true)) return { ok: false, error: 'Only the finalist team can choose bonus letters.' }
    const consonants = [...new Set(command.consonants.toUpperCase().replace(/[^A-Z]/g, ''))]
    const vowel = command.vowel.trim().toUpperCase()
    if (consonants.length !== 3 || consonants.some((letter) => vowels.has(letter) || bonusBaseLetters.includes(letter))) {
      return { ok: false, error: 'Choose three different consonants outside R, S, T, L, N, and E.' }
    }
    if (!/^[AEIOU]$/.test(vowel) || bonusBaseLetters.includes(vowel)) return { ok: false, error: 'Choose one vowel outside the letters already provided.' }
    const letters = [...consonants, vowel]
    state = {
      ...state, phase: 'bonus-solving', revealedLetters: [...state.revealedLetters, ...letters],
      usedLetters: [...state.usedLetters, ...letters], bonusDeadline: dependencies.now() + 10_000,
      message: 'Ten seconds. Solve the bonus puzzle!',
    }
    return { ok: true, state }
  }

  if (command.type === 'bonus-solve') {
    if (state.phase !== 'bonus-solving') return { ok: false, error: 'The bonus puzzle is not open for solving.' }
    if (!canAct(state, actor, true)) return { ok: false, error: 'Only the finalist team can solve the bonus puzzle.' }
    if ((state.bonusDeadline ?? 0) < dependencies.now()) return { ok: true, state: { ...state, phase: 'complete', bonusWon: false, message: 'Time is up. What a run!' } }
    if (normalizeSolution(command.solution) === normalizeSolution(state.puzzle.solution)) {
      const winnerTeam = state.winnerTeam ?? state.activeTeam
      state = {
        ...state, phase: 'complete', bonusWon: true,
        totals: { ...state.totals, [winnerTeam]: state.totals[winnerTeam] + 5_000 },
        message: 'Bonus solved! Add 5,000 points and make some noise.',
      }
    } else {
      state = { ...state, message: 'Not quite—keep solving while the clock runs.' }
    }
    return { ok: true, state }
  }

  if (command.type === 'finish-bonus') {
    if (actor.role !== 'host') return { ok: false, error: 'Only the host can end the bonus timer.' }
    if (state.phase !== 'bonus-solving') return { ok: false, error: 'The bonus timer is not running.' }
    return { ok: true, state: { ...state, phase: 'complete', bonusWon: false, message: 'Time is up. What a run!' } }
  }

  return { ok: false, error: 'That action is not available.' }
}

export function viewSpinSolveGame(state: SpinSolveState): SpinSolveView {
  return {
    kind: 'spin-solve', phase: state.phase, round: state.round, totalRounds: state.totalRounds,
    category: state.puzzle.category, maskedPuzzle: maskPuzzle(state), usedLetters: [...state.usedLetters],
    activeTeam: state.activeTeam, roundBanks: { ...state.roundBanks }, totals: { ...state.totals },
    wheelSegments: wheelSegments.map((segment) => ({ ...segment })), wheelIndex: state.wheelIndex,
    spinId: state.spinId, pendingWedge: state.pendingWedge ? { ...state.pendingWedge } : null,
    message: state.message, winnerTeam: state.winnerTeam, bonusDeadline: state.bonusDeadline,
    bonusWon: state.bonusWon, canUndo: state.history.length > 0,
  }
}
