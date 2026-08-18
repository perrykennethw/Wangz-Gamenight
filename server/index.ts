import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Server, type Socket } from 'socket.io'
import type {
  ChatMessage,
  BuzzerState,
  ClientToServerEvents,
  GameConfig,
  Participant,
  PlayPassChoice,
  PlayPassPollView,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from '../src/roomTypes.js'
import { GamePackError, normalizeFeudGamePack } from '../src/feudGamePack.js'
import { applySpinSolveCommand, createSpinSolveGame, viewSpinSolveGame, type SpinSolveState } from './spinSolve.js'

interface Connection {
  role: 'host' | 'player'
  participantId?: string
}

interface Room {
  code: string
  phase: 'lobby' | 'playing'
  config: GameConfig
  hostSocketId: string
  participants: Map<string, Participant>
  connections: Map<string, Connection>
  messages: Record<TeamId, ChatMessage[]>
  chatLockedTeam: TeamId | null
  playPass: {
    status: 'closed' | 'open' | 'decided'
    team: TeamId | null
    activePlayerId: string | null
    votes: Map<string, PlayPassChoice>
    decision: PlayPassChoice | null
    controllingTeam: TeamId | null
  }
  game: SpinSolveState | null
  buzzer: BuzzerState
}

const rooms = new Map<string, Room>()
const socketRooms = new Map<string, string>()
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
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
    config,
    participants: [...room.participants.values()],
    messages: participant?.team ? room.messages[participant.team] : [],
    teamChats,
    chat: {
      lockedTeam: room.chatLockedTeam,
      reason: room.chatLockedTeam ? 'The answering team is live. This huddle reopens when the host ends the question.' : null,
    },
    playPass: playPassViewFor(room, connection, participant),
    buzzer: room.buzzer,
    viewer: connection.role === 'host'
      ? { role: 'host' }
      : { role: 'player', participantId: participant?.id ?? '', team: participant?.team ?? null },
    game: room.game ? viewSpinSolveGame(room.game) : null,
  }
}

function syncRoom(room: Room): void {
  for (const socketId of room.connections.keys()) {
    io.sockets.sockets.get(socketId)?.emit('room:snapshot', snapshotFor(room, socketId))
  }
}

function playersForTeam(room: Room, team: TeamId): Participant[] {
  return [...room.participants.values()].filter((participant) => participant.team === team)
}

function nextRepresentative(room: Room, team: TeamId): string | null {
  const players = playersForTeam(room, team)
  if (players.length === 0) return null
  const currentIndex = players.findIndex((participant) => participant.id === room.buzzer.representatives[team])
  return players[(currentIndex + 1 + players.length) % players.length].id
}

function leaveCurrentRoom(socket: Socket<ClientToServerEvents, ServerToClientEvents>, notifySocket = true): void {
  const room = roomFor(socket.id)
  if (!room) return

  const connection = room.connections.get(socket.id)
  room.connections.delete(socket.id)
  socketRooms.delete(socket.id)

  if (connection?.role === 'host') {
    for (const memberSocketId of room.connections.keys()) {
      io.sockets.sockets.get(memberSocketId)?.emit('room:closed', 'The host closed this room.')
      socketRooms.delete(memberSocketId)
    }
    rooms.delete(room.code)
    return
  }

  if (connection?.participantId) {
    const participant = room.participants.get(connection.participantId)
    room.participants.delete(connection.participantId)
    room.playPass.votes.delete(connection.participantId)
    if (room.playPass.activePlayerId === connection.participantId) endFeudQuestion(room)
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
  }
  if (notifySocket) syncRoom(room)
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
      config: normalizedConfig,
      hostSocketId: socket.id,
      participants: new Map(),
      connections: new Map([[socket.id, { role: 'host' }]]),
      messages: { one: [], two: [] },
      chatLockedTeam: null,
      playPass: closedPlayPass(),
      game: null,
      buzzer: { status: 'idle', winner: null, representatives: { one: null, two: null } },
    }
    rooms.set(code, room)
    socketRooms.set(socket.id, code)
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    socket.emit('room:snapshot', snapshot)
  })

  socket.on('room:join', ({ code, name }, reply) => {
    const normalizedCode = code.trim().toUpperCase()
    const cleanName = name.trim().slice(0, 24)
    const room = rooms.get(normalizedCode)

    if (!room) return reply({ ok: false, error: 'That room code is not active.' })
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'That game has already started.' })
    if (room.participants.size >= 20) return reply({ ok: false, error: 'That room is full.' })
    if (!cleanName) return reply({ ok: false, error: 'Enter a name before joining.' })
    if ([...room.participants.values()].some((player) => player.name.toLowerCase() === cleanName.toLowerCase())) {
      return reply({ ok: false, error: 'Someone in this room is already using that name.' })
    }

    leaveCurrentRoom(socket)
    const participant: Participant = { id: randomUUID(), name: cleanName, team: null }
    room.participants.set(participant.id, participant)
    room.connections.set(socket.id, { role: 'player', participantId: participant.id })
    socketRooms.set(socket.id, room.code)
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
    for (let index = participants.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1))
      ;[participants[index], participants[swapIndex]] = [participants[swapIndex], participants[index]]
    }
    participants.forEach((participant, index) => { participant.team = index % 2 === 0 ? 'one' : 'two' })

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

    const message: ChatMessage = {
      id: randomUUID(),
      senderId: participant?.id ?? 'host',
      senderName: participant?.name ?? 'Host',
      team: messageTeam,
      text: cleanText,
      sentAt: Date.now(),
    }
    room.messages[messageTeam].push(message)
    room.messages[messageTeam] = room.messages[messageTeam].slice(-100)
    reply({ ok: true, data: message })
    syncRoom(room)
  })

  socket.on('feud:open-play-pass', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can open a play/pass huddle.' })
    if (room.phase !== 'playing' || room.config.kind !== 'feud') {
      return reply({ ok: false, error: 'Start a Family Feud game before opening a play/pass huddle.' })
    }
    const winner = room.buzzer.winner
    const activePlayer = winner ? room.participants.get(winner.participantId) : undefined
    if (!winner || activePlayer?.team !== winner.team) {
      return reply({ ok: false, error: 'Finish the face-off before opening the play/pass huddle.' })
    }

    room.chatLockedTeam = null
    room.playPass = {
      status: 'open',
      team: winner.team,
      activePlayerId: winner.participantId,
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

  socket.on('game:start', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can start the game.' })

    const hasTeamOne = [...room.participants.values()].some((player) => player.team === 'one')
    const hasTeamTwo = [...room.participants.values()].some((player) => player.team === 'two')
    if (!hasTeamOne || !hasTeamTwo) return reply({ ok: false, error: 'Each team needs at least one player.' })

    room.phase = 'playing'
    endFeudQuestion(room)
    room.buzzer = {
      status: 'idle',
      winner: null,
      representatives: {
        one: playersForTeam(room, 'one')[0]?.id ?? null,
        two: playersForTeam(room, 'two')[0]?.id ?? null,
      },
    }
    if (room.config.kind === 'spin-solve') {
      room.game = createSpinSolveGame(room.config, { random: Math.random, now: Date.now })
    }
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('game:action', (command, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined

    if (!room || room.phase !== 'playing' || !room.game || !connection) {
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
        if (!liveRoom?.game || liveRoom.game.phase !== 'bonus-solving' || liveRoom.game.bonusDeadline !== expectedDeadline) return
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

  socket.on('buzzer:arm', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can arm the buzzer.' })
    if (room.phase !== 'playing') return reply({ ok: false, error: 'Start the game before arming the buzzer.' })

    const representativesReady = (['one', 'two'] as TeamId[]).every((team) => {
      const participant = room.participants.get(room.buzzer.representatives[team] ?? '')
      return participant?.team === team
    })
    if (!representativesReady) return reply({ ok: false, error: 'Choose one representative from each team before arming the buzzer.' })

    if (room.config.kind === 'feud') endFeudQuestion(room)
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
        team: participant.team,
      },
    }
    reply({ ok: true, data: room.buzzer })
    syncRoom(room)
  })

  socket.on('room:leave', () => leaveCurrentRoom(socket))
  socket.on('disconnect', () => leaveCurrentRoom(socket, false))
})

const port = Number(process.env.PORT ?? 3001)
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Room server listening on http://localhost:${port}`)
})
