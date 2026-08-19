import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ChatTypingUpdate,
  BuzzerState,
  ClientToServerEvents,
  GameConfig,
  JoinRoomDetails,
  PlayPassChoice,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  SharedTimerPreset,
  SpinSolveCommand,
  TeamId,
} from "./roomTypes";

type SnapshotListener = (snapshot: RoomSnapshot) => void;
type ClosedListener = (message: string) => void;
type TypingListener = (update: ChatTypingUpdate) => void;

class RoomClient {
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private joinedRoom: JoinRoomDetails | null = null;
  private canResume = false;
  private onResumeFailed: ClosedListener | null = null;

  constructor() {
    this.socket = io({ autoConnect: false });
    this.socket.on("connect", () => {
      if (!this.canResume || !this.joinedRoom) return;
      this.socket.emit("room:join", this.joinedRoom, (result) => {
        if (result.ok) return;
        this.canResume = false;
        this.onResumeFailed?.(`Could not reconnect: ${result.error}`);
      });
    });
  }

  subscribe(
    onSnapshot: SnapshotListener,
    onClosed: ClosedListener,
  ): () => void {
    this.connect();
    this.onResumeFailed = onClosed;
    this.socket.on("room:snapshot", onSnapshot);
    this.socket.on("room:closed", onClosed);

    return () => {
      this.socket.off("room:snapshot", onSnapshot);
      this.socket.off("room:closed", onClosed);
      if (this.onResumeFailed === onClosed) this.onResumeFailed = null;
    };
  }

  createRoom(config: GameConfig): Promise<RoomSnapshot> {
    this.canResume = false;
    this.joinedRoom = null;
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit("room:create", config, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  joinRoom(code: string, name: string, avatarId: string | null): Promise<RoomSnapshot> {
    const details: JoinRoomDetails = {
      code,
      name,
      avatarId,
      sessionId: this.sessionId(),
    };
    this.joinedRoom = details;
    this.canResume = false;
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit("room:join", details, (result) => {
        if (result.ok) this.canResume = true;
        this.finish(result, resolve, reject);
      });
    });
  }

  updateIdentity(name: string, avatarId: string | null): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("participant:update-identity", { name, avatarId }, (result) => {
        if (result.ok && this.joinedRoom) {
          this.joinedRoom.name = name;
          this.joinedRoom.avatarId = avatarId;
        }
        this.finish(result, resolve, reject);
      });
    });
  }

  chooseTeam(team: TeamId): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("room:choose-team", team, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  assignTeam(participantId: string, team: TeamId): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("room:assign-team", { participantId, team }, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  randomizeTeams(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("room:randomize-teams", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  startTimer(durationSeconds: SharedTimerPreset): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("timer:start", { durationSeconds }, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  stopTimer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("timer:stop", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  startGame(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("game:start", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  gameAction(command: SpinSolveCommand): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("game:action", command, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  sendMessage(text: string, team?: TeamId): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      this.socket.emit("chat:send", { text, team }, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  setTyping(isTyping: boolean, team?: TeamId): void {
    this.socket.emit("chat:typing", { isTyping, team });
  }

  subscribeTyping(listener: TypingListener): () => void {
    this.connect();
    this.socket.on("chat:typing", listener);
    return () => this.socket.off("chat:typing", listener);
  }

  openPlayPass(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:open-play-pass", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  votePlayPass(choice: PlayPassChoice): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:vote-play-pass", choice, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  decidePlayPass(choice: PlayPassChoice): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:decide-play-pass", choice, (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  endFeudQuestion(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:end-question", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  armBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("buzzer:arm", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  closeBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("buzzer:close", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  resetBuzzer(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("buzzer:reset", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  selectBuzzerRepresentative(
    team: TeamId,
    participantId: string,
  ): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit(
        "buzzer:select-representative",
        { team, participantId },
        (result) => this.finish(result, resolve, reject),
      );
    });
  }

  nextBuzzerPair(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("buzzer:next-pair", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  pressBuzzer(): Promise<BuzzerState> {
    return new Promise((resolve, reject) => {
      this.socket.emit("buzzer:press", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  leaveRoom(): void {
    this.canResume = false;
    this.joinedRoom = null;
    this.socket.emit("room:leave");
  }

  private sessionId(): string {
    const key = "wangz-player-session";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  }

  private connect(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  private finish<T>(
    result: RoomResult<T>,
    resolve: (value: T) => void,
    reject: (reason: Error) => void,
  ): void {
    if (result.ok) resolve(result.data);
    else reject(new Error(result.error));
  }
}

export const roomClient = new RoomClient();
