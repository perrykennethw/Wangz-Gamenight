import { io, type Socket } from 'socket.io-client'
import type {
  ChatMessage,
  BuzzerState,
  ClientToServerEvents,
  GameConfig,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  SpinSolveCommand,
  TeamId,
} from './roomTypes'

type SnapshotListener = (snapshot: RoomSnapshot) => void
type ClosedListener = (message: string) => void

class RoomClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>

  constructor() {
    this.socket = io({ autoConnect: false })
  }

  subscribe(onSnapshot: SnapshotListener, onClosed: ClosedListener): () => void {
    this.connect()
    this.socket.on('room:snapshot', onSnapshot)
    this.socket.on('room:closed', onClosed)

    return () => {
      this.socket.off('room:snapshot', onSnapshot)
      this.socket.off('room:closed', onClosed)
    }
  }

  createRoom(config: GameConfig): Promise<RoomSnapshot> {
    this.connect()
    return new Promise((resolve, reject) => {
      this.socket.emit('room:create', config, (result) => this.finish(result, resolve, reject))
    })
  }

  joinRoom(code: string, name: string): Promise<RoomSnapshot> {
    this.connect()
    return new Promise((resolve, reject) => {
      this.socket.emit('room:join', { code, name }, (result) => this.finish(result, resolve, reject))
    })
  }

  chooseTeam(team: TeamId): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('room:choose-team', team, (result) => this.finish(result, resolve, reject))
    })
  }

  startGame(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('game:start', (result) => this.finish(result, resolve, reject))
    })
  }

  gameAction(command: SpinSolveCommand): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('game:action', command, (result) => this.finish(result, resolve, reject))
    })
  }

  sendMessage(text: string): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      this.socket.emit('chat:send', text, (result) => this.finish(result, resolve, reject))
    })
  }

  armBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:arm', (result) => this.finish(result, resolve, reject))
    })
  }

  closeBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:close', (result) => this.finish(result, resolve, reject))
    })
  }

  resetBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:reset', (result) => this.finish(result, resolve, reject))
    })
  }

  selectBuzzerRepresentative(team: TeamId, participantId: string): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:select-representative', { team, participantId }, (result) => this.finish(result, resolve, reject))
    })
  }

  nextBuzzerPair(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:next-pair', (result) => this.finish(result, resolve, reject))
    })
  }

  pressBuzzer(): Promise<BuzzerState> {
    return new Promise((resolve, reject) => {
      this.socket.emit('buzzer:press', (result) => this.finish(result, resolve, reject))
    })
  }

  leaveRoom(): void {
    this.socket.emit('room:leave')
  }

  private connect(): void {
    if (!this.socket.connected) this.socket.connect()
  }

  private finish<T>(result: RoomResult<T>, resolve: (value: T) => void, reject: (reason: Error) => void): void {
    if (result.ok) resolve(result.data)
    else reject(new Error(result.error))
  }
}

export const roomClient = new RoomClient()
