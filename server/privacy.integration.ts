import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
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
const config: GameConfig = { kind: 'spin-solve', teamOne: 'Comets', teamTwo: 'Rockets', rounds: 3 }

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

function createRoom(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:create', config, (result) => unwrap(result, resolve, reject)))
}

function joinRoom(socket: TestSocket, code: string, name: string): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:join', { code, name }, (result) => unwrap(result, resolve, reject)))
}

function chooseTeam(socket: TestSocket, team: TeamId): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:choose-team', team, (result) => unwrap(result, resolve, reject)))
}

function sendMessage(socket: TestSocket, text: string): Promise<void> {
  return new Promise((resolve, reject) => socket.emit('chat:send', text, (result) => unwrap(result, () => resolve(), reject)))
}

function startGame(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('game:start', (result) => unwrap(result, resolve, reject)))
}

function spin(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('game:action', { type: 'spin' }, (result) => unwrap(result, resolve, reject)))
}

function armBuzzer(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('buzzer:arm', (result) => unwrap(result, resolve, reject)))
}

function pressBuzzer(socket: TestSocket): Promise<void> {
  return new Promise((resolve, reject) => socket.emit('buzzer:press', (result) => unwrap(result, () => resolve(), reject)))
}

function nextBuzzerPair(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('buzzer:next-pair', (result) => unwrap(result, resolve, reject)))
}

const [host, teamOne, teamTwo, teamOneBench] = await Promise.all([connect(), connect(), connect(), connect()])
const views: { host?: RoomSnapshot; teamOne?: RoomSnapshot; teamTwo?: RoomSnapshot; teamOneBench?: RoomSnapshot } = {}

host.on('room:snapshot', (snapshot) => { views.host = snapshot })
teamOne.on('room:snapshot', (snapshot) => { views.teamOne = snapshot })
teamTwo.on('room:snapshot', (snapshot) => { views.teamTwo = snapshot })
teamOneBench.on('room:snapshot', (snapshot) => { views.teamOneBench = snapshot })

try {
  const room = await createRoom(host)
  await joinRoom(teamOne, room.code, 'Avery')
  await joinRoom(teamTwo, room.code, 'Blake')
  await joinRoom(teamOneBench, room.code, 'Casey')
  await chooseTeam(teamOne, 'one')
  await chooseTeam(teamTwo, 'two')
  await chooseTeam(teamOneBench, 'one')
  await assert.rejects(() => chooseTeam(teamOne, 'two'), /team is locked/i)

  await sendMessage(teamOne, 'Our answer is snacks.')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(views.teamOne?.messages.at(-1)?.text, 'Our answer is snacks.')
  assert.equal(views.teamTwo?.messages.length, 0)
  assert.equal(views.host?.messages.length, 0)

  await sendMessage(teamTwo, 'Let’s guess traffic.')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(views.teamTwo?.messages.at(-1)?.text, 'Let’s guess traffic.')
  assert.equal(views.teamOne?.messages.length, 1)
  assert.equal(views.host?.messages.length, 0)

  const started = await startGame(host)
  assert.equal(started.phase, 'playing')
  assert.equal(started.game?.kind, 'spin-solve')
  assert.equal(JSON.stringify(started.game).includes('"solution"'), false)
  await assert.rejects(() => spin(teamTwo), /team’s turn/i)
  const afterSpin = await spin(teamOne)
  assert.equal(afterSpin.game?.spinId, 1)
  assert.equal(JSON.stringify(views.teamTwo?.game).includes('"solution"'), false)
  assert.equal(started.buzzer.representatives.one, started.participants.find((participant) => participant.name === 'Avery')?.id)
  assert.equal(started.buzzer.representatives.two, started.participants.find((participant) => participant.name === 'Blake')?.id)

  const armed = await armBuzzer(host)
  assert.equal(armed.buzzer.status, 'armed')
  await assert.rejects(() => pressBuzzer(teamOneBench), /not your team’s representative/i)
  const buzzes = await Promise.allSettled([pressBuzzer(teamOne), pressBuzzer(teamTwo)])
  assert.equal(buzzes.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(buzzes.filter((result) => result.status === 'rejected').length, 1)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(views.host?.buzzer.status, 'locked')
  assert.ok(views.host?.buzzer.winner)
  assert.equal(views.teamOne?.buzzer.winner?.participantId, views.host?.buzzer.winner?.participantId)
  assert.equal(views.teamTwo?.buzzer.winner?.participantId, views.host?.buzzer.winner?.participantId)

  const nextPair = await nextBuzzerPair(host)
  assert.equal(nextPair.buzzer.representatives.one, nextPair.participants.find((participant) => participant.name === 'Casey')?.id)
  assert.equal(nextPair.buzzer.representatives.two, nextPair.participants.find((participant) => participant.name === 'Blake')?.id)

  console.log('Room lifecycle, Spin & Solve authorization/redaction, chat privacy, representative rotation, and first-buzz locking passed.')
} finally {
  host.disconnect()
  teamOne.disconnect()
  teamTwo.disconnect()
  teamOneBench.disconnect()
}
