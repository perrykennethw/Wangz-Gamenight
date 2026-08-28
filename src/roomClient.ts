import { io, type Socket } from "socket.io-client";
import type {
  ChatMessage,
  ChatTypingUpdate,
  BuzzerState,
  ClientToServerEvents,
  GameConfig,
  FastMoneyCommand,
  JoinRoomDetails,
  PlayPassChoice,
  RoomResult,
  RoomRecoveryRequest,
  RoomSnapshot,
  ServerToClientEvents,
  SharedTimerPreset,
  SpinSolveCommand,
  TeamId,
} from "./roomTypes";
import { getPlayerSessionId } from "./playerSessionIdentity";
import {
  roomRecoveryStore,
  type RoomRecoveryStore,
} from "./roomRecovery";

type SnapshotListener = (snapshot: RoomSnapshot) => void;
type ClosedListener = (message: string) => void;
type TypingListener = (update: ChatTypingUpdate) => void;
type RecoveredListener = (snapshot: RoomSnapshot) => void;

export type RoomConnectionStatus =
  | { state: "online"; message: "" }
  | { state: "reconnecting"; message: string }
  | { state: "back-online"; message: string }
  | { state: "recovery-expired"; message: string };

type ConnectionStatusListener = (status: RoomConnectionStatus) => void;

export type RoomClientSocket = Pick<
  Socket<ServerToClientEvents, ClientToServerEvents>,
  "connected" | "connect" | "on" | "off" | "emit"
>;

export class RoomClient {
  private readonly socket: RoomClientSocket;
  private readonly recoveryStore: RoomRecoveryStore;
  private recoveryIntent: RoomRecoveryRequest | null;
  private shouldRecover: boolean;
  private recoveryInFlight = false;
  private connectionStatus: RoomConnectionStatus;
  private onResumeFailed: ClosedListener | null = null;
  private onRecovered: RecoveredListener | null = null;
  private onConnectionStatus: ConnectionStatusListener | null = null;

  constructor(
    socket: RoomClientSocket = io({ autoConnect: false }),
    recoveryStore: RoomRecoveryStore = roomRecoveryStore,
  ) {
    this.socket = socket;
    this.recoveryStore = recoveryStore;
    this.recoveryIntent = recoveryStore.read();
    this.shouldRecover = this.recoveryIntent !== null;
    this.connectionStatus = this.recoveryIntent
      ? { state: "reconnecting", message: "Rejoining your room…" }
      : { state: "online", message: "" };

    this.socket.on("connect", () => {
      this.attemptRecovery();
    });
    this.socket.on("disconnect", () => {
      if (!this.recoveryIntent) return;
      this.shouldRecover = true;
      this.updateConnectionStatus({
        state: "reconnecting",
        message: "Connection lost. Rejoining your room…",
      });
    });
  }

  subscribe(
    onSnapshot: SnapshotListener,
    onClosed: ClosedListener,
    onConnectionStatus?: ConnectionStatusListener,
    onRecovered?: RecoveredListener,
  ): () => void {
    this.onResumeFailed = onClosed;
    this.onRecovered = onRecovered ?? null;
    this.onConnectionStatus = onConnectionStatus ?? null;
    onConnectionStatus?.(this.connectionStatus);
    const handleClosed = (message: string) => {
      this.clearResumeIntent();
      onClosed(message);
    };
    this.socket.on("room:snapshot", onSnapshot);
    this.socket.on("room:closed", handleClosed);
    this.connect();

    return () => {
      this.socket.off("room:snapshot", onSnapshot);
      this.socket.off("room:closed", handleClosed);
      if (this.onResumeFailed === onClosed) this.onResumeFailed = null;
      if (this.onRecovered === onRecovered) this.onRecovered = null;
      if (this.onConnectionStatus === onConnectionStatus) this.onConnectionStatus = null;
    };
  }

  hasRecoveryIntent(): boolean {
    return this.recoveryIntent !== null;
  }

  createRoom(config: GameConfig): Promise<RoomSnapshot> {
    this.clearResumeIntent();
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit("room:create", config, (result) => {
        if (!result.ok) {
          reject(new Error(result.error));
          return;
        }
        this.setRecoveryIntent({
          role: "host",
          code: result.data.room.code,
          credential: result.data.recoveryCredential,
        });
        resolve(result.data.room);
      });
    });
  }

  joinRoom(code: string, name: string, avatarId: string | null): Promise<RoomSnapshot> {
    const details: JoinRoomDetails = {
      code,
      name,
      avatarId,
      sessionId: getPlayerSessionId(),
    };
    this.clearResumeIntent();
    this.connect();
    return new Promise((resolve, reject) => {
      this.socket.emit("room:join", details, (result) => {
        if (result.ok) {
          this.setRecoveryIntent({
            role: "player",
            code: result.data.code,
            sessionId: details.sessionId,
          });
        }
        this.finish(result, resolve, reject);
      });
    });
  }

  updateIdentity(name: string, avatarId: string | null): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("participant:update-identity", { name, avatarId }, (result) => {
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

  prepareNextGame(expectedGameRevision: number, config?: GameConfig): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit(
        "room:prepare-next-game",
        { expectedGameRevision, ...(config ? { config } : {}) },
        (result) => this.finish(result, resolve, reject),
      );
    });
  }

  clearTeamChats(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("room:clear-team-chats", (result) =>
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

  fastMoneyAction(command: FastMoneyCommand): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("fast-money:action", command, (result) =>
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

  subscribeFastMoneyRepeat(listener: () => void): () => void {
    this.connect();
    this.socket.on("fast-money:repeat", listener);
    return () => this.socket.off("fast-money:repeat", listener);
  }

  openPlayPass(team: TeamId): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:open-play-pass", { team }, (result) =>
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

  prepareNextFeudQuestion(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:prepare-next-question", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  advanceFeudTurn(): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:advance-turn", (result) =>
        this.finish(result, resolve, reject),
      );
    });
  }

  setFeudTurnPlayer(team: TeamId, participantId: string): Promise<RoomSnapshot> {
    return new Promise((resolve, reject) => {
      this.socket.emit("feud:set-turn-player", { team, participantId }, (result) =>
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
    this.clearResumeIntent();
    this.socket.emit("room:leave");
  }

  private clearResumeIntent(): void {
    this.recoveryIntent = null;
    this.shouldRecover = false;
    this.recoveryInFlight = false;
    this.recoveryStore.clear();
    this.updateConnectionStatus({ state: "online", message: "" });
  }

  private connect(): void {
    if (!this.socket.connected) this.socket.connect();
    else this.attemptRecovery();
  }

  private setRecoveryIntent(intent: RoomRecoveryRequest): void {
    this.recoveryIntent = intent;
    this.shouldRecover = false;
    this.recoveryStore.write(intent);
    this.updateConnectionStatus({ state: "online", message: "" });
  }

  private attemptRecovery(): void {
    if (!this.recoveryIntent || !this.shouldRecover || this.recoveryInFlight) return;
    this.recoveryInFlight = true;
    const intent = this.recoveryIntent;
    this.updateConnectionStatus({
      state: "reconnecting",
      message: "Rejoining your room…",
    });
    this.socket.emit("room:recover", intent, (result) => {
      this.recoveryInFlight = false;
      if (result.ok) {
        this.shouldRecover = false;
        this.updateConnectionStatus({
          state: "back-online",
          message: "Back online.",
        });
        this.onRecovered?.(result.data);
        return;
      }

      this.recoveryIntent = null;
      this.shouldRecover = false;
      this.recoveryStore.clear();
      const message = `Recovery expired. ${result.error}`;
      this.updateConnectionStatus({ state: "recovery-expired", message });
      this.onResumeFailed?.(message);
    });
  }

  private updateConnectionStatus(status: RoomConnectionStatus): void {
    this.connectionStatus = status;
    this.onConnectionStatus?.(status);
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
