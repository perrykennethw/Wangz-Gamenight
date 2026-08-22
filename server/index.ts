import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Server, type Socket } from 'socket.io'
import { normalizeAvatarId } from '../src/avatarId.js'
import {
  HOST_AVATAR_ID,
  type AvatarId,
  type ChatMessage,
  type ChatTypingUpdate,
  type BuzzerState,
  type ClientToServerEvents,
  type GameConfig,
  type FeudRoundCommand,
  type FeudRoundView,
  type Participant,
  type PlayPassChoice,
  type PlayPassPollView,
  type RoomResult,
  type RoomSnapshot,
  type ServerToClientEvents,
  type SharedTimerState,
  type TeamId,
} from '../src/roomTypes.js'
import { applyFeudRoundCommand, createFeudRoundState, otherFeudTeam, setFeudControl } from '../src/feudRound.js'
import { GamePackError, normalizeFeudGamePack } from '../src/feudGamePack.js'
import {
  activateFeudTurnTeam,
  advanceFeudTurn,
  createFeudTurnState,
  deactivateFeudTurns,
  repairFeudTurnState,
  seedFeudTurnsAfterRepresentatives,
  selectFeudTurnPlayer,
  viewFeudTurnOrder,
  type FeudTurnState,
} from '../src/feudTurnOrder.js'
import {
  createIdleSharedTimer,
  expireSharedTimer,
  isSharedTimerPreset,
  startSharedTimer,
} from '../src/sharedTimer.js'
import { applySpinSolveCommand, createSpinSolveGame, viewSpinSolveGame, type SpinSolveState } from './spinSolve.js'
import {
  applyFastMoneyCommand,
  createFastMoneyState,
  expireFastMoney,
  viewFastMoney,
  type FastMoneyActor,
  type FastMoneyState,
} from './fastMoney.js'

interface Connection {
  role: 'host' | 'player'
  participantId?: string
}

interface Room {
  code: string
  phase: 'lobby' | 'playing'
  gameRevision: number
  config: GameConfig
  hostSocketId: string
  participants: Map<string, Participant>
  participantSessions: Map<string, string>
  disconnectTimers: Map<string, ReturnType<typeof setTimeout>>
  connections: Map<string, Connection>
  messages: Record<TeamId, ChatMessage[]>
  typing: Map<string, ChatTypingUpdate>
  chatLockedTeam: TeamId | null
  playPass: {
    status: 'closed' | 'open' | 'decided'
    team: TeamId | null
    activePlayerId: string | null
    votes: Map<string, PlayPassChoice>
    decision: PlayPassChoice | null
    controllingTeam: TeamId | null
  }
  feudTurns: FeudTurnState
  game: SpinSolveState | FeudRoundView | FastMoneyState | null
  buzzer: BuzzerState
  timer: SharedTimerState
  timerGeneration: number
  timerTimeout: ReturnType<typeof setTimeout> | null
  fastMoneyTimerGeneration: number
  fastMoneyTimerTimeout: ReturnType<typeof setTimeout> | null
}

const rooms = new Map<string, Room>()
const socketRooms = new Map<string, string>()
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const reconnectGraceMs = 30_000
const staticDirectory = resolve(process.cwd(), 'dist')
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const httpServer = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' })
    response.end()
    return
  }

  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
  } catch {
    response.writeHead(400)
    response.end()
    return
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname
  const candidatePath = resolve(staticDirectory, `.${requestedPath}`)
  const isInsideStaticDirectory = candidatePath.startsWith(`${staticDirectory}${sep}`)
  const filePath = isInsideStaticDirectory ? candidatePath : resolve(staticDirectory, 'index.html')

  try {
    const body = await readFile(filePath)
    const extension = extname(filePath)
    response.writeHead(200, {
      'content-type': contentTypes[extension] ?? 'application/octet-stream',
      'cache-control': requestedPath.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    })
    response.end(request.method === 'HEAD' ? undefined : body)
  } catch {
    if (extname(requestedPath)) {
      response.writeHead(404)
      response.end()
      return
    }

    try {
      const body = await readFile(resolve(staticDirectory, 'index.html'))
      response.writeHead(200, {
        'content-type': contentTypes['.html'],
        'cache-control': 'no-cache',
      })
      response.end(request.method === 'HEAD' ? undefined : body)
    } catch {
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Frontend build is unavailable.')
    }
  }
})

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isTeamId(value: unknown): value is TeamId {
  return value === 'one' || value === 'two'
}

function normalizePlayerAvatarId(value: unknown): AvatarId | null {
  const avatarId = normalizeAvatarId(value)
  if (avatarId === HOST_AVATAR_ID) throw new Error('Mudkip is reserved for the host.')
  return avatarId
}

function normalizeSessionId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{10,100}$/.test(value)) {
    throw new Error('Refresh this page before joining the room.')
  }
  return value
}

function isPlayPassChoice(value: unknown): value is PlayPassChoice {
  return value === 'play' || value === 'pass'
}

function normalizeGameConfig(value: unknown): GameConfig {
  if (!isRecord(value)) throw new Error('Choose a game before opening the room.')
  const teamOne = typeof value.teamOne === 'string' ? value.teamOne.trim().slice(0, 24) : ''
  const teamTwo = typeof value.teamTwo === 'string' ? value.teamTwo.trim().slice(0, 24) : ''
  if (!teamOne || !teamTwo) throw new Error('Give both teams a name.')

  if (value.kind === 'feud') {
    const winningScore = typeof value.winningScore === 'number' ? value.winningScore : Number.NaN
    if (!Number.isInteger(winningScore) || winningScore < 100 || winningScore > 1000) {
      throw new Error('Choose a winning score between 100 and 1,000 points.')
    }
    return { kind: 'feud', teamOne, teamTwo, winningScore, pack: normalizeFeudGamePack(value.pack) }
  }

  if (value.kind === 'spin-solve') {
    const rounds = typeof value.rounds === 'number' ? value.rounds : Number.NaN
    if (!Number.isInteger(rounds) || rounds < 1 || rounds > 10) throw new Error('Choose between 1 and 10 rounds.')
    return { kind: 'spin-solve', teamOne, teamTwo, rounds }
  }

  throw new Error('Choose a supported game before opening the room.')
}

function makeCode(): string {
  let code = ''
  do {
    code = Array.from({ length: 5 }, () => codeAlphabet[Math.floor(Math.random() * codeAlphabet.length)]).join('')
  } while (rooms.has(code))
  return code
}

function roomFor(socketId: string): Room | undefined {
  const code = socketRooms.get(socketId)
  return code ? rooms.get(code) : undefined
}

function closedPlayPass(): Room['playPass'] {
  return {
    status: 'closed',
    team: null,
    activePlayerId: null,
    votes: new Map(),
    decision: null,
    controllingTeam: null,
  }
}

function otherTeam(team: TeamId): TeamId {
  return team === 'one' ? 'two' : 'one'
}

function endFeudQuestion(room: Room): void {
  room.chatLockedTeam = null
  room.playPass = closedPlayPass()
  room.feudTurns = deactivateFeudTurns(room.feudTurns)
}

function playPassViewFor(room: Room, connection: Connection, participant?: Participant): PlayPassPollView {
  const canView = connection.role === 'host' || (participant?.team && participant.team === room.playPass.team)
  if (!canView) {
    return {
      ...closedPlayPass(),
      votes: { play: 0, pass: 0 },
      viewerVote: null,
    }
  }

  let play = 0
  let pass = 0
  for (const choice of room.playPass.votes.values()) choice === 'play' ? play++ : pass++
  return {
    status: room.playPass.status,
    team: room.playPass.team,
    activePlayerId: room.playPass.activePlayerId,
    votes: { play, pass },
    viewerVote: participant ? room.playPass.votes.get(participant.id) ?? null : null,
    decision: room.playPass.decision,
    controllingTeam: room.playPass.controllingTeam,
  }
}

function snapshotFor(room: Room, socketId: string): RoomSnapshot {
  const connection = room.connections.get(socketId)
  if (!connection) throw new Error('Socket is not connected to this room.')

  const participant = connection.participantId
    ? room.participants.get(connection.participantId)
    : undefined

  const teamChats: Partial<Record<TeamId, ChatMessage[]>> = connection.role === 'host'
    ? { one: room.messages.one, two: room.messages.two }
    : participant?.team
      ? { [participant.team]: room.messages[participant.team] }
      : {}

  const config: RoomSnapshot['config'] = connection.role === 'host' || room.config.kind === 'spin-solve'
    ? room.config
    : {
        kind: 'feud',
        teamOne: room.config.teamOne,
        teamTwo: room.config.teamTwo,
        winningScore: room.config.winningScore,
      }

  return {
    code: room.code,
    phase: room.phase,
    gameRevision: room.gameRevision,
    config,
    participants: [...room.participants.values()],
    messages: participant?.team ? room.messages[participant.team] : [],
    teamChats,
    chat: {
      lockedTeam: room.chatLockedTeam,
      reason: room.chatLockedTeam ? 'The answering team is live. This huddle reopens when the host ends the question.' : null,
    },
    playPass: playPassViewFor(room, connection, participant),
    feudTurns: viewFeudTurnOrder(room.feudTurns, connectedParticipantIds(room)),
    buzzer: room.buzzer,
    timer: room.timer,
    viewer: connection.role === 'host'
      ? { role: 'host' }
      : { role: 'player', participantId: participant?.id ?? '', team: participant?.team ?? null },
    game: room.game
      ? room.game.kind === 'spin-solve'
        ? viewSpinSolveGame(room.game)
        : room.game.kind === 'feud'
          ? { ...room.game, revealed: [...room.game.revealed], scores: { ...room.game.scores } }
          : room.config.kind === 'feud' && room.config.pack.fastMoney
          ? viewFastMoney(room.game, room.config.pack.fastMoney, [...room.participants.values()], {
              role: connection.role,
              participantId: participant?.id ?? null,
              team: participant?.team ?? null,
            })
          : null
      : null,
  }
}

function syncRoom(room: Room): void {
  for (const socketId of room.connections.keys()) {
    io.sockets.sockets.get(socketId)?.emit('room:snapshot', snapshotFor(room, socketId))
  }
}

function cancelSharedTimerExpiration(room: Room): void {
  room.timerGeneration += 1
  if (room.timerTimeout) clearTimeout(room.timerTimeout)
  room.timerTimeout = null
}

function scheduleSharedTimerExpiration(room: Room): void {
  cancelSharedTimerExpiration(room)
  if (room.timer.status !== 'running') return

  const generation = room.timerGeneration
  const roomCode = room.code
  const delay = Math.max(0, room.timer.deadline - Date.now()) + 25
  room.timerTimeout = setTimeout(() => {
    const liveRoom = rooms.get(roomCode)
    if (!liveRoom || liveRoom.timerGeneration !== generation || liveRoom.timer.status !== 'running') return

    liveRoom.timerTimeout = null
    const expired = expireSharedTimer(liveRoom.timer, Date.now())
    if (expired.status === 'running') {
      scheduleSharedTimerExpiration(liveRoom)
      return
    }
    liveRoom.timer = expired
    syncRoom(liveRoom)
  }, delay)
}

function cancelFastMoneyExpiration(room: Room): void {
  room.fastMoneyTimerGeneration += 1
  if (room.fastMoneyTimerTimeout) clearTimeout(room.fastMoneyTimerTimeout)
  room.fastMoneyTimerTimeout = null
}

function scheduleFastMoneyExpiration(room: Room): void {
  cancelFastMoneyExpiration(room)
  if (room.game?.kind !== 'fast-money' || room.game.timer.status !== 'running' || room.game.timer.deadline === null) return

  const generation = room.fastMoneyTimerGeneration
  const roomCode = room.code
  const expectedDeadline = room.game.timer.deadline
  room.fastMoneyTimerTimeout = setTimeout(() => {
    const liveRoom = rooms.get(roomCode)
    if (
      !liveRoom
      || liveRoom.fastMoneyTimerGeneration !== generation
      || liveRoom.game?.kind !== 'fast-money'
      || liveRoom.game.timer.deadline !== expectedDeadline
    ) return

    liveRoom.fastMoneyTimerTimeout = null
    const expired = expireFastMoney(liveRoom.game, Date.now())
    if (expired === liveRoom.game) {
      scheduleFastMoneyExpiration(liveRoom)
      return
    }
    liveRoom.game = expired
    syncRoom(liveRoom)
  }, Math.max(0, expectedDeadline - Date.now()) + 25)
}

function emitTypingUpdate(room: Room, sourceSocketId: string, update: ChatTypingUpdate): void {
  for (const [socketId, connection] of room.connections) {
    if (socketId === sourceSocketId) continue
    const participant = connection.participantId
      ? room.participants.get(connection.participantId)
      : undefined
    if (connection.role === 'host' || participant?.team === update.team) {
      io.sockets.sockets.get(socketId)?.emit('chat:typing', update)
    }
  }
}

function setRoomTyping(room: Room, socketId: string, requestedTeam: unknown, isTyping: unknown): void {
  if (typeof isTyping !== 'boolean') return

  const existing = room.typing.get(socketId)
  if (existing && !isTyping) {
    room.typing.delete(socketId)
    emitTypingUpdate(room, socketId, { ...existing, isTyping: false })
    return
  }
  if (!isTyping) return

  const connection = room.connections.get(socketId)
  const participant = connection?.participantId
    ? room.participants.get(connection.participantId)
    : undefined
  const team = connection?.role === 'host' ? requestedTeam : participant?.team
  if (!connection || !isTeamId(team)) return
  if (connection.role === 'player' && room.chatLockedTeam === team) return

  if (existing && existing.team !== team) {
    emitTypingUpdate(room, socketId, { ...existing, isTyping: false })
  }

  const update: ChatTypingUpdate = {
    senderId: participant?.id ?? 'host',
    senderName: participant?.name ?? 'Host',
    senderAvatarId: participant ? participant.avatarId : HOST_AVATAR_ID,
    team,
    isTyping: true,
  }
  room.typing.set(socketId, update)
  emitTypingUpdate(room, socketId, update)
}

function clearParticipantTyping(room: Room, participantId: string): void {
  for (const [socketId, connection] of room.connections) {
    if (connection.participantId === participantId) setRoomTyping(room, socketId, undefined, false)
  }
}

function clearTeamTyping(room: Room, team: TeamId): void {
  for (const [socketId, update] of room.typing) {
    if (update.team === team) setRoomTyping(room, socketId, undefined, false)
  }
}

function prepareRoomForNextGame(room: Room, config: GameConfig): void {
  cancelSharedTimerExpiration(room)
  cancelFastMoneyExpiration(room)
  for (const socketId of [...room.typing.keys()]) setRoomTyping(room, socketId, undefined, false)
  room.phase = 'lobby'
  room.config = config
  room.chatLockedTeam = null
  room.playPass = closedPlayPass()
  room.feudTurns = createFeudTurnState([], { one: null, two: null }, new Set())
  room.game = null
  room.buzzer = { status: 'idle', winner: null, representatives: { one: null, two: null } }
  room.timer = createIdleSharedTimer()
}

function playersForTeam(room: Room, team: TeamId): Participant[] {
  return [...room.participants.values()].filter((participant) => participant.team === team)
}

function connectedParticipantIds(room: Room): Set<string> {
  return new Set(
    [...room.connections.values()]
      .map((connection) => connection.participantId)
      .filter((participantId): participantId is string => Boolean(participantId)),
  )
}

function repairRoomFeudTurns(room: Room): void {
  room.feudTurns = repairFeudTurnState(
    room.feudTurns,
    [...room.participants.values()],
    connectedParticipantIds(room),
  )
}

function seedRoomFeudTurns(room: Room): void {
  repairRoomFeudTurns(room)
  room.feudTurns = seedFeudTurnsAfterRepresentatives(
    room.feudTurns,
    room.buzzer.representatives,
    connectedParticipantIds(room),
  )
}

function nextRepresentative(room: Room, team: TeamId): string | null {
  const players = playersForTeam(room, team)
  if (players.length === 0) return null
  const currentIndex = players.findIndex((participant) => participant.id === room.buzzer.representatives[team])
  return players[(currentIndex + 1 + players.length) % players.length].id
}

function removeParticipant(room: Room, participantId: string): void {
  const participant = room.participants.get(participantId)
  room.participants.delete(participantId)
  room.playPass.votes.delete(participantId)
  for (const [sessionId, savedParticipantId] of room.participantSessions) {
    if (savedParticipantId === participantId) room.participantSessions.delete(sessionId)
  }
  const timer = room.disconnectTimers.get(participantId)
  if (timer) clearTimeout(timer)
  room.disconnectTimers.delete(participantId)
  if (room.playPass.activePlayerId === participantId) endFeudQuestion(room)
  if (participant?.team && room.buzzer.representatives[participant.team] === participant.id) {
    room.buzzer = {
      status: 'idle',
      winner: null,
      representatives: {
        ...room.buzzer.representatives,
        [participant.team]: nextRepresentative(room, participant.team),
      },
    }
  }
  repairRoomFeudTurns(room)
}

function leaveCurrentRoom(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  notifySocket = true,
  preservePlayer = false,
): void {
  const room = roomFor(socket.id)
  if (!room) return

  const connection = room.connections.get(socket.id)
  setRoomTyping(room, socket.id, undefined, false)
  room.connections.delete(socket.id)
  socketRooms.delete(socket.id)

  if (connection?.role === 'host') {
    cancelSharedTimerExpiration(room)
    cancelFastMoneyExpiration(room)
    for (const timer of room.disconnectTimers.values()) clearTimeout(timer)
    for (const memberSocketId of room.connections.keys()) {
      io.sockets.sockets.get(memberSocketId)?.emit('room:closed', 'The host closed this room.')
      socketRooms.delete(memberSocketId)
    }
    rooms.delete(room.code)
    return
  }

  if (connection?.participantId) {
    if (preservePlayer) {
      const participantId = connection.participantId
      const previousTimer = room.disconnectTimers.get(participantId)
      if (previousTimer) clearTimeout(previousTimer)
      room.disconnectTimers.set(participantId, setTimeout(() => {
        removeParticipant(room, participantId)
        syncRoom(room)
      }, reconnectGraceMs))
      repairRoomFeudTurns(room)
    } else {
      removeParticipant(room, connection.participantId)
    }
  }
  if (notifySocket || (preservePlayer && connection?.participantId)) syncRoom(room)
}

io.on('connection', (socket) => {
  socket.on('room:create', (config, reply) => {
    let normalizedConfig: GameConfig
    try {
      normalizedConfig = normalizeGameConfig(config)
    } catch (cause) {
      const message = cause instanceof GamePackError ? cause.issues[0] : cause instanceof Error ? cause.message : 'That room setup is not valid.'
      return reply({ ok: false, error: message })
    }

    leaveCurrentRoom(socket)
    const code = makeCode()
    const room: Room = {
      code,
      phase: 'lobby',
      gameRevision: 0,
      config: normalizedConfig,
      hostSocketId: socket.id,
      participants: new Map(),
      participantSessions: new Map(),
      disconnectTimers: new Map(),
      connections: new Map([[socket.id, { role: 'host' }]]),
      messages: { one: [], two: [] },
      typing: new Map(),
      chatLockedTeam: null,
      playPass: closedPlayPass(),
      feudTurns: createFeudTurnState([], { one: null, two: null }, new Set()),
      game: null,
      buzzer: { status: 'idle', winner: null, representatives: { one: null, two: null } },
      timer: createIdleSharedTimer(),
      timerGeneration: 0,
      timerTimeout: null,
      fastMoneyTimerGeneration: 0,
      fastMoneyTimerTimeout: null,
    }
    rooms.set(code, room)
    socketRooms.set(socket.id, code)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    socket.emit('room:snapshot', snapshot)
  })

  socket.on('room:join', ({ code, name, avatarId, sessionId }, reply) => {
    const normalizedCode = code.trim().toUpperCase()
    const cleanName = name.trim().slice(0, 24)
    const room = rooms.get(normalizedCode)
    let cleanAvatarId: AvatarId | null
    let cleanSessionId: string

    try {
      cleanAvatarId = normalizePlayerAvatarId(avatarId)
      cleanSessionId = normalizeSessionId(sessionId)
    } catch (cause) {
      return reply({ ok: false, error: cause instanceof Error ? cause.message : 'That player identity is not valid.' })
    }

    if (!room) return reply({ ok: false, error: 'That room code is not active.' })
    if (!cleanName) return reply({ ok: false, error: 'Enter a name before joining.' })

    const savedParticipantId = room.participantSessions.get(cleanSessionId)
    const savedParticipant = savedParticipantId ? room.participants.get(savedParticipantId) : undefined
    if (savedParticipant) {
      if (savedParticipant.name.toLowerCase() !== cleanName.toLowerCase()) {
        return reply({ ok: false, error: 'This device is already linked to a different player in that room.' })
      }
      const alreadyConnected = [...room.connections.values()].some(
        (connection) => connection.participantId === savedParticipant.id,
      )
      if (alreadyConnected) return reply({ ok: false, error: 'That player is already connected.' })

      leaveCurrentRoom(socket)
      const timer = room.disconnectTimers.get(savedParticipant.id)
      if (timer) clearTimeout(timer)
      room.disconnectTimers.delete(savedParticipant.id)
      savedParticipant.avatarId = cleanAvatarId
      room.connections.set(socket.id, { role: 'player', participantId: savedParticipant.id })
      socketRooms.set(socket.id, room.code)
      repairRoomFeudTurns(room)
      const snapshot = snapshotFor(room, socket.id)
      reply({ ok: true, data: snapshot })
      syncRoom(room)
      return
    }

    if (room.phase !== 'lobby') return reply({ ok: false, error: 'That game has already started.' })
    if (room.participants.size >= 20) return reply({ ok: false, error: 'That room is full.' })
    if ([...room.participants.values()].some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
      return reply({ ok: false, error: 'Someone in this room is already using that name.' })
    }

    leaveCurrentRoom(socket)
    const participant: Participant = { id: randomUUID(), name: cleanName, avatarId: cleanAvatarId, team: null }
    room.participants.set(participant.id, participant)
    room.participantSessions.set(cleanSessionId, participant.id)
    room.connections.set(socket.id, { role: 'player', participantId: participant.id })
    socketRooms.set(socket.id, room.code)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('participant:update-identity', ({ name, avatarId }, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 24) : ''
    if (!room || !participant || connection?.role !== 'player') {
      return reply({ ok: false, error: 'Join a room before updating your identity.' })
    }
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Player identities are locked after the game starts.' })
    if (!cleanName) return reply({ ok: false, error: 'Enter a name for your player card.' })
    if ([...room.participants.values()].some(
      (player) => player.id !== participant.id && player.name.toLowerCase() === cleanName.toLowerCase(),
    )) {
      return reply({ ok: false, error: 'Someone in this room is already using that name.' })
    }

    try {
      participant.name = cleanName
      participant.avatarId = normalizePlayerAvatarId(avatarId)
    } catch (cause) {
      return reply({ ok: false, error: cause instanceof Error ? cause.message : 'Choose a valid avatar.' })
    }

    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:choose-team', (team, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined

    if (!room || !participant || connection?.role !== 'player') {
      return reply({ ok: false, error: 'Join a room before choosing a team.' })
    }
    if (!isTeamId(team)) return reply({ ok: false, error: 'Choose one of the two teams.' })
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Teams are locked after the game starts.' })
    if (participant.team && participant.team !== team) {
      return reply({ ok: false, error: 'Your team is locked to keep both chats private.' })
    }

    participant.team = team
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:assign-team', ({ participantId, team }, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can assign teams.' })
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Teams are locked after the game starts.' })
    if (!isTeamId(team)) return reply({ ok: false, error: 'Choose one of the two teams.' })
    const participant = room.participants.get(participantId)
    if (!participant) return reply({ ok: false, error: 'Choose a connected player.' })

    clearParticipantTyping(room, participant.id)
    participant.team = team
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:randomize-teams', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can randomize teams.' })
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Teams are locked after the game starts.' })

    const participants = [...room.participants.values()]
    for (const participant of participants) clearParticipantTyping(room, participant.id)
    for (let index = participants.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[participants[index], participants[swapIndex]] = [participants[swapIndex], participants[index]]
    }
    participants.forEach((participant, index) => { participant.team = index % 2 === 0 ? 'one' : 'two' })

    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('timer:start', (details, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can start the shared timer.' })
    }
    const durationSeconds = isRecord(details) ? details.durationSeconds : undefined
    if (!isSharedTimerPreset(durationSeconds)) {
      return reply({ ok: false, error: 'Choose a 5-, 25-, 30-, or 40-second timer.' })
    }

    room.timer = startSharedTimer(durationSeconds, Date.now())
    scheduleSharedTimerExpiration(room)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('timer:stop', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can stop the shared timer.' })
    }

    cancelSharedTimerExpiration(room)
    room.timer = createIdleSharedTimer()
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:prepare-next-game', (details, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can prepare the next game.' })
    }
    const expectedGameRevision = isRecord(details) ? details.expectedGameRevision : undefined
    if (!Number.isInteger(expectedGameRevision) || expectedGameRevision !== room.gameRevision) {
      return reply({ ok: false, error: 'A newer game is already active. Refresh before resetting the room.' })
    }

    let nextConfig = room.config
    if (isRecord(details) && details.config !== undefined) {
      try {
        nextConfig = normalizeGameConfig(details.config)
      } catch (cause) {
        const message = cause instanceof GamePackError ? cause.issues[0] : cause instanceof Error ? cause.message : 'That next-game setup is not valid.'
        return reply({ ok: false, error: message })
      }
    }

    prepareRoomForNextGame(room, nextConfig)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:clear-team-chats', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can clear team chats.' })
    }
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Clear team chats before starting the next game.' })
    for (const socketId of [...room.typing.keys()]) setRoomTyping(room, socketId, undefined, false)
    room.messages = { one: [], two: [] }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('chat:send', ({ text, team }, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    const cleanText = typeof text === 'string' ? text.trim().slice(0, 280) : ''

    if (!room || !connection) return reply({ ok: false, error: 'Join a room before chatting.' })
    if (!cleanText) return reply({ ok: false, error: 'Write a message before sending.' })
    const messageTeam = connection.role === 'host' ? team : participant?.team
    if (!isTeamId(messageTeam)) return reply({ ok: false, error: 'Choose a team before chatting.' })
    if (connection.role === 'player' && room.chatLockedTeam === messageTeam) {
      return reply({ ok: false, error: 'Your team is answering now. The huddle reopens when the host ends the question.' })
    }

    setRoomTyping(room, socket.id, messageTeam, false)
    const message: ChatMessage = {
      id: randomUUID(),
      senderId: participant?.id ?? 'host',
      senderName: participant?.name ?? 'Host',
      senderAvatarId: participant ? participant.avatarId : HOST_AVATAR_ID,
      team: messageTeam,
      text: cleanText,
      sentAt: Date.now(),
    }
    room.messages[messageTeam].push(message)
    room.messages[messageTeam] = room.messages[messageTeam].slice(-100)
    reply({ ok: true, data: message })
    syncRoom(room)
  })

  socket.on('chat:typing', (details) => {
    if (!isRecord(details)) return
    const room = roomFor(socket.id)
    if (room) setRoomTyping(room, socket.id, details.team, details.isTyping)
  })

  socket.on('feud:open-play-pass', (details, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can open a play/pass huddle.' })
    if (room.phase !== 'playing' || room.config.kind !== 'feud') {
      return reply({ ok: false, error: 'Start a Family Feud game before opening a play/pass huddle.' })
    }
    const team = isRecord(details) && isTeamId(details.team) ? details.team : null
    if (!team) return reply({ ok: false, error: 'Choose a valid team for the play/pass poll.' })
    if (room.playPass.status !== 'closed') {
      return reply({ ok: false, error: 'A play/pass poll is already active. Cancel it before opening another.' })
    }
    if (!room.buzzer.winner) {
      return reply({ ok: false, error: 'Finish the face-off before opening the play/pass huddle.' })
    }
    const activePlayerId = room.buzzer.representatives[team]
    const activePlayer = activePlayerId ? room.participants.get(activePlayerId) : undefined
    if (
      activePlayer?.team !== team ||
      !activePlayerId ||
      !connectedParticipantIds(room).has(activePlayerId)
    ) {
      return reply({ ok: false, error: `Choose a connected face-off representative for ${team === 'one' ? room.config.teamOne : room.config.teamTwo} before opening its poll.` })
    }

    room.chatLockedTeam = null
    room.playPass = {
      status: 'open',
      team,
      activePlayerId,
      votes: new Map(),
      decision: null,
      controllingTeam: null,
    }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:vote-play-pass', (choice, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    if (!room || !participant?.team || connection?.role !== 'player') {
      return reply({ ok: false, error: 'Join a team before voting.' })
    }
    if (!isPlayPassChoice(choice)) return reply({ ok: false, error: 'Vote Play or Pass.' })
    if (room.playPass.status !== 'open' || room.playPass.team !== participant.team) {
      return reply({ ok: false, error: 'There is no play/pass vote open for your team.' })
    }

    room.playPass.votes.set(participant.id, choice)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:decide-play-pass', (choice, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    if (!room || !participant || connection?.role !== 'player') {
      return reply({ ok: false, error: 'Join a team before making the final choice.' })
    }
    if (!isPlayPassChoice(choice)) return reply({ ok: false, error: 'Choose Play or Pass.' })
    if (room.playPass.status !== 'open' || room.playPass.activePlayerId !== participant.id || !room.playPass.team) {
      return reply({ ok: false, error: 'Only the designated active player can make the final choice.' })
    }

    const controllingTeam = choice === 'play' ? room.playPass.team : otherTeam(room.playPass.team)
    room.playPass.status = 'decided'
    room.playPass.decision = choice
    room.playPass.controllingTeam = controllingTeam
    if (room.game?.kind === 'feud') room.game = setFeudControl(room.game, controllingTeam)
    repairRoomFeudTurns(room)
    room.feudTurns = activateFeudTurnTeam(room.feudTurns, controllingTeam)
    clearTeamTyping(room, controllingTeam)
    room.chatLockedTeam = controllingTeam
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:end-question', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can end the active question.' })
    if (room.config.kind !== 'feud') return reply({ ok: false, error: 'Play/pass controls are only available in Family Feud.' })

    endFeudQuestion(room)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:advance-turn', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can advance the answering order.' })
    }
    if (room.phase !== 'playing' || room.config.kind !== 'feud' || room.game?.kind === 'fast-money') {
      return reply({ ok: false, error: 'Start a Family Feud question before advancing the answering order.' })
    }

    repairRoomFeudTurns(room)
    const activeTeam = room.feudTurns.activeTeam
    if (!activeTeam || !room.feudTurns.teams[activeTeam].currentPlayerId) {
      return reply({ ok: false, error: 'Finish Play or Pass before advancing the answering order.' })
    }
    room.feudTurns = advanceFeudTurn(room.feudTurns, connectedParticipantIds(room))
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:set-turn-player', ({ team, participantId }, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can choose the current player.' })
    }
    if (room.phase !== 'playing' || room.config.kind !== 'feud' || room.game?.kind === 'fast-money') {
      return reply({ ok: false, error: 'Start a Family Feud question before choosing the current player.' })
    }
    if (!isTeamId(team)) return reply({ ok: false, error: 'Choose one of the two teams.' })

    repairRoomFeudTurns(room)
    const participant = room.participants.get(participantId)
    if (
      participant?.team !== team ||
      !connectedParticipantIds(room).has(participant.id) ||
      !room.feudTurns.teams[team].order.includes(participant.id)
    ) {
      return reply({ ok: false, error: 'Choose a connected player from that team.' })
    }
    room.feudTurns = selectFeudTurnPlayer(room.feudTurns, team, participant.id)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('game:start', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can start the game.' })
    if (room.phase === 'playing') return reply({ ok: true, data: snapshotFor(room, socket.id) })

    const hasTeamOne = [...room.participants.values()].some((player) => player.team === 'one')
    const hasTeamTwo = [...room.participants.values()].some((player) => player.team === 'two')
    if (!hasTeamOne || !hasTeamTwo) return reply({ ok: false, error: 'Each team needs at least one player.' })

    room.phase = 'playing'
    room.gameRevision += 1
    endFeudQuestion(room)
    room.buzzer = {
      status: 'idle',
      winner: null,
      representatives: {
        one: playersForTeam(room, 'one')[0]?.id ?? null,
        two: playersForTeam(room, 'two')[0]?.id ?? null,
      },
    }
    room.feudTurns = createFeudTurnState(
      [...room.participants.values()],
      room.buzzer.representatives,
      connectedParticipantIds(room),
    )
    if (room.config.kind === 'spin-solve') {
      room.game = createSpinSolveGame(room.config, { random: Math.random, now: Date.now })
    } else {
      room.game = createFeudRoundState()
    }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('game:action', (command, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined

    if (!room || room.phase !== 'playing' || room.game?.kind !== 'spin-solve' || !connection) {
      return reply({ ok: false, error: 'Start a spin-and-solve game before making a move.' })
    }

    const result = applySpinSolveCommand(
      room.game,
      { role: connection.role, team: participant?.team ?? null },
      command,
      { random: Math.random, now: Date.now },
    )
    if (!result.ok) return reply(result)

    room.game = result.state
    if (room.game.phase === 'bonus-solving' && room.game.bonusDeadline) {
      const expectedDeadline = room.game.bonusDeadline
      const roomCode = room.code
      setTimeout(() => {
        const liveRoom = rooms.get(roomCode)
        if (!liveRoom?.game || liveRoom.game.kind !== 'spin-solve' || liveRoom.game.phase !== 'bonus-solving' || liveRoom.game.bonusDeadline !== expectedDeadline) return
        const finished = applySpinSolveCommand(
          liveRoom.game,
          { role: 'host', team: null },
          { type: 'finish-bonus' },
          { random: Math.random, now: Date.now },
        )
        if (finished.ok) {
          liveRoom.game = finished.state
          syncRoom(liveRoom)
        }
      }, Math.max(0, expectedDeadline - Date.now()) + 50)
    }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('feud:round-action', (command: FeudRoundCommand, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) {
      return reply({ ok: false, error: 'Only the host can manage the Family Feud round.' })
    }
    if (room.phase !== 'playing' || room.config.kind !== 'feud' || room.game?.kind !== 'feud') {
      return reply({ ok: false, error: 'Start a Family Feud game before using the round controls.' })
    }
    if (!isRecord(command) || typeof command.type !== 'string') {
      return reply({ ok: false, error: 'Choose a valid Family Feud control.' })
    }
    const allowedCommands: FeudRoundCommand['type'][] = [
      'reveal-answer',
      'add-strike',
      'remove-strike',
      'set-control',
      'set-steal-outcome',
      'select-award-team',
      'confirm-award',
      'adjust-score',
      'skip-question',
    ]
    if (!allowedCommands.includes(command.type)) {
      return reply({ ok: false, error: 'Choose a valid Family Feud control.' })
    }
    if (
      (command.type === 'set-control' || command.type === 'select-award-team')
      && !isTeamId(command.team)
    ) {
      return reply({ ok: false, error: 'Choose one of the two teams.' })
    }
    if (
      command.type === 'set-steal-outcome'
      && command.outcome !== 'success'
      && command.outcome !== 'failed'
    ) {
      return reply({ ok: false, error: 'Choose whether the steal succeeded or failed.' })
    }
    if (command.type === 'add-strike' && !room.game.controllingTeam) {
      return reply({ ok: false, error: 'Finish Play or Pass before recording normal-play strikes.' })
    }

    const previous = room.game
    const result = applyFeudRoundCommand(previous, room.config, command)
    if (!result.ok) return reply(result)
    room.game = result.state

    if (command.type === 'set-control') {
      room.playPass = {
        ...room.playPass,
        status: 'decided',
        decision: room.playPass.decision ?? 'play',
        controllingTeam: command.team,
      }
      repairRoomFeudTurns(room)
      room.feudTurns = activateFeudTurnTeam(room.feudTurns, command.team)
      clearTeamTyping(room, command.team)
      room.chatLockedTeam = command.team
    } else if (command.type === 'reveal-answer' && previous.phase === 'playing' && previous.controllingTeam) {
      repairRoomFeudTurns(room)
      room.feudTurns = advanceFeudTurn(room.feudTurns, connectedParticipantIds(room))
    } else if (command.type === 'add-strike') {
      if (result.state.strikes < 3 && result.state.controllingTeam) {
        repairRoomFeudTurns(room)
        room.feudTurns = advanceFeudTurn(room.feudTurns, connectedParticipantIds(room))
      } else if (result.state.strikes === 3 && result.state.originalControllingTeam) {
        const stealingTeam = otherFeudTeam(result.state.originalControllingTeam)
        repairRoomFeudTurns(room)
        room.feudTurns = activateFeudTurnTeam(room.feudTurns, stealingTeam)
        room.chatLockedTeam = stealingTeam
      }
    } else if (command.type === 'remove-strike' && previous.strikes === 3 && result.state.controllingTeam) {
      repairRoomFeudTurns(room)
      room.feudTurns = activateFeudTurnTeam(room.feudTurns, result.state.controllingTeam)
      room.chatLockedTeam = result.state.controllingTeam
    }

    if (result.event === 'round-awarded' || result.event === 'question-skipped') {
      endFeudQuestion(room)
      room.buzzer = {
        status: 'idle',
        winner: null,
        representatives: {
          one: nextRepresentative(room, 'one'),
          two: nextRepresentative(room, 'two'),
        },
      }
      seedRoomFeudTurns(room)
    } else if (result.event === 'game-won') {
      endFeudQuestion(room)
      room.buzzer = { ...room.buzzer, status: 'idle', winner: null }
    }

    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('fast-money:action', (command, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    if (!room || room.phase !== 'playing' || room.config.kind !== 'feud' || !connection) {
      return reply({ ok: false, error: 'Start a Family Feud game before opening Fast Money.' })
    }
    const pack = room.config.pack.fastMoney
    if (!pack) return reply({ ok: false, error: 'This game pack does not include five Fast Money questions.' })

    const actor: FastMoneyActor = {
      role: connection.role,
      participantId: participant?.id ?? null,
      team: participant?.team ?? null,
    }

    if (command.type === 'start') {
      if (connection.role !== 'host') return reply({ ok: false, error: 'Only the host can start Fast Money.' })
      if (!isTeamId(command.team)) return reply({ ok: false, error: 'Choose the team that won the main game.' })
      if (room.game && room.game.kind !== 'feud') {
        return reply({ ok: false, error: 'Fast Money has already started.' })
      }
      if (playersForTeam(room, command.team).length < 2) {
        return reply({ ok: false, error: 'The winning team needs two connected players for Fast Money.' })
      }
      endFeudQuestion(room)
      clearTeamTyping(room, command.team)
      room.chatLockedTeam = command.team
      room.buzzer = { ...room.buzzer, status: 'idle', winner: null }
      room.game = createFastMoneyState(command.team)
    } else {
      if (room.game?.kind !== 'fast-money') return reply({ ok: false, error: 'Start Fast Money before using its controls.' })
      if (command.type === 'start-attempt') {
        const contestant = room.game.phase === 'ready-one' ? 0 : room.game.phase === 'ready-two' ? 1 : null
        if (contestant !== null) {
          const participantId = room.game.lineup[contestant]
          const connected = participantId && [...room.connections.values()].some(
            (candidate) => candidate.participantId === participantId,
          )
          if (!connected) return reply({ ok: false, error: 'That contestant is disconnected. Wait for them or choose a replacement.' })
        }
      }
      const expired = expireFastMoney(room.game, Date.now())
      if (expired !== room.game) room.game = expired
      const result = applyFastMoneyCommand(
        room.game,
        pack,
        [...room.participants.values()],
        actor,
        command,
        Date.now(),
      )
      if (!result.ok) {
        if (/repeat answer/i.test(result.error)) {
          io.sockets.sockets.get(room.hostSocketId)?.emit('fast-money:repeat')
        }
        scheduleFastMoneyExpiration(room)
        syncRoom(room)
        return reply(result)
      }
      room.game = result.state
      if (room.game.phase === 'complete') room.chatLockedTeam = null
    }

    scheduleFastMoneyExpiration(room)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:arm', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can arm the buzzer.' })
    if (room.phase !== 'playing') return reply({ ok: false, error: 'Start the game before arming the buzzer.' })

    const representativesReady = (['one', 'two'] as TeamId[]).every((team) => {
      const participant = room.participants.get(room.buzzer.representatives[team] ?? '')
      return participant?.team === team
    })
    if (!representativesReady) return reply({ ok: false, error: 'Choose one representative from each team before arming the buzzer.' })

    if (room.config.kind === 'feud') {
      endFeudQuestion(room)
      seedRoomFeudTurns(room)
    }
    room.buzzer = { ...room.buzzer, status: 'armed', winner: null }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:close', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can close the buzzer.' })

    room.buzzer = { ...room.buzzer, status: 'idle', winner: null }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:reset', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can reset the buzzer.' })

    room.buzzer = { ...room.buzzer, status: 'idle', winner: null }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:select-representative', ({ team, participantId }, reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can choose representatives.' })
    if (room.buzzer.status === 'armed') return reply({ ok: false, error: 'Close the buzzer before changing representatives.' })
    const participant = room.participants.get(participantId)
    if (participant?.team !== team) return reply({ ok: false, error: 'Choose a connected player from that team.' })

    room.buzzer = {
      status: 'idle',
      winner: null,
      representatives: { ...room.buzzer.representatives, [team]: participantId },
    }
    if (!room.feudTurns.activeTeam) seedRoomFeudTurns(room)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:next-pair', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can rotate representatives.' })
    if (room.buzzer.status === 'armed') return reply({ ok: false, error: 'Close the buzzer before rotating representatives.' })

    room.buzzer = {
      status: 'idle',
      winner: null,
      representatives: {
        one: nextRepresentative(room, 'one'),
        two: nextRepresentative(room, 'two'),
      },
    }
    seedRoomFeudTurns(room)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('buzzer:press', (reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined

    if (!room || !participant?.team || connection?.role !== 'player') {
      return reply({ ok: false, error: 'Join a team before using the buzzer.' })
    }
    if (room.phase !== 'playing') return reply({ ok: false, error: 'The game has not started yet.' })
    if (room.buzzer.representatives[participant.team] !== participant.id) {
      return reply({ ok: false, error: 'You are not your team’s representative for this face-off.' })
    }
    if (room.buzzer.status !== 'armed' || room.buzzer.winner) {
      return reply({ ok: false, error: room.buzzer.winner ? `${room.buzzer.winner.playerName} buzzed first.` : 'The buzzer is closed.' })
    }

    room.buzzer = {
      ...room.buzzer,
      status: 'locked',
      winner: {
        participantId: participant.id,
        playerName: participant.name,
        avatarId: participant.avatarId,
        team: participant.team,
      },
    }
    reply({ ok: true, data: room.buzzer })
    syncRoom(room)
  })

  socket.on('room:leave', () => leaveCurrentRoom(socket))
  socket.on('disconnect', () => leaveCurrentRoom(socket, false, true))
})

const port = Number(process.env.PORT ?? 3001)
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Room server listening on http://localhost:${port}`)
})
