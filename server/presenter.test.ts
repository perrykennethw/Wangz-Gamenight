import assert from 'node:assert/strict'
import { starterFeudPack } from '../src/gameData.js'
import {
  createFastMoneyPresentation,
  createFeudPresentation,
  createLobbyPresentation,
  presenterRoomCodeFromSearch,
  startPresentationPublisher,
  startPresentationSubscriber,
  type PresentationTransportChannel,
} from '../src/presenterChannel.js'
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
    { id: 'private-player-id', name: 'Avery', avatarId: 'contestants/rocket.webp', team: 'one', status: 'active' },
    { id: 'other-private-id', name: 'Blake', avatarId: null, team: 'two', status: 'active' },
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
  game: null,
}

assert.equal(presenterRoomCodeFromSearch('?present=abc12'), 'ABC12')
assert.equal(presenterRoomCodeFromSearch('?join=ABC12'), null)
assert.equal(presenterRoomCodeFromSearch('?present=ABC-12'), null)

const lobby = createLobbyPresentation(room, 2)
const feud = createFeudPresentation({
  room,
  config,
  round: 1,
  multiplier: 1,
  question: config.pack.questions[0],
  revealed: [0],
  strikes: 1,
  scores: [34, 20],
  roundPot: 34,
  winner: null,
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

class FakePresentationChannel implements PresentationTransportChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  readonly messages: unknown[] = []
  closeCount = 0
  throwOnPost = false

  postMessage(message: unknown): void {
    if (this.throwOnPost) throw new Error('Presenter transport rejected the message')
    this.messages.push(message)
  }

  close(): void {
    this.closeCount += 1
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

assert.equal(
  startPresentationPublisher(lobby, () => lobby, () => null),
  null,
  'missing BroadcastChannel support disables publishing without throwing',
)
assert.doesNotThrow(() => {
  const publisher = startPresentationPublisher(lobby, () => lobby, () => {
    throw new Error('BroadcastChannel construction blocked')
  })
  assert.equal(publisher, null)
})

const throwingPublisherChannel = new FakePresentationChannel()
throwingPublisherChannel.throwOnPost = true
assert.doesNotThrow(() => {
  const publisher = startPresentationPublisher(lobby, () => lobby, () => throwingPublisherChannel)
  assert.ok(publisher)
  publisher.publish(lobby)
  throwingPublisherChannel.receive({ version: 1, roomCode: room.code, kind: 'request' })
  publisher.close()
})
assert.equal(throwingPublisherChannel.closeCount, 1)

const publishingChannel = new FakePresentationChannel()
let latestPresentation = lobby
let publisherChannelName = ''
const publisher = startPresentationPublisher(lobby, () => latestPresentation, (name) => {
  publisherChannelName = name
  return publishingChannel
})
assert.ok(publisher)
assert.equal(publisherChannelName, 'wangz-presenter-ABCDE')
assert.equal(publishingChannel.messages.length, 1, 'publisher sends its initial state')
publishingChannel.receive({ version: 1, roomCode: 'OTHER', kind: 'request' })
assert.equal(publishingChannel.messages.length, 1, 'publisher ignores another room')
latestPresentation = { ...lobby, teamRevealRevision: 3 }
publishingChannel.receive({ version: 1, roomCode: room.code, kind: 'request' })
assert.equal(publishingChannel.messages.length, 2, 'publisher answers a request for its room')
assert.deepEqual(
  publishingChannel.messages[1],
  { version: 1, roomCode: room.code, kind: 'state', state: latestPresentation },
)
publisher.publish({ ...latestPresentation, teamRevealRevision: 4 })
assert.equal(publishingChannel.messages.length, 3, 'publisher sends live state updates')
publisher.close()
publisher.close()
assert.equal(publishingChannel.closeCount, 1, 'publisher cleanup is idempotent')
assert.equal(publishingChannel.onmessage, null)

assert.equal(
  startPresentationSubscriber(room.code, () => undefined, () => null),
  null,
  'missing BroadcastChannel support reports an unavailable subscriber',
)
assert.doesNotThrow(() => {
  const subscriber = startPresentationSubscriber(room.code, () => undefined, () => {
    throw new Error('BroadcastChannel construction blocked')
  })
  assert.equal(subscriber, null)
})

const throwingSubscriberChannel = new FakePresentationChannel()
throwingSubscriberChannel.throwOnPost = true
const throwingSubscriber = startPresentationSubscriber(
  room.code,
  () => undefined,
  () => throwingSubscriberChannel,
  {
    setInterval: () => {
      throw new Error('request timer should not start after a failed request')
    },
    clearInterval: () => undefined,
  },
)
assert.equal(throwingSubscriber, null)
assert.equal(throwingSubscriberChannel.closeCount, 1)
assert.equal(throwingSubscriberChannel.onmessage, null)

const subscribingChannel = new FakePresentationChannel()
const intervalCallbacks: Array<() => void> = []
let clearedTimer: number | null = null
const receivedStates: typeof lobby[] = []
const subscriber = startPresentationSubscriber(
  room.code,
  (state) => receivedStates.push(state as typeof lobby),
  () => subscribingChannel,
  {
    setInterval: (callback, delayMs) => {
      assert.equal(delayMs, 1000)
      intervalCallbacks.push(callback)
      return 42
    },
    clearInterval: (timer) => {
      clearedTimer = timer
    },
  },
)
assert.ok(subscriber)
assert.deepEqual(
  subscribingChannel.messages[0],
  { version: 1, roomCode: room.code, kind: 'request' },
  'subscriber requests the current presentation immediately',
)
subscribingChannel.receive({ version: 1, roomCode: 'OTHER', kind: 'state', state: lobby })
assert.equal(receivedStates.length, 0, 'subscriber ignores another room')
subscribingChannel.receive({ version: 1, roomCode: room.code, kind: 'state', state: lobby })
assert.deepEqual(receivedStates, [lobby])
const scheduledRequest = intervalCallbacks[0]
assert.ok(scheduledRequest)
scheduledRequest()
assert.equal(subscribingChannel.messages.length, 2, 'subscriber retries while waiting')
subscriber.close()
subscriber.close()
assert.equal(clearedTimer, 42)
assert.equal(subscribingChannel.closeCount, 1, 'subscriber cleanup is idempotent')
assert.equal(subscribingChannel.onmessage, null)

console.log('Presenter state includes public boards while excluding hidden Fast Money answers, moderator chats, votes, and private participant IDs.')
