import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { starterFeudPack } from '../src/gameData.js'
import type {
  ClientToServerEvents,
  FastMoneyCommand,
  GameConfig,
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

function unwrap<T>(result: RoomResult<T>, resolve: (value: T) => void, reject: (reason: Error) => void): void {
  if (result.ok) resolve(result.data)
  else reject(new Error(result.error))
}

function createRoom(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:create', config, (result) => {
    if (result.ok) resolve(result.data.room)
    else reject(new Error(result.error))
  }))
}

function joinRoom(socket: TestSocket, code: string, name: string, sessionId: string): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:join', {
    code,
    name,
    avatarId: null,
    sessionId,
  }, (result) => unwrap(result, resolve, reject)))
}

function chooseTeam(socket: TestSocket, team: TeamId): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('room:choose-team', team, (result) => unwrap(result, resolve, reject)))
}

function startGame(socket: TestSocket): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('game:start', (result) => unwrap(result, resolve, reject)))
}

function fastMoney(socket: TestSocket, command: FastMoneyCommand): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => socket.emit('fast-money:action', command, (result) => unwrap(result, resolve, reject)))
}

const [host, first, second, opponent] = await Promise.all([connect(), connect(), connect(), connect()])
const latest = new Map<TestSocket, RoomSnapshot>()
for (const socket of [host, first, second, opponent]) {
  socket.on('room:snapshot', (snapshot) => latest.set(socket, snapshot))
}

try {
  const room = await createRoom(host)
  const firstJoined = await joinRoom(first, room.code, 'Avery', 'fast-money-avery-12345')
  const secondJoined = await joinRoom(second, room.code, 'Blake', 'fast-money-blake-12345')
  await joinRoom(opponent, room.code, 'Devon', 'fast-money-devon-12345')
  await chooseTeam(first, 'one')
  await chooseTeam(second, 'one')
  await chooseTeam(opponent, 'two')
  await startGame(host)

  await fastMoney(host, { type: 'start', team: 'one' })
  await assert.rejects(() => fastMoney(opponent, {
    type: 'vote',
    participantIds: [firstJoined.viewer.role === 'player' ? firstJoined.viewer.participantId : '', secondJoined.viewer.role === 'player' ? secondJoined.viewer.participantId : ''],
  }), /winning team/i)
  const firstId = firstJoined.viewer.role === 'player' ? firstJoined.viewer.participantId : ''
  const secondId = secondJoined.viewer.role === 'player' ? secondJoined.viewer.participantId : ''
  await fastMoney(first, { type: 'vote', participantIds: [firstId, secondId] })
  await fastMoney(second, { type: 'vote', participantIds: [secondId, firstId] })
  await fastMoney(host, { type: 'set-lineup', contestantIds: [firstId, secondId] })
  await fastMoney(host, { type: 'confirm-lineup' })
  await fastMoney(host, { type: 'start-attempt' })
  await new Promise((resolve) => setTimeout(resolve, 30))

  const isolated = latest.get(second)?.game
  assert.equal(isolated?.kind, 'fast-money')
  assert.equal(isolated?.kind === 'fast-money' ? isolated.isIsolated : false, true)
  assert.equal(JSON.stringify(isolated).includes(starterFeudPack.fastMoney?.questions[0].prompt ?? 'missing'), false)
  assert.equal(JSON.stringify(isolated).includes('Check their phone'), false)
  const hostGame = latest.get(host)?.game
  assert.equal(hostGame?.kind === 'fast-money' ? Boolean(hostGame.questions[0].answerOptions?.length) : false, true)
  assert.deepEqual(hostGame?.kind === 'fast-money' ? hostGame.attemptDurations : [], [35, 40])
  const firstGame = latest.get(first)?.game
  assert.equal(firstGame?.kind === 'fast-money'
    ? firstGame.questions.every((question) => question.prompt === null)
    : false, true)
  await assert.rejects(() => fastMoney(first, { type: 'submit', answer: 'Phone' }), /only the host/i)
  await assert.rejects(() => fastMoney(first, { type: 'pass' }), /only the host/i)

  for (const question of starterFeudPack.fastMoney?.questions ?? []) {
    await fastMoney(host, { type: 'submit', answer: question.answers[0].label })
  }
  await fastMoney(host, { type: 'lock-review' })
  await assert.rejects(() => fastMoney(host, { type: 'start-attempt' }), /not ready/i)
  await fastMoney(host, { type: 'reveal-next' })
  await new Promise((resolve) => setTimeout(resolve, 30))

  const opponentFirstReveal = latest.get(opponent)?.game
  assert.equal(opponentFirstReveal?.kind === 'fast-money' ? opponentFirstReveal.questions[0].responses[0].text : null, starterFeudPack.fastMoney?.questions[0].answers[0].label)
  assert.equal(opponentFirstReveal?.kind === 'fast-money' ? opponentFirstReveal.questions[0].responses[1].text : 'leaked', null)

  second.disconnect()
  const reconnectedSecond = await connect()
  reconnectedSecond.on('room:snapshot', (snapshot) => latest.set(reconnectedSecond, snapshot))
  const resumed = await joinRoom(reconnectedSecond, room.code, 'Blake', 'fast-money-blake-12345')
  assert.equal(resumed.game?.kind, 'fast-money')
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.viewerRole : '', 'contestant-two')
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.phase : '', 'reveal-one')
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.isIsolated : false, true)
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.questions[0].responses[0].text : 'leaked', null)
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.questions[0].prompt : 'leaked', null)
  assert.deepEqual(resumed.game?.kind === 'fast-money' ? resumed.game.subtotals : [], [null, null])
  assert.equal(resumed.game?.kind === 'fast-money' ? resumed.game.questions.every((question) => question.answerOptions === null) : false, true)

  for (let index = 1; index < 5; index += 1) await fastMoney(host, { type: 'reveal-next' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const completedFirstReveal = latest.get(opponent)?.game
  assert.equal(completedFirstReveal?.kind === 'fast-money' ? completedFirstReveal.questions.every((question) => question.revealed) : false, true)
  assert.notEqual(completedFirstReveal?.kind === 'fast-money' ? completedFirstReveal.subtotals[0] : null, null)
  const stillIsolated = latest.get(reconnectedSecond)?.game
  assert.equal(stillIsolated?.kind === 'fast-money' ? stillIsolated.questions.every((question) => question.responses[0].text === null) : false, true)

  await fastMoney(host, { type: 'finish-first-reveal' })
  await fastMoney(host, { type: 'start-attempt' })
  await new Promise((resolve) => setTimeout(resolve, 30))

  const hostAttemptTwo = latest.get(host)?.game
  assert.equal(hostAttemptTwo?.kind === 'fast-money'
    ? hostAttemptTwo.questions[0].responses[0].text
    : null, starterFeudPack.fastMoney?.questions[0].answers[0].label)
  await assert.rejects(() => fastMoney(reconnectedSecond, { type: 'submit', answer: 'Phone' }), /only the host/i)
  await assert.rejects(() => fastMoney(host, { type: 'submit', answer: 'Phone' }), /repeat answer/i)
  for (const question of starterFeudPack.fastMoney?.questions ?? []) {
    await fastMoney(host, { type: 'submit', answer: question.answers[1].label })
  }
  await assert.rejects(() => fastMoney(opponent, { type: 'lock-review' }), /only the host/i)
  await fastMoney(host, { type: 'lock-review' })
  await fastMoney(host, { type: 'reveal-next' })
  await new Promise((resolve) => setTimeout(resolve, 30))

  const opponentReveal = latest.get(opponent)?.game
  assert.equal(opponentReveal?.kind === 'fast-money' ? opponentReveal.questions[0].revealed : false, true)
  assert.equal(opponentReveal?.kind === 'fast-money' ? opponentReveal.questions[1].revealed : true, false)
  assert.equal(opponentReveal?.kind === 'fast-money' ? opponentReveal.questions[0].responses[0].text : null, starterFeudPack.fastMoney?.questions[0].answers[0].label)
  assert.equal(opponentReveal?.kind === 'fast-money' ? opponentReveal.questions[1].responses[0].text : 'leaked', null)

  reconnectedSecond.disconnect()
  console.log('Fast Money 35/40 timers, between-attempt reveal, reconnect isolation, and staged final reveal passed.')
} finally {
  host.disconnect()
  first.disconnect()
  second.disconnect()
  opponent.disconnect()
}
