import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  avatarFor,
  avatarOptions,
  initials,
  rememberedAvatarId,
  rememberAvatarId,
} from "./avatarCatalog";
import { FeudGameBuilder, saveFeudGamePackDraft } from "./FeudGameBuilder";
import { GamePackError, parseFeudGamePack } from "./feudGamePack";
import {
  GAME_AUDIO_CUE_LABELS,
  gameAudio,
  type GameAudioCue,
  type GameAudioPackChoice,
  type GameAudioState,
} from "./gameAudio";
import { starterFeudPack } from "./gameData";
import { FastMoneyBoard, FastMoneyClock, FastMoneyHost, FastMoneyPlayer } from "./FastMoney";
import {
  createFastMoneyPresentation,
  createFeudPresentation,
  createLobbyPresentation,
  createSpinPresentation,
  openPresenterTab,
  presenterRoomCode,
  usePresentation,
  usePresentationPublisher,
  type FeudPresentation,
  type FastMoneyPresentation,
  type LobbyPresentation,
  type SpinPresentation,
} from "./presenterChannel";
import { roomClient } from "./roomClient";
import {
  browserRoomInviteUrl,
  isLocalRoomInviteUrl,
  joinRoomCodeFromSearch,
} from "./roomInvite";
import {
  forgetPlayerIdentity,
  readPlayerIdentityPreference,
  rememberPlayerIdentity,
} from "./playerIdentityPreference";
import {
  SHARED_TIMER_PRESETS,
  remainingSharedTimerMilliseconds,
  type SharedTimerPreset,
  type SharedTimerState,
} from "./sharedTimer";
import type {
  AvatarId,
  ChatMessage,
  ChatTypingUpdate,
  FeudGameConfig,
  FeudGamePack,
  FeudRoundCommand,
  GameConfig,
  Participant,
  PlayPassChoice,
  RoomSnapshot,
  SpinSolveCommand,
  SpinSolveGameConfig,
  SpinSolveView,
  TeamId,
  WheelSegment,
} from "./roomTypes";

type Screen =
  | "home"
  | "setup"
  | "builder"
  | "join"
  | "host-lobby"
  | "player-room"
  | "game";
type TeamIndex = 0 | 1;
type ScoreAccent = "gold" | "coral";

interface Winner {
  name: string;
  score: number;
  team: TeamId;
}

interface BoltProps {
  size?: number;
}

interface BrandProps {
  compact?: boolean;
}

interface HomeProps {
  onChooseFeud: () => void;
  onChooseSpinSolve: () => void;
  onJoin: () => void;
}

interface SetupProps {
  kind: GameConfig["kind"];
  feudPack: FeudGamePack;
  initialConfig?: GameConfig;
  existingRoomCode?: string;
  onBack: () => void;
  onBuildPack: () => void;
  onChooseKind?: (kind: GameConfig["kind"]) => void;
  onSelectPack: (pack: FeudGamePack) => void;
  onStart: (config: GameConfig) => Promise<void>;
}

interface ScoreCardProps {
  team: string;
  score: number;
  accent: ScoreAccent;
  onAdjust?: (change: number) => void;
}

interface AnswerTileProps {
  answer: string;
  points: number;
  number: number;
  revealed: boolean;
  onReveal: () => void;
}

interface WinnerModalProps {
  winner: string;
  score: number;
  onReplay: () => Promise<void>;
  onChangeGame: () => Promise<void>;
  onHome: () => void;
  onFastMoney?: () => void;
  fastMoneyError?: string;
}

interface GameProps {
  config: FeudGameConfig;
  roomCode: string;
  room: RoomSnapshot;
  onExit: () => void;
  onReplay: () => Promise<void>;
  onChangeGame: () => Promise<void>;
}

type PrototypeVariant = "A" | "B" | "C";

interface PlayerBuzzerVariantProps {
  room: RoomSnapshot;
  participantId: string;
  team: TeamId;
  isBuzzing: boolean;
  error: string;
  onBuzz: () => void;
  chat: React.ReactNode;
}

const Bolt = ({ size = 18 }: BoltProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M13.2 2 4.5 13h6.2l-.8 9L19.5 10h-6.2l-.1-8Z"
      fill="currentColor"
    />
  </svg>
);

const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="m9 5 7 7-7 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function Brand({ compact = false }: BrandProps) {
  return (
    <div
      className={`brand ${compact ? "brand--compact" : ""}`}
      aria-label="Wangz Game Night"
    >
      <span className="brand__mark">
        <Bolt size={compact ? 16 : 20} />
      </span>
      <span className="brand__name">WANGZ</span>
      <span className="brand__sub">GAME NIGHT</span>
    </div>
  );
}

const manualAudioCues: GameAudioCue[] = [
  "opening",
  "answer-reveal",
  "wrong-answer",
  "repeat-answer",
];

const alternateAudioPackUrl = (import.meta.env.VITE_GAME_AUDIO_PACK_URL ?? "").trim();
if (alternateAudioPackUrl) void gameAudio.configureAlternatePack(alternateAudioPackUrl);

function useGameAudioState(): GameAudioState {
  const [state, setState] = useState<GameAudioState>(() => gameAudio.getState());
  useEffect(() => gameAudio.subscribe(setState), []);
  return state;
}

function GameAudioControls() {
  const audio = useGameAudioState();
  const muted = !audio.enabled || audio.volume === 0;
  const status = muted
    ? "Muted"
    : audio.playingCue
      ? `Playing ${GAME_AUDIO_CUE_LABELS[audio.playingCue].toLowerCase()}`
      : "Ready";

  return (
    <section
      className={`game-audio-panel ${muted ? "is-muted" : ""} ${audio.playingCue ? "is-playing" : ""}`}
      aria-label="Game audio controls"
    >
      <div className="game-audio-panel__status">
        <span aria-hidden="true">♫</span>
        <div>
          <small>Host audio</small>
          <strong aria-live="polite">{status}</strong>
        </div>
      </div>
      <button
        type="button"
        className="game-audio-panel__toggle"
        aria-pressed={audio.enabled}
        onClick={() => gameAudio.setEnabled(!audio.enabled)}
      >
        {audio.enabled ? "Disable audio" : "Enable audio"}
      </button>
      <label className="game-audio-panel__pack">
        <span>Sound pack</span>
        <select
          value={audio.selectedPack}
          onChange={(event) => gameAudio.setPack(event.target.value as GameAudioPackChoice)}
          aria-label="Game audio sound pack"
        >
          <option value="original">Original</option>
          {audio.alternatePackStatus === "ready" && (
            <option value="alternate">{audio.alternatePackName}</option>
          )}
        </select>
        {audio.alternatePackStatus === "loading" && <small>Loading configured pack…</small>}
      </label>
      <label className="game-audio-panel__volume">
        <span>Volume</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(audio.volume * 100)}
          onChange={(event) => gameAudio.setVolume(Number(event.target.value) / 100)}
          aria-label={`Game audio volume, ${Math.round(audio.volume * 100)} percent`}
        />
        <b>{Math.round(audio.volume * 100)}%</b>
      </label>
      <div className="game-audio-panel__cues" aria-label="Replay audio cues">
        {manualAudioCues.map((cue) => (
          <button
            type="button"
            key={cue}
            disabled={!audio.enabled}
            aria-pressed={audio.playingCue === cue}
            onClick={() => void gameAudio.play(cue)}
          >
            <span aria-hidden="true">▶</span> {GAME_AUDIO_CUE_LABELS[cue]}
          </button>
        ))}
        {audio.playingCue && (
          <button type="button" onClick={() => gameAudio.stop()}>
            Stop
          </button>
        )}
      </div>
      {audio.error && <p role="alert">{audio.error}</p>}
    </section>
  );
}

function useSharedTimerSeconds(timer: SharedTimerState): number {
  const calculate = () => Math.ceil(
    remainingSharedTimerMilliseconds(timer, Date.now()) / 1000,
  );
  const [seconds, setSeconds] = useState(calculate);

  useEffect(() => {
    setSeconds(calculate());
    if (timer.status !== "running") return;
    const interval = window.setInterval(() => setSeconds(calculate()), 100);
    return () => window.clearInterval(interval);
  }, [timer.status, timer.deadline]);

  return seconds;
}

function SharedTimerReadout({
  timer,
  className = "",
}: {
  timer: SharedTimerState;
  className?: string;
}) {
  const seconds = useSharedTimerSeconds(timer);
  const status = timer.status === "running" && seconds === 0
    ? "expired"
    : timer.status;
  const label = status === "idle"
    ? "Shared timer ready"
    : status === "expired"
      ? "Time is up"
      : `${seconds} second${seconds === 1 ? "" : "s"} remaining`;

  return (
    <div
      className={`shared-timer-readout shared-timer-readout--${status} ${className}`}
      role="timer"
      aria-label={label}
      aria-live={status === "expired" ? "assertive" : "off"}
    >
      <span>Shared timer</span>
      <strong>{status === "idle" ? "—" : status === "expired" ? "TIME" : seconds}</strong>
      <small>
        {status === "idle"
          ? "Ready"
          : status === "expired"
            ? "Time’s up"
            : "seconds left"}
      </small>
    </div>
  );
}

function SharedTimerAudience({
  timer,
  className = "",
}: {
  timer: SharedTimerState;
  className?: string;
}) {
  if (timer.status === "idle") return null;
  return <SharedTimerReadout timer={timer} className={`shared-timer-audience ${className}`} />;
}

function SharedTimerHostPanel({ timer }: { timer: SharedTimerState }) {
  const [updating, setUpdating] = useState<SharedTimerPreset | "stop" | null>(null);
  const [error, setError] = useState("");
  const seconds = useSharedTimerSeconds(timer);
  const timerAudio = useRef({ deadline: null as number | null, warned: false, expired: false });

  useEffect(() => {
    if (timer.deadline !== timerAudio.current.deadline) {
      timerAudio.current = { deadline: timer.deadline, warned: false, expired: false };
    }
    if (timer.status === "idle") return;
    if (seconds > 0 && seconds <= 5 && !timerAudio.current.warned) {
      timerAudio.current.warned = true;
      void gameAudio.play("timer-warning");
    }
    if ((timer.status === "expired" || seconds === 0) && !timerAudio.current.expired) {
      timerAudio.current.expired = true;
      void gameAudio.play("timer-expired");
    }
  }, [seconds, timer.deadline, timer.status]);

  const start = async (durationSeconds: SharedTimerPreset) => {
    setError("");
    setUpdating(durationSeconds);
    try {
      await roomClient.startTimer(durationSeconds);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the timer.");
    } finally {
      setUpdating(null);
    }
  };

  const stop = async () => {
    setError("");
    setUpdating("stop");
    try {
      await roomClient.stopTimer();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not stop the timer.");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <section className="shared-timer-panel" aria-label="Shared timer controls">
      <SharedTimerReadout timer={timer} />
      <div className="shared-timer-panel__presets" role="group" aria-label="Start a shared timer">
        {SHARED_TIMER_PRESETS.map((duration) => {
          const active = timer.status === "running" && timer.durationSeconds === duration;
          const action = timer.status === "running"
            ? active ? "Restart" : "Replace timer with"
            : "Start";
          return (
            <button
              type="button"
              key={duration}
              aria-label={`${action} ${duration} seconds`}
              aria-pressed={active}
              disabled={updating !== null}
              onClick={() => void start(duration)}
            >
              {updating === duration ? "Starting…" : `${duration}s`}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="shared-timer-panel__stop"
        disabled={timer.status === "idle" || updating !== null}
        onClick={() => void stop()}
      >
        {updating === "stop" ? "Resetting…" : "Stop & reset"}
      </button>
      {timer.status === "running" && (
        <p>Starting another preset replaces this countdown.</p>
      )}
      {error && <p className="shared-timer-panel__error" role="alert">{error}</p>}
    </section>
  );
}

function IdentityPortrait({
  name,
  avatarId,
  compact = false,
}: {
  name: string;
  avatarId: AvatarId | null;
  compact?: boolean;
}) {
  const avatar = avatarFor(avatarId);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = avatar && avatar.url !== failedUrl;

  return (
    <span
      className={`identity-portrait ${compact ? "identity-portrait--compact" : ""}`}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={avatar.url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(avatar.url)}
        />
      ) : (
        <b>{initials(name)}</b>
      )}
    </span>
  );
}

function PlayerIdentity({
  participant,
  compact = false,
}: {
  participant: Pick<Participant, "name" | "avatarId">;
  compact?: boolean;
}) {
  return (
    <span className={`player-identity ${compact ? "player-identity--compact" : ""}`}>
      <IdentityPortrait name={participant.name} avatarId={participant.avatarId} compact={compact} />
      <strong>{participant.name}</strong>
    </span>
  );
}

function AvatarPicker({
  selected,
  name,
  onSelect,
  compact = false,
}: {
  selected: AvatarId | null;
  name: string;
  onSelect: (avatarId: AvatarId | null) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filteredAvatars = avatarOptions.filter((avatar) =>
    avatar.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <fieldset className={`avatar-picker ${compact ? "avatar-picker--compact" : ""}`}>
      <legend>Pick an avatar <span>Optional</span></legend>
      <div className="avatar-picker__toolbar">
        <p>Choose a favorite or keep your initials.</p>
        {avatarOptions.length > 12 && (
          <label>
            <input
              type="search"
              aria-label="Search avatars"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search avatars"
            />
          </label>
        )}
      </div>
      <div className="avatar-picker__grid">
        <button
          type="button"
          className={!selected ? "is-selected" : ""}
          onClick={() => onSelect(null)}
          aria-pressed={!selected}
          aria-label="Use my initials"
        >
          <IdentityPortrait name={name || "Player"} avatarId={null} compact={compact} />
          <span>My initials</span>
          {!selected && <i aria-hidden="true">✓</i>}
        </button>
        {filteredAvatars.map((avatar) => (
          <button
            type="button"
            key={avatar.id}
            className={selected === avatar.id ? "is-selected" : ""}
            onClick={() => onSelect(avatar.id)}
            aria-pressed={selected === avatar.id}
            aria-label={`Choose ${avatar.label}`}
          >
            <IdentityPortrait name={avatar.label} avatarId={avatar.id} compact={compact} />
            <span>{avatar.label}</span>
            {selected === avatar.id && <i aria-hidden="true">✓</i>}
          </button>
        ))}
      </div>
      {query && !filteredAvatars.length && (
        <p className="avatar-picker__empty">No avatars match “{query}”.</p>
      )}
      {!avatarOptions.length && (
        <small>Your initials are ready. More avatars are coming soon.</small>
      )}
    </fieldset>
  );
}

function PresenterTabButton({ roomCode }: { roomCode: string }) {
  const [status, setStatus] = useState("");
  const open = () => {
    const opened = openPresenterTab(roomCode);
    setStatus(
      opened
        ? "Presenter tab opened."
        : "Your browser blocked the presenter tab. Allow pop-ups, then try again.",
    );
    if (opened) window.setTimeout(() => setStatus(""), 1800);
  };

  return (
    <span className="presenter-tab-action">
      <button onClick={open}>Open presenter tab ↗</button>
      {status && <small role="status">{status}</small>}
    </span>
  );
}

function RoomInviteCard({
  roomCode,
  view,
}: {
  roomCode: string;
  view: "moderator" | "presenter";
}) {
  const invitationUrl = useMemo(() => browserRoomInviteUrl(roomCode), [roomCode]);
  const localOnly = isLocalRoomInviteUrl(invitationUrl);
  const [status, setStatus] = useState("");

  const copy = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(successMessage);
    } catch {
      setStatus("Could not copy. Select the room code instead.");
    }
    window.setTimeout(() => setStatus(""), 1800);
  };

  return (
    <aside
      className={`room-invite-card room-invite-card--${view}`}
      aria-label={`Join room ${roomCode}`}
    >
      <div className="room-invite-card__qr">
        <QRCodeSVG
          value={invitationUrl}
          size={view === "presenter" ? 220 : 176}
          level="M"
          marginSize={4}
          bgColor="#ffffff"
          fgColor="#081934"
          title={`Scan to join room ${roomCode}`}
        />
      </div>
      <div className="room-invite-card__details">
        <span>Scan to join</span>
        <strong>{roomCode}</strong>
        <small>Open your camera and point it here.</small>
        {view === "moderator" && (
          <div className="room-invite-card__actions">
            <button type="button" onClick={() => void copy(roomCode, "Room code copied!")}>
              Copy code
            </button>
            <button type="button" onClick={() => void copy(invitationUrl, "Join link copied!")}>
              Copy join link
            </button>
          </div>
        )}
      </div>
      {localOnly && view === "moderator" && (
        <p className="room-invite-card__warning">
          Phones cannot open localhost. Reopen the host on the Vite Network URL
          to make this QR code reachable.
        </p>
      )}
      {status && (
        <p className="room-invite-card__status" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </aside>
  );
}

function Home({ onChooseFeud, onChooseSpinSolve, onJoin }: HomeProps) {
  return (
    <main className="home-shell">
      <nav className="home-nav">
        <Brand />
        <div className="home-nav__actions">
          <span className="edition">Living room edition · 01</span>
          <button className="nav-join" onClick={onJoin}>
            Join a room
          </button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Tonight’s main event</p>
          <h1>
            The room is ready.
            <br />
            <em>Pick your game.</em>
          </h1>
          <p className="hero__dek">
            Pass out the snacks, split into teams, and hand the controls to your
            most dramatic friend.
          </p>
        </div>

        <button
          className="feature-card"
          onClick={onChooseFeud}
          aria-label="Set up Family Feud"
        >
          <span className="feature-card__flag">Ready to play</span>
          <span className="feature-card__burst" aria-hidden="true">
            <i>FAMILY</i>
            <strong>FEUD</strong>
          </span>
          <span className="feature-card__footer">
            <span>
              <b>2 teams</b>
              <small>Host-led · 20–40 min</small>
            </span>
            <span className="round-arrow">
              <Arrow />
            </span>
          </span>
        </button>
      </section>

      <section className="game-shelf" aria-label="More games">
        <div className="shelf-title">
          <span>Up next in the game cabinet</span>
          <span>More games coming soon</span>
        </div>
        <div className="coming-grid">
          <button
            className="coming-card coming-card--wheel coming-card--ready"
            onClick={onChooseSpinSolve}
          >
            <span className="coming-card__number">02</span>
            <div>
              <h2>Spin & Solve</h2>
              <p>Spin. Call a letter. Crack the board.</p>
            </div>
            <span className="coming-card__tag">Ready to play →</span>
          </button>
          <article className="coming-card coming-card--trivia">
            <span className="coming-card__number">03</span>
            <div>
              <h2>Jeopardy!</h2>
              <p>Pick a category. Phrase it as a question.</p>
            </div>
            <span className="coming-card__tag">In the works</span>
          </article>
        </div>
      </section>
    </main>
  );
}

function Setup({
  kind,
  feudPack,
  initialConfig,
  existingRoomCode,
  onBack,
  onBuildPack,
  onChooseKind,
  onSelectPack,
  onStart,
}: SetupProps) {
  const [teamOne, setTeamOne] = useState(initialConfig?.teamOne ?? "The Leftovers");
  const [teamTwo, setTeamTwo] = useState(initialConfig?.teamTwo ?? "The Plus Ones");
  const [winningScore, setWinningScore] = useState(initialConfig?.kind === "feud" ? initialConfig.winningScore : 300);
  const [rounds, setRounds] = useState(initialConfig?.kind === "spin-solve" ? initialConfig.rounds : 3);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [packError, setPackError] = useState("");

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError("");
    try {
      const teams = {
        teamOne: teamOne.trim() || "Team One",
        teamTwo: teamTwo.trim() || "Team Two",
      };
      await onStart(
        kind === "feud"
          ? { kind: "feud", ...teams, winningScore, pack: feudPack }
          : { kind: "spin-solve", ...teams, rounds },
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the room.",
      );
      setIsCreating(false);
    }
  };

  const importPack = async (file: File | undefined) => {
    if (!file) return;
    setPackError("");
    try {
      onSelectPack(parseFeudGamePack(await file.text()));
    } catch (cause) {
      setPackError(
        cause instanceof GamePackError
          ? cause.issues.join(" ")
          : "That game pack could not be opened.",
      );
    }
  };

  return (
    <main className="setup-shell">
      <header className="setup-nav">
        <button className="text-button" onClick={onBack}>
          {existingRoomCode ? "← Back to room" : "← All games"}
        </button>
        <Brand compact />
        <span className="step-label">{existingRoomCode ? "Next game setup" : "Game setup"}</span>
      </header>

      <section className="setup-stage">
        <div className="setup-intro">
          <span className="setup-number">{kind === "feud" ? "01" : "02"}</span>
          <p className="eyebrow">
            {kind === "feud" ? "Family Feud" : "Spin & Solve"}
          </p>
          <h1>
            {kind === "feud" ? (
              <>
                Name your
                <br />
                rivals.
              </>
            ) : (
              <>
                Choose your
                <br />
                word nerds.
              </>
            )}
          </h1>
          <p>
            {kind === "feud"
              ? "Two teams enter. One team gets bragging rights until the next game night."
              : "Build a round bank one letter at a time, dodge the bad wedges, and solve before the room does."}
          </p>
          <div className="host-note">
            <Bolt size={17} />
            <span>
              <strong>Host tip</strong>{" "}
              {kind === "feud"
                ? "Put this screen where everyone can see it. You’ll control reveals and scoring."
                : "Keep the host screen visible. Players can spin and submit letters from their phones."}
            </span>
          </div>
        </div>

        <form className="setup-form" onSubmit={submit}>
          {existingRoomCode && (
            <div className="next-game-room-banner" role="status">
              <span>Keeping everyone together</span>
              <strong>Room {existingRoomCode}</strong>
              <small>Players, teams, and chat stay in this room.</small>
            </div>
          )}
          {onChooseKind && (
            <fieldset className="next-game-picker">
              <legend>Choose the next game</legend>
              <div className="score-options">
                <button type="button" className={kind === "feud" ? "is-selected" : ""} onClick={() => onChooseKind("feud")}>Family Feud</button>
                <button type="button" className={kind === "spin-solve" ? "is-selected" : ""} onClick={() => onChooseKind("spin-solve")}>Spin &amp; Solve</button>
              </div>
            </fieldset>
          )}
          <label>
            <span>Team one</span>
            <input
              value={teamOne}
              onChange={(e) => setTeamOne(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </label>
          <div className="versus">
            <span>VS</span>
          </div>
          <label>
            <span>Team two</span>
            <input
              value={teamTwo}
              onChange={(e) => setTeamTwo(e.target.value)}
              maxLength={24}
            />
          </label>
          {kind === "feud" ? (
            <>
              <fieldset className="pack-picker">
                <legend>Question pack</legend>
                <div className="pack-picker__card">
                  <div>
                    <span>Loaded for tonight</span>
                    <strong>{feudPack.title}</strong>
                    <small>
                      {feudPack.questions.length} questions · JSON game pack
                    </small>
                  </div>
                  <b>{String(feudPack.questions.length).padStart(2, "0")}</b>
                </div>
                <div className="pack-picker__actions">
                  <button type="button" onClick={onBuildPack}>
                    Build or edit
                  </button>
                  <label>
                    <input
                      className="sr-only"
                      type="file"
                      accept="application/json,.json"
                      onChange={(event) =>
                        void importPack(event.target.files?.[0])
                      }
                    />
                    Upload JSON
                  </label>
                </div>
                {packError && (
                  <p className="form-error" role="alert">
                    {packError}
                  </p>
                )}
              </fieldset>
              <fieldset>
                <legend>Play to</legend>
                <div className="score-options">
                  {[200, 300, 400].map((score) => (
                    <label
                      key={score}
                      className={winningScore === score ? "is-selected" : ""}
                    >
                      <input
                        type="radio"
                        name="winningScore"
                        value={score}
                        checked={winningScore === score}
                        onChange={() => setWinningScore(score)}
                      />
                      <span>{score}</span> pts
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <fieldset>
              <legend>Regular rounds</legend>
              <div className="score-options">
                {[2, 3, 4].map((count) => (
                  <label
                    key={count}
                    className={rounds === count ? "is-selected" : ""}
                  >
                    <input
                      type="radio"
                      name="rounds"
                      value={count}
                      checked={rounds === count}
                      onChange={() => setRounds(count)}
                    />
                    <span>{count}</span> rounds
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={isCreating}
          >
            {isCreating
              ? existingRoomCode ? "Saving next game…" : "Opening room…"
              : existingRoomCode ? "Use this game in the room" : "Open the room"}{" "}
            {!isCreating && <Arrow />}
          </button>
        </form>
      </section>
    </main>
  );
}

function ExistingRoomSetup({ room, ...props }: SetupProps & { room: RoomSnapshot }) {
  const presentation = useMemo(() => createLobbyPresentation(room), [room]);
  usePresentationPublisher(presentation);
  return <Setup {...props} existingRoomCode={room.code} />;
}

interface JoinRoomProps {
  initialCode?: string;
  onBack: () => void;
  onJoin: (code: string, name: string, avatarId: AvatarId | null) => Promise<void>;
}

function JoinRoom({ initialCode = "", onBack, onJoin }: JoinRoomProps) {
  const [code, setCode] = useState(initialCode);
  const [rememberedIdentity, setRememberedIdentity] = useState(() => {
    const preference = readPlayerIdentityPreference();
    if (!preference) return null;
    return {
      ...preference,
      avatarId: preference.avatarId && avatarFor(preference.avatarId)
        ? preference.avatarId
        : null,
    };
  });
  const [name, setName] = useState(rememberedIdentity?.name ?? "");
  const [avatarId, setAvatarId] = useState<AvatarId | null>(
    rememberedIdentity?.avatarId ?? rememberedAvatarId(),
  );
  const [isEditingIdentity, setIsEditingIdentity] = useState(!rememberedIdentity);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  const editIdentity = () => {
    setIsEditingIdentity(true);
    window.requestAnimationFrame(() => nameInput.current?.focus());
  };

  const useRememberedIdentity = () => {
    if (!rememberedIdentity) return;
    setName(rememberedIdentity.name);
    setAvatarId(rememberedIdentity.avatarId);
    setIsEditingIdentity(false);
  };

  const forgetIdentity = () => {
    forgetPlayerIdentity();
    setRememberedIdentity(null);
    setName("");
    setAvatarId(null);
    setIsEditingIdentity(true);
    setError("");
    window.requestAnimationFrame(() => nameInput.current?.focus());
  };

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsJoining(true);
    try {
      const normalizedName = name.trim();
      await onJoin(code, normalizedName, avatarId);
      rememberPlayerIdentity(normalizedName, avatarId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not join that room.",
      );
      setIsJoining(false);
    }
  };

  return (
    <main className="join-shell">
      <header className="setup-nav">
        <button className="text-button" onClick={onBack}>
          ← Game cabinet
        </button>
        <Brand compact />
        <span className="step-label">Player entry</span>
      </header>
      <section className="join-stage">
        <div className="join-stage__intro">
          <p className="eyebrow">Grab your spot</p>
          <h1>
            Join the
            <br />
            <em>room.</em>
          </h1>
          <p>
            The host’s screen has the five-character code. Enter it here, then
            pick the team you’ll scheme with.
          </p>
        </div>
        <form className="join-form" onSubmit={submit}>
          <label>
            <span>Room code</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) =>
                setCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 5),
                )
              }
              placeholder="ABCDE"
              autoComplete="off"
              maxLength={5}
              required
              autoFocus={!initialCode}
            />
          </label>
          {rememberedIdentity && !isEditingIdentity ? (
            <section className="returning-player" aria-labelledby="returning-player-name">
              <div className="returning-player__identity">
                <IdentityPortrait name={name} avatarId={avatarId} />
                <span>
                  <small>Welcome back</small>
                  <strong id="returning-player-name">{name}</strong>
                  <em>Saved on this device</em>
                </span>
              </div>
              <p>
                On a shared device? Confirm this is you, change the player, or
                forget this saved identity before joining.
              </p>
              <div className="returning-player__actions">
                <button type="button" onClick={editIdentity}>
                  Change name or avatar
                </button>
                <button type="button" onClick={forgetIdentity}>
                  Forget me on this device
                </button>
              </div>
            </section>
          ) : (
            <section className="join-identity-editor" aria-label="Player identity">
              <label>
                <span>Your name</span>
                <input
                  ref={nameInput}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What should we call you?"
                  maxLength={24}
                  required
                  autoFocus={Boolean(initialCode)}
                />
              </label>
              <AvatarPicker selected={avatarId} name={name} onSelect={setAvatarId} />
              {rememberedIdentity && (
                <div className="join-identity-editor__actions">
                  <button type="button" onClick={useRememberedIdentity}>
                    Keep saved identity
                  </button>
                  <button type="button" onClick={forgetIdentity}>
                    Forget me on this device
                  </button>
                </div>
              )}
            </section>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={isJoining || code.length !== 5 || !name.trim()}
            autoFocus={Boolean(initialCode) && Boolean(rememberedIdentity) && !isEditingIdentity}
          >
            {isJoining
              ? "Joining…"
              : rememberedIdentity && !isEditingIdentity
                ? `Join as ${name}`
                : "Enter the room"}{" "}
            {!isJoining && <Arrow />}
          </button>
          <p className="privacy-note">
            <span aria-hidden="true">◈</span> This device remembers only your
            name and avatar—not room codes, chats, answers, or room history.
          </p>
        </form>
      </section>
    </main>
  );
}

function teamName(room: RoomSnapshot, team: TeamId): string {
  return team === "one" ? room.config.teamOne : room.config.teamTwo;
}

interface TeamRosterProps {
  room: RoomSnapshot;
  team: TeamId;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (team: TeamId) => void;
}

function TeamRoster({
  room,
  team,
  selectable = false,
  selected = false,
  onSelect,
}: TeamRosterProps) {
  const players = room.participants.filter(
    (participant) => participant.team === team,
  );
  const content = (
    <>
      <div className="team-roster__heading">
        <span>{team === "one" ? "Team one" : "Team two"}</span>
        <b>{players.length}</b>
      </div>
      <h2>{teamName(room, team)}</h2>
      <div className="player-chips">
        {players.length === 0 ? (
          <span className="empty-player">First seat is open</span>
        ) : (
          players.map((player) => <PlayerIdentity key={player.id} participant={player} compact />)
        )}
      </div>
      {selectable && (
        <strong className="team-roster__action">
          {selected ? "Your team ✓" : "Join this team →"}
        </strong>
      )}
    </>
  );

  if (selectable) {
    return (
      <button
        className={`team-roster team-roster--${team} ${selected ? "is-selected" : ""}`}
        onClick={() => onSelect?.(team)}
      >
        {content}
      </button>
    );
  }

  return (
    <section className={`team-roster team-roster--${team}`}>{content}</section>
  );
}

interface HostRosterPlayerProps {
  participant: Participant;
  room: RoomSnapshot;
  moving: boolean;
  onMove: (participantId: string, team: TeamId) => Promise<void>;
  onDragStart: (participantId: string) => void;
  onDragEnd: () => void;
}

function HostRosterPlayer({
  participant,
  room,
  moving,
  onMove,
  onDragStart,
  onDragEnd,
}: HostRosterPlayerProps) {
  const destinations: TeamId[] = participant.team
    ? [participant.team === "one" ? "two" : "one"]
    : ["one", "two"];

  const startDragging = (event: DragEvent<HTMLDivElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", participant.id);
    onDragStart(participant.id);
  };

  return (
    <div
      className={`host-roster-player ${moving ? "is-moving" : ""}`}
      draggable={!moving}
      onDragStart={startDragging}
      onDragEnd={onDragEnd}
    >
      <PlayerIdentity participant={participant} compact />
      <div className="host-roster-player__actions">
        {destinations.map((destination) => (
          <button
            key={destination}
            type="button"
            draggable={false}
            disabled={moving}
            aria-label={`Move ${participant.name} to ${teamName(room, destination)}`}
            onClick={() => void onMove(participant.id, destination)}
          >
            {moving ? "Moving…" : `Move to ${teamName(room, destination)} →`}
          </button>
        ))}
      </div>
    </div>
  );
}

interface HostTeamRosterProps {
  room: RoomSnapshot;
  team: TeamId;
  movingPlayerId: string | null;
  draggingPlayerId: string | null;
  onMove: (participantId: string, team: TeamId) => Promise<void>;
  onDragStart: (participantId: string) => void;
  onDragEnd: () => void;
}

function HostTeamRoster({
  room,
  team,
  movingPlayerId,
  draggingPlayerId,
  onMove,
  onDragStart,
  onDragEnd,
}: HostTeamRosterProps) {
  const players = room.participants.filter(
    (participant) => participant.team === team,
  );
  const draggingPlayer = room.participants.find(
    (participant) => participant.id === draggingPlayerId,
  );
  const isDropTarget = Boolean(
    draggingPlayer && draggingPlayer.team !== team && !movingPlayerId,
  );

  const allowDrop = (event: DragEvent<HTMLElement>) => {
    if (movingPlayerId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const dropPlayer = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const participantId =
      draggingPlayerId || event.dataTransfer.getData("text/plain");
    const participant = room.participants.find(
      (candidate) => candidate.id === participantId,
    );
    if (!participant || participant.team === team || movingPlayerId) return;
    void onMove(participantId, team);
  };

  return (
    <section
      className={`team-roster team-roster--${team} host-team-roster ${isDropTarget ? "is-drop-target" : ""}`}
      aria-label={`${teamName(room, team)} roster${isDropTarget ? ". Drop player here" : ""}`}
      onDragOver={allowDrop}
      onDrop={dropPlayer}
    >
      <div className="team-roster__heading">
        <span>{team === "one" ? "Team one" : "Team two"}</span>
        <b>{players.length}</b>
      </div>
      <h2>{teamName(room, team)}</h2>
      <div className="host-roster-players">
        {players.length === 0 ? (
          <span className="empty-player">Drop or move a player here</span>
        ) : (
          players.map((player) => (
            <HostRosterPlayer
              key={player.id}
              participant={player}
              room={room}
              moving={movingPlayerId === player.id}
              onMove={onMove}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          ))
        )}
      </div>
      {isDropTarget && <strong className="host-team-roster__drop-cue">Drop to move</strong>}
    </section>
  );
}

function HostUnassignedPlayers({
  room,
  movingPlayerId,
  onMove,
  onDragStart,
  onDragEnd,
}: Omit<HostTeamRosterProps, "team" | "draggingPlayerId">) {
  const players = room.participants.filter((participant) => !participant.team);
  if (players.length === 0) return null;

  return (
    <section className="host-unassigned" aria-label="Players waiting to choose a team">
      <div>
        <strong>Waiting to choose</strong>
        <span>{players.length} unassigned</span>
      </div>
      <p>Assign them now, or let them pick a side from their phone.</p>
      <div className="host-unassigned__players">
        {players.map((player) => (
          <HostRosterPlayer
            key={player.id}
            participant={player}
            room={room}
            moving={movingPlayerId === player.id}
            onMove={onMove}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </section>
  );
}

interface TeamChatProps {
  team: TeamId;
  teamLabel: string;
  messages: ChatMessage[];
  participantId: string;
  onSend: (text: string) => Promise<void>;
  locked?: boolean;
  lockReason?: string | null;
  moderator?: boolean;
}

function typingSummary(members: ChatTypingUpdate[]): string {
  if (members.length === 1) return `${members[0].senderName} is typing`;
  if (members.length === 2) {
    return `${members[0].senderName} and ${members[1].senderName} are typing`;
  }
  return `${members[0].senderName} and ${members.length - 1} others are typing`;
}

function TeamChat({
  team,
  teamLabel,
  messages,
  participantId,
  onSend,
  locked = false,
  lockReason,
  moderator = false,
}: TeamChatProps) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [typingMembers, setTypingMembers] = useState<ChatTypingUpdate[]>([]);
  const typingExpiryTimers = useRef(new Map<string, number>());
  const typingStopTimer = useRef<number | null>(null);
  const typingAnnounced = useRef(false);
  const lastTypingSignalAt = useRef(0);
  const inputId = `team-message-${team}-${participantId}`;

  const stopTyping = () => {
    if (typingStopTimer.current !== null) {
      window.clearTimeout(typingStopTimer.current);
      typingStopTimer.current = null;
    }
    if (typingAnnounced.current) {
      roomClient.setTyping(false, team);
      typingAnnounced.current = false;
    }
  };

  const updateMessage = (value: string) => {
    setMessage(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }

    const now = Date.now();
    if (!typingAnnounced.current || now - lastTypingSignalAt.current >= 900) {
      roomClient.setTyping(true, team);
      typingAnnounced.current = true;
      lastTypingSignalAt.current = now;
    }
    if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current);
    typingStopTimer.current = window.setTimeout(stopTyping, 1_400);
  };

  useEffect(() => roomClient.subscribeTyping((update) => {
    if (update.team !== team || update.senderId === participantId) return;

    const currentTimer = typingExpiryTimers.current.get(update.senderId);
    if (currentTimer !== undefined) window.clearTimeout(currentTimer);
    typingExpiryTimers.current.delete(update.senderId);

    if (!update.isTyping) {
      setTypingMembers((current) => current.filter((member) => member.senderId !== update.senderId));
      return;
    }

    setTypingMembers((current) => [
      ...current.filter((member) => member.senderId !== update.senderId),
      update,
    ]);
    const expiryTimer = window.setTimeout(() => {
      typingExpiryTimers.current.delete(update.senderId);
      setTypingMembers((current) => current.filter((member) => member.senderId !== update.senderId));
    }, 2_500);
    typingExpiryTimers.current.set(update.senderId, expiryTimer);
  }), [participantId, team]);

  useEffect(() => {
    setTypingMembers([]);
    return () => {
      if (typingStopTimer.current !== null) window.clearTimeout(typingStopTimer.current);
      if (typingAnnounced.current) roomClient.setTyping(false, team);
      for (const timer of typingExpiryTimers.current.values()) window.clearTimeout(timer);
      typingExpiryTimers.current.clear();
    };
  }, [participantId, team]);

  useEffect(() => {
    if (locked && !moderator) stopTyping();
  }, [locked, moderator]);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!message.trim()) return;
    stopTyping();
    setIsSending(true);
    setError("");
    try {
      await onSend(message);
      setMessage("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Message could not be sent.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section
      className={`team-chat team-chat--${team}`}
      aria-label={`${teamLabel} private chat`}
    >
      <header>
        <div>
          <span>
            {moderator ? "Host-moderated huddle" : "Private team huddle"}
          </span>
          <h2>{teamLabel}</h2>
        </div>
        <span className="lock-label">◆ Team + host</span>
      </header>
      <div className="chat-feed" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <strong>Huddle up.</strong>
            <span>Start the plan before the other team does.</span>
          </div>
        ) : (
          messages.map((item) => (
            <article
              key={item.id}
              className={item.senderId === participantId ? "is-mine" : ""}
            >
              <IdentityPortrait
                name={item.senderName}
                avatarId={item.senderAvatarId}
                compact
              />
              <div className="chat-message__body">
                <span>{item.senderName}</span>
                <p>{item.text}</p>
              </div>
            </article>
          ))
        )}
      </div>
      {typingMembers.length > 0 && (
        <div className="chat-typing" role="status" aria-live="polite">
          <span className="chat-typing__avatars" aria-hidden="true">
            {typingMembers.slice(0, 3).map((member) => (
              <IdentityPortrait
                key={member.senderId}
                name={member.senderName}
                avatarId={member.senderAvatarId}
                compact
              />
            ))}
          </span>
          <span className="chat-typing__copy">
            {typingSummary(typingMembers)}
            <span className="chat-typing__dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </span>
        </div>
      )}
      {locked && !moderator && (
        <p className="chat-lock-notice" role="status">
          <strong>Huddle paused.</strong> {lockReason}
        </p>
      )}
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor={inputId}>
          Message {teamLabel}
        </label>
        <input
          id={inputId}
          value={message}
          onChange={(event) => updateMessage(event.target.value)}
          onBlur={stopTyping}
          placeholder={
            locked && !moderator
              ? "Huddle reopens after this question"
              : `Message ${teamLabel}…`
          }
          maxLength={280}
          disabled={locked && !moderator}
        />
        <button
          type="submit"
          disabled={(locked && !moderator) || isSending || !message.trim()}
          aria-label="Send message"
        >
          ↑
        </button>
      </form>
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function HostHuddles({ room }: { room: RoomSnapshot }) {
  return (
    <section className="host-huddles" aria-label="Host team huddles">
      <header>
        <div>
          <span>Moderator desk</span>
          <h2>Both team huddles</h2>
        </div>
        <p>Players only see their own team. Your messages are labeled Host.</p>
      </header>
      <div>
        {(["one", "two"] as TeamId[]).map((team) => (
          <TeamChat
            key={team}
            team={team}
            teamLabel={teamName(room, team)}
            messages={room.teamChats[team] ?? []}
            participantId="host"
            moderator
            onSend={(text) =>
              roomClient.sendMessage(text, team).then(() => undefined)
            }
          />
        ))}
      </div>
    </section>
  );
}

function PlayPassPanel({ room }: { room: RoomSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (room.viewer.role !== "player" || room.playPass.status === "closed") {
    return null;
  }

  const activePlayer = room.participants.find(
    (participant) => participant.id === room.playPass.activePlayerId,
  );
  const isActivePlayer =
    room.viewer.participantId === room.playPass.activePlayerId;
  const run = async (kind: "vote" | "decide", choice: PlayPassChoice) => {
    setBusy(true);
    setError("");
    try {
      if (kind === "vote") {
        await roomClient.votePlayPass(choice);
      } else {
        await roomClient.decidePlayPass(choice);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That choice did not register.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`play-pass-slip play-pass-slip--${room.playPass.status}`}
      aria-label="Play or pass huddle"
    >
      <header>
        <span>Team decision slip</span>
        <b>
          {room.playPass.status === "open"
            ? "Play or pass?"
            : `${room.playPass.decision === "play" ? "Play" : "Pass"} is locked in`}
        </b>
      </header>
      {room.playPass.status === "open" ? (
        <>
          <p>
            Vote to advise {activePlayer?.name ?? "your active player"}. Tallies
            are anonymous; their final call decides.
          </p>
          <div className="play-pass-tally">
            {(["play", "pass"] as PlayPassChoice[]).map((choice) => (
              <button
                className={
                  room.playPass.viewerVote === choice ? "is-selected" : ""
                }
                disabled={busy}
                key={choice}
                onClick={() => run("vote", choice)}
              >
                <span>{choice}</span>
                <strong>{room.playPass.votes[choice]}</strong>
                <small>
                  {room.playPass.viewerVote === choice
                    ? "Your vote"
                    : "Team votes"}
                </small>
              </button>
            ))}
          </div>
          {isActivePlayer ? (
            <div className="play-pass-final">
              <span>Your call, {activePlayer?.name}</span>
              <div>
                <button disabled={busy} onClick={() => run("decide", "play")}>
                  Final: Play
                </button>
                <button disabled={busy} onClick={() => run("decide", "pass")}>
                  Final: Pass
                </button>
              </div>
            </div>
          ) : (
            <p className="play-pass-waiting">
              Waiting for {activePlayer?.name ?? "the active player"} to make
              the final call.
            </p>
          )}
        </>
      ) : (
        <p className="play-pass-result">
          {teamName(
            room,
            room.playPass.controllingTeam ?? room.viewer.team ?? "one",
          )}{" "}
          is answering. Their huddle is paused until the host ends the question.
        </p>
      )}
      {error && (
        <p className="chat-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function HostPlayPassPanel({ room }: { room: RoomSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const winner = room.buzzer.winner;
  const activePlayer = room.participants.find(
    (participant) => participant.id === room.playPass.activePlayerId,
  );
  const representatives = Object.fromEntries(
    (["one", "two"] as TeamId[]).map((team) => [
      team,
      room.participants.find(
        (participant) =>
          participant.id === room.buzzer.representatives[team] &&
          participant.team === team,
      ),
    ]),
  ) as Record<TeamId, Participant | undefined>;
  const run = async (action: "open" | "end", team?: TeamId) => {
    setBusy(true);
    setError("");
    try {
      if (action === "open" && team) {
        await roomClient.openPlayPass(team);
      } else {
        await roomClient.endFeudQuestion();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update the play/pass huddle.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`host-play-pass host-play-pass--${room.playPass.status}`}
    >
      <div>
        <span>After the face-off</span>
        <strong>
          {room.playPass.status === "closed"
            ? winner
              ? "Who won the face-off?"
              : "Play / Pass"
            : room.playPass.status === "open"
              ? `${teamName(room, room.playPass.team ?? "one")} poll · ${activePlayer?.name ?? "Active player"} decides`
              : `${room.playPass.decision === "play" ? "Play" : "Pass"} · ${teamName(room, room.playPass.controllingTeam ?? "one")} answers`}
        </strong>
        {room.playPass.status === "closed" && (
          <small>
            {winner
              ? "Choose the team that won the face-off. The first buzz stays recorded above."
              : "Finish the face-off, then choose which team gets the poll."}
          </small>
        )}
      </div>
      {room.playPass.status === "closed" ? (
        <div className="host-play-pass__open-actions">
          {(["one", "two"] as TeamId[]).map((team) => {
            const representative = representatives[team];
            return (
              <button
                type="button"
                className={`host-play-pass__open-button--${team}`}
                disabled={!winner || !representative || busy}
                key={team}
                onClick={() => run("open", team)}
              >
                <strong>Open {teamName(room, team)} poll</strong>
                <small>
                  {representative
                    ? `Final call: ${representative.name}`
                    : "Choose a face-off representative"}
                </small>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="host-play-pass__status">
          <span>
            Play <b>{room.playPass.votes.play}</b>
          </span>
          <span>
            Pass <b>{room.playPass.votes.pass}</b>
          </span>
          {room.playPass.status === "open" ? (
            <button disabled={busy} onClick={() => run("end")}>Cancel poll</button>
          ) : (
            <strong>Use the award review below to finish the question.</strong>
          )}
        </div>
      )}
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

function feudTurnParticipant(room: RoomSnapshot, participantId: string | null) {
  return participantId
    ? room.participants.find((participant) => participant.id === participantId)
    : undefined;
}

function HostFeudTurnPanel({ room }: { room: RoomSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeTeam = room.feudTurns.activeTeam;
  const feud = room.game?.kind === "feud" ? room.game : null;

  const choosePlayer = async (team: TeamId, participantId: string) => {
    setBusy(true);
    setError("");
    try {
      await roomClient.setFeudTurnPlayer(team, participantId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not change the answering order.",
      );
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setBusy(true);
    setError("");
    try {
      await roomClient.advanceFeudTurn();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not advance the answering order.",
      );
    } finally {
      setBusy(false);
    }
  };

  const setControl = async (team: TeamId) => {
    setBusy(true);
    setError("");
    try {
      await roomClient.feudRoundAction({ type: "set-control", team });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not change team control.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="host-turn-order" aria-label="Answering order">
      <header>
        <div>
          <span>Round rotation</span>
          <h2>
            {activeTeam
              ? `${teamName(room, activeTeam)} are answering`
              : "Play or Pass sets control"}
          </h2>
        </div>
        <p>
          Correct reveals and the first two strikes move to the next player.
          Override the order here for skips or AFK players.
        </p>
      </header>
      <div className="host-turn-order__teams">
        {(["one", "two"] as TeamId[]).map((team) => {
          const turn = room.feudTurns.teams[team];
          const current = feudTurnParticipant(room, turn.currentPlayerId);
          const next = feudTurnParticipant(room, turn.nextPlayerId);
          const roster = turn.order
            .map((participantId) => feudTurnParticipant(room, participantId))
            .filter((participant): participant is Participant => Boolean(participant));
          const isActive = team === activeTeam;
          return (
            <article
              className={`host-turn-team host-turn-team--${team} ${isActive ? "is-active" : ""}`}
              key={team}
            >
              <div className="host-turn-team__heading">
                <span>{isActive ? "Answering now" : activeTeam ? "Standby order" : "If selected"}</span>
                <h3>{teamName(room, team)}</h3>
              </div>
              <button
                className={`control-team-button ${feud?.controllingTeam === team ? "is-selected" : ""}`}
                disabled={busy || feud?.winnerTeam !== null}
                onClick={() => void setControl(team)}
              >
                {feud?.controllingTeam === team ? "Controls the board" : `Give control to ${teamName(room, team)}`}
              </button>
              <div className="host-turn-team__players">
                <div>
                  <small>{isActive ? "Now" : "First up"}</small>
                  {current ? (
                    <PlayerIdentity participant={current} compact />
                  ) : (
                    <strong>No connected player</strong>
                  )}
                </div>
                <div>
                  <small>Next</small>
                  {next ? (
                    <PlayerIdentity participant={next} compact />
                  ) : (
                    <strong>Waiting for teammate</strong>
                  )}
                </div>
              </div>
              <label>
                <span>Host override</span>
                <select
                  aria-label={`${teamName(room, team)} current player`}
                  value={turn.currentPlayerId ?? ""}
                  disabled={busy || !roster.length}
                  onChange={(event) => void choosePlayer(team, event.target.value)}
                >
                  {!roster.length && <option value="">No connected players</option>}
                  {roster.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </select>
              </label>
              {isActive && (
                <button disabled={busy || !current} onClick={() => void advance()}>
                  Next player →
                </button>
              )}
            </article>
          );
        })}
      </div>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

function PlayerFeudTurnCard({
  room,
  team,
  participantId,
}: {
  room: RoomSnapshot;
  team: TeamId;
  participantId: string;
}) {
  const turn = room.feudTurns.teams[team];
  const current = feudTurnParticipant(room, turn.currentPlayerId);
  const next = feudTurnParticipant(room, turn.nextPlayerId);
  const isActiveTeam = room.feudTurns.activeTeam === team;
  const feud = room.game?.kind === "feud" ? room.game : null;
  const isControllingTeam = feud?.controllingTeam === team;
  const isStealingTeam = Boolean(
    feud?.originalControllingTeam && feud.originalControllingTeam !== team,
  );
  const status = !room.feudTurns.activeTeam
    ? "Order ready after Play or Pass"
    : isActiveTeam
      ? current?.id === participantId
        ? "You’re up"
        : next?.id === participantId
          ? "You’re on deck"
          : `${current?.name ?? "A teammate"} is up`
      : `${teamName(room, room.feudTurns.activeTeam)} are answering`;

  return (
    <section
      className={`player-turn-card player-turn-card--${team} ${isActiveTeam ? "is-active" : ""}`}
      aria-label={`${teamName(room, team)} answering order`}
      aria-live="polite"
    >
      <header>
        <span>
          {isControllingTeam
            ? "Your team controls the board"
            : isActiveTeam
              ? "Your team is live"
              : "Answering order"}
        </span>
        <strong>{status}</strong>
      </header>
      {feud?.phase === "playing" && feud.strikes === 2 && isStealingTeam && (
        <p className="player-steal-cue" role="status">Get ready to steal.</p>
      )}
      {feud?.phase === "steal" && (
        <p className={`player-steal-cue ${isStealingTeam ? "is-live" : ""}`} role="status">
          {isStealingTeam ? "Steal opportunity — your team is up." : "Three strikes — defend the board."}
        </p>
      )}
      <div>
        <span>
          <small>{isActiveTeam ? "Now" : "First up"}</small>
          {current ? <PlayerIdentity participant={current} compact /> : <b>Waiting</b>}
        </span>
        <span>
          <small>Next</small>
          {next ? <PlayerIdentity participant={next} compact /> : <b>Waiting</b>}
        </span>
      </div>
    </section>
  );
}

interface HostLobbyProps {
  room: RoomSnapshot;
  onStart: () => Promise<void>;
  onChangeGame: () => void;
  onExit: () => void;
}

function HostLobby({ room, onStart, onChangeGame, onExit }: HostLobbyProps) {
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [teamUpdateMessage, setTeamUpdateMessage] = useState("");
  const [teamRevealRevision, setTeamRevealRevision] = useState(0);
  const [isClearingChats, setIsClearingChats] = useState(false);
  const teamOneReady = room.participants.some(
    (player) => player.team === "one",
  );
  const teamTwoReady = room.participants.some(
    (player) => player.team === "two",
  );
  const canStart = teamOneReady && teamTwoReady;
  const presentation = useMemo(
    () => createLobbyPresentation(room, teamRevealRevision),
    [room, teamRevealRevision],
  );
  usePresentationPublisher(presentation);

  const start = async () => {
    setError("");
    setIsStarting(true);
    void gameAudio.play("opening");
    try {
      await onStart();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not start the game.",
      );
      setIsStarting(false);
    }
  };

  const randomizeTeams = async () => {
    setError("");
    setTeamUpdateMessage("");
    setIsRandomizing(true);
    try {
      await roomClient.randomizeTeams();
      setTeamRevealRevision((revision) => revision + 1);
      setTeamUpdateMessage(
        "Teams randomized. The new lineup is visible on the presenter display.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not randomize the teams.",
      );
    } finally {
      setIsRandomizing(false);
    }
  };

  const movePlayer = async (participantId: string, team: TeamId) => {
    const participant = room.participants.find(
      (candidate) => candidate.id === participantId,
    );
    if (!participant || participant.team === team) {
      setDraggingPlayerId(null);
      return;
    }

    setError("");
    setTeamUpdateMessage("");
    setMovingPlayerId(participantId);
    setDraggingPlayerId(null);
    try {
      await roomClient.assignTeam(participantId, team);
      setTeamUpdateMessage(
        `${participant.name} moved to ${teamName(room, team)}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not move that player.",
      );
    } finally {
      setMovingPlayerId(null);
    }
  };

  const clearTeamChats = async () => {
    if (!window.confirm("Clear both team chat histories for this room? This cannot be undone.")) return;
    setError("");
    setTeamUpdateMessage("");
    setIsClearingChats(true);
    try {
      await roomClient.clearTeamChats();
      setTeamUpdateMessage("Both team chat histories were cleared.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not clear team chats.");
    } finally {
      setIsClearingChats(false);
    }
  };

  return (
    <main className="room-shell">
      <header className="room-nav">
        <Brand compact />
        <div className="host-view-actions">
          <span>Moderator tab</span>
          <PresenterTabButton roomCode={room.code} />
          <button className="text-button text-button--light" onClick={onExit}>
            Close room
          </button>
        </div>
      </header>
      <section className="room-code-hero">
        <div>
          <p className="eyebrow">Players join at this screen</p>
          <h1>
            Room <em>{room.code}</em>
          </h1>
          <p>
            Scan the QR code with a phone, or choose <strong>Join a room</strong>{" "}
            and enter the code.
          </p>
        </div>
        <RoomInviteCard roomCode={room.code} view="moderator" />
      </section>
      <section className="lobby-content">
        <div className="lobby-status">
          <span className="live-dot" />
          <strong>
            {room.participants.length} player
            {room.participants.length === 1 ? "" : "s"} connected
          </strong>
          <span>Host can moderate both private huddles</span>
        </div>
        <GameAudioControls />
        <SharedTimerHostPanel timer={room.timer} />
        <div className="lobby-team-tools">
          <span>
            Drag a player between rosters, use their move button, or deal
            everyone again.
          </span>
          <div>
            <button type="button" className="is-secondary" onClick={onChangeGame}>Change game or pack</button>
            <button
              type="button"
              className="is-secondary"
              onClick={() => void clearTeamChats()}
              disabled={isClearingChats || ((room.teamChats.one?.length ?? 0) + (room.teamChats.two?.length ?? 0) === 0)}
            >
              {isClearingChats ? "Clearing chats…" : "Clear team chats"}
            </button>
            <button
              onClick={randomizeTeams}
              disabled={
                room.participants.length < 2 ||
                isRandomizing ||
                movingPlayerId !== null
              }
            >
              {isRandomizing ? "Dealing teams…" : "Randomize teams"}
            </button>
          </div>
        </div>
        {teamUpdateMessage && (
          <p className="team-update-message" role="status" aria-live="polite">
            {teamUpdateMessage}
          </p>
        )}
        <HostUnassignedPlayers
          room={room}
          movingPlayerId={movingPlayerId}
          onMove={movePlayer}
          onDragStart={setDraggingPlayerId}
          onDragEnd={() => setDraggingPlayerId(null)}
        />
        <div className="roster-grid">
          <HostTeamRoster
            room={room}
            team="one"
            movingPlayerId={movingPlayerId}
            draggingPlayerId={draggingPlayerId}
            onMove={movePlayer}
            onDragStart={setDraggingPlayerId}
            onDragEnd={() => setDraggingPlayerId(null)}
          />
          <HostTeamRoster
            room={room}
            team="two"
            movingPlayerId={movingPlayerId}
            draggingPlayerId={draggingPlayerId}
            onMove={movePlayer}
            onDragStart={setDraggingPlayerId}
            onDragEnd={() => setDraggingPlayerId(null)}
          />
        </div>
        <HostHuddles room={room} />
        <div className="host-lobby-footer">
          <p>
            <span>◆</span>
            <strong>Huddles are team-private and host-moderated.</strong>{" "}
            Opposing teams never receive each other’s messages.
          </p>
          <div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary-button"
              onClick={start}
              disabled={!canStart || isStarting}
            >
              {isStarting
                ? "Starting…"
                : canStart
                  ? "Start the game"
                  : "Fill both teams"}{" "}
              {canStart && !isStarting && <Arrow />}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

interface PlayerRoomProps {
  room: RoomSnapshot;
  onChooseTeam: (team: TeamId) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
  onGameAction: (command: SpinSolveCommand) => Promise<void>;
  onBuzz: () => Promise<void>;
  onExit: () => void;
}

const buzzerVariantNames: Record<PrototypeVariant, string> = {
  A: "Stage + chat",
  B: "Full takeover",
  C: "Buzzer dock",
};

function getPrototypeVariant(): PrototypeVariant {
  const candidate = new URLSearchParams(window.location.search)
    .get("variant")
    ?.toUpperCase();
  return candidate === "B" || candidate === "C" ? candidate : "A";
}

function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: PrototypeVariant;
  onChange: (variant: PrototypeVariant) => void;
}) {
  const variants: PrototypeVariant[] = ["A", "B", "C"];
  const cycle = (direction: -1 | 1) => {
    const currentIndex = variants.indexOf(current);
    onChange(
      variants[(currentIndex + direction + variants.length) % variants.length],
    );
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!import.meta.env.DEV) return null;

  return (
    <nav className="prototype-switcher" aria-label="Buzzer prototype variants">
      <button onClick={() => cycle(-1)} aria-label="Previous prototype variant">
        ←
      </button>
      <span>
        <small>Prototype</small>
        <b>
          {current} — {buzzerVariantNames[current]}
        </b>
      </span>
      <button onClick={() => cycle(1)} aria-label="Next prototype variant">
        →
      </button>
    </nav>
  );
}

function buzzerRepresentative(room: RoomSnapshot, team: TeamId) {
  const participantId = room.buzzer.representatives[team];
  return room.participants.find(
    (participant) => participant.id === participantId,
  );
}

function playerBuzzerCopy(room: RoomSnapshot, participantId: string) {
  const winner = room.buzzer.winner;
  const viewer = room.participants.find(
    (participant) => participant.id === participantId,
  );
  const isRepresentative = viewer?.team
    ? room.buzzer.representatives[viewer.team] === participantId
    : false;
  const teamOneRepresentative =
    buzzerRepresentative(room, "one")?.name ?? room.config.teamOne;
  const teamTwoRepresentative =
    buzzerRepresentative(room, "two")?.name ?? room.config.teamTwo;
  if (winner?.participantId === participantId)
    return {
      kicker: "Locked in",
      headline: "You’re first!",
      detail: `${winner.playerName}, the answer is yours.`,
    };
  if (winner)
    return {
      kicker: "Buzzer locked",
      headline: `${winner.playerName} got it`,
      detail: `${teamName(room, winner.team)} buzzed first.`,
    };
  if (!isRepresentative) {
    const teammate = viewer?.team
      ? buzzerRepresentative(room, viewer.team)?.name
      : undefined;
    return {
      kicker: "Your teammate is up",
      headline: `${teammate ?? "Representative"} is at the buzzer`,
      detail: `${teamOneRepresentative} vs. ${teamTwoRepresentative}`,
    };
  }
  if (room.buzzer.status === "armed")
    return {
      kicker: "Buzzer is live",
      headline: "Buzz!",
      detail: "First tap wins the face-off.",
    };
  return {
    kicker: "Buzzer closed",
    headline: "Stand by",
    detail: "The host will open the buzzer after reading the question.",
  };
}

function LobbyAvatarEditor({ room, participantId }: { room: RoomSnapshot; participantId: string }) {
  const participant = room.participants.find((player) => player.id === participantId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draftName, setDraftName] = useState(participant?.name ?? "");
  useEffect(() => setDraftName(participant?.name ?? ""), [participant?.name]);
  if (!participant || room.phase !== "lobby") return null;

  const selectAvatar = async (avatarId: AvatarId | null) => {
    setBusy(true);
    setError("");
    try {
      await roomClient.updateIdentity(participant.name, avatarId);
      rememberAvatarId(avatarId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your avatar.");
    } finally {
      setBusy(false);
    }
  };

  const saveName = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await roomClient.updateIdentity(draftName, participant.avatarId);
      rememberPlayerIdentity(draftName, participant.avatarId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your name.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="lobby-avatar-editor">
      <summary>
        <PlayerIdentity participant={participant} compact />
        <span>{busy ? "Saving look…" : "Change game face"}</span>
      </summary>
      <AvatarPicker
        selected={participant.avatarId}
        name={participant.name}
        onSelect={selectAvatar}
        compact
      />
      <form onSubmit={saveName}>
        <label>
          <span>Player-card name</span>
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            maxLength={24}
            required
          />
        </label>
        <button disabled={busy || draftName.trim() === participant.name}>Save name</button>
      </form>
      {error && <small role="alert">{error}</small>}
    </details>
  );
}

function PlayerBuzzerVariantA({
  room,
  participantId,
  team,
  isBuzzing,
  error,
  onBuzz,
  chat,
}: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId);
  const isRepresentative = room.buzzer.representatives[team] === participantId;
  const canBuzz = room.buzzer.status === "armed" && isRepresentative;
  return (
    <div className="player-room-layout player-room-layout--buzzer-stage">
      <section
        className={`buzzer-stage buzzer-stage--${team} buzzer-state--${room.buzzer.status} ${isRepresentative ? "is-representative" : "is-spectator"}`}
      >
        <span>{copy.kicker}</span>
        <button
          onClick={onBuzz}
          disabled={!canBuzz || isBuzzing}
          aria-label={
            canBuzz ? `Buzz for ${teamName(room, team)}` : copy.headline
          }
        >
          <i aria-hidden="true">
            <Bolt size={34} />
          </i>
          <strong>{isBuzzing ? "Sending…" : copy.headline}</strong>
          <small>{copy.detail}</small>
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
      {chat}
    </div>
  );
}

function PlayerBuzzerVariantB({
  room,
  participantId,
  team,
  isBuzzing,
  error,
  onBuzz,
  chat,
}: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId);
  const isRepresentative = room.buzzer.representatives[team] === participantId;
  const canBuzz = room.buzzer.status === "armed" && isRepresentative;
  return (
    <div
      className={`buzzer-takeover buzzer-takeover--${team} buzzer-state--${room.buzzer.status} ${isRepresentative ? "is-representative" : "is-spectator"}`}
    >
      <section>
        <span>
          {teamName(room, team)} · {copy.kicker}
        </span>
        <button onClick={onBuzz} disabled={!canBuzz || isBuzzing}>
          <i aria-hidden="true">
            <Bolt size={46} />
          </i>
          <strong>{isBuzzing ? "Sending…" : copy.headline}</strong>
          <small>{copy.detail}</small>
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
      <details>
        <summary>
          Team chat <span>Open while you wait</span>
        </summary>
        {chat}
      </details>
    </div>
  );
}

function PlayerBuzzerVariantC({
  room,
  participantId,
  team,
  isBuzzing,
  error,
  onBuzz,
  chat,
}: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId);
  const isRepresentative = room.buzzer.representatives[team] === participantId;
  const canBuzz = room.buzzer.status === "armed" && isRepresentative;
  return (
    <div className="buzzer-dock-layout">
      <div className="player-room-layout">
        <aside className={`my-team-card my-team-card--${team}`}>
          <span>Your team · buzzer below</span>
          <h1>{teamName(room, team)}</h1>
          <div className="player-chips">
            {room.participants
              .filter((player) => player.team === team)
              .map((player) => (
                <PlayerIdentity key={player.id} participant={player} compact />
              ))}
          </div>
        </aside>
        {chat}
      </div>
      <section
        className={`player-buzzer-dock player-buzzer-dock--${team} buzzer-state--${room.buzzer.status} ${isRepresentative ? "is-representative" : "is-spectator"}`}
      >
        <span>
          <small>{copy.kicker}</small>
          <b>{copy.detail}</b>
        </span>
        <button onClick={onBuzz} disabled={!canBuzz || isBuzzing}>
          <Bolt size={22} /> {isBuzzing ? "Sending…" : copy.headline}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  );
}

// PROTOTYPE: Three realtime buzzer treatments on the existing player-room route, switchable via ?variant=.
function PlayerRoom({
  room,
  onChooseTeam,
  onSendMessage,
  onGameAction,
  onBuzz,
  onExit,
}: PlayerRoomProps) {
  const [error, setError] = useState("");
  const [buzzError, setBuzzError] = useState("");
  const [isBuzzing, setIsBuzzing] = useState(false);
  const [variant, setVariant] = useState<PrototypeVariant>(getPrototypeVariant);
  const viewer = room.viewer;
  if (viewer.role !== "player") return null;

  const chooseTeam = async (team: TeamId) => {
    setError("");
    try {
      await onChooseTeam(team);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not join that team.",
      );
    }
  };

  const changeVariant = (nextVariant: PrototypeVariant) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", nextVariant);
    window.history.replaceState({}, "", url);
    setVariant(nextVariant);
  };

  const buzz = async () => {
    setBuzzError("");
    setIsBuzzing(true);
    try {
      await onBuzz();
      navigator.vibrate?.(70);
    } catch (cause) {
      setBuzzError(
        cause instanceof Error ? cause.message : "That buzz did not register.",
      );
    } finally {
      setIsBuzzing(false);
    }
  };

  return (
    <main className="player-shell">
      <header className="player-nav">
        <Brand compact />
        <span>
          Room <b>{room.code}</b>
        </span>
        <button className="text-button text-button--light" onClick={onExit}>
          Leave
        </button>
      </header>
      <section className="player-room">
        {room.phase === "playing" && (
          <div className="game-live-banner">
            <span className="live-dot" />
            <strong>Game in progress</strong>
            <span>
              {room.config.kind === "spin-solve"
                ? "Eyes on the main screen—your controls are live below."
                : room.game?.kind === "fast-money"
                  ? room.game.isIsolated
                    ? "Your private holding screen is active below."
                    : room.game.viewerRole === "contestant-one" || room.game.viewerRole === "contestant-two"
                      ? "Fast Money is live—your role-specific controls are below."
                      : "Fast Money is live—follow the finale below."
                : viewer.team &&
                    room.buzzer.representatives[viewer.team] ===
                      viewer.participantId
                  ? "You’re at the podium—this phone is your buzzer."
                  : "Eyes on the main screen—your representative is at the podium."}
            </span>
          </div>
        )}
        <SharedTimerAudience timer={room.timer} className="player-shared-timer" />
        <LobbyAvatarEditor room={room} participantId={viewer.participantId} />
        {!viewer.team ? (
          <>
            <div className="player-room__intro">
              <p className="eyebrow">You’re in</p>
              <h1>
                Choose your
                <br />
                <em>side.</em>
              </h1>
              <p>
                Pick a side. The host can rebalance teams before the game; each
                huddle always follows the server’s current roster.
              </p>
            </div>
            <div className="roster-grid roster-grid--selectable">
              <TeamRoster
                room={room}
                team="one"
                selectable
                onSelect={chooseTeam}
              />
              <TeamRoster
                room={room}
                team="two"
                selectable
                onSelect={chooseTeam}
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : room.phase !== "playing" ? (
          <div className="player-room-layout">
            <aside className={`my-team-card my-team-card--${viewer.team}`}>
              <span>Your team · waiting for host</span>
              <h1>{teamName(room, viewer.team)}</h1>
              <div className="player-chips">
                {room.participants
                  .filter((player) => player.team === viewer.team)
                  .map((player) => (
                    <PlayerIdentity key={player.id} participant={player} compact />
                  ))}
              </div>
            </aside>
            <TeamChat
              team={viewer.team}
              teamLabel={teamName(room, viewer.team)}
              messages={room.messages}
              participantId={viewer.participantId}
              onSend={onSendMessage}
            />
          </div>
        ) : room.config.kind === "spin-solve" ? (
          <div className="player-room-layout player-room-layout--game">
            <PlayerSpinSolve room={room} onAction={onGameAction} />
            <TeamChat
              team={viewer.team}
              teamLabel={teamName(room, viewer.team)}
              messages={room.messages}
              participantId={viewer.participantId}
              onSend={onSendMessage}
            />
          </div>
        ) : room.game?.kind === "fast-money" ? (
          <FastMoneyPlayer room={room} />
        ) : (
          <>
            {(() => {
              const chat = (
                <div className="player-huddle-stack">
                  <PlayPassPanel room={room} />
                  <PlayerFeudTurnCard
                    room={room}
                    team={viewer.team!}
                    participantId={viewer.participantId}
                  />
                  <TeamChat
                    team={viewer.team}
                    teamLabel={teamName(room, viewer.team)}
                    messages={room.messages}
                    participantId={viewer.participantId}
                    onSend={onSendMessage}
                    locked={room.chat.lockedTeam === viewer.team}
                    lockReason={room.chat.reason}
                  />
                </div>
              );
              const props: PlayerBuzzerVariantProps = {
                room,
                participantId: viewer.participantId,
                team: viewer.team!,
                isBuzzing,
                error: buzzError,
                onBuzz: buzz,
                chat,
              };
              if (variant === "B") return <PlayerBuzzerVariantB {...props} />;
              if (variant === "C") return <PlayerBuzzerVariantC {...props} />;
              return <PlayerBuzzerVariantA {...props} />;
            })()}
            <PrototypeSwitcher current={variant} onChange={changeVariant} />
          </>
        )}
      </section>
    </main>
  );
}

function ScoreCard({ team, score, accent, onAdjust }: ScoreCardProps) {
  return (
    <section
      className={`score-card score-card--${accent}`}
      aria-label={`${team}: ${score} points`}
    >
      <div>
        <span className="score-card__label">
          {accent === "gold" ? "Team one" : "Team two"}
        </span>
        <h2>{team}</h2>
      </div>
      <div className="score-card__points">
        <strong>{score}</strong>
        {onAdjust && (
          <div className="score-adjust" aria-label={`Adjust ${team} score`}>
            <button
              onClick={() => onAdjust(-5)}
              aria-label={`Subtract 5 points from ${team}`}
            >
              −
            </button>
            <button
              onClick={() => onAdjust(5)}
              aria-label={`Add 5 points to ${team}`}
            >
              +
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function AnswerTile({
  answer,
  points,
  number,
  revealed,
  onReveal,
}: AnswerTileProps) {
  return (
    <button
      className={`answer-tile answer-tile--moderator ${revealed ? "is-revealed" : ""}`}
      onClick={onReveal}
      aria-label={
        revealed
          ? `${answer}, ${points} points`
          : `Reveal answer ${number}: ${answer}, ${points} points`
      }
    >
      <span
        className="answer-tile__face answer-tile__front"
        aria-hidden={revealed}
      >
        <b>{number}</b>
        <span className="answer-tile__moderator-copy">
          <small>Click to reveal</small>
          <strong>{answer}</strong>
        </span>
        <em>{points}</em>
      </span>
      <span
        className="answer-tile__face answer-tile__back"
        aria-hidden={!revealed}
      >
        <b>{answer}</b>
        <strong>{points}</strong>
      </span>
    </button>
  );
}

function answerGridStyle(answerCount: number): CSSProperties {
  return {
    "--answer-grid-rows": Math.max(1, Math.ceil(answerCount / 2)),
  } as CSSProperties;
}

const consonants = "BCDFGHJKLMNPQRSTVWXYZ".split("");
const vowels = "AEIOU".split("");

function wheelLabel(segment: WheelSegment): string {
  if (segment.kind === "bankrupt") return "BANKRUPT";
  if (segment.kind === "lose-turn") return "LOSE";
  return String(segment.value);
}

function teamLabel(config: GameConfig, team: TeamId): string {
  return team === "one" ? config.teamOne : config.teamTwo;
}

function SpinnerWheel({
  game,
  compact = false,
}: {
  game: SpinSolveView;
  compact?: boolean;
}) {
  const angle =
    game.wheelIndex === null ? 0 : 360 - (game.wheelIndex * 15 + 7.5);
  const rotation = game.spinId * 1440 + angle;
  const result = game.pendingWedge ? wheelLabel(game.pendingWedge) : "SPIN";

  return (
    <div
      className={`spinner-wrap ${compact ? "spinner-wrap--compact" : ""}`}
      aria-label={`Wheel result: ${result}`}
    >
      <span className="spinner-pointer" aria-hidden="true" />
      <div
        className="spinner-wheel"
        style={{ "--wheel-rotation": `${rotation}deg` } as CSSProperties}
      >
        {game.wheelSegments.map((segment, index) => (
          <span
            className={`spinner-wheel__label spinner-wheel__label--${segment.kind}`}
            style={{ "--segment-index": index } as CSSProperties}
            key={`${segment.kind}-${segment.kind === "points" ? segment.value : index}-${index}`}
          >
            {wheelLabel(segment)}
          </span>
        ))}
        <span className="spinner-wheel__hub">
          <b>{result}</b>
          <small>result</small>
        </span>
      </div>
    </div>
  );
}

function PuzzleTiles({
  maskedPuzzle,
  compact = false,
}: {
  maskedPuzzle: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`letter-board ${compact ? "letter-board--compact" : ""}`}
      aria-label={maskedPuzzle.replaceAll("_", "blank")}
    >
      {maskedPuzzle.split(" ").map((word, wordIndex) => (
        <span className="letter-word" key={`${word}-${wordIndex}`}>
          {[...word].map((character, index) => (
            <i
              className={
                character === "_"
                  ? "is-hidden"
                  : !/[A-Z0-9]/.test(character)
                    ? "is-punctuation"
                    : "is-revealed"
              }
              key={`${character}-${index}`}
            >
              {character === "_" ? (
                <span aria-hidden="true">·</span>
              ) : (
                character
              )}
            </i>
          ))}
        </span>
      ))}
    </div>
  );
}

function LetterKeyboard({
  letters,
  used,
  selected = [],
  onChoose,
}: {
  letters: string[];
  used: string[];
  selected?: string[];
  onChoose: (letter: string) => void;
}) {
  return (
    <div className="letter-keyboard">
      {letters.map((letter) => (
        <button
          type="button"
          key={letter}
          disabled={used.includes(letter)}
          className={selected.includes(letter) ? "is-selected" : ""}
          onClick={() => onChoose(letter)}
          aria-pressed={selected.includes(letter)}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function Countdown({ deadline }: { deadline: number }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Date.now()),
  );

  useEffect(() => {
    setRemaining(Math.max(0, deadline - Date.now()));
    const timer = window.setInterval(
      () => setRemaining(Math.max(0, deadline - Date.now())),
      100,
    );
    return () => window.clearInterval(timer);
  }, [deadline]);

  return (
    <strong className="bonus-clock" aria-live="polite">
      {Math.ceil(remaining / 1000)}
    </strong>
  );
}

interface SpinActionPanelProps {
  game: SpinSolveView;
  config: SpinSolveGameConfig;
  canAct: boolean;
  isHost: boolean;
  onAction: (command: SpinSolveCommand) => Promise<void>;
}

function SpinActionPanel({
  game,
  config,
  canAct,
  isHost,
  onAction,
}: SpinActionPanelProps) {
  const [solution, setSolution] = useState("");
  const [bonusConsonants, setBonusConsonants] = useState<string[]>([]);
  const [bonusVowel, setBonusVowel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeName = teamLabel(config, game.activeTeam);

  const run = async (command: SpinSolveCommand) => {
    setError("");
    setBusy(true);
    try {
      await onAction(command);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That move could not be played.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitSolve = async (
    event: React.SubmitEvent<HTMLFormElement>,
    bonus = false,
  ) => {
    event.preventDefault();
    if (!solution.trim()) return;
    await run({ type: bonus ? "bonus-solve" : "solve", solution });
    setSolution("");
  };

  if (game.phase === "complete") {
    return (
      <div className="spin-action-panel spin-action-panel--complete">
        <span>Final score</span>
        <strong>
          {game.winnerTeam ? teamLabel(config, game.winnerTeam) : activeName}
        </strong>
        <p>{game.message}</p>
      </div>
    );
  }

  if (!canAct && game.phase !== "round-complete") {
    return (
      <div className="spin-action-panel spin-action-panel--waiting">
        <span>Eyes on the board</span>
        <strong>{activeName} are up.</strong>
        <p>Your controls will unlock when your team has the wheel.</p>
      </div>
    );
  }

  return (
    <section className="spin-action-panel" aria-label="Game controls">
      {game.phase === "regular" && (
        <>
          <div className="action-heading">
            <span>{activeName} control the board</span>
            <b>Choose one</b>
          </div>
          <button
            className="spin-button"
            disabled={busy}
            onClick={() => run({ type: "spin" })}
          >
            <span>Spin</span>
            <small>Test your luck</small>
          </button>
          <div className="vowel-buy">
            <span>Buy a vowel · 250</span>
            <LetterKeyboard
              letters={vowels}
              used={game.usedLetters}
              onChoose={(letter) => run({ type: "buy-vowel", letter })}
            />
          </div>
          <form className="solve-form" onSubmit={(event) => submitSolve(event)}>
            <label htmlFor="regular-solve">Solve the puzzle</label>
            <div>
              <input
                id="regular-solve"
                value={solution}
                onChange={(event) => setSolution(event.target.value)}
                placeholder="Type the full phrase"
              />
              <button disabled={busy || !solution.trim()}>Solve</button>
            </div>
          </form>
          {isHost && (
            <button
              className="accept-solve-button"
              onClick={() => run({ type: "award-solve" })}
            >
              Accept the active team’s spoken solve
            </button>
          )}
        </>
      )}

      {game.phase === "choosing-letter" && (
        <>
          <div className="action-heading">
            <span>
              {activeName} spun{" "}
              {game.pendingWedge?.kind === "points"
                ? game.pendingWedge.value
                : ""}
            </span>
            <b>Call a consonant</b>
          </div>
          <LetterKeyboard
            letters={consonants}
            used={game.usedLetters}
            onChoose={(letter) => run({ type: "guess-letter", letter })}
          />
        </>
      )}

      {game.phase === "round-complete" && (
        <div className="round-complete-action">
          <span>Round {game.round} complete</span>
          <strong>{game.message}</strong>
          {isHost ? (
            <button
              className="spin-button"
              disabled={busy}
              onClick={() => run({ type: "next-round" })}
            >
              {game.round < game.totalRounds
                ? "Open next round"
                : "Start bonus finale"}
            </button>
          ) : (
            <p>The host is setting the next board.</p>
          )}
        </div>
      )}

      {game.phase === "bonus-letters" && (
        <div className="bonus-choices">
          <div className="action-heading">
            <span>R S T L N E are on us</span>
            <b>Pick 3 consonants + 1 vowel</b>
          </div>
          <LetterKeyboard
            letters={consonants.filter((letter) => !"RSTLN".includes(letter))}
            used={[]}
            selected={bonusConsonants}
            onChoose={(letter) =>
              setBonusConsonants((current) =>
                current.includes(letter)
                  ? current.filter((item) => item !== letter)
                  : current.length < 3
                    ? [...current, letter]
                    : current,
              )
            }
          />
          <LetterKeyboard
            letters={vowels.filter((letter) => letter !== "E")}
            used={[]}
            selected={bonusVowel ? [bonusVowel] : []}
            onChoose={setBonusVowel}
          />
          <button
            className="spin-button"
            disabled={busy || bonusConsonants.length !== 3 || !bonusVowel}
            onClick={() =>
              run({
                type: "choose-bonus-letters",
                consonants: bonusConsonants.join(""),
                vowel: bonusVowel,
              })
            }
          >
            Lock the letters
          </button>
        </div>
      )}

      {game.phase === "bonus-solving" && game.bonusDeadline && (
        <div className="bonus-solving">
          <div className="action-heading">
            <span>Bonus finale</span>
            <b>Say it before zero</b>
          </div>
          <Countdown deadline={game.bonusDeadline} />
          <form
            className="solve-form"
            onSubmit={(event) => submitSolve(event, true)}
          >
            <label htmlFor="bonus-solve">Solve the bonus puzzle</label>
            <div>
              <input
                id="bonus-solve"
                value={solution}
                onChange={(event) => setSolution(event.target.value)}
                placeholder="Type the full phrase"
                autoFocus
              />
              <button disabled={busy || !solution.trim()}>Try it</button>
            </div>
          </form>
          {isHost && (
            <button
              className="end-timer-button"
              onClick={() => run({ type: "finish-bonus" })}
            >
              End timer and reveal
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="spin-action-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SpinScoreboard({
  game,
  config,
}: {
  game: SpinSolveView;
  config: SpinSolveGameConfig;
}) {
  return (
    <div className="spin-scoreboard">
      {(["one", "two"] as const).map((team) => (
        <section
          className={`spin-team-score spin-team-score--${team} ${game.activeTeam === team ? "is-active" : ""}`}
          key={team}
        >
          <span>
            {game.activeTeam === team ? "On the wheel" : `Team ${team}`}
          </span>
          <h2>{teamLabel(config, team)}</h2>
          <div>
            <b>{game.totals[team]}</b>
            <small>banked</small>
            <strong>+{game.roundBanks[team]}</strong>
            <small>round</small>
          </div>
        </section>
      ))}
    </div>
  );
}

function SpinSolveHostGame({
  room,
  onAction,
  onExit,
  onReplay,
  onChangeGame,
}: {
  room: RoomSnapshot;
  onAction: (command: SpinSolveCommand) => Promise<void>;
  onExit: () => void;
  onReplay: () => Promise<void>;
  onChangeGame: () => Promise<void>;
}) {
  const presentation = useMemo(() => createSpinPresentation(room), [room]);
  usePresentationPublisher(presentation);
  if (room.config.kind !== "spin-solve" || room.game?.kind !== "spin-solve")
    return null;
  const game = room.game;
  const finale =
    game.phase === "bonus-letters" ||
    game.phase === "bonus-solving" ||
    game.phase === "complete";

  return (
    <main className="spin-game-shell">
      <header className="spin-topbar">
        <Brand compact />
        <div>
          <span>Room {room.code}</span>
          <b>
            {finale
              ? "Bonus finale"
              : `Round ${game.round} of ${game.totalRounds}`}
          </b>
        </div>
        <div className="host-view-actions">
          <span>Moderator tab</span>
          <PresenterTabButton roomCode={room.code} />
          <button className="text-button text-button--light" onClick={onExit}>
            Exit game
          </button>
        </div>
      </header>
      <div className="spin-audio-controls">
        <GameAudioControls />
        <SharedTimerHostPanel timer={room.timer} />
      </div>
      <div className="spin-game-stage">
        <SpinScoreboard game={game} config={room.config} />
        <section className="spin-puzzle-stage">
          <div className="spin-puzzle-heading">
            <span>{game.category}</span>
            <p aria-live="polite">{game.message}</p>
            {game.canUndo && (
              <button onClick={() => onAction({ type: "undo" })}>
                Undo last move
              </button>
            )}
          </div>
          <PuzzleTiles maskedPuzzle={game.maskedPuzzle} />
        </section>
        <div className="spin-lower-stage">
          <SpinnerWheel game={game} />
          <SpinActionPanel
            game={game}
            config={room.config}
            canAct
            isHost
            onAction={onAction}
          />
        </div>
      </div>
      {game.phase === "complete" && game.winnerTeam && (
        <WinnerModal
          winner={teamLabel(room.config, game.winnerTeam)}
          score={game.totals[game.winnerTeam]}
          onReplay={onReplay}
          onChangeGame={onChangeGame}
          onHome={onExit}
        />
      )}
    </main>
  );
}

function PlayerSpinSolve({
  room,
  onAction,
}: {
  room: RoomSnapshot;
  onAction: (command: SpinSolveCommand) => Promise<void>;
}) {
  if (
    room.config.kind !== "spin-solve" ||
    room.game?.kind !== "spin-solve" ||
    room.viewer.role !== "player"
  )
    return null;
  const team = room.viewer.team;
  const game = room.game;
  const canAct = Boolean(
    team &&
    (game.phase.startsWith("bonus")
      ? team === game.winnerTeam
      : team === game.activeTeam),
  );

  return (
    <section className="player-spin-console">
      <header>
        <span>{game.category}</span>
        <b>
          {game.phase.startsWith("bonus") || game.phase === "complete"
            ? "Bonus finale"
            : `Round ${game.round} / ${game.totalRounds}`}
        </b>
      </header>
      <PuzzleTiles maskedPuzzle={game.maskedPuzzle} compact />
      <div className="player-spin-status">
        <strong>{game.message}</strong>
        <span>
          {team
            ? `${teamLabel(room.config, team)} · ${game.totals[team]} banked · +${game.roundBanks[team]} this round`
            : "Choose a team to play"}
        </span>
      </div>
      <SpinActionPanel
        game={game}
        config={room.config}
        canAct={canAct}
        isHost={false}
        onAction={onAction}
      />
    </section>
  );
}

function WinnerModal({ winner, score, onReplay, onChangeGame, onHome, onFastMoney, fastMoneyError }: WinnerModalProps) {
  const [nextGameAction, setNextGameAction] = useState<"same" | "change" | null>(null);
  const [nextGameError, setNextGameError] = useState("");
  const prepare = async (action: "same" | "change") => {
    setNextGameAction(action);
    setNextGameError("");
    try {
      await (action === "same" ? onReplay() : onChangeGame());
    } catch (cause) {
      setNextGameError(cause instanceof Error ? cause.message : "Could not prepare the next game.");
      setNextGameAction(null);
    }
  };
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="winner-title"
    >
      <div className="winner-modal">
        <span className="winner-modal__rays" aria-hidden="true" />
        <p className="eyebrow">That’s the game</p>
        <h2 id="winner-title">
          {winner}
          <br />
          <em>take the night!</em>
        </h2>
        <div className="winner-score">
          <strong>{score}</strong>
          <span>points</span>
        </div>
        <div className="winner-actions">
          {onFastMoney && (
            <button className="primary-button" onClick={onFastMoney} disabled={nextGameAction !== null}>
              Play Fast Money
            </button>
          )}
          <button className="primary-button" disabled={nextGameAction !== null} onClick={() => void prepare("same")}>
            {nextGameAction === "same" ? "Preparing room…" : "Play again in this room"}
          </button>
          <button className="secondary-button" disabled={nextGameAction !== null} onClick={() => void prepare("change")}>
            {nextGameAction === "change" ? "Opening setup…" : "Change game or pack"}
          </button>
          <button className="secondary-button" onClick={onHome} disabled={nextGameAction !== null}>
            Game cabinet
          </button>
        </div>
        {(fastMoneyError || nextGameError) && <p className="form-error" role="alert">{fastMoneyError || nextGameError}</p>}
      </div>
    </div>
  );
}

function HostBuzzerPanel({ room }: { room: RoomSnapshot }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");
  const winner = room.buzzer.winner;
  const teamOneRepresentative = buzzerRepresentative(room, "one");
  const teamTwoRepresentative = buzzerRepresentative(room, "two");
  const matchup = `${teamOneRepresentative?.name ?? "Choose team one"} vs. ${teamTwoRepresentative?.name ?? "Choose team two"}`;
  const statusCopy = winner
    ? `${winner.playerName} · ${teamName(room, winner.team)}`
    : room.buzzer.status === "armed"
      ? `${matchup} · live`
      : `${matchup} · standing by`;

  const run = async (action: "arm" | "close" | "reset" | "next") => {
    setError("");
    setIsUpdating(true);
    try {
      if (action === "arm") await roomClient.armBuzzer();
      if (action === "close") await roomClient.closeBuzzer();
      if (action === "reset") await roomClient.resetBuzzer();
      if (action === "next") await roomClient.nextBuzzerPair();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update the buzzer.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const selectRepresentative = async (team: TeamId, participantId: string) => {
    setError("");
    setIsUpdating(true);
    try {
      await roomClient.selectBuzzerRepresentative(team, participantId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not choose that representative.",
      );
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <section
      className={`host-buzzer-panel host-buzzer-panel--${room.buzzer.status}`}
      aria-label="Buzzer controls"
    >
      <div className="host-buzzer-panel__signal" aria-hidden="true">
        <Bolt size={24} />
      </div>
      <div>
        <span>Buzzer</span>
        <strong>{statusCopy}</strong>
        {error && <small role="alert">{error}</small>}
      </div>
      <div className="host-buzzer-reps">
        {(["one", "two"] as TeamId[]).map((team) => (
          <label key={team}>
            <span>{teamName(room, team)}</span>
            <div className="host-buzzer-rep-identity">
              {buzzerRepresentative(room, team) ? (
                <PlayerIdentity participant={buzzerRepresentative(room, team)!} compact />
              ) : (
                <small>Choose a player</small>
              )}
            </div>
            <select
              value={room.buzzer.representatives[team] ?? ""}
              disabled={room.buzzer.status === "armed" || isUpdating}
              onChange={(event) =>
                selectRepresentative(team, event.target.value)
              }
              aria-label={`${teamName(room, team)} representative`}
            >
              {room.participants
                .filter((participant) => participant.team === team)
                .map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <b aria-hidden="true">VS</b>
      </div>
      <div className="host-buzzer-panel__actions">
        {room.buzzer.status === "armed" ? (
          <button onClick={() => run("close")} disabled={isUpdating}>
            Close buzzer
          </button>
        ) : (
          <button
            className="is-primary"
            onClick={() => run("arm")}
            disabled={isUpdating}
          >
            {winner ? "Arm again" : "Arm buzzer"} <kbd>Z</kbd>
          </button>
        )}
        <button
          onClick={() => run("next")}
          disabled={room.buzzer.status === "armed" || isUpdating}
        >
          Next pair
        </button>
        {winner && (
          <button onClick={() => run("reset")} disabled={isUpdating}>
            Clear result
          </button>
        )}
      </div>
    </section>
  );
}

function Game({ config, roomCode, room, onExit, onReplay, onChangeGame }: GameProps) {
  const [fastMoneyError, setFastMoneyError] = useState("");
  const [roundError, setRoundError] = useState("");
  const [strikeAnimating, setStrikeAnimating] = useState(false);
  const feud = room.game?.kind === "feud" ? room.game : null;

  useEffect(() => roomClient.subscribeFastMoneyRepeat(() => {
    void gameAudio.play("repeat-answer");
  }), []);

  const buzzerWinnerId = room.buzzer.winner?.participantId ?? null;
  const previousBuzzerWinner = useRef<string | null>(null);
  useEffect(() => {
    if (buzzerWinnerId && buzzerWinnerId !== previousBuzzerWinner.current) {
      void gameAudio.play("faceoff-buzz");
    }
    previousBuzzerWinner.current = buzzerWinnerId;
  }, [buzzerWinnerId]);

  const question = feud
    ? config.pack.questions[feud.questionIndex % config.pack.questions.length]
    : null;
  const presentation = useMemo(
    () => room.game?.kind === "fast-money"
      ? createFastMoneyPresentation(room)
      : feud && question
        ? createFeudPresentation({ room, config, question })
        : null,
    [room, config, feud, question],
  );
  usePresentationPublisher(presentation);

  const previousStrikeRevision = useRef(feud?.strikeRevision ?? 0);
  useEffect(() => {
    const revision = feud?.strikeRevision ?? 0;
    if (revision <= previousStrikeRevision.current) {
      previousStrikeRevision.current = revision;
      return;
    }
    previousStrikeRevision.current = revision;
    setStrikeAnimating(true);
    const timeout = window.setTimeout(() => setStrikeAnimating(false), 850);
    return () => window.clearTimeout(timeout);
  }, [feud?.strikeRevision]);

  const runRoundAction = async (command: FeudRoundCommand) => {
    setRoundError("");
    try {
      return await roomClient.feudRoundAction(command);
    } catch (cause) {
      setRoundError(cause instanceof Error ? cause.message : "Could not update the round.");
      return null;
    }
  };

  const revealAnswer = async (index: number) => {
    if (!feud) return;
    if (feud.revealed.includes(index)) {
      void gameAudio.play("repeat-answer");
      return;
    }
    const next = await runRoundAction({ type: "reveal-answer", index });
    if (next) void gameAudio.play("answer-reveal");
  };

  const addStrike = async () => {
    const next = await runRoundAction({ type: "add-strike" });
    if (next) void gameAudio.play("wrong-answer");
  };

  const confirmAward = async () => {
    const next = await runRoundAction({ type: "confirm-award" });
    if (!next || next.game?.kind !== "feud") return;
    void gameAudio.play(next.game.winnerTeam ? "game-win" : "round-win");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (room.game?.kind === "fast-money") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable]")) return;
      if (question && event.key >= "1" && event.key <= String(question.answers.length))
        void revealAnswer(Number(event.key) - 1);
      if (event.key.toLowerCase() === "x" && !event.repeat) void addStrike();
      if (event.key.toLowerCase() === "a") void runRoundAction({ type: "select-award-team", team: "one" });
      if (event.key.toLowerCase() === "b") void runRoundAction({ type: "select-award-team", team: "two" });
      if (event.key.toLowerCase() === "z" && !event.repeat) {
        if (room.buzzer.status === "armed") void roomClient.closeBuzzer();
        else void roomClient.armBuzzer();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (room.game?.kind === "fast-money") {
    return (
      <main className="fast-money-shell fast-money-shell--host">
        <header className="game-topbar fast-money-topbar">
          <Brand compact />
          <div><span>Room {roomCode}</span><b>Fast Money · moderator</b></div>
          <div className="host-view-actions">
            <span>Moderator tab</span>
            <PresenterTabButton roomCode={roomCode} />
            <button className="text-button text-button--light" onClick={onExit}>Exit game</button>
          </div>
        </header>
        <FastMoneyHost room={room} />
        {room.game.phase === "complete" && (
          <WinnerModal
            winner={teamName(room, room.game.eligibleTeam)}
            score={room.game.combinedScore}
            onReplay={onReplay}
            onChangeGame={onChangeGame}
            onHome={onExit}
          />
        )}
      </main>
    );
  }

  if (!feud || !question) return null;

  const winner: Winner | null = feud.winnerTeam
    ? {
        team: feud.winnerTeam,
        name: feud.winnerTeam === "one" ? config.teamOne : config.teamTwo,
        score: feud.scores[feud.winnerTeam],
      }
    : null;
  const selectedTeamName = feud.selectedAwardTeam
    ? feud.selectedAwardTeam === "one" ? config.teamOne : config.teamTwo
    : null;
  const controllingTeamName = feud.controllingTeam
    ? feud.controllingTeam === "one" ? config.teamOne : config.teamTwo
    : null;
  const stealingTeam = feud.originalControllingTeam
    ? feud.originalControllingTeam === "one" ? "two" : "one"
    : null;

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <Brand compact />
        <div className="round-indicator">
          <span>Room {roomCode}</span>
          <span>Round {feud.round}</span>
          <b>{feud.multiplier}× points</b>
        </div>
        <div className="host-view-actions">
          <span>Moderator tab</span>
          <PresenterTabButton roomCode={roomCode} />
          <button className="text-button text-button--light" onClick={onExit}>
            Exit game
          </button>
        </div>
      </header>

      <section className="score-row">
        <ScoreCard
          team={config.teamOne}
          score={feud.scores.one}
          accent="gold"
          onAdjust={(change) => void runRoundAction({ type: "adjust-score", team: "one", change })}
        />
        <div
          className="round-pot"
          aria-label={`${feud.roundPot} points in the round at ${feud.multiplier} times value`}
        >
          <span>Round pot · {feud.multiplier}×</span>
          <strong>{feud.roundPot}</strong>
        </div>
        <ScoreCard
          team={config.teamTwo}
          score={feud.scores.two}
          accent="coral"
          onAdjust={(change) => void runRoundAction({ type: "adjust-score", team: "two", change })}
        />
      </section>

      <section className="question-board">
        <header className="question-board__header">
          <span>{config.pack.title} · We asked 100 people…</span>
          <button onClick={() => void runRoundAction({ type: "skip-question" })}>Skip question ↗</button>
        </header>
        {room.buzzer.status === "armed" && (
          <div
            className="buzzer-board-banner buzzer-board-banner--armed"
            role="status"
          >
            <span className="live-dot" /> Buzzer is live
          </div>
        )}
        {room.buzzer.winner && (
          <div
            className={`buzzer-board-banner buzzer-board-banner--winner buzzer-board-banner--${room.buzzer.winner.team}`}
            role="status"
          >
            <Bolt size={20} />
            <PlayerIdentity
              participant={{
                name: room.buzzer.winner.playerName,
                avatarId: room.buzzer.winner.avatarId,
              }}
              compact
            />
            <span>{teamName(room, room.buzzer.winner.team)} buzzed first</span>
          </div>
        )}
        <h1>{question.prompt}</h1>
        <div
          className="answers-grid"
          style={answerGridStyle(question.answers.length)}
        >
          {question.answers.map((answer, index) => (
            <AnswerTile
              key={answer.id}
              answer={answer.label}
              points={answer.points}
              number={index + 1}
              revealed={feud.revealed.includes(index)}
              onReveal={() => void revealAnswer(index)}
            />
          ))}
        </div>
      </section>

      <section className="host-controls">
        <GameAudioControls />
        <SharedTimerHostPanel timer={room.timer} />
        <HostBuzzerPanel room={room} />
        <HostPlayPassPanel room={room} />
        <HostFeudTurnPanel room={room} />
        <div className={`strike-panel strike-panel--${feud.controllingTeam ?? "neutral"} ${strikeAnimating ? "is-animating" : ""} ${feud.strikes === 3 ? "is-final" : ""}`}>
          <span>Strikes</span>
          <div className="strike-marks" aria-label={`${feud.strikes} strikes`}>
            {[0, 1, 2].map((index) => (
              <i key={index} className={index < feud.strikes ? "is-active" : ""}>
                ×
              </i>
            ))}
          </div>
          <div className="strike-actions">
            <button
              onClick={() => void runRoundAction({ type: "remove-strike" })}
              disabled={feud.strikes === 0}
              aria-label="Remove a strike"
            >
              Undo
            </button>
            <button onClick={() => void addStrike()} disabled={!feud.controllingTeam || feud.strikes >= 3}>
              Add strike <kbd>X</kbd>
            </button>
          </div>
        </div>
        <div className="award-panel award-panel--review">
          <span>Review award · {feud.roundPot} points</span>
          {feud.phase === "steal" && (
            <div className="steal-outcome-controls">
              <button className={feud.stealOutcome === "success" ? "is-selected" : ""} onClick={() => void runRoundAction({ type: "set-steal-outcome", outcome: "success" })}>
                Steal succeeded
              </button>
              <button className={feud.stealOutcome === "failed" ? "is-selected" : ""} onClick={() => void runRoundAction({ type: "set-steal-outcome", outcome: "failed" })}>
                Steal failed
              </button>
            </div>
          )}
          <div className="award-team-options">
            <button className={feud.selectedAwardTeam === "one" ? "is-selected" : ""} disabled={feud.roundPot === 0} onClick={() => void runRoundAction({ type: "select-award-team", team: "one" })}>
              {config.teamOne} <kbd>A</kbd>
            </button>
            <button className={feud.selectedAwardTeam === "two" ? "is-selected" : ""} disabled={feud.roundPot === 0} onClick={() => void runRoundAction({ type: "select-award-team", team: "two" })}>
              {config.teamTwo} <kbd>B</kbd>
            </button>
          </div>
          <p>
            {feud.phase === "steal"
              ? `Steal opportunity: ${stealingTeam ? teamName(room, stealingTeam) : "opposing team"}`
              : controllingTeamName
                ? `${controllingTeamName} currently control the board.`
                : "Play or Pass will preselect the likely recipient."}
          </p>
          <button className="award-confirm" disabled={!selectedTeamName || feud.roundPot === 0} onClick={() => void confirmAward()}>
            {selectedTeamName
              ? `Confirm ${feud.roundPot} points to ${selectedTeamName}`
              : "Choose award recipient"}
          </button>
        </div>
      </section>

      {roundError && <p className="form-error game-round-error" role="alert">{roundError}</p>}

      <HostHuddles room={room} />

      <footer className="game-help">
        Host shortcuts: <kbd>Z</kbd> opens/closes buzzer · <kbd>1</kbd>–
        <kbd>8</kbd> reveal answers · <kbd>X</kbd> adds a strike · first team to{" "}
        {config.winningScore} wins · A/B select an award recipient; confirmation applies it
      </footer>

      {winner && (
        <WinnerModal
          winner={winner.name}
          score={winner.score}
          onReplay={onReplay}
          onChangeGame={onChangeGame}
          onHome={onExit}
          onFastMoney={config.pack.fastMoney ? () => {
            setFastMoneyError("");
            void roomClient.fastMoneyAction({ type: "start", team: winner.team })
              .catch((cause) => setFastMoneyError(cause instanceof Error ? cause.message : "Fast Money could not start."));
          } : undefined}
          fastMoneyError={fastMoneyError}
        />
      )}
    </main>
  );
}

function PresenterLobby({ state }: { state: LobbyPresentation }) {
  const [showTeamReveal, setShowTeamReveal] = useState(false);
  const teams: Record<TeamId, LobbyPresentation["participants"]> = { one: [], two: [] };
  for (const participant of state.participants) {
    if (participant.team) teams[participant.team].push(participant);
  }

  useEffect(() => {
    if (state.teamRevealRevision === 0) return;
    setShowTeamReveal(true);
    const timeout = window.setTimeout(() => setShowTeamReveal(false), 3600);
    return () => window.clearTimeout(timeout);
  }, [state.teamRevealRevision]);

  return (
    <main className="presenter-lobby">
      <header className="presenter-topbar">
        <Brand compact />
        <span className="presenter-live">
          <i /> Presenter display
        </span>
        <b>Room {state.code}</b>
      </header>
      {showTeamReveal && (
        <aside
          className="presenter-team-reveal"
          key={state.teamRevealRevision}
          role="status"
          aria-live="polite"
        >
          <span>Teams randomized</span>
          <strong>Here’s tonight’s lineup</strong>
        </aside>
      )}
      <section className="presenter-lobby__hero">
        <div className="presenter-lobby__copy">
          <p className="eyebrow">Players, grab a phone and join</p>
          <h1>
            Room <em>{state.code}</em>
          </h1>
          <p>{state.game} · Pick your team after joining.</p>
        </div>
        <RoomInviteCard roomCode={state.code} view="presenter" />
      </section>
      <section className="presenter-rosters">
        {(["one", "two"] as TeamId[]).map((team) => (
          <article
            className={`presenter-roster presenter-roster--${team}`}
            key={team}
          >
            <span>
              {team === "one" ? "Team one" : "Team two"} · {teams[team].length}{" "}
              ready
            </span>
            <h2>{team === "one" ? state.teamOne : state.teamTwo}</h2>
            <div>
              {teams[team].length ? (
                teams[team].map((participant) => (
                  <PlayerIdentity
                    key={participant.name}
                    participant={participant}
                    compact
                  />
                ))
              ) : (
                <i>Seats are open</i>
              )}
            </div>
          </article>
        ))}
      </section>
      <footer className="presenter-footer">
        The moderator is setting the table. This display will switch when the
        game begins.
      </footer>
    </main>
  );
}

function PresenterAnswerTile({
  answer,
  number,
  revealed,
}: {
  answer: FeudPresentation["question"]["answers"][number];
  number: number;
  revealed: boolean;
}) {
  return (
    <div
      className={`answer-tile presenter-answer-tile ${revealed ? "is-revealed" : ""}`}
      aria-label={
        revealed
          ? `${answer.label}, ${answer.points} points`
          : `Answer ${number} hidden`
      }
    >
      <div
        className="answer-tile__face answer-tile__front"
        aria-hidden={revealed}
      >
        <b>{number}</b>
        <small>Answer</small>
      </div>
      <div
        className="answer-tile__face answer-tile__back"
        aria-hidden={!revealed}
      >
        <b>{answer.label}</b>
        <strong>{answer.points}</strong>
      </div>
    </div>
  );
}

function PresenterFeud({ state }: { state: FeudPresentation }) {
  const controlTeam = state.controllingTeam
    ? state.controllingTeam === "one" ? state.teamOne : state.teamTwo
    : null;
  const stealingTeam = state.originalControllingTeam
    ? state.originalControllingTeam === "one" ? state.teamTwo : state.teamOne
    : null;
  const [showStrike, setShowStrike] = useState(false);
  const previousStrikeRevision = useRef(state.strikeRevision);
  useEffect(() => {
    if (state.strikeRevision <= previousStrikeRevision.current) {
      previousStrikeRevision.current = state.strikeRevision;
      return;
    }
    previousStrikeRevision.current = state.strikeRevision;
    setShowStrike(true);
    const timeout = window.setTimeout(() => setShowStrike(false), 850);
    return () => window.clearTimeout(timeout);
  }, [state.strikeRevision]);
  return (
    <main className="game-shell presenter-game-shell">
      <header className="presenter-topbar presenter-topbar--game">
        <Brand compact />
        <span className="presenter-live">
          <i /> Live board
        </span>
        <div>
          <b>Room {state.code}</b>
          <b>Round {state.round}</b>
          <strong>{state.multiplier}× points</strong>
        </div>
      </header>
      <section className="score-row">
        <ScoreCard team={state.teamOne} score={state.scores[0]} accent="gold" />
        <div
          className="round-pot"
          aria-label={`${state.roundPot} points in the round`}
        >
          <span>Round pot</span>
          <strong>{state.roundPot}</strong>
        </div>
        <ScoreCard
          team={state.teamTwo}
          score={state.scores[1]}
          accent="coral"
        />
      </section>
      <section className="question-board presenter-question-board">
        {showStrike && (
          <div
            className={`presenter-strike-overlay ${state.strikes === 3 ? "is-final" : ""}`}
            key={state.strikeRevision}
            aria-hidden="true"
          >
            ×
          </div>
        )}
        <header className="question-board__header">
          <span>{state.title} · We asked 100 people…</span>
          <b>First to {state.winningScore}</b>
        </header>
        {state.buzzer.status === "armed" && (
          <div
            className="buzzer-board-banner buzzer-board-banner--armed"
            role="status"
          >
            <span className="live-dot" /> Buzzer is live
          </div>
        )}
        {state.buzzer.winner && (
          <div
            className={`buzzer-board-banner buzzer-board-banner--winner buzzer-board-banner--${state.buzzer.winner.team}`}
            role="status"
          >
            <Bolt size={20} />
            <PlayerIdentity
              participant={{
                name: state.buzzer.winner.playerName,
                avatarId: state.buzzer.winner.avatarId,
              }}
              compact
            />
            <span>
              {state.buzzer.winner.team === "one"
                ? state.teamOne
                : state.teamTwo}{" "}
              buzzed first
            </span>
          </div>
        )}
        {state.decision.status === "open" && (
          <div className="presenter-decision">
            <span>
              {state.decision.team === "two" ? state.teamTwo : state.teamOne} huddle
            </span>
            {state.decision.activePlayer ? (
              <PlayerIdentity participant={state.decision.activePlayer} compact />
            ) : (
              <strong>{state.teamOne}</strong>
            )}
            <strong>is choosing Play or Pass</strong>
          </div>
        )}
        {controlTeam && (
          <div className="presenter-decision presenter-decision--locked">
            <span>{state.phase === "steal" ? "Steal" : state.decision.choice ?? "Control"}</span>
            <strong>
              {state.phase === "steal"
                ? `${stealingTeam} have a chance to steal`
                : `${controlTeam} control the board`}
            </strong>
          </div>
        )}
        {state.phase === "playing" && state.strikes === 2 && stealingTeam && (
          <div className="presenter-steal-warning" role="status">
            {stealingTeam}, get ready to steal
          </div>
        )}
        {state.phase === "steal" && stealingTeam && (
          <div className="presenter-steal-warning is-live" role="status">
            Steal opportunity · {stealingTeam}
          </div>
        )}
        {state.turn.activeTeam && state.turn.currentPlayer && (
          <section className={`presenter-turn presenter-turn--${state.turn.activeTeam}`}>
            <div>
              <span>Now answering</span>
              <PlayerIdentity participant={state.turn.currentPlayer} compact />
            </div>
            <div>
              <span>On deck</span>
              {state.turn.nextPlayer ? (
                <PlayerIdentity participant={state.turn.nextPlayer} compact />
              ) : (
                <strong>Waiting for teammate</strong>
              )}
            </div>
          </section>
        )}
        <div className="presenter-host-cue">
          <span>Question with the host</span>
          <h1>Listen to the host</h1>
          <p>Answers appear here as they’re revealed.</p>
        </div>
        <div
          className="answers-grid"
          style={answerGridStyle(state.question.answers.length)}
        >
          {state.question.answers.map((answer, index) => (
            <PresenterAnswerTile
              key={answer.id}
              answer={answer}
              number={index + 1}
              revealed={state.revealed.includes(index)}
            />
          ))}
        </div>
      </section>
      <section className={`presenter-round-status presenter-round-status--${state.controllingTeam ?? "neutral"}`}>
        <span>Strikes</span>
        <div className="strike-marks" aria-label={`${state.strikes} strikes`}>
          {[0, 1, 2].map((index) => (
            <i key={index} className={index < state.strikes ? "is-active" : ""}>
              ×
            </i>
          ))}
        </div>
        <p>Answers and scores update live from the moderator tab.</p>
      </section>
      {state.winner && (
        <div className="presenter-winner" role="status">
          <p className="eyebrow">That’s the game</p>
          <h2>
            {state.winner.name}
            <br />
            <em>take the night!</em>
          </h2>
          <div className="winner-score">
            <strong>{state.winner.score}</strong>
            <span>points</span>
          </div>
        </div>
      )}
    </main>
  );
}

function PresenterSpin({ state }: { state: SpinPresentation }) {
  const finale =
    state.game.phase === "bonus-letters" ||
    state.game.phase === "bonus-solving" ||
    state.game.phase === "complete";
  return (
    <main className="spin-game-shell presenter-spin-shell">
      <header className="presenter-topbar presenter-topbar--spin">
        <Brand compact />
        <span className="presenter-live">
          <i /> Live board
        </span>
        <div>
          <b>Room {state.code}</b>
          <strong>
            {finale
              ? "Bonus finale"
              : `Round ${state.game.round} of ${state.game.totalRounds}`}
          </strong>
        </div>
      </header>
      <div className="spin-game-stage">
        <SpinScoreboard game={state.game} config={state.config} />
        <section className="spin-puzzle-stage">
          <div className="spin-puzzle-heading">
            <span>{state.game.category}</span>
            <p aria-live="polite">{state.game.message}</p>
          </div>
          <PuzzleTiles maskedPuzzle={state.game.maskedPuzzle} />
        </section>
        <div className="presenter-spin-lower">
          <SpinnerWheel game={state.game} />
          <section className="presenter-spin-callout">
            <span>
              {state.game.phase === "complete"
                ? "Game complete"
                : "Now playing"}
            </span>
            <h2>{state.game.message}</h2>
            <p>
              {state.game.winnerTeam
                ? `${teamLabel(state.config, state.game.winnerTeam)} win the night.`
                : `${teamLabel(state.config, state.game.activeTeam)} control the wheel.`}
            </p>
            {state.game.bonusDeadline &&
              state.game.phase === "bonus-solving" && (
                <Countdown deadline={state.game.bonusDeadline} />
              )}
          </section>
        </div>
      </div>
    </main>
  );
}

function PresenterFastMoney({ state }: { state: FastMoneyPresentation }) {
  return (
    <main className="fast-money-shell fast-money-shell--presenter">
      <header className="presenter-topbar presenter-topbar--game fast-money-topbar">
        <Brand compact />
        <span className="presenter-live"><i /> Live finale</span>
        <div>
          <b>Room {state.code}</b>
          <strong>First to 200</strong>
        </div>
      </header>
      <div className="fast-money-presenter-stage">
        <div className="fast-money-lineup fast-money-lineup--presenter">
          <ContestantPresenterCard person={state.game.contestants[0]} order={1} durationSeconds={state.game.attemptDurations[0]} />
          <span>+</span>
          <ContestantPresenterCard person={state.game.contestants[1]} order={2} durationSeconds={state.game.attemptDurations[1]} />
        </div>
        {(state.game.phase === "active-one" || state.game.phase === "active-two") && (
          <div className="fast-money-presenter-clock">
            <span>{state.game.contestants[state.game.currentContestant ?? 0]?.name} is on the clock</span>
            <FastMoneyClock timer={state.game.timer} />
          </div>
        )}
        <FastMoneyBoard game={state.game} />
      </div>
    </main>
  );
}

function ContestantPresenterCard({
  person,
  order,
  durationSeconds,
}: {
  person: FastMoneyPresentation["game"]["contestants"][number];
  order: 1 | 2;
  durationSeconds: number;
}) {
  return (
    <article className={`fast-money-presenter-person fast-money-presenter-person--${order}`}>
      <span>{durationSeconds} sec</span>
      <strong>{person?.name ?? `Contestant ${order}`}</strong>
    </article>
  );
}

function PresenterScreen({ roomCode }: { roomCode: string }) {
  const state = usePresentation(roomCode);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `Presenter · Room ${roomCode}`;
    return () => {
      document.title = previousTitle;
    };
  }, [roomCode]);

  if (!state) {
    return (
      <main className="presenter-waiting">
        <Brand />
        <span className="presenter-live">
          <i /> Presenter display
        </span>
        <h1>
          Waiting for
          <br />
          <em>the moderator.</em>
        </h1>
        <p>
          Keep the moderator tab open on this device. Room {roomCode} will
          appear here automatically.
        </p>
      </main>
    );
  }
  const screen = state.mode === "lobby"
    ? <PresenterLobby state={state} />
    : state.mode === "feud"
      ? <PresenterFeud state={state} />
      : state.mode === "fast-money"
        ? <PresenterFastMoney state={state} />
      : <PresenterSpin state={state} />;

  return (
    <>
      <SharedTimerAudience timer={state.timer} className="presenter-shared-timer" />
      {screen}
    </>
  );
}

export default function App() {
  const presentationCode = useMemo(presenterRoomCode, []);
  const initialJoinCode = useMemo(
    () => joinRoomCodeFromSearch(window.location.search),
    [],
  );
  const [screen, setScreen] = useState<Screen>(() =>
    initialJoinCode ? "join" : "home",
  );
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameConfig["kind"]>("feud");
  const [feudPack, setFeudPack] = useState<FeudGamePack>(starterFeudPack);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomNotice, setRoomNotice] = useState("");
  const [preparingExistingRoom, setPreparingExistingRoom] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [screen]);

  useEffect(() => {
    if (presentationCode) return;
    return roomClient.subscribe(
      (snapshot) => setRoom(snapshot),
      (message) => {
        setRoom(null);
        setRoomNotice(message);
        setScreen("home");
      },
    );
  }, [presentationCode]);

  const createRoom = async (nextConfig: GameConfig) => {
    const snapshot = await roomClient.createRoom(nextConfig);
    setPreparingExistingRoom(false);
    setConfig(nextConfig);
    setRoom(snapshot);
    setScreen("host-lobby");
  };

  const joinRoom = async (code: string, name: string, avatarId: AvatarId | null) => {
    const snapshot = await roomClient.joinRoom(code, name, avatarId);
    setRoom(snapshot);
    setScreen("player-room");
  };

  const startGame = async () => {
    const snapshot = await roomClient.startGame();
    setRoom(snapshot);
    setScreen("game");
  };

  const leaveRoom = () => {
    roomClient.leaveRoom();
    setRoom(null);
    setConfig(null);
    setPreparingExistingRoom(false);
    setScreen("home");
  };

  const prepareNextGame = async (changeGame: boolean) => {
    if (!room) throw new Error("This room is no longer active.");
    const snapshot = await roomClient.prepareNextGame(room.gameRevision);
    setRoom(snapshot);
    if (changeGame) {
      setSelectedGame(config?.kind ?? snapshot.config.kind);
      setPreparingExistingRoom(true);
      setScreen("setup");
    } else {
      setPreparingExistingRoom(false);
      setScreen("host-lobby");
    }
  };

  const configureExistingRoom = async (nextConfig: GameConfig) => {
    if (!room) throw new Error("This room is no longer active.");
    const snapshot = await roomClient.prepareNextGame(room.gameRevision, nextConfig);
    setConfig(nextConfig);
    setSelectedGame(nextConfig.kind);
    if (nextConfig.kind === "feud") setFeudPack(nextConfig.pack);
    setRoom(snapshot);
    setPreparingExistingRoom(false);
    setScreen("host-lobby");
  };

  const openExistingRoomSetup = () => {
    if (!room || !config) return;
    setSelectedGame(config.kind);
    setPreparingExistingRoom(true);
    setScreen("setup");
  };

  const chooseGame = (kind: GameConfig["kind"]) => {
    setPreparingExistingRoom(false);
    setSelectedGame(kind);
    setScreen("setup");
  };

  const gameAction = (command: SpinSolveCommand) =>
    roomClient.gameAction(command).then((snapshot) => {
      setRoom(snapshot);
    });

  if (presentationCode) return <PresenterScreen roomCode={presentationCode} />;

  return (
    <>
      {screen === "home" && (
        <>
          {roomNotice && (
            <div className="room-notice" role="status">
              {roomNotice}
              <button onClick={() => setRoomNotice("")}>×</button>
            </div>
          )}
          <Home
            onChooseFeud={() => chooseGame("feud")}
            onChooseSpinSolve={() => chooseGame("spin-solve")}
            onJoin={() => setScreen("join")}
          />
        </>
      )}
      {screen === "setup" && preparingExistingRoom && room ? (
        <ExistingRoomSetup
          room={room}
          kind={selectedGame}
          feudPack={feudPack}
          initialConfig={config ?? undefined}
          onBack={() => {
            setPreparingExistingRoom(false);
            setScreen("host-lobby");
          }}
          onBuildPack={() => setScreen("builder")}
          onChooseKind={setSelectedGame}
          onSelectPack={(pack) => {
            setFeudPack(pack);
            saveFeudGamePackDraft(pack);
          }}
          onStart={configureExistingRoom}
        />
      ) : screen === "setup" ? (
        <Setup
          kind={selectedGame}
          feudPack={feudPack}
          onBack={() => setScreen("home")}
          onBuildPack={() => setScreen("builder")}
          onSelectPack={(pack) => {
            setFeudPack(pack);
            saveFeudGamePackDraft(pack);
          }}
          onStart={createRoom}
        />
      ) : null}
      {screen === "builder" && (
        <FeudGameBuilder
          initialPack={feudPack}
          onBack={() => setScreen("setup")}
          onUsePack={(pack) => {
            setFeudPack(pack);
            setScreen("setup");
          }}
        />
      )}
      {screen === "join" && (
        <JoinRoom
          initialCode={initialJoinCode ?? ""}
          onBack={() => setScreen("home")}
          onJoin={joinRoom}
        />
      )}
      {screen === "host-lobby" && room && (
        <HostLobby room={room} onStart={startGame} onChangeGame={openExistingRoomSetup} onExit={leaveRoom} />
      )}
      {screen === "player-room" && room && (
        <PlayerRoom
          room={room}
          onChooseTeam={(team) => roomClient.chooseTeam(team).then(setRoom)}
          onSendMessage={(text) =>
            roomClient.sendMessage(text).then(() => undefined)
          }
          onGameAction={gameAction}
          onBuzz={() => roomClient.pressBuzzer().then(() => undefined)}
          onExit={leaveRoom}
        />
      )}
      {screen === "game" && config?.kind === "feud" && room && (
        <Game
          key={`${room.gameRevision}-${config.teamOne}-${config.teamTwo}-${screen}`}
          config={config}
          roomCode={room.code}
          room={room}
          onExit={leaveRoom}
          onReplay={() => prepareNextGame(false)}
          onChangeGame={() => prepareNextGame(true)}
        />
      )}
      {screen === "game" && config?.kind === "spin-solve" && room && (
        <SpinSolveHostGame
          room={room}
          onAction={gameAction}
          onExit={leaveRoom}
          onReplay={() => prepareNextGame(false)}
          onChangeGame={() => prepareNextGame(true)}
        />
      )}
    </>
  );
}
