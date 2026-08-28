import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { starterFeudPack } from '../src/gameData.js'
import {
  HOST_AVATAR_ID,
  type ChatMessage,
  type ChatTypingUpdate,
  type ClientToServerEvents,
  type GameConfig,
  type HostRoomCreation,
  type PlayPassChoice,
  type RoomResult,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SharedTimerPreset,
  type TeamId,
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
  return new Promise((resolve, reject) => emit((value) => value.ok ? resolve(value.data) : reject(new Error(value.error))))
}

const createRoom = (socket: TestSocket) => result<HostRoomCreation>((reply) => socket.emit('room:create', config, reply)).then((creation) => creation.room)
const sessionId = (name: string) => `test-session-${name.toLowerCase()}-12345`
const joinRoom = (socket: TestSocket, code: string, name: string, avatarId: string | null = null, playerSessionId = sessionId(name)) => result<RoomSnapshot>((reply) => socket.emit('room:join', { code, name, avatarId, sessionId: playerSessionId }, reply))
const updateIdentity = (socket: TestSocket, name: string, avatarId: string | null) => result<RoomSnapshot>((reply) => socket.emit('participant:update-identity', { name, avatarId }, reply))
const chooseTeam = (socket: TestSocket, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit('room:choose-team', team, reply))
const assignTeam = (socket: TestSocket, participantId: string, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit('room:assign-team', { participantId, team }, reply))
const randomizeTeams = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('room:randomize-teams', reply))
const startTimer = (socket: TestSocket, durationSeconds: SharedTimerPreset) => result<RoomSnapshot>((reply) => socket.emit('timer:start', { durationSeconds }, reply))
const stopTimer = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('timer:stop', reply))
const sendMessage = (socket: TestSocket, text: string, team?: TeamId) => result<ChatMessage>((reply) => socket.emit('chat:send', { text, team }, reply))
const setTyping = (socket: TestSocket, isTyping: boolean, team?: TeamId) => socket.emit('chat:typing', { isTyping, team })
const startGame = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('game:start', reply))
const armBuzzer = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('buzzer:arm', reply))
const pressBuzzer = (socket: TestSocket) => result((reply) => socket.emit('buzzer:press', reply))
const openPoll = (socket: TestSocket, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit('feud:open-play-pass', { team }, reply))
const openInvalidPoll = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('feud:open-play-pass', { team: 'three' as TeamId }, reply))
const vote = (socket: TestSocket, choice: PlayPassChoice) => result<RoomSnapshot>((reply) => socket.emit('feud:vote-play-pass', choice, reply))
const decide = (socket: TestSocket, choice: PlayPassChoice) => result<RoomSnapshot>((reply) => socket.emit('feud:decide-play-pass', choice, reply))
const endQuestion = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit('feud:end-question', reply))
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

const [host, avery, casey, blake] = await Promise.all([connect(), connect(), connect(), connect()])
const sockets = [host, avery, casey, blake]
const views = new Map<TestSocket, RoomSnapshot>()
const typingUpdates = new Map<TestSocket, ChatTypingUpdate[]>()
for (const socket of sockets) socket.on('room:snapshot', (snapshot) => views.set(socket, snapshot))
for (const socket of sockets) {
  typingUpdates.set(socket, [])
  socket.on('chat:typing', (update) => typingUpdates.get(socket)?.push(update))
}

try {
  const created = await createRoom(host)
  const averySessionId = sessionId('Avery')
  const averyJoined = await joinRoom(avery, created.code, 'Avery', 'contestants/rocket rider.webp', averySessionId)
  const caseyJoined = await joinRoom(casey, created.code, 'Casey')
  await assert.rejects(() => joinRoom(blake, created.code, 'Blake', HOST_AVATAR_ID), /reserved for the host/i)
  const blakeJoined = await joinRoom(blake, created.code, 'Blake')
  await chooseTeam(avery, 'one')
  await chooseTeam(casey, 'one')
  await chooseTeam(blake, 'two')

  const caseyParticipantId = caseyJoined.viewer.role === 'player' ? caseyJoined.viewer.participantId : ''
  await assert.rejects(() => assignTeam(avery, caseyParticipantId, 'two'), /only the host/i)
  await assert.rejects(() => randomizeTeams(casey), /only the host/i)

  await assert.rejects(() => startTimer(avery, 5), /only the host/i)
  await assert.rejects(() => stopTimer(avery), /only the host/i)
  const twentyFiveSecondTimer = await startTimer(host, 25)
  assert.equal(twentyFiveSecondTimer.timer.status, 'running')
  assert.equal(twentyFiveSecondTimer.timer.durationSeconds, 25)
  assert.ok(twentyFiveSecondTimer.timer.deadline > Date.now())
  await settle()
  for (const socket of sockets) assert.deepEqual(views.get(socket)?.timer, twentyFiveSecondTimer.timer)

  const replacementTimer = await startTimer(host, 5)
  assert.equal(replacementTimer.timer.status, 'running')
  assert.equal(replacementTimer.timer.durationSeconds, 5)
  assert.ok(replacementTimer.timer.deadline < twentyFiveSecondTimer.timer.deadline)
  const stoppedTimer = await stopTimer(host)
  assert.equal(stoppedTimer.timer.status, 'idle')
  await settle()
  for (const socket of sockets) assert.equal(views.get(socket)?.timer.status, 'idle')

  await settle()
  assert.equal(views.get(host)?.participants.find((participant) => participant.name === 'Avery')?.avatarId, 'contestants/rocket rider.webp')
  await updateIdentity(avery, 'Avery Wang', 'contestants/disco ball.webp')
  await settle()
  assert.equal(views.get(host)?.participants.find((participant) => participant.name === 'Avery Wang')?.avatarId, 'contestants/disco ball.webp')
  await assert.rejects(() => updateIdentity(avery, 'Avery Wang', 'https://example.com/not-allowed.webp'), /valid avatar/i)
  await assert.rejects(() => updateIdentity(avery, 'Avery Wang', HOST_AVATAR_ID), /reserved for the host/i)

  setTyping(avery, true)
  await settle()
  assert.deepEqual(typingUpdates.get(host)?.at(-1), {
    senderId: averyJoined.viewer.role === 'player' ? averyJoined.viewer.participantId : '',
    senderName: 'Avery Wang',
    senderAvatarId: 'contestants/disco ball.webp',
    team: 'one',
    isTyping: true,
  })
  assert.equal(typingUpdates.get(casey)?.at(-1)?.senderName, 'Avery Wang')
  assert.equal(typingUpdates.get(avery)?.length, 0)
  assert.equal(typingUpdates.get(blake)?.length, 0)
  setTyping(avery, false)
  await settle()
  assert.equal(typingUpdates.get(host)?.at(-1)?.isTyping, false)
  assert.equal(typingUpdates.get(casey)?.at(-1)?.isTyping, false)

  setTyping(host, true, 'two')
  await settle()
  assert.deepEqual(typingUpdates.get(blake)?.at(-1), {
    senderId: 'host',
    senderName: 'Host',
    senderAvatarId: HOST_AVATAR_ID,
    team: 'two',
    isTyping: true,
  })
  assert.equal(typingUpdates.get(avery)?.length, 0)
  assert.equal(typingUpdates.get(casey)?.length, 2)
  setTyping(host, false, 'two')
  await settle()

  await sendMessage(avery, 'Comets only')
  await sendMessage(blake, 'Rockets only')
  await sendMessage(host, 'Host checking in', 'one')
  await settle()
  assert.deepEqual(views.get(host)?.teamChats.one?.map((message) => message.text), ['Comets only', 'Host checking in'])
  assert.deepEqual(views.get(host)?.teamChats.two?.map((message) => message.text), ['Rockets only'])
  assert.deepEqual(views.get(avery)?.messages.map((message) => message.text), ['Comets only', 'Host checking in'])
  assert.deepEqual(views.get(blake)?.messages.map((message) => message.text), ['Rockets only'])
  assert.equal(views.get(blake)?.messages[0]?.senderAvatarId, null)
  assert.equal(views.get(blake)?.teamChats.one, undefined)
  assert.equal(views.get(avery)?.messages[0]?.senderAvatarId, 'contestants/disco ball.webp')
  assert.equal(views.get(avery)?.messages[1]?.senderAvatarId, HOST_AVATAR_ID)

  await assignTeam(host, caseyParticipantId, 'two')
  await settle()
  const movedCasey = views.get(casey)
  assert.equal(movedCasey?.viewer.role === 'player' ? movedCasey.viewer.team : null, 'two')
  assert.deepEqual(views.get(casey)?.messages.map((message) => message.text), ['Rockets only'])

  const randomized = await randomizeTeams(host)
  assert.equal(randomized.participants.filter((participant) => participant.team === 'one').length, 2)
  assert.equal(randomized.participants.filter((participant) => participant.team === 'two').length, 1)
  await settle()
  for (const socket of [avery, casey, blake]) {
    const snapshot = views.get(socket)
    assert.equal(snapshot?.viewer.role, 'player')
    if (snapshot?.viewer.role !== 'player' || !snapshot.viewer.team) throw new Error('Randomization left a player without a team.')
    assert.deepEqual(snapshot.messages, snapshot.teamChats[snapshot.viewer.team])
    assert.equal(snapshot.teamChats[snapshot.viewer.team === 'one' ? 'two' : 'one'], undefined)
  }

  const drew = await connect()
  sockets.push(drew)
  views.set(drew, await joinRoom(drew, created.code, 'Drew'))
  drew.on('room:snapshot', (snapshot) => views.set(drew, snapshot))
  typingUpdates.set(drew, [])
  drew.on('chat:typing', (update) => typingUpdates.get(drew)?.push(update))
  const drewBeforeChoosing = views.get(drew)
  assert.equal(drewBeforeChoosing?.viewer.role === 'player' ? drewBeforeChoosing.viewer.team : undefined, null)
  await chooseTeam(drew, 'two')
  await settle()
  const drewAfterChoosing = views.get(drew)
  assert.equal(drewAfterChoosing?.viewer.role === 'player' ? drewAfterChoosing.viewer.team : null, 'two')
  assert.deepEqual(views.get(drew)?.messages.map((message) => message.text), ['Rockets only'])
  await assert.rejects(() => chooseTeam(drew, 'one'), /team is locked/i)

  await assignTeam(host, averyJoined.viewer.role === 'player' ? averyJoined.viewer.participantId : '', 'one')
  await assignTeam(host, caseyParticipantId, 'one')
  await assignTeam(host, blakeJoined.viewer.role === 'player' ? blakeJoined.viewer.participantId : '', 'two')
  const started = await startGame(host)
  await settle()
  assert.equal('pack' in started.config, true)
  for (const team of ['one', 'two'] as TeamId[]) {
    const representativeId = started.buzzer.representatives[team]
    assert.ok(started.participants.some((participant) => participant.id === representativeId && participant.team === team))
  }
  for (const socket of [avery, casey, blake, drew]) {
    const playerView = views.get(socket)
    if (!playerView) throw new Error('Player did not receive the started game snapshot.')
    assert.equal('pack' in playerView.config, false)
    assert.equal(JSON.stringify(playerView).includes(config.kind === 'feud' ? config.pack.questions[0].prompt : ''), false)
  }
  await assert.rejects(() => assignTeam(host, blakeJoined.viewer.role === 'player' ? blakeJoined.viewer.participantId : '', 'one'), /locked after the game starts/i)
  await assert.rejects(() => randomizeTeams(host), /locked after the game starts/i)
  await assert.rejects(() => openPoll(host, 'one'), /finish the face-off/i)

  await armBuzzer(host)
  const activeId = started.buzzer.representatives.one
  const activeSocket = activeId === (averyJoined.viewer.role === 'player' ? averyJoined.viewer.participantId : '') ? avery : casey
  const teammateSocket = activeSocket === avery ? casey : avery
  await pressBuzzer(activeSocket)
  await assert.rejects(() => openPoll(activeSocket, 'one'), /only the host/i)
  await assert.rejects(() => openInvalidPoll(host), /valid team/i)
  const openedOtherTeam = await openPoll(host, 'two')
  assert.equal(openedOtherTeam.playPass.team, 'two')
  assert.equal(openedOtherTeam.playPass.activePlayerId, started.buzzer.representatives.two)
  assert.equal(openedOtherTeam.buzzer.winner?.participantId, activeId)
  assert.equal(openedOtherTeam.buzzer.winner?.team, 'one')
  await assert.rejects(() => openPoll(host, 'one'), /already active/i)
  await assert.rejects(() => vote(teammateSocket, 'pass'), /no play\/pass vote open for your team/i)
  await vote(blake, 'play')
  const canceled = await endQuestion(host)
  assert.equal(canceled.playPass.status, 'closed')

  const opened = await openPoll(host, 'one')
  assert.equal(opened.playPass.team, 'one')
  assert.equal(opened.playPass.activePlayerId, activeId)

  await assert.rejects(() => vote(blake, 'pass'), /no play\/pass vote open for your team/i)
  const voted = await vote(teammateSocket, 'pass')
  assert.equal(voted.playPass.votes.pass, 1)
  await assert.rejects(() => decide(teammateSocket, 'pass'), /only the designated active player/i)
  await settle()
  assert.equal(views.get(blake)?.playPass.status, 'closed')
  assert.equal(views.get(host)?.playPass.votes.pass, 1)

  const decided = await decide(activeSocket, 'pass')
  assert.equal(decided.playPass.decision, 'pass')
  assert.equal(decided.playPass.controllingTeam, 'two')
  assert.equal(decided.chat.lockedTeam, 'two')
  const existingRocketsMessages = views.get(blake)?.messages.length
  await assert.rejects(() => sendMessage(blake, 'This must be blocked'), /answering now/i)
  assert.equal(views.get(blake)?.messages.length, existingRocketsMessages)
  await sendMessage(avery, 'Comets can still huddle')
  await sendMessage(host, 'Host can moderate while locked', 'two')
  await settle()
  assert.equal(views.get(blake)?.messages.at(-1)?.text, 'Host can moderate while locked')

  const ended = await endQuestion(host)
  assert.equal(ended.chat.lockedTeam, null)
  assert.equal(ended.playPass.status, 'closed')
  await sendMessage(blake, 'Rockets huddle reopened')

  blake.disconnect()
  await settle()
  await assert.rejects(() => openPoll(host, 'two'), /connected face-off representative/i)

  const reconnectTimer = await startTimer(host, 40)
  avery.disconnect()
  const reconnectedAvery = await connect()
  sockets.push(reconnectedAvery)
  const resumed = await joinRoom(reconnectedAvery, created.code, 'Avery Wang', 'contestants/disco ball.webp', averySessionId)
  assert.equal(resumed.viewer.role === 'player' ? resumed.viewer.participantId : null, averyJoined.viewer.role === 'player' ? averyJoined.viewer.participantId : null)
  assert.equal(resumed.participants.find((participant) => participant.name === 'Avery Wang')?.avatarId, 'contestants/disco ball.webp')
  assert.deepEqual(resumed.timer, reconnectTimer.timer)
  await stopTimer(host)

  console.log('Shared timer synchronization, avatar chat identity, typing privacy, reconnect, host question visibility, chat privacy, lobby team management, roster-authoritative membership, lock enforcement, and play/pass authorization passed.')
} finally {
  for (const socket of sockets) socket.disconnect()
}
