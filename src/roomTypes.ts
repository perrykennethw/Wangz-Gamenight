export type TeamId = 'one' | 'two'
export type RoomPhase = 'lobby' | 'playing'
export type ParticipantRole = 'host' | 'player'

export interface GameConfig {
  teamOne: string
  teamTwo: string
  winningScore: number
}

export interface Participant {
  id: string
  name: string
  team: TeamId | null
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  team: TeamId
  text: string
  sentAt: number
}

export type RoomViewer =
  | { role: 'host' }
  | { role: 'player'; participantId: string; team: TeamId | null }

export interface RoomSnapshot {
  code: string
  phase: RoomPhase
  config: GameConfig
  participants: Participant[]
  messages: ChatMessage[]
  viewer: RoomViewer
}

export type RoomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface ClientToServerEvents {
  'room:create': (config: GameConfig, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:join': (details: { code: string; name: string }, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:choose-team': (team: TeamId, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:leave': () => void
  'game:start': (reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'chat:send': (text: string, reply: (result: RoomResult<ChatMessage>) => void) => void
}

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void
  'room:closed': (message: string) => void
}
