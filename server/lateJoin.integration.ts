import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { starterFeudPack } from '../src/gameData.js'
import type {
  BuzzerState,
  ChatMessage,
  ClientToServerEvents,
  FastMoneyCommand,
  GameConfig,
  HostRoomCreation,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from '../src/roomTypes.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const serverUrl = process.env.ROOM_SERVER_URL ?? 'http://localhost:3001'
const config: GameConfig = {
  kind: 'feud',
  teamOne: 'Comets',
  teamTwo: 'Rockets',
  winningScore: 300,
  pack: starterFeudPack,
}

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(serverUrl, { transports: ['websocket'], forceNew: true })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function result<T>(emit: (reply: (value: RoomResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => emit((value) => (
    value.ok ? resolve(value.data) : reject(new Error(value.error))
  )))
}

const createRoom = (socket: TestSocket) => result<HostRoomCreation>((reply) => socket.emit('room:create', config, reply)).then((creation) => creation.room)
const joinRoom = (socket: TestSocket, code: string, name: string, sessionId: string) => result<RoomSnapshot>((reply) => (
  socket.emit('room:join', { code, name, avatarId: null, sessionId }, reply)
))
const chooseTeam = (socket: TestSocket, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit('room:choose-team', team, reply))
const assignTeam = (socket: TestSocket, participantId: string, team: TeamId) => result<RoomSnapshot>((reply) => (
  socket.emit('room:assign-team', { participantId, team }, reply)
))
const startGame = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('game:start', reply))
const prepareNextQuestion = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('feud:prepare-next-question', reply))
const selectRepresentative = (socket: TestSocket, team: TeamId, participantId: string) => result<RoomSnapshot>((reply) => (
  socket.emit('buzzer:select-representative', { team, participantId }, reply)
))
const setTurnPlayer = (socket: TestSocket, team: TeamId, participantId: string) => result<RoomSnapshot>((reply) => (
  socket.emit('feud:set-turn-player', { team, participantId }, reply)
))
const armBuzzer = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('buzzer:arm', reply))
const pressBuzzer = (socket: TestSocket) => result<BuzzerState>((reply) => socket.emit('buzzer:press', reply))
const votePlayPass = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('feud:vote-play-pass', 'play', reply))
const sendMessage = (socket: TestSocket, text: string, team?: TeamId) => result<ChatMessage>((reply) => (
  socket.emit('chat:send', { text, team }, reply)
))
const fastMoney = (socket: TestSocket, command: FastMoneyCommand) => result<RoomSnapshot>((reply) => (
  socket.emit('fast-money:action', command, reply)
))
const prepareNextGame = (socket: TestSocket, expectedGameRevision: number) => result<RoomSnapshot>((reply) => (
  socket.emit('room:prepare-next-game', { expectedGameRevision }, reply)
))
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

const [host, avery, casey, blake, late, nonHost] = await Promise.all(
  Array.from({ length: 6 }, () => connect()),
)
const sockets = [host, avery, casey, blake, late, nonHost]
const latest = new Map<TestSocket, RoomSnapshot>()
for (const socket of sockets) socket.on('room:snapshot', (snapshot) => latest.set(socket, snapshot))

try {
  const room = await createRoom(host)
  const averyJoined = await joinRoom(avery, room.code, 'Avery', 'late-join-avery-12345')
  await joinRoom(casey, room.code, 'Casey', 'late-join-casey-12345')
  await joinRoom(blake, room.code, 'Blake', 'late-join-blake-12345')
  await joinRoom(nonHost, room.code, 'Devon', 'late-join-devon-12345')
  await chooseTeam(avery, 'one')
  await chooseTeam(casey, 'one')
  await chooseTeam(blake, 'two')
  await chooseTeam(nonHost, 'two')
  await sendMessage(host, 'Comets strategy', 'one')
  await sendMessage(host, 'Rockets strategy', 'two')

  const started = await startGame(host)
  const initialRepresentatives = { ...started.buzzer.representatives }
  const initialTurns = structuredClone(started.feudTurns)

  const waiting = await joinRoom(late, room.code, 'Emery', 'late-join-emery-12345')
  const waitingId = waiting.viewer.role === 'player' ? waiting.viewer.participantId : ''
  assert.equal(waiting.participants.find((participant) => participant.id === waitingId)?.status, 'waiting')
  assert.equal(waiting.viewer.role === 'player' ? waiting.viewer.team : 'unexpected', null)
  assert.deepEqual(waiting.messages, [])
  assert.equal(waiting.teamChats.one, undefined)
  assert.equal(waiting.teamChats.two, undefined)
  assert.deepEqual(waiting.buzzer.representatives, initialRepresentatives)
  assert.deepEqual(waiting.feudTurns, initialTurns)

  await assert.rejects(() => chooseTeam(late, 'one'), /locked after the game starts/i)
  await assert.rejects(() => pressBuzzer(late), /join a team/i)
  await assert.rejects(() => assignTeam(nonHost, waitingId, 'one'), /only the host/i)

  const assigned = await assignTeam(host, waitingId, 'one')
  assert.equal(assigned.participants.find((participant) => participant.id === waitingId)?.status, 'waiting')
  assert.equal(assigned.participants.find((participant) => participant.id === waitingId)?.team, 'one')
  assert.deepEqual(assigned.buzzer.representatives, initialRepresentatives)
  assert.deepEqual(assigned.feudTurns, initialTurns)
  await settle()

  assert.deepEqual(latest.get(late)?.messages.map((message) => message.text), ['Comets strategy'])
  assert.equal(latest.get(late)?.teamChats.two, undefined)
  await sendMessage(late, 'I am ready for the next question')
  await assert.rejects(() => votePlayPass(late), /join a team before voting/i)
  await assert.rejects(() => selectRepresentative(host, 'one', waitingId), /active player/i)
  await assert.rejects(() => setTurnPlayer(host, 'one', waitingId), /connected player/i)

  late.disconnect()
  const reconnectedLate = await connect()
  sockets.push(reconnectedLate)
  reconnectedLate.on('room:snapshot', (snapshot) => latest.set(reconnectedLate, snapshot))
  const resumed = await joinRoom(reconnectedLate, room.code, 'Emery', 'late-join-emery-12345')
  assert.equal(resumed.participants.find((participant) => participant.id === waitingId)?.status, 'waiting')
  assert.equal(resumed.viewer.role === 'player' ? resumed.viewer.team : null, 'one')
  assert.deepEqual(resumed.messages.map((message) => message.text), [
    'Comets strategy',
    'I am ready for the next question',
  ])

  const activated = await prepareNextQuestion(host)
  assert.equal(activated.participants.find((participant) => participant.id === waitingId)?.status, 'active')
  assert.deepEqual(activated.buzzer.representatives, initialRepresentatives)
  assert.equal(activated.feudTurns.teams.one.currentPlayerId, initialTurns.teams.one.currentPlayerId)
  assert.deepEqual(
    activated.feudTurns.teams.one.order.slice(0, initialTurns.teams.one.order.length),
    initialTurns.teams.one.order,
  )
  assert.equal(activated.feudTurns.teams.one.order.at(-1), waitingId)

  await selectRepresentative(host, 'one', waitingId)
  await armBuzzer(host)
  const buzzed = await pressBuzzer(reconnectedLate)
  assert.equal(buzzed.winner?.participantId, waitingId)

  await fastMoney(host, { type: 'start', team: 'one' })
  const fastMoneyWaiting = await connect()
  sockets.push(fastMoneyWaiting)
  fastMoneyWaiting.on('room:snapshot', (snapshot) => latest.set(fastMoneyWaiting, snapshot))
  const fastMoneyJoined = await joinRoom(
    fastMoneyWaiting,
    room.code,
    'Finley',
    'late-join-finley-12345',
  )
  const fastMoneyWaitingId = fastMoneyJoined.viewer.role === 'player'
    ? fastMoneyJoined.viewer.participantId
    : ''
  assert.equal(fastMoneyJoined.participants.find((participant) => participant.id === fastMoneyWaitingId)?.status, 'waiting')
  assert.equal(fastMoneyJoined.game?.kind === 'fast-money' ? fastMoneyJoined.game.viewerRole : null, 'spectator')

  await assignTeam(host, fastMoneyWaitingId, 'one')
  await assert.rejects(() => fastMoney(fastMoneyWaiting, {
    type: 'vote',
    participantIds: [
      averyJoined.viewer.role === 'player' ? averyJoined.viewer.participantId : '',
      waitingId,
    ],
  }), /winning team/i)
  await assert.rejects(() => fastMoney(host, {
    type: 'set-lineup',
    contestantIds: [waitingId, fastMoneyWaitingId],
  }), /connected players from the winning team/i)

  const nextLobby = await prepareNextGame(host, started.gameRevision)
  assert.equal(nextLobby.phase, 'lobby')
  assert.equal(nextLobby.participants.find((participant) => participant.id === fastMoneyWaitingId)?.status, 'active')

  console.log('Host-approved late join waiting, privacy, activation, reconnect, and Fast Money safeguards passed.')
} finally {
  for (const socket of sockets) socket.disconnect()
}
