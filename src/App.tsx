import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, FormEvent } from "react";
import {
  avatarFor,
  avatarOptions,
  initials,
  rememberedAvatarId,
  rememberAvatarId,
} from "./avatarCatalog";
import { FeudGameBuilder, saveFeudGamePackDraft } from "./FeudGameBuilder";
import { GamePackError, parseFeudGamePack } from "./feudGamePack";
import { gameAudio, type GameAudioCue, type GameAudioState } from "./gameAudio";
import { multiplierForRound, starterFeudPack } from "./gameData";
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
  onBack: () => void;
  onBuildPack: () => void;
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
  onReplay: () => void;
  onHome: () => void;
  onFastMoney?: () => void;
  fastMoneyError?: string;
}

interface GameProps {
  config: FeudGameConfig;
  roomCode: string;
  room: RoomSnapshot;
  onExit: () => void;
  onReplay: () => void;
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

const audioCueLabels: Record<GameAudioCue, string> = {
  opening: "Opening theme",
  wrong: "Wrong answer",
  repeat: "Repeat answer",
};

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
      ? `Playing ${audioCueLabels[audio.playingCue].toLowerCase()}`
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
        {(Object.keys(audioCueLabels) as GameAudioCue[]).map((cue) => (
          <button
            type="button"
            key={cue}
            disabled={!audio.enabled}
            aria-pressed={audio.playingCue === cue}
            onClick={() => void gameAudio.play(cue)}
          >
            <span aria-hidden="true">▶</span> {audioCueLabels[cue]}
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
  onBack,
  onBuildPack,
  onSelectPack,
  onStart,
}: SetupProps) {
  const [teamOne, setTeamOne] = useState("The Leftovers");
  const [teamTwo, setTeamTwo] = useState("The Plus Ones");
  const [winningScore, setWinningScore] = useState(300);
  const [rounds, setRounds] = useState(3);
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
          ← All games
        </button>
        <Brand compact />
        <span className="step-label">Game setup</span>
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
            {isCreating ? "Opening room…" : "Open the room"}{" "}
            {!isCreating && <Arrow />}
          </button>
        </form>
      </section>
    </main>
  );
}

interface JoinRoomProps {
  onBack: () => void;
  onJoin: (code: string, name: string, avatarId: AvatarId | null) => Promise<void>;
}

function JoinRoom({ onBack, onJoin }: JoinRoomProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<AvatarId | null>(rememberedAvatarId);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const submit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsJoining(true);
    try {
      rememberAvatarId(avatarId);
      await onJoin(code, name, avatarId);
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
              autoFocus
            />
          </label>
          <label>
            <span>Your name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
              maxLength={24}
              required
            />
          </label>
          <AvatarPicker selected={avatarId} name={name} onSelect={setAvatarId} />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={isJoining || code.length !== 5 || !name.trim()}
          >
            {isJoining ? "Joining…" : "Enter the room"}{" "}
            {!isJoining && <Arrow />}
          </button>
          <p className="privacy-note">
            <span aria-hidden="true">◈</span> Your huddle is visible to
            teammates and the host—not the other team.
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
  const run = async (action: "open" | "end") => {
    setBusy(true);
    setError("");
    try {
      if (action === "open") {
        await roomClient.openPlayPass();
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
            ? "Play / Pass"
            : room.playPass.status === "open"
              ? `${activePlayer?.name ?? "Active player"} decides`
              : `${room.playPass.decision === "play" ? "Play" : "Pass"} · ${teamName(room, room.playPass.controllingTeam ?? "one")} answers`}
        </strong>
      </div>
      {room.playPass.status === "closed" ? (
        <button disabled={!winner || busy} onClick={() => run("open")}>
          {winner
            ? `Open ${teamName(room, winner.team)} poll`
            : "Waiting for face-off"}
        </button>
      ) : (
        <div className="host-play-pass__status">
          <span>
            Play <b>{room.playPass.votes.play}</b>
          </span>
          <span>
            Pass <b>{room.playPass.votes.pass}</b>
          </span>
          <button disabled={busy} onClick={() => run("end")}>
            {room.playPass.status === "open"
              ? "Cancel poll"
              : "End question & unlock"}
          </button>
        </div>
      )}
      {error && <small role="alert">{error}</small>}
    </section>
  );
}

interface HostLobbyProps {
  room: RoomSnapshot;
  onStart: () => Promise<void>;
  onExit: () => void;
}

function HostLobby({ room, onStart, onExit }: HostLobbyProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [movingPlayerId, setMovingPlayerId] = useState<string | null>(null);
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null);
  const [teamUpdateMessage, setTeamUpdateMessage] = useState("");
  const [teamRevealRevision, setTeamRevealRevision] = useState(0);
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

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

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
            Open this app on a phone, choose <strong>Join a room</strong>, and
            enter the code.
          </p>
        </div>
        <button className="copy-code" onClick={copyCode}>
          <span>{room.code}</span>
          <small>{copied ? "Copied!" : "Copy code"}</small>
        </button>
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
}: {
  room: RoomSnapshot;
  onAction: (command: SpinSolveCommand) => Promise<void>;
  onExit: () => void;
  onReplay: () => void;
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

function WinnerModal({ winner, score, onReplay, onHome, onFastMoney, fastMoneyError }: WinnerModalProps) {
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
            <button className="primary-button" onClick={onFastMoney}>
              Play Fast Money
            </button>
          )}
          <button className="primary-button" onClick={onReplay}>
            Run it back
          </button>
          <button className="secondary-button" onClick={onHome}>
            Game cabinet
          </button>
        </div>
        {fastMoneyError && <p className="form-error" role="alert">{fastMoneyError}</p>}
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

function Game({ config, roomCode, room, onExit, onReplay }: GameProps) {
  const [round, setRound] = useState(1);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [strikes, setStrikes] = useState(0);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [fastMoneyError, setFastMoneyError] = useState("");

  useEffect(() => roomClient.subscribeFastMoneyRepeat(() => {
    void gameAudio.play("repeat");
  }), []);

  const question =
    config.pack.questions[questionIndex % config.pack.questions.length];
  const multiplier = multiplierForRound(round);
  const roundPot = useMemo(
    () =>
      revealed.reduce(
        (sum, index) => sum + question.answers[index].points * multiplier,
        0,
      ),
    [revealed, question, multiplier],
  );
  const presentation = useMemo(
    () => room.game?.kind === "fast-money"
      ? createFastMoneyPresentation(room)
      : createFeudPresentation({
          room,
          config,
          round,
          multiplier,
          question,
          revealed,
          strikes,
          scores,
          roundPot,
          winner,
        }),
    [
      room,
      config,
      round,
      multiplier,
      question,
      revealed,
      strikes,
      scores,
      roundPot,
      winner,
    ],
  );
  usePresentationPublisher(presentation);

  const revealAnswer = (index: number) => {
    if (revealed.includes(index)) {
      void gameAudio.play("repeat");
      return;
    }
    setRevealed((current) =>
      current.includes(index) ? current : [...current, index],
    );
  };

  const addStrike = () => {
    void gameAudio.play("wrong");
    setStrikes((current) => Math.min(3, current + 1));
  };

  const awardRound = (teamIndex: TeamIndex) => {
    void roomClient.endFeudQuestion();
    void roomClient.nextBuzzerPair();
    const nextScores: [number, number] = [scores[0], scores[1]];
    nextScores[teamIndex] += roundPot;
    setScores(nextScores);
    if (nextScores[teamIndex] >= config.winningScore) {
      setWinner({
        name: teamIndex === 0 ? config.teamOne : config.teamTwo,
        score: nextScores[teamIndex],
        team: teamIndex === 0 ? "one" : "two",
      });
      return;
    }
    setRound((current) => current + 1);
    setQuestionIndex((current) => (current + 1) % config.pack.questions.length);
    setRevealed([]);
    setStrikes(0);
  };

  const adjustScore = (teamIndex: TeamIndex, change: number) => {
    setScores((current) => {
      const nextScores: [number, number] = [current[0], current[1]];
      nextScores[teamIndex] = Math.max(0, nextScores[teamIndex] + change);
      return nextScores;
    });
  };

  const newQuestion = () => {
    void roomClient.endFeudQuestion();
    void roomClient.resetBuzzer();
    setQuestionIndex((current) => (current + 1) % config.pack.questions.length);
    setRevealed([]);
    setStrikes(0);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (room.game?.kind === "fast-money") return;
      if (event.key >= "1" && event.key <= String(question.answers.length))
        revealAnswer(Number(event.key) - 1);
      if (event.key.toLowerCase() === "x") addStrike();
      if (event.key.toLowerCase() === "a") awardRound(0);
      if (event.key.toLowerCase() === "b") awardRound(1);
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
      </main>
    );
  }

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <Brand compact />
        <div className="round-indicator">
          <span>Room {roomCode}</span>
          <span>Round {round}</span>
          <b>{multiplier}× points</b>
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
          score={scores[0]}
          accent="gold"
          onAdjust={(change) => adjustScore(0, change)}
        />
        <div
          className="round-pot"
          aria-label={`${roundPot} points in the round`}
        >
          <span>Round pot</span>
          <strong>{roundPot}</strong>
        </div>
        <ScoreCard
          team={config.teamTwo}
          score={scores[1]}
          accent="coral"
          onAdjust={(change) => adjustScore(1, change)}
        />
      </section>

      <section className="question-board">
        <header className="question-board__header">
          <span>{config.pack.title} · We asked 100 people…</span>
          <button onClick={newQuestion}>Skip question ↗</button>
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
              revealed={revealed.includes(index)}
              onReveal={() => revealAnswer(index)}
            />
          ))}
        </div>
      </section>

      <section className="host-controls">
        <GameAudioControls />
        <SharedTimerHostPanel timer={room.timer} />
        <HostBuzzerPanel room={room} />
        <HostPlayPassPanel room={room} />
        <div className="strike-panel">
          <span>Strikes</span>
          <div className="strike-marks" aria-label={`${strikes} strikes`}>
            {[0, 1, 2].map((index) => (
              <i key={index} className={index < strikes ? "is-active" : ""}>
                ×
              </i>
            ))}
          </div>
          <div className="strike-actions">
            <button
              onClick={() => setStrikes((current) => Math.max(0, current - 1))}
              aria-label="Remove a strike"
            >
              Undo
            </button>
            <button onClick={addStrike}>
              Add strike <kbd>X</kbd>
            </button>
          </div>
        </div>
        <div className="award-panel">
          <span>Award {roundPot} points</span>
          <div>
            <button disabled={roundPot === 0} onClick={() => awardRound(0)}>
              {config.teamOne} <kbd>A</kbd>
            </button>
            <button disabled={roundPot === 0} onClick={() => awardRound(1)}>
              {config.teamTwo} <kbd>B</kbd>
            </button>
          </div>
        </div>
      </section>

      <HostHuddles room={room} />

      <footer className="game-help">
        Host shortcuts: <kbd>Z</kbd> opens/closes buzzer · <kbd>1</kbd>–
        <kbd>8</kbd> reveal answers · <kbd>X</kbd> adds a strike · first team to{" "}
        {config.winningScore} wins
      </footer>

      {winner && (
        <WinnerModal
          winner={winner.name}
          score={winner.score}
          onReplay={onReplay}
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
        <p className="eyebrow">Players, grab a phone and join</p>
        <h1>
          Room <em>{state.code}</em>
        </h1>
        <p>{state.game} · Pick your team after joining.</p>
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
  const controlTeam =
    state.decision.controllingTeam === "one" ? state.teamOne : state.teamTwo;
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
            <span>Team huddle</span>
            {state.decision.activePlayer ? (
              <PlayerIdentity participant={state.decision.activePlayer} compact />
            ) : (
              <strong>{state.teamOne}</strong>
            )}
            <strong>is choosing Play or Pass</strong>
          </div>
        )}
        {state.decision.status === "decided" && (
          <div className="presenter-decision presenter-decision--locked">
            <span>{state.decision.choice}</span>
            <strong>{controlTeam} answer the question</strong>
          </div>
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
      <section className="presenter-round-status">
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
          <ContestantPresenterCard person={state.game.contestants[0]} order={1} />
          <span>+</span>
          <ContestantPresenterCard person={state.game.contestants[1]} order={2} />
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
}: {
  person: FastMoneyPresentation["game"]["contestants"][number];
  order: 1 | 2;
}) {
  return (
    <article className={`fast-money-presenter-person fast-money-presenter-person--${order}`}>
      <span>{order === 1 ? "20 sec" : "25 sec"}</span>
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
  const [screen, setScreen] = useState<Screen>("home");
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [selectedGame, setSelectedGame] = useState<GameConfig["kind"]>("feud");
  const [feudPack, setFeudPack] = useState<FeudGamePack>(starterFeudPack);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [roomNotice, setRoomNotice] = useState("");

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
    setScreen("home");
  };

  const replay = () => {
    roomClient.leaveRoom();
    setRoom(null);
    setScreen("setup");
  };

  const chooseGame = (kind: GameConfig["kind"]) => {
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
      {screen === "setup" && (
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
      )}
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
        <JoinRoom onBack={() => setScreen("home")} onJoin={joinRoom} />
      )}
      {screen === "host-lobby" && room && (
        <HostLobby room={room} onStart={startGame} onExit={leaveRoom} />
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
          key={`${config.teamOne}-${config.teamTwo}-${screen}`}
          config={config}
          roomCode={room.code}
          room={room}
          onExit={leaveRoom}
          onReplay={replay}
        />
      )}
      {screen === "game" && config?.kind === "spin-solve" && room && (
        <SpinSolveHostGame
          room={room}
          onAction={gameAction}
          onExit={leaveRoom}
          onReplay={replay}
        />
      )}
    </>
  );
}
