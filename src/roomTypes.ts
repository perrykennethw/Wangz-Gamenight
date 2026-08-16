export type TeamId = 'one' | 'two'
export type RoomPhase = 'lobby' | 'playing'
export type ParticipantRole = 'host' | 'player'

export interface FeudGameConfig {
  kind: 'feud'
  teamOne: string
  teamTwo: string
  winningScore: number
}

export interface SpinSolveGameConfig {
  kind: 'spin-solve'
  teamOne: string
  teamTwo: string
  rounds: number
}

export type GameConfig = FeudGameConfig | SpinSolveGameConfig

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

export type SpinSolvePhase =
  | 'regular'
  | 'choosing-letter'
  | 'round-complete'
  | 'bonus-letters'
  | 'bonus-solving'
  | 'complete'

export type WheelSegment =
  | { kind: 'points'; value: number }
  | { kind: 'bankrupt' }
  | { kind: 'lose-turn' }

export interface SpinSolveView {
  kind: 'spin-solve'
  phase: SpinSolvePhase
  round: number
  totalRounds: number
  category: string
  maskedPuzzle: string
  usedLetters: string[]
  activeTeam: TeamId
  roundBanks: Record<TeamId, number>
  totals: Record<TeamId, number>
  wheelSegments: WheelSegment[]
  wheelIndex: number | null
  spinId: number
  pendingWedge: WheelSegment | null
  message: string
  winnerTeam: TeamId | null
  bonusDeadline: number | null
  bonusWon: boolean | null
  canUndo: boolean
}

export type GameView = SpinSolveView

export interface RoomSnapshot {
  code: string
  phase: RoomPhase
  config: GameConfig
  participants: Participant[]
  messages: ChatMessage[]
  viewer: RoomViewer
  game: GameView | null
}

export type RoomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export type SpinSolveCommand =
  | { type: 'spin' }
  | { type: 'guess-letter'; letter: string }
  | { type: 'buy-vowel'; letter: string }
  | { type: 'solve'; solution: string }
  | { type: 'award-solve' }
  | { type: 'next-round' }
  | { type: 'choose-bonus-letters'; consonants: string; vowel: string }
  | { type: 'bonus-solve'; solution: string }
  | { type: 'finish-bonus' }
  | { type: 'undo' }

export interface ClientToServerEvents {
  'room:create': (config: GameConfig, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:join': (details: { code: string; name: string }, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:choose-team': (team: TeamId, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'room:leave': () => void
  'game:start': (reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'game:action': (command: SpinSolveCommand, reply: (result: RoomResult<RoomSnapshot>) => void) => void
  'chat:send': (text: string, reply: (result: RoomResult<ChatMessage>) => void) => void
}

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void
  'room:closed': (message: string) => void
}
