import type { SharedTimerPreset, SharedTimerState } from "./sharedTimer.js";
import type { FeudTurnOrderView } from "./feudTurnOrder.js";

export type TeamId = "one" | "two";
export type RoomPhase = "lobby" | "playing";
export type ParticipantRole = "host" | "player";
export type PlayerStatus = "active" | "waiting";
export type BuzzerStatus = "idle" | "armed" | "locked";
export type PlayPassChoice = "play" | "pass";
export type AvatarId = string;

export const HOST_AVATAR_ID: AvatarId = "Mudkip.svg";

export type { SharedTimerPreset, SharedTimerState } from "./sharedTimer.js";
export type { FeudTurnOrderView } from "./feudTurnOrder.js";

export interface JoinRoomDetails {
  code: string;
  name: string;
  avatarId: AvatarId | null;
  sessionId: string;
}

export type RoomRecoveryRequest =
  | {
      role: "host";
      code: string;
      credential: string;
    }
  | {
      role: "player";
      code: string;
      sessionId: string;
    };

export interface FeudAnswer {
  id: string;
  label: string;
  points: number;
  aliases?: string[];
}

export interface FeudQuestion {
  id: string;
  prompt: string;
  answers: FeudAnswer[];
}

export interface FeudFastMoneyPack {
  questions: FeudQuestion[];
  timers: {
    first: number;
    second: number;
  };
}

export interface FeudGamePack {
  version: 1;
  kind: "feud";
  title: string;
  questions: FeudQuestion[];
  fastMoney?: FeudFastMoneyPack;
}

export interface FeudGameConfig {
  kind: "feud";
  teamOne: string;
  teamTwo: string;
  winningScore: number;
  pack: FeudGamePack;
}

export interface FeudPublicConfig {
  kind: "feud";
  teamOne: string;
  teamTwo: string;
  winningScore: number;
}

export interface SpinSolveGameConfig {
  kind: "spin-solve";
  teamOne: string;
  teamTwo: string;
  rounds: number;
}

export type GameConfig = FeudGameConfig | SpinSolveGameConfig;
export type RoomConfig =
  | FeudGameConfig
  | FeudPublicConfig
  | SpinSolveGameConfig;

export interface Participant {
  id: string;
  name: string;
  avatarId: AvatarId | null;
  team: TeamId | null;
  status: PlayerStatus;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatarId: AvatarId | null;
  team: TeamId;
  text: string;
  sentAt: number;
}

export interface ChatTypingUpdate {
  senderId: string;
  senderName: string;
  senderAvatarId: AvatarId | null;
  team: TeamId;
  isTyping: boolean;
}

export interface BuzzerWinner {
  participantId: string;
  playerName: string;
  avatarId: AvatarId | null;
  team: TeamId;
}

export interface BuzzerState {
  status: BuzzerStatus;
  winner: BuzzerWinner | null;
  representatives: Record<TeamId, string | null>;
}

export interface ChatState {
  lockedTeam: TeamId | null;
  reason: string | null;
}

export interface PlayPassPollView {
  status: "closed" | "open" | "decided";
  team: TeamId | null;
  activePlayerId: string | null;
  votes: Record<PlayPassChoice, number>;
  viewerVote: PlayPassChoice | null;
  decision: PlayPassChoice | null;
  controllingTeam: TeamId | null;
}

export type RoomViewer =
  | { role: "host" }
  | { role: "player"; participantId: string; team: TeamId | null };

export type SpinSolvePhase =
  | "regular"
  | "choosing-letter"
  | "round-complete"
  | "bonus-letters"
  | "bonus-solving"
  | "complete";

export type WheelSegment =
  | { kind: "points"; value: number }
  | { kind: "bankrupt" }
  | { kind: "lose-turn" };

export interface SpinSolveView {
  kind: "spin-solve";
  phase: SpinSolvePhase;
  round: number;
  totalRounds: number;
  category: string;
  maskedPuzzle: string;
  usedLetters: string[];
  activeTeam: TeamId;
  roundBanks: Record<TeamId, number>;
  totals: Record<TeamId, number>;
  wheelSegments: WheelSegment[];
  wheelIndex: number | null;
  spinId: number;
  pendingWedge: WheelSegment | null;
  message: string;
  winnerTeam: TeamId | null;
  bonusDeadline: number | null;
  bonusWon: boolean | null;
  canUndo: boolean;
}

export type FastMoneyPhase =
  | "selecting"
  | "ready-one"
  | "active-one"
  | "review-one"
  | "reveal-one"
  | "ready-two"
  | "active-two"
  | "review-two"
  | "reveal"
  | "complete";

export type FastMoneyViewerRole =
  | "host"
  | "contestant-one"
  | "contestant-two"
  | "eligible-team"
  | "spectator";

export interface FastMoneyContestantView {
  id: string;
  name: string;
  avatarId: AvatarId | null;
}

export interface FastMoneyTimerView {
  status: "idle" | "running" | "paused";
  durationSeconds: number;
  deadline: number | null;
  remainingMs: number;
}

export interface FastMoneyResponseView {
  text: string | null;
  answerId: string | null;
  points: number | null;
  repeated: boolean;
}

export interface FastMoneyQuestionView {
  id: string;
  prompt: string | null;
  responses: [FastMoneyResponseView, FastMoneyResponseView];
  answerOptions: FeudAnswer[] | null;
  revealed: boolean;
}

export interface FastMoneyView {
  kind: "fast-money";
  phase: FastMoneyPhase;
  eligibleTeam: TeamId;
  viewerRole: FastMoneyViewerRole;
  contestants: [FastMoneyContestantView | null, FastMoneyContestantView | null];
  voteCounts: Record<string, number>;
  viewerVotes: string[];
  currentContestant: 0 | 1 | null;
  currentQuestionIndex: number | null;
  questions: FastMoneyQuestionView[];
  answeredCount: number;
  attemptDurations: [number, number];
  timer: FastMoneyTimerView;
  subtotals: [number | null, number | null];
  combinedScore: number;
  goal: 200;
  revealIndex: number;
  isIsolated: boolean;
  outcome: "win" | "short" | null;
  message: string;
}

export type GameView = SpinSolveView | FastMoneyView;

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  gameRevision: number;
  hostConnection: {
    status: "connected" | "reconnecting";
    recoveryDeadline: number | null;
  };
  config: RoomConfig;
  participants: Participant[];
  messages: ChatMessage[];
  teamChats: Partial<Record<TeamId, ChatMessage[]>>;
  chat: ChatState;
  playPass: PlayPassPollView;
  feudTurns: FeudTurnOrderView;
  buzzer: BuzzerState;
  timer: SharedTimerState;
  viewer: RoomViewer;
  game: GameView | null;
}

export interface HostRoomCreation {
  room: RoomSnapshot;
  recoveryCredential: string;
}

export type RoomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SpinSolveCommand =
  | { type: "spin" }
  | { type: "guess-letter"; letter: string }
  | { type: "buy-vowel"; letter: string }
  | { type: "solve"; solution: string }
  | { type: "award-solve" }
  | { type: "next-round" }
  | { type: "choose-bonus-letters"; consonants: string; vowel: string }
  | { type: "bonus-solve"; solution: string }
  | { type: "finish-bonus" }
  | { type: "undo" };

export type FastMoneyCommand =
  | { type: "start"; team: TeamId }
  | { type: "vote"; participantIds: [string, string] }
  | { type: "set-lineup"; contestantIds: [string, string] }
  | { type: "confirm-lineup" }
  | { type: "replace-contestant"; contestant: 0 | 1; participantId: string }
  | { type: "start-attempt" }
  | { type: "submit"; answer: string }
  | { type: "pass" }
  | { type: "end-attempt" }
  | {
      type: "score-response";
      contestant: 0 | 1;
      questionIndex: number;
      text: string;
      answerId: string | null;
      repeated: boolean;
    }
  | { type: "lock-review" }
  | { type: "pause-timer" }
  | { type: "resume-timer" }
  | { type: "add-time" }
  | { type: "reveal-next" }
  | { type: "finish-first-reveal" }
  | { type: "skip-first-reveal" };

export interface ClientToServerEvents {
  "room:create": (
    config: GameConfig,
    reply: (result: RoomResult<HostRoomCreation>) => void,
  ) => void;
  "room:join": (
    details: JoinRoomDetails,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:recover": (
    details: RoomRecoveryRequest,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "participant:update-identity": (
    details: { name: string; avatarId: AvatarId | null },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:choose-team": (
    team: TeamId,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:assign-team": (
    details: { participantId: string; team: TeamId },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:randomize-teams": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "timer:start": (
    details: { durationSeconds: SharedTimerPreset },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "timer:stop": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:prepare-next-game": (
    details: { expectedGameRevision: number; config?: GameConfig },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:clear-team-chats": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:leave": () => void;
  "game:start": (reply: (result: RoomResult<RoomSnapshot>) => void) => void;
  "game:action": (
    command: SpinSolveCommand,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "fast-money:action": (
    command: FastMoneyCommand,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "chat:send": (
    details: { text: string; team?: TeamId },
    reply: (result: RoomResult<ChatMessage>) => void,
  ) => void;
  "chat:typing": (details: { isTyping: boolean; team?: TeamId }) => void;
  "feud:open-play-pass": (
    details: { team: TeamId },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:vote-play-pass": (
    choice: PlayPassChoice,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:decide-play-pass": (
    choice: PlayPassChoice,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:end-question": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:prepare-next-question": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:advance-turn": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "feud:set-turn-player": (
    details: { team: TeamId; participantId: string },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "buzzer:arm": (reply: (result: RoomResult<RoomSnapshot>) => void) => void;
  "buzzer:close": (reply: (result: RoomResult<RoomSnapshot>) => void) => void;
  "buzzer:reset": (reply: (result: RoomResult<RoomSnapshot>) => void) => void;
  "buzzer:select-representative": (
    details: { team: TeamId; participantId: string },
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "buzzer:next-pair": (
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "buzzer:press": (reply: (result: RoomResult<BuzzerState>) => void) => void;
}

export interface ServerToClientEvents {
  "room:snapshot": (snapshot: RoomSnapshot) => void;
  "room:closed": (message: string) => void;
  "chat:typing": (update: ChatTypingUpdate) => void;
  "fast-money:repeat": () => void;
}
