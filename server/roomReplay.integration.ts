import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { starterFeudPack } from '../src/gameData.js'
import type {
  ClientToServerEvents,
  GameConfig,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from '../src/roomTypes.js'

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

const serverUrl = process.env.ROOM_SERVER_URL ?? 'http://localhost:3001'
const feudConfig: GameConfig = {
  kind: 'feud',
  teamOne: 'Comets',
  teamTwo: 'Rockets',
  winningScore: 300,
  pack: starterFeudPack,
}
const spinConfig: GameConfig = {
  kind: 'spin-solve',
  teamOne: 'Comets',
  teamTwo: 'Rockets',
  rounds: 2,
}

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(serverUrl, { transports: ['websocket'], forceNew: true })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', reject)
  })
}

function unwrap<T>(result: RoomResult<T>, resolve: (value: T) => void, reject: (reason: Error) => void): void {
  if (result.ok) resolve(result.data)
  else reject(new Error(result.error))
}

const result = <T>(run: (reply: (value: RoomResult<T>) => void) => void) => new Promise<T>((resolve, reject) => {
  run((value) => unwrap(value, resolve, reject))
})

const createRoom = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('room:create', feudConfig, reply))
const joinRoom = (socket: TestSocket, code: string, name: string, sessionId: string) => result<RoomSnapshot>((reply) => socket.emit('room:join', {
  code,
  name,
  avatarId: null,
  sessionId,
}, reply))
const chooseTeam = (socket: TestSocket, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit('room:choose-team', team, reply))
const startGame = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('game:start', reply))
const prepareNextGame = (socket: TestSocket, expectedGameRevision: number, config?: GameConfig) => result<RoomSnapshot>((reply) => socket.emit(
  'room:prepare-next-game',
  { expectedGameRevision, ...(config ? { config } : {}) },
  reply,
))
const clearTeamChats = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('room:clear-team-chats', reply))
const sendMessage = (socket: TestSocket, text: string) => result((reply) => socket.emit('chat:send', { text }, reply))
const startTimer = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('timer:start', { durationSeconds: 40 }, reply))
const armBuzzer = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('buzzer:arm', reply))
const pressBuzzer = (socket: TestSocket) => result((reply) => socket.emit('buzzer:press', reply))
const openPlayPass = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('feud:open-play-pass', { team: 'one' }, reply))
const startFastMoney = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('fast-money:action', { type: 'start', team: 'one' }, reply))

const host = await connect()
const teamOne = await connect()
let teamOneSecond = await connect()
const teamTwo = await connect()
const latest = new Map<TestSocket, RoomSnapshot>()
for (const socket of [host, teamOne, teamOneSecond, teamTwo]) {
  socket.on('room:snapshot', (snapshot) => latest.set(socket, snapshot))
}

try {
  const created = await createRoom(host)
  assert.equal(created.gameRevision, 0)
  const firstJoined = await joinRoom(teamOne, created.code, 'Avery', 'replay-avery-session-12345')
  await joinRoom(teamOneSecond, created.code, 'Blake', 'replay-blake-session-12345')
  await joinRoom(teamTwo, created.code, 'Casey', 'replay-casey-session-12345')
  await chooseTeam(teamOne, 'one')
  await chooseTeam(teamOneSecond, 'one')
  await chooseTeam(teamTwo, 'two')
  await sendMessage(teamOne, 'Keep this plan for the next game.')
  await sendMessage(teamTwo, 'Rockets chat survives too.')

  const firstGame = await startGame(host)
  assert.equal(firstGame.phase, 'playing')
  assert.equal(firstGame.gameRevision, 1)
  await startTimer(host)
  await armBuzzer(host)
  await pressBuzzer(teamOne)
  const openPoll = await openPlayPass(host)
  assert.equal(openPoll.playPass.status, 'open')
  assert.notEqual(openPoll.buzzer.winner, null)
  assert.equal(openPoll.timer.status, 'running')

  const originalCode = firstGame.code
  const originalParticipants = firstGame.participants.map(({ id, name, team }) => ({ id, name, team }))
  teamOneSecond.disconnect()
  const reset = await prepareNextGame(host, firstGame.gameRevision)
  assert.equal(reset.code, originalCode)
  assert.equal(reset.phase, 'lobby')
  assert.equal(reset.gameRevision, 1)
  assert.equal(reset.config.kind, 'feud')
  assert.deepEqual(reset.participants.map(({ id, name, team }) => ({ id, name, team })), originalParticipants)
  assert.equal(reset.teamChats.one?.at(-1)?.text, 'Keep this plan for the next game.')
  assert.equal(reset.teamChats.two?.at(-1)?.text, 'Rockets chat survives too.')
  assert.equal(reset.game, null)
  assert.equal(reset.timer.status, 'idle')
  assert.equal(reset.buzzer.status, 'idle')
  assert.equal(reset.buzzer.winner, null)
  assert.deepEqual(reset.buzzer.representatives, { one: null, two: null })
  assert.equal(reset.playPass.status, 'closed')
  assert.equal(reset.playPass.controllingTeam, null)
  assert.equal(reset.feudTurns.activeTeam, null)
  assert.equal(reset.chat.lockedTeam, null)

  await new Promise((resolve) => setTimeout(resolve, 30))
  const playerLobby = latest.get(teamOne)
  assert.equal(playerLobby?.phase, 'lobby')
  assert.equal(playerLobby?.code, originalCode)
  assert.equal(JSON.stringify(playerLobby?.config).includes('pack'), false)
  await assert.rejects(() => prepareNextGame(teamOne, reset.gameRevision), /only the host/i)

  teamOneSecond = await connect()
  teamOneSecond.on('room:snapshot', (snapshot) => latest.set(teamOneSecond, snapshot))
  const reconnected = await joinRoom(teamOneSecond, originalCode, 'Blake', 'replay-blake-session-12345')
  assert.equal(reconnected.phase, 'lobby')
  assert.equal(reconnected.viewer.role === 'player' ? reconnected.viewer.team : null, 'one')
  assert.equal(reconnected.participants.find((participant) => participant.name === 'Blake')?.id, originalParticipants.find((participant) => participant.name === 'Blake')?.id)

  const duplicateReset = await prepareNextGame(host, reset.gameRevision)
  assert.equal(duplicateReset.phase, 'lobby')
  assert.deepEqual(duplicateReset.participants.map(({ id, team }) => ({ id, team })), reset.participants.map(({ id, team }) => ({ id, team })))
  assert.equal(duplicateReset.teamChats.one?.length, 1)

  const secondGame = await startGame(host)
  assert.equal(secondGame.gameRevision, 2)
  const duplicateStart = await startGame(host)
  assert.equal(duplicateStart.gameRevision, 2)
  assert.equal(duplicateStart.phase, 'playing')

  const fastMoney = await startFastMoney(host)
  assert.equal(fastMoney.game?.kind, 'fast-money')
  const switched = await prepareNextGame(host, secondGame.gameRevision, spinConfig)
  assert.equal(switched.code, originalCode)
  assert.equal(switched.phase, 'lobby')
  assert.equal(switched.config.kind, 'spin-solve')
  assert.equal(switched.game, null)
  assert.deepEqual(switched.participants.map(({ id, team }) => ({ id, team })), reset.participants.map(({ id, team }) => ({ id, team })))
  assert.equal(switched.teamChats.one?.length, 1)
  assert.equal(switched.teamChats.two?.length, 1)

  const cleared = await clearTeamChats(host)
  assert.deepEqual(cleared.teamChats, { one: [], two: [] })
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(latest.get(teamOne)?.messages.length, 0)
  const spinStarted = await startGame(host)
  assert.equal(spinStarted.gameRevision, 3)
  assert.equal(spinStarted.game?.kind, 'spin-solve')
  const originalSpinState = JSON.stringify(spinStarted.game)
  const duplicateSpinStart = await startGame(host)
  assert.equal(duplicateSpinStart.gameRevision, 3)
  assert.equal(JSON.stringify(duplicateSpinStart.game), originalSpinState)
  await assert.rejects(() => prepareNextGame(host, secondGame.gameRevision), /newer game/i)
  await assert.rejects(() => clearTeamChats(host), /before starting/i)

  assert.equal(firstJoined.viewer.role === 'player' ? firstJoined.viewer.participantId : '', originalParticipants.find((participant) => participant.name === 'Avery')?.id)
  console.log('Same-room replay, reset isolation, chat preservation/clearing, config switching, reconnects, and idempotency passed.')
} finally {
  host.disconnect()
  teamOne.disconnect()
  teamOneSecond.disconnect()
  teamTwo.disconnect()
}
