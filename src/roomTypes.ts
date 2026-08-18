export type TeamId = "one" | "two";
export type RoomPhase = "lobby" | "playing";
export type ParticipantRole = "host" | "player";
export type BuzzerStatus = "idle" | "armed" | "locked";
export type PlayPassChoice = "play" | "pass";
export type AvatarId = string;

export interface JoinRoomDetails {
  code: string;
  name: string;
  avatarId: AvatarId | null;
  sessionId: string;
}

export interface FeudAnswer {
  id: string;
  label: string;
  points: number;
}

export interface FeudQuestion {
  id: string;
  prompt: string;
  answers: FeudAnswer[];
}

export interface FeudGamePack {
  version: 1;
  kind: "feud";
  title: string;
  questions: FeudQuestion[];
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
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  team: TeamId;
  text: string;
  sentAt: number;
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

export type GameView = SpinSolveView;

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  config: RoomConfig;
  participants: Participant[];
  messages: ChatMessage[];
  teamChats: Partial<Record<TeamId, ChatMessage[]>>;
  chat: ChatState;
  playPass: PlayPassPollView;
  buzzer: BuzzerState;
  viewer: RoomViewer;
  game: GameView | null;
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

export interface ClientToServerEvents {
  "room:create": (
    config: GameConfig,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "room:join": (
    details: JoinRoomDetails,
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
  "room:leave": () => void;
  "game:start": (reply: (result: RoomResult<RoomSnapshot>) => void) => void;
  "game:action": (
    command: SpinSolveCommand,
    reply: (result: RoomResult<RoomSnapshot>) => void,
  ) => void;
  "chat:send": (
    details: { text: string; team?: TeamId },
    reply: (result: RoomResult<ChatMessage>) => void,
  ) => void;
  "feud:open-play-pass": (
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
}
