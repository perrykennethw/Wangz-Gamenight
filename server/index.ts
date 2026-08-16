import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { Server, type Socket } from 'socket.io'
import type {
  ChatMessage,
  ClientToServerEvents,
  GameConfig,
  Participant,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from '../src/roomTypes.js'

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

function snapshotFor(room: Room, socketId: string): RoomSnapshot {
  const connection = room.connections.get(socketId)
  if (!connection) throw new Error('Socket is not connected to this room.')

  const participant = connection.participantId
    ? room.participants.get(connection.participantId)
    : undefined

  return {
    code: room.code,
    phase: room.phase,
    config: room.config,
    participants: [...room.participants.values()],
    messages: participant?.team ? room.messages[participant.team] : [],
    viewer: connection.role === 'host'
      ? { role: 'host' }
      : { role: 'player', participantId: participant?.id ?? '', team: participant?.team ?? null },
  }
}

function syncRoom(room: Room): void {
  for (const socketId of room.connections.keys()) {
    io.sockets.sockets.get(socketId)?.emit('room:snapshot', snapshotFor(room, socketId))
  }
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

  if (connection?.participantId) room.participants.delete(connection.participantId)
  if (notifySocket) syncRoom(room)
}

io.on('connection', (socket) => {
  socket.on('room:create', (config, reply) => {
    leaveCurrentRoom(socket)
    const code = makeCode()
    const room: Room = {
      code,
      phase: 'lobby',
      config,
      hostSocketId: socket.id,
      participants: new Map(),
      connections: new Map([[socket.id, { role: 'host' }]]),
      messages: { one: [], two: [] },
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
    if (room.phase !== 'lobby') return reply({ ok: false, error: 'Teams are locked after the game starts.' })
    if (participant.team && participant.team !== team) {
      return reply({ ok: false, error: 'Your team is locked to keep both chats private.' })
    }

    participant.team = team
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('chat:send', (text, reply) => {
    const room = roomFor(socket.id)
    const connection = room?.connections.get(socket.id)
    const participant = connection?.participantId ? room?.participants.get(connection.participantId) : undefined
    const cleanText = text.trim().slice(0, 280)

    if (!room || !participant?.team) return reply({ ok: false, error: 'Choose a team before chatting.' })
    if (!cleanText) return reply({ ok: false, error: 'Write a message before sending.' })

    const message: ChatMessage = {
      id: randomUUID(),
      senderId: participant.id,
      senderName: participant.name,
      team: participant.team,
      text: cleanText,
      sentAt: Date.now(),
    }
    room.messages[participant.team].push(message)
    room.messages[participant.team] = room.messages[participant.team].slice(-100)
    reply({ ok: true, data: message })
    syncRoom(room)
  })

  socket.on('game:start', (reply) => {
    const room = roomFor(socket.id)
    if (!room || room.hostSocketId !== socket.id) return reply({ ok: false, error: 'Only the host can start the game.' })

    const hasTeamOne = [...room.participants.values()].some((player) => player.team === 'one')
    const hasTeamTwo = [...room.participants.values()].some((player) => player.team === 'two')
    if (!hasTeamOne || !hasTeamTwo) return reply({ ok: false, error: 'Each team needs at least one player.' })

    room.phase = 'playing'
    const snapshot = snapshotFor(room, socket.id)
    reply({ ok: true, data: snapshot })
    syncRoom(room)
  })

  socket.on('room:leave', () => leaveCurrentRoom(socket))
  socket.on('disconnect', () => leaveCurrentRoom(socket, false))
})

const port = Number(process.env.PORT ?? 3001)
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Room server listening on http://localhost:${port}`)
})
