import assert from 'node:assert/strict'
import { starterFeudPack } from '../src/gameData.js'
import { createFeudPresentation, createLobbyPresentation } from '../src/presenterChannel.js'
import type { RoomSnapshot } from '../src/roomTypes.js'

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
  config,
  participants: [
    { id: 'private-player-id', name: 'Avery', team: 'one' },
    { id: 'other-private-id', name: 'Blake', team: 'two' },
  ],
  messages: [{ id: 'secret-message-id', senderId: 'private-player-id', senderName: 'Avery', team: 'one', text: 'SECRET HUDDLE', sentAt: 1 }],
  teamChats: {
    one: [{ id: 'secret-message-id', senderId: 'private-player-id', senderName: 'Avery', team: 'one', text: 'SECRET HUDDLE', sentAt: 1 }],
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
  buzzer: {
    status: 'locked',
    winner: { participantId: 'private-player-id', playerName: 'Avery', team: 'one' },
    representatives: { one: 'private-player-id', two: 'other-private-id' },
  },
  viewer: { role: 'host' },
  game: null,
}

const lobby = createLobbyPresentation(room)
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

assert.deepEqual(lobby.participants, [{ name: 'Avery', team: 'one' }, { name: 'Blake', team: 'two' }])
assert.equal(feud.decision.activePlayerName, 'Avery')
assert.deepEqual(feud.buzzer.winner, { playerName: 'Avery', team: 'one' })
assert.deepEqual(feud.revealed, [0])
assert.equal(feud.question.answers[0].label, config.pack.questions[0].answers[0].label)
assert.equal(feud.question.answers[1].label, '')
assert.equal(JSON.stringify(feud).includes(config.pack.questions[0].prompt), false)
assert.equal(JSON.stringify(feud).includes(config.pack.questions[0].answers[1].label), false)

console.log('Presenter state includes the public board while excluding questions, moderator chats, votes, and private participant IDs.')
