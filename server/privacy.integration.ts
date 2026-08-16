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
const config: GameConfig = { teamOne: 'Comets', teamTwo: 'Rockets', winningScore: 300 }

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

const [host, teamOne, teamTwo] = await Promise.all([connect(), connect(), connect()])
const views: { host?: RoomSnapshot; teamOne?: RoomSnapshot; teamTwo?: RoomSnapshot } = {}

host.on('room:snapshot', (snapshot) => { views.host = snapshot })
teamOne.on('room:snapshot', (snapshot) => { views.teamOne = snapshot })
teamTwo.on('room:snapshot', (snapshot) => { views.teamTwo = snapshot })

try {
  const room = await createRoom(host)
  await joinRoom(teamOne, room.code, 'Avery')
  await joinRoom(teamTwo, room.code, 'Blake')
  await chooseTeam(teamOne, 'one')
  await chooseTeam(teamTwo, 'two')
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
  console.log('Room lifecycle and private team-chat isolation passed.')
} finally {
  host.disconnect()
  teamOne.disconnect()
  teamTwo.disconnect()
}
