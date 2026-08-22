import type {
  FeudFastMoneyPack,
  FeudQuestion,
  FastMoneyCommand,
  FastMoneyPhase,
  FastMoneyResponseView,
  FastMoneyView,
  Participant,
  TeamId,
} from '../src/roomTypes.js'

export interface FastMoneyActor {
  role: 'host' | 'player'
  participantId: string | null
  team: TeamId | null
}

export interface FastMoneyResponse {
  text: string
  answerId: string | null
  points: number
  repeated: boolean
}

interface FastMoneyAttempt {
  responses: Array<FastMoneyResponse | null>
  queue: number[]
  passed: number[]
}

export interface FastMoneyState {
  kind: 'fast-money'
  phase: FastMoneyPhase
  eligibleTeam: TeamId
  lineup: [string | null, string | null]
  votes: Map<string, [string, string]>
  attempts: [FastMoneyAttempt, FastMoneyAttempt]
  timer: {
    status: 'idle' | 'running' | 'paused'
    durationSeconds: number
    deadline: number | null
    remainingMs: number
  }
  revealIndex: number
}

export type FastMoneyResult =
  | { ok: true; state: FastMoneyState }
  | { ok: false; error: string }

const questionIndexes = [0, 1, 2, 3, 4]

const emptyAttempt = (): FastMoneyAttempt => ({
  responses: [null, null, null, null, null],
  queue: [],
  passed: [],
})

const idleTimer = (durationSeconds = 0): FastMoneyState['timer'] => ({
  status: 'idle',
  durationSeconds,
  deadline: null,
  remainingMs: durationSeconds * 1000,
})

function cloneState(state: FastMoneyState): FastMoneyState {
  return {
    ...state,
    lineup: [...state.lineup],
    votes: new Map([...state.votes].map(([participantId, votes]) => [participantId, [...votes]])),
    attempts: state.attempts.map((attempt) => ({
      responses: attempt.responses.map((response) => response ? { ...response } : null),
      queue: [...attempt.queue],
      passed: [...attempt.passed],
    })) as [FastMoneyAttempt, FastMoneyAttempt],
    timer: { ...state.timer },
  }
}

export function normalizeFastMoneyAnswer(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function answerFor(question: FeudQuestion, text: string) {
  const normalized = normalizeFastMoneyAnswer(text)
  return question.answers.find((answer) => (
    [answer.label, ...(answer.aliases ?? [])]
      .some((candidate) => normalizeFastMoneyAnswer(candidate) === normalized)
  )) ?? null
}

function activeContestant(phase: FastMoneyPhase): 0 | 1 | null {
  if (phase === 'ready-one' || phase === 'active-one' || phase === 'review-one') return 0
  if (phase === 'ready-two' || phase === 'active-two' || phase === 'review-two') return 1
  return null
}

function activePhase(contestant: 0 | 1): FastMoneyPhase {
  return contestant === 0 ? 'active-one' : 'active-two'
}

function reviewPhase(contestant: 0 | 1): FastMoneyPhase {
  return contestant === 0 ? 'review-one' : 'review-two'
}

function attemptScore(attempt: FastMoneyAttempt): number {
  return attempt.responses.reduce((total, response) => total + (response?.points ?? 0), 0)
}

function finishAttempt(state: FastMoneyState, contestant: 0 | 1): void {
  state.phase = reviewPhase(contestant)
  state.attempts[contestant].queue = []
  state.timer = idleTimer(state.timer.durationSeconds)
}

function requireHost(actor: FastMoneyActor): string | null {
  return actor.role === 'host' ? null : 'Only the host can control Fast Money.'
}

function eligiblePlayers(participants: Participant[], team: TeamId): Participant[] {
  return participants.filter((participant) => participant.team === team)
}

function validateLineup(
  contestantIds: [string, string],
  participants: Participant[],
  team: TeamId,
): string | null {
  if (contestantIds[0] === contestantIds[1]) return 'Choose two different contestants.'
  const eligibleIds = new Set(eligiblePlayers(participants, team).map((participant) => participant.id))
  if (!contestantIds.every((participantId) => eligibleIds.has(participantId))) {
    return 'Choose two connected players from the winning team.'
  }
  return null
}

export function createFastMoneyState(eligibleTeam: TeamId): FastMoneyState {
  return {
    kind: 'fast-money',
    phase: 'selecting',
    eligibleTeam,
    lineup: [null, null],
    votes: new Map(),
    attempts: [emptyAttempt(), emptyAttempt()],
    timer: idleTimer(),
    revealIndex: -1,
  }
}

export function expireFastMoney(state: FastMoneyState, now: number): FastMoneyState {
  if (state.timer.status !== 'running' || state.timer.deadline === null || now < state.timer.deadline) return state
  const contestant = activeContestant(state.phase)
  if (contestant === null || state.phase !== activePhase(contestant)) return state
  const next = cloneState(state)
  finishAttempt(next, contestant)
  return next
}

export function applyFastMoneyCommand(
  state: FastMoneyState,
  pack: FeudFastMoneyPack,
  participants: Participant[],
  actor: FastMoneyActor,
  command: Exclude<FastMoneyCommand, { type: 'start' }>,
  now: number,
): FastMoneyResult {
  const next = cloneState(state)

  if (command.type === 'vote') {
    if (next.phase !== 'selecting') return { ok: false, error: 'Contestant voting is closed.' }
    if (actor.role !== 'player' || !actor.participantId || actor.team !== next.eligibleTeam) {
      return { ok: false, error: 'Only members of the winning team can vote.' }
    }
    const issue = validateLineup(command.participantIds, participants, next.eligibleTeam)
    if (issue) return { ok: false, error: issue }
    next.votes.set(actor.participantId, [...command.participantIds])
    return { ok: true, state: next }
  }

  if (command.type === 'set-lineup') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    if (next.phase !== 'selecting') return { ok: false, error: 'The contestant order is already locked.' }
    const lineupIssue = validateLineup(command.contestantIds, participants, next.eligibleTeam)
    if (lineupIssue) return { ok: false, error: lineupIssue }
    next.lineup = [...command.contestantIds]
    return { ok: true, state: next }
  }

  if (command.type === 'confirm-lineup') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    if (next.phase !== 'selecting') return { ok: false, error: 'The contestant order is already locked.' }
    if (!next.lineup[0] || !next.lineup[1]) return { ok: false, error: 'Choose and order two contestants first.' }
    const lineupIssue = validateLineup(next.lineup as [string, string], participants, next.eligibleTeam)
    if (lineupIssue) return { ok: false, error: lineupIssue }
    next.phase = 'ready-one'
    return { ok: true, state: next }
  }

  if (command.type === 'replace-contestant') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    if (next.phase !== 'ready-one' && next.phase !== 'ready-two') {
      return { ok: false, error: 'Contestants can only be replaced before an attempt starts.' }
    }
    if (next.phase === 'ready-two' && command.contestant !== 1) {
      return { ok: false, error: 'Contestant one’s completed attempt is already locked.' }
    }
    const participant = participants.find((candidate) => candidate.id === command.participantId)
    if (participant?.team !== next.eligibleTeam) return { ok: false, error: 'Choose a player from the winning team.' }
    const otherContestant = next.lineup[command.contestant === 0 ? 1 : 0]
    if (otherContestant === participant.id) return { ok: false, error: 'Choose two different contestants.' }
    next.lineup[command.contestant] = participant.id
    return { ok: true, state: next }
  }

  if (command.type === 'start-attempt') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    const contestant = next.phase === 'ready-one' ? 0 : next.phase === 'ready-two' ? 1 : null
    if (contestant === null) return { ok: false, error: 'This attempt is not ready to start.' }
    const participantId = next.lineup[contestant]
    if (!participantId || !participants.some((participant) => participant.id === participantId)) {
      return { ok: false, error: 'That contestant is disconnected. Wait for them or choose a replacement.' }
    }
    const durationSeconds = contestant === 0 ? pack.timers.first : pack.timers.second
    next.attempts[contestant].queue = [...questionIndexes]
    next.attempts[contestant].passed = []
    next.phase = activePhase(contestant)
    next.timer = {
      status: 'running',
      durationSeconds,
      deadline: now + durationSeconds * 1000,
      remainingMs: durationSeconds * 1000,
    }
    return { ok: true, state: next }
  }

  if (command.type === 'submit' || command.type === 'pass') {
    const hostIssue = requireHost(actor)
    if (hostIssue) return { ok: false, error: 'Only the host can submit or pass Fast Money answers.' }
    const contestant = activeContestant(next.phase)
    if (contestant === null || next.phase !== activePhase(contestant)) {
      return { ok: false, error: 'There is no active Fast Money question.' }
    }
    const questionIndex = next.attempts[contestant].queue[0]
    if (questionIndex === undefined) return { ok: false, error: 'There are no questions left in this attempt.' }

    if (command.type === 'pass') {
      const rest = next.attempts[contestant].queue.slice(1)
      if (next.attempts[contestant].passed.includes(questionIndex)) {
        next.attempts[contestant].queue = rest
      } else {
        next.attempts[contestant].passed.push(questionIndex)
        next.attempts[contestant].queue = [...rest, questionIndex]
      }
    } else {
      const text = command.answer.trim().slice(0, 100)
      if (!text) return { ok: false, error: 'Enter an answer or pass.' }
      const question = pack.questions[questionIndex]
      const matched = answerFor(question, text)
      if (contestant === 1) {
        const first = next.attempts[0].responses[questionIndex]
        const repeatsText = first && normalizeFastMoneyAnswer(first.text) === normalizeFastMoneyAnswer(text)
        const repeatsBucket = first?.answerId && matched?.id === first.answerId
        if (repeatsText || repeatsBucket) return { ok: false, error: 'Repeat answer — try another answer.' }
      }
      next.attempts[contestant].responses[questionIndex] = {
        text,
        answerId: matched?.id ?? null,
        points: matched?.points ?? 0,
        repeated: false,
      }
      next.attempts[contestant].queue = next.attempts[contestant].queue.slice(1)
    }

    if (next.attempts[contestant].queue.length === 0) finishAttempt(next, contestant)
    return { ok: true, state: next }
  }

  if (command.type === 'end-attempt') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    const contestant = activeContestant(next.phase)
    if (contestant === null || next.phase !== activePhase(contestant)) {
      return { ok: false, error: 'There is no active attempt to end.' }
    }
    finishAttempt(next, contestant)
    return { ok: true, state: next }
  }

  if (command.type === 'score-response') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    const expectedPhase = reviewPhase(command.contestant)
    if (next.phase !== expectedPhase) return { ok: false, error: 'Review the active contestant’s answers first.' }
    const question = pack.questions[command.questionIndex]
    if (!question) return { ok: false, error: 'Choose one of the five Fast Money questions.' }
    const text = command.text.trim().slice(0, 100)
    const answer = command.answerId === null
      ? null
      : question.answers.find((candidate) => candidate.id === command.answerId)
    if (command.answerId !== null && !answer) return { ok: false, error: 'Choose a score from this question’s answer list.' }

    const first = next.attempts[0].responses[command.questionIndex]
    const repeatsText = command.contestant === 1 && Boolean(
      first && text && normalizeFastMoneyAnswer(first.text) === normalizeFastMoneyAnswer(text),
    )
    const repeatsBucket = command.contestant === 1 && Boolean(first?.answerId && answer?.id === first.answerId)
    const repeated = command.contestant === 1 && (command.repeated || repeatsText || repeatsBucket)
    next.attempts[command.contestant].responses[command.questionIndex] = {
      text,
      answerId: repeated ? null : answer?.id ?? null,
      points: repeated ? 0 : answer?.points ?? 0,
      repeated,
    }
    return { ok: true, state: next }
  }

  if (command.type === 'lock-review') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    if (next.phase === 'review-one') next.phase = 'ready-two'
    else if (next.phase === 'review-two') next.phase = 'reveal'
    else return { ok: false, error: 'Finish an attempt before locking its scores.' }
    next.timer = idleTimer()
    return { ok: true, state: next }
  }

  if (command.type === 'pause-timer' || command.type === 'resume-timer' || command.type === 'add-time') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    const contestant = activeContestant(next.phase)
    if (contestant === null || next.phase !== activePhase(contestant)) {
      return { ok: false, error: 'Timer controls are available during an active attempt.' }
    }
    if (command.type === 'pause-timer') {
      if (next.timer.status !== 'running' || next.timer.deadline === null) return { ok: false, error: 'The timer is not running.' }
      next.timer.remainingMs = Math.max(0, next.timer.deadline - now)
      next.timer.deadline = null
      next.timer.status = 'paused'
    } else if (command.type === 'resume-timer') {
      if (next.timer.status !== 'paused') return { ok: false, error: 'Pause the timer before resuming it.' }
      next.timer.deadline = now + next.timer.remainingMs
      next.timer.status = 'running'
    } else if (next.timer.status === 'running' && next.timer.deadline !== null) {
      next.timer.deadline += 5_000
      next.timer.remainingMs = Math.max(0, next.timer.deadline - now)
    } else if (next.timer.status === 'paused') {
      next.timer.remainingMs += 5_000
    } else {
      return { ok: false, error: 'Start the attempt before adding time.' }
    }
    return { ok: true, state: next }
  }

  if (command.type === 'reveal-next') {
    const issue = requireHost(actor)
    if (issue) return { ok: false, error: issue }
    if (next.phase !== 'reveal') return { ok: false, error: 'Both attempts must be locked before the reveal.' }
    next.revealIndex = Math.min(4, next.revealIndex + 1)
    if (next.revealIndex === 4) next.phase = 'complete'
    return { ok: true, state: next }
  }

  return { ok: false, error: 'That Fast Money action is not supported.' }
}

function responseView(
  response: FastMoneyResponse | null,
  visible: boolean,
  includeScore: boolean,
  includeAnswerId: boolean,
): FastMoneyResponseView {
  if (!visible || !response) return { text: null, answerId: null, points: null, repeated: false }
  return {
    text: response.text,
    answerId: includeAnswerId ? response.answerId : null,
    points: includeScore ? response.points : null,
    repeated: includeScore ? response.repeated : false,
  }
}

function phaseMessage(state: FastMoneyState): string {
  const total = attemptScore(state.attempts[0]) + attemptScore(state.attempts[1])
  switch (state.phase) {
    case 'selecting': return 'The winning team is choosing two contestants.'
    case 'ready-one': return 'Contestant one is headed to the clock.'
    case 'active-one': return 'Contestant one is answering five questions.'
    case 'review-one': return 'The host is checking contestant one’s answers.'
    case 'ready-two': return 'Contestant two is up. First answers stay hidden.'
    case 'active-two': return 'Contestant two is answering the same five questions.'
    case 'review-two': return 'The host is checking contestant two’s answers.'
    case 'reveal': return 'Survey says… let’s build the total.'
    case 'complete': return total >= 200 ? 'Two hundred! Bragging rights secured.' : 'The board put up a fight. Rematch material.'
  }
}

export function viewFastMoney(
  state: FastMoneyState,
  pack: FeudFastMoneyPack,
  participants: Participant[],
  actor: FastMoneyActor,
): FastMoneyView {
  const participantId = actor.participantId
  const viewerRole = actor.role === 'host'
    ? 'host'
    : participantId === state.lineup[0]
      ? 'contestant-one'
      : participantId === state.lineup[1]
        ? 'contestant-two'
        : actor.team === state.eligibleTeam
          ? 'eligible-team'
          : 'spectator'
  const currentContestant = activeContestant(state.phase)
  const currentQuestionIndex = currentContestant === null
    ? null
    : state.attempts[currentContestant].queue[0] ?? null
  const publicReveal = state.phase === 'reveal' || state.phase === 'complete'
  const isIsolated = viewerRole === 'contestant-two' && (
    state.phase === 'ready-one'
    || state.phase === 'active-one'
    || state.phase === 'review-one'
    || state.phase === 'ready-two'
  )

  const voteCounts: Record<string, number> = {}
  if (actor.role === 'host' || actor.team === state.eligibleTeam) {
    for (const votes of state.votes.values()) {
      for (const candidateId of votes) voteCounts[candidateId] = (voteCounts[candidateId] ?? 0) + 1
    }
  }

  const questions = pack.questions.map((question, questionIndex) => {
    const revealed = publicReveal && questionIndex <= state.revealIndex
    const canSeePrompt = actor.role === 'host' || revealed
    const canSeeFirst = actor.role === 'host' || revealed
    const canSeeSecond = actor.role === 'host' || revealed
    return {
      id: question.id,
      prompt: canSeePrompt ? question.prompt : null,
      responses: [
        responseView(state.attempts[0].responses[questionIndex], canSeeFirst, actor.role === 'host' || revealed, actor.role === 'host'),
        responseView(state.attempts[1].responses[questionIndex], canSeeSecond, actor.role === 'host' || revealed, actor.role === 'host'),
      ] as [FastMoneyResponseView, FastMoneyResponseView],
      answerOptions: actor.role === 'host'
        ? question.answers.map((answer) => ({ ...answer, ...(answer.aliases ? { aliases: [...answer.aliases] } : {}) }))
        : null,
      revealed,
    }
  })

  const rawSubtotals: [number, number] = [attemptScore(state.attempts[0]), attemptScore(state.attempts[1])]
  const revealedScore = questions.reduce((total, question) => (
    total
    + (question.revealed ? question.responses[0].points ?? 0 : 0)
    + (question.revealed ? question.responses[1].points ?? 0 : 0)
  ), 0)
  const contestants = state.lineup.map((participantId) => {
    const participant = participants.find((candidate) => candidate.id === participantId)
    return participant ? { id: participant.id, name: participant.name, avatarId: participant.avatarId } : null
  }) as FastMoneyView['contestants']

  return {
    kind: 'fast-money',
    phase: state.phase,
    eligibleTeam: state.eligibleTeam,
    viewerRole,
    contestants,
    voteCounts,
    viewerVotes: participantId ? [...(state.votes.get(participantId) ?? [])] : [],
    currentContestant,
    currentQuestionIndex,
    questions,
    answeredCount: currentContestant === null
      ? 0
      : state.attempts[currentContestant].responses.filter(Boolean).length,
    timer: { ...state.timer },
    subtotals: [
      actor.role === 'host' || state.phase === 'complete' ? rawSubtotals[0] : null,
      actor.role === 'host' || state.phase === 'complete' ? rawSubtotals[1] : null,
    ],
    combinedScore: actor.role === 'host' ? rawSubtotals[0] + rawSubtotals[1] : revealedScore,
    goal: 200,
    revealIndex: state.revealIndex,
    isIsolated,
    outcome: state.phase === 'complete' ? rawSubtotals[0] + rawSubtotals[1] >= 200 ? 'win' : 'short' : null,
    message: phaseMessage(state),
  }
}
