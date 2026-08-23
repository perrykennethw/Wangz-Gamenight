import assert from 'node:assert/strict'
import { starterFeudPack } from '../src/gameData.js'
import { createFastMoneyPresentation, createFeudPresentation, createLobbyPresentation, presenterRoomCodeFromSearch } from '../src/presenterChannel.js'
import type { FastMoneyView, RoomSnapshot } from '../src/roomTypes.js'

const config = {
  kind: 'feud' as const,
  teamOne: 'Comets',
  teamTwo: 'Rockets',
  winningScore: 300,
  pack: starterFeudPack,
}

const room: RoomSnapshot = {
  code: 'ABCDE',
  phase: 'playing',
  gameRevision: 1,
  config,
  participants: [
    { id: 'private-player-id', name: 'Avery', avatarId: 'contestants/rocket.webp', team: 'one' },
    { id: 'other-private-id', name: 'Blake', avatarId: null, team: 'two' },
  ],
  messages: [{ id: 'secret-message-id', senderId: 'private-player-id', senderName: 'Avery', senderAvatarId: 'contestants/rocket.webp', team: 'one', text: 'SECRET HUDDLE', sentAt: 1 }],
  teamChats: {
    one: [{ id: 'secret-message-id', senderId: 'private-player-id', senderName: 'Avery', senderAvatarId: 'contestants/rocket.webp', team: 'one', text: 'SECRET HUDDLE', sentAt: 1 }],
    two: [],
  },
  chat: { lockedTeam: null, reason: null },
  playPass: {
    status: 'open',
    team: 'one',
    activePlayerId: 'private-player-id',
    votes: { play: 3, pass: 1 },
    viewerVote: null,
    decision: null,
    controllingTeam: null,
  },
  feudTurns: {
    activeTeam: 'one',
    teams: {
      one: {
        order: ['private-player-id'],
        currentPlayerId: 'private-player-id',
        nextPlayerId: 'private-player-id',
      },
      two: {
        order: ['other-private-id'],
        currentPlayerId: 'other-private-id',
        nextPlayerId: 'other-private-id',
      },
    },
  },
  buzzer: {
    status: 'locked',
    winner: { participantId: 'private-player-id', playerName: 'Avery', avatarId: 'contestants/rocket.webp', team: 'one' },
    representatives: { one: 'private-player-id', two: 'other-private-id' },
  },
  timer: {
    status: 'running',
    durationSeconds: 25,
    startedAt: 1_000,
    deadline: 26_000,
  },
  viewer: { role: 'host' },
  game: {
    kind: 'feud',
    round: 1,
    questionIndex: 0,
    multiplier: 1,
    revealed: [0],
    strikes: 1,
    strikeRevision: 1,
    phase: 'playing',
    controllingTeam: 'one',
    originalControllingTeam: 'one',
    stealOutcome: null,
    selectedAwardTeam: 'one',
    scores: { one: 34, two: 20 },
    roundPot: 34,
    winnerTeam: null,
  },
}

assert.equal(presenterRoomCodeFromSearch('?present=abc12'), 'ABC12')
assert.equal(presenterRoomCodeFromSearch('?join=ABC12'), null)
assert.equal(presenterRoomCodeFromSearch('?present=ABC-12'), null)

const lobby = createLobbyPresentation(room, 2)
const feud = createFeudPresentation({
  room,
  config,
  question: config.pack.questions[0],
})

for (const state of [lobby, feud]) {
  const serialized = JSON.stringify(state)
  assert.equal(serialized.includes('SECRET HUDDLE'), false)
  assert.equal(serialized.includes('secret-message-id'), false)
  assert.equal(serialized.includes('private-player-id'), false)
  assert.equal(serialized.includes('"votes"'), false)
  assert.equal(serialized.includes('teamChats'), false)
  assert.equal(serialized.includes('messages'), false)
}

assert.deepEqual(lobby.participants, [{ name: 'Avery', avatarId: 'contestants/rocket.webp', team: 'one' }, { name: 'Blake', avatarId: null, team: 'two' }])
assert.equal(lobby.teamRevealRevision, 2)
assert.deepEqual(feud.decision.activePlayer, { name: 'Avery', avatarId: 'contestants/rocket.webp' })
assert.equal(feud.decision.team, 'one')
assert.deepEqual(feud.turn, {
  activeTeam: 'one',
  currentPlayer: { name: 'Avery', avatarId: 'contestants/rocket.webp' },
  nextPlayer: { name: 'Avery', avatarId: 'contestants/rocket.webp' },
})
assert.deepEqual(feud.buzzer.winner, { playerName: 'Avery', avatarId: 'contestants/rocket.webp', team: 'one' })
assert.deepEqual(feud.revealed, [0])
assert.deepEqual(feud.timer, room.timer)
assert.equal(feud.question.answers[0].label, config.pack.questions[0].answers[0].label)
assert.equal(feud.question.answers[1].label, '')
assert.equal(JSON.stringify(feud).includes(config.pack.questions[0].prompt), false)
assert.equal(JSON.stringify(feud).includes(config.pack.questions[0].answers[1].label), false)

const fastMoneyGame: FastMoneyView = {
  kind: 'fast-money',
  phase: 'reveal',
  eligibleTeam: 'one',
  viewerRole: 'host',
  contestants: [
    { id: 'private-player-id', name: 'Avery', avatarId: null },
    { id: 'other-private-id', name: 'Blake', avatarId: null },
  ],
  voteCounts: { 'private-player-id': 2 },
  viewerVotes: ['private-player-id', 'other-private-id'],
  currentContestant: null,
  currentQuestionIndex: null,
  questions: config.pack.fastMoney!.questions.map((question, index) => ({
    id: question.id,
    prompt: question.prompt,
    responses: [
      { text: index === 0 ? 'PUBLIC FIRST ANSWER' : 'SECRET FIRST ANSWER', answerId: question.answers[0].id, points: question.answers[0].points, repeated: false },
      { text: index === 0 ? 'PUBLIC SECOND ANSWER' : 'SECRET SECOND ANSWER', answerId: question.answers[1].id, points: question.answers[1].points, repeated: false },
    ],
    answerOptions: question.answers,
    revealed: index === 0,
  })),
  answeredCount: 0,
  attemptDurations: [35, 40],
  timer: { status: 'idle', durationSeconds: 0, deadline: null, remainingMs: 0 },
  subtotals: [145, 99],
  combinedScore: 244,
  goal: 200,
  revealIndex: 0,
  isIsolated: false,
  outcome: null,
  message: 'Survey says… let’s build the total.',
}
const fastMoney = createFastMoneyPresentation({ ...room, game: fastMoneyGame })
assert.ok(fastMoney)
const serializedFastMoney = JSON.stringify(fastMoney)
assert.equal(serializedFastMoney.includes('PUBLIC FIRST ANSWER'), true)
assert.equal(serializedFastMoney.includes('SECRET FIRST ANSWER'), false)
assert.equal(serializedFastMoney.includes('SECRET SECOND ANSWER'), false)
assert.equal(serializedFastMoney.includes('private-player-id'), false)
assert.equal(serializedFastMoney.includes('other-private-id'), false)
assert.equal(serializedFastMoney.includes('answerOptions'), true)
assert.equal(fastMoney.game.questions.every((question) => question.answerOptions === null), true)
assert.deepEqual(fastMoney.game.subtotals, [null, null])
assert.equal(fastMoney.game.combinedScore, config.pack.fastMoney!.questions[0].answers[0].points + config.pack.fastMoney!.questions[0].answers[1].points)

const firstRevealGame: FastMoneyView = {
  ...fastMoneyGame,
  phase: 'reveal-one',
  questions: fastMoneyGame.questions.map((question) => ({
    ...question,
    responses: [question.responses[0], { text: null, answerId: null, points: null, repeated: false }],
    revealed: true,
  })),
  subtotals: [145, 0],
  combinedScore: 145,
  revealIndex: 4,
  message: 'Let’s see how contestant one scored.',
}
const firstReveal = createFastMoneyPresentation({ ...room, game: firstRevealGame })
assert.ok(firstReveal)
assert.equal(firstReveal.game.questions.every((question) => question.responses[0].text !== null), true)
assert.equal(firstReveal.game.questions.every((question) => question.responses[1].text === null), true)
assert.deepEqual(firstReveal.game.subtotals, [145, null])
assert.equal(firstReveal.game.combinedScore, firstReveal.game.questions.reduce((total, question) => total + (question.responses[0].points ?? 0), 0))

console.log('Presenter state includes public boards while excluding hidden Fast Money answers, moderator chats, votes, and private participant IDs.')
