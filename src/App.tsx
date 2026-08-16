import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { multiplierForRound, questions } from './gameData'
import { roomClient } from './roomClient'
import type { ChatMessage, GameConfig, RoomSnapshot, TeamId } from './roomTypes'

type Screen = 'home' | 'setup' | 'join' | 'host-lobby' | 'player-room' | 'game'
type TeamIndex = 0 | 1
type ScoreAccent = 'gold' | 'coral'

interface Winner {
  name: string
  score: number
}

interface BoltProps {
  size?: number
}

interface BrandProps {
  compact?: boolean
}

interface HomeProps {
  onChooseFeud: () => void
  onJoin: () => void
}

interface SetupProps {
  onBack: () => void
  onStart: (config: GameConfig) => Promise<void>
}

interface ScoreCardProps {
  team: string
  score: number
  accent: ScoreAccent
  onAdjust: (change: number) => void
}

interface AnswerTileProps {
  answer: string
  points: number
  number: number
  revealed: boolean
  onReveal: () => void
}

interface WinnerModalProps {
  winner: string
  score: number
  onReplay: () => void
  onHome: () => void
}

interface GameProps {
  config: GameConfig
  roomCode: string
  room: RoomSnapshot
  onExit: () => void
  onReplay: () => void
}

type PrototypeVariant = 'A' | 'B' | 'C'

interface PlayerBuzzerVariantProps {
  room: RoomSnapshot
  participantId: string
  team: TeamId
  isBuzzing: boolean
  error: string
  onBuzz: () => void
  chat: React.ReactNode
}

const Bolt = ({ size = 18 }: BoltProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M13.2 2 4.5 13h6.2l-.8 9L19.5 10h-6.2l-.1-8Z" fill="currentColor" />
  </svg>
)

const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="Wangz Game Night">
      <span className="brand__mark"><Bolt size={compact ? 16 : 20} /></span>
      <span className="brand__name">WANGZ</span>
      <span className="brand__sub">GAME NIGHT</span>
    </div>
  )
}

function Home({ onChooseFeud, onJoin }: HomeProps) {
  return (
    <main className="home-shell">
      <nav className="home-nav">
        <Brand />
        <div className="home-nav__actions">
          <span className="edition">Living room edition · 01</span>
          <button className="nav-join" onClick={onJoin}>Join a room</button>
        </div>
      </nav>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Tonight’s main event</p>
          <h1>The room is ready.<br /><em>Pick your game.</em></h1>
          <p className="hero__dek">Pass out the snacks, split into teams, and hand the controls to your most dramatic friend.</p>
        </div>

        <button className="feature-card" onClick={onChooseFeud} aria-label="Set up Family Feud">
          <span className="feature-card__flag">Ready to play</span>
          <span className="feature-card__burst" aria-hidden="true">
            <i>FAMILY</i><strong>FEUD</strong>
          </span>
          <span className="feature-card__footer">
            <span>
              <b>2 teams</b>
              <small>Host-led · 20–40 min</small>
            </span>
            <span className="round-arrow"><Arrow /></span>
          </span>
        </button>
      </section>

      <section className="game-shelf" aria-label="More games">
        <div className="shelf-title">
          <span>Up next in the game cabinet</span>
          <span>More games coming soon</span>
        </div>
        <div className="coming-grid">
          <article className="coming-card coming-card--charades">
            <span className="coming-card__number">02</span>
            <div><h2>Wheel of Fortune</h2><p>Spin the wheel. Solve the puzzle.</p></div>
            <span className="coming-card__tag">In the works</span>
          </article>
          <article className="coming-card coming-card--trivia">
            <span className="coming-card__number">03</span>
            <div><h2>Jeopardy!</h2><p>Pick a category. Phrase it as a question.</p></div>
            <span className="coming-card__tag">In the works</span>
          </article>
        </div>
      </section>
    </main>
  )
}

function Setup({ onBack, onStart }: SetupProps) {
  const [teamOne, setTeamOne] = useState('The Leftovers')
  const [teamTwo, setTeamTwo] = useState('The Plus Ones')
  const [winningScore, setWinningScore] = useState(300)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsCreating(true)
    setError('')
    try {
      await onStart({
        teamOne: teamOne.trim() || 'Team One',
        teamTwo: teamTwo.trim() || 'Team Two',
        winningScore,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the room.')
      setIsCreating(false)
    }
  }

  return (
    <main className="setup-shell">
      <header className="setup-nav">
        <button className="text-button" onClick={onBack}>← All games</button>
        <Brand compact />
        <span className="step-label">Game setup</span>
      </header>

      <section className="setup-stage">
        <div className="setup-intro">
          <span className="setup-number">01</span>
          <p className="eyebrow">Family Feud</p>
          <h1>Name your<br />rivals.</h1>
          <p>Two teams enter. One team gets bragging rights until the next game night.</p>
          <div className="host-note">
            <Bolt size={17} />
            <span><strong>Host tip</strong> Put this screen where everyone can see it. You’ll control reveals and scoring.</span>
          </div>
        </div>

        <form className="setup-form" onSubmit={submit}>
          <label>
            <span>Team one</span>
            <input value={teamOne} onChange={(e) => setTeamOne(e.target.value)} maxLength={24} autoFocus />
          </label>
          <div className="versus"><span>VS</span></div>
          <label>
            <span>Team two</span>
            <input value={teamTwo} onChange={(e) => setTeamTwo(e.target.value)} maxLength={24} />
          </label>
          <fieldset>
            <legend>Play to</legend>
            <div className="score-options">
              {[200, 300, 400].map((score) => (
                <label key={score} className={winningScore === score ? 'is-selected' : ''}>
                  <input type="radio" name="winningScore" value={score} checked={winningScore === score} onChange={() => setWinningScore(score)} />
                  <span>{score}</span> pts
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isCreating}>
            {isCreating ? 'Opening room…' : 'Open the room'} {!isCreating && <Arrow />}
          </button>
        </form>
      </section>
    </main>
  )
}

interface JoinRoomProps {
  onBack: () => void
  onJoin: (code: string, name: string) => Promise<void>
}

function JoinRoom({ onBack, onJoin }: JoinRoomProps) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsJoining(true)
    try {
      await onJoin(code, name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join that room.')
      setIsJoining(false)
    }
  }

  return (
    <main className="join-shell">
      <header className="setup-nav">
        <button className="text-button" onClick={onBack}>← Game cabinet</button>
        <Brand compact />
        <span className="step-label">Player entry</span>
      </header>
      <section className="join-stage">
        <div className="join-stage__intro">
          <p className="eyebrow">Grab your spot</p>
          <h1>Join the<br /><em>room.</em></h1>
          <p>The host’s screen has the five-character code. Enter it here, then pick the team you’ll scheme with.</p>
        </div>
        <form className="join-form" onSubmit={submit}>
          <label>
            <span>Room code</span>
            <input
              className="code-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="ABCDE"
              autoComplete="off"
              maxLength={5}
              required
              autoFocus
            />
          </label>
          <label>
            <span>Your name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="What should we call you?" maxLength={24} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={isJoining || code.length !== 5 || !name.trim()}>
            {isJoining ? 'Joining…' : 'Enter the room'} {!isJoining && <Arrow />}
          </button>
          <p className="privacy-note"><span aria-hidden="true">◈</span> Your team chat is visible only to teammates.</p>
        </form>
      </section>
    </main>
  )
}

function teamName(room: RoomSnapshot, team: TeamId): string {
  return team === 'one' ? room.config.teamOne : room.config.teamTwo
}

interface TeamRosterProps {
  room: RoomSnapshot
  team: TeamId
  selectable?: boolean
  selected?: boolean
  onSelect?: (team: TeamId) => void
}

function TeamRoster({ room, team, selectable = false, selected = false, onSelect }: TeamRosterProps) {
  const players = room.participants.filter((participant) => participant.team === team)
  const content = (
    <>
      <div className="team-roster__heading">
        <span>{team === 'one' ? 'Team one' : 'Team two'}</span>
        <b>{players.length}</b>
      </div>
      <h2>{teamName(room, team)}</h2>
      <div className="player-chips">
        {players.length === 0
          ? <span className="empty-player">First seat is open</span>
          : players.map((player) => <span key={player.id}>{player.name}</span>)}
      </div>
      {selectable && <strong className="team-roster__action">{selected ? 'Your team ✓' : 'Join this team →'}</strong>}
    </>
  )

  if (selectable) {
    return (
      <button className={`team-roster team-roster--${team} ${selected ? 'is-selected' : ''}`} onClick={() => onSelect?.(team)}>
        {content}
      </button>
    )
  }

  return <section className={`team-roster team-roster--${team}`}>{content}</section>
}

interface TeamChatProps {
  team: TeamId
  teamLabel: string
  messages: ChatMessage[]
  participantId: string
  onSend: (text: string) => Promise<void>
}

function TeamChat({ team, teamLabel, messages, participantId, onSend }: TeamChatProps) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!message.trim()) return
    setIsSending(true)
    setError('')
    try {
      await onSend(message)
      setMessage('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <section className={`team-chat team-chat--${team}`} aria-label={`${teamLabel} private chat`}>
      <header>
        <div>
          <span>Private team channel</span>
          <h2>{teamLabel}</h2>
        </div>
        <span className="lock-label">◆ Team only</span>
      </header>
      <div className="chat-feed" aria-live="polite">
        {messages.length === 0 ? (
          <div className="chat-empty"><strong>Huddle up.</strong><span>Start the plan before the other team does.</span></div>
        ) : messages.map((item) => (
          <article key={item.id} className={item.senderId === participantId ? 'is-mine' : ''}>
            <span>{item.senderName}</span>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="team-message">Message your team</label>
        <input id="team-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Message your team…" maxLength={280} />
        <button type="submit" disabled={isSending || !message.trim()} aria-label="Send message">↑</button>
      </form>
      {error && <p className="chat-error" role="alert">{error}</p>}
    </section>
  )
}

interface HostLobbyProps {
  room: RoomSnapshot
  onStart: () => Promise<void>
  onExit: () => void
}

function HostLobby({ room, onStart, onExit }: HostLobbyProps) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [isStarting, setIsStarting] = useState(false)
  const teamOneReady = room.participants.some((player) => player.team === 'one')
  const teamTwoReady = room.participants.some((player) => player.team === 'two')
  const canStart = teamOneReady && teamTwoReady

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const start = async () => {
    setError('')
    setIsStarting(true)
    try {
      await onStart()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the game.')
      setIsStarting(false)
    }
  }

  return (
    <main className="room-shell">
      <header className="room-nav">
        <Brand compact />
        <button className="text-button text-button--light" onClick={onExit}>Close room</button>
      </header>
      <section className="room-code-hero">
        <div>
          <p className="eyebrow">Players join at this screen</p>
          <h1>Room <em>{room.code}</em></h1>
          <p>Open this app on a phone, choose <strong>Join a room</strong>, and enter the code.</p>
        </div>
        <button className="copy-code" onClick={copyCode}><span>{room.code}</span><small>{copied ? 'Copied!' : 'Copy code'}</small></button>
      </section>
      <section className="lobby-content">
        <div className="lobby-status">
          <span className="live-dot" />
          <strong>{room.participants.length} player{room.participants.length === 1 ? '' : 's'} connected</strong>
          <span>Waiting for one player on each team</span>
        </div>
        <div className="roster-grid">
          <TeamRoster room={room} team="one" />
          <TeamRoster room={room} team="two" />
        </div>
        <div className="host-lobby-footer">
          <p><span>◆</span><strong>Team chats are private.</strong> The host and opposing team cannot read them.</p>
          <div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button" onClick={start} disabled={!canStart || isStarting}>
              {isStarting ? 'Starting…' : canStart ? 'Start the game' : 'Fill both teams'} {canStart && !isStarting && <Arrow />}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

interface PlayerRoomProps {
  room: RoomSnapshot
  onChooseTeam: (team: TeamId) => Promise<void>
  onSendMessage: (text: string) => Promise<void>
  onBuzz: () => Promise<void>
  onExit: () => void
}

const buzzerVariantNames: Record<PrototypeVariant, string> = {
  A: 'Stage + chat',
  B: 'Full takeover',
  C: 'Buzzer dock',
}

function getPrototypeVariant(): PrototypeVariant {
  const candidate = new URLSearchParams(window.location.search).get('variant')?.toUpperCase()
  return candidate === 'B' || candidate === 'C' ? candidate : 'A'
}

function PrototypeSwitcher({ current, onChange }: { current: PrototypeVariant; onChange: (variant: PrototypeVariant) => void }) {
  const variants: PrototypeVariant[] = ['A', 'B', 'C']
  const cycle = (direction: -1 | 1) => {
    const currentIndex = variants.indexOf(current)
    onChange(variants[(currentIndex + direction + variants.length) % variants.length])
  }

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable]')) return
      if (event.key === 'ArrowLeft') cycle(-1)
      if (event.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!import.meta.env.DEV) return null

  return (
    <nav className="prototype-switcher" aria-label="Buzzer prototype variants">
      <button onClick={() => cycle(-1)} aria-label="Previous prototype variant">←</button>
      <span><small>Prototype</small><b>{current} — {buzzerVariantNames[current]}</b></span>
      <button onClick={() => cycle(1)} aria-label="Next prototype variant">→</button>
    </nav>
  )
}

function playerBuzzerCopy(room: RoomSnapshot, participantId: string) {
  const winner = room.buzzer.winner
  if (room.buzzer.status === 'armed') return { kicker: 'Buzzer is live', headline: 'Buzz!', detail: 'First tap wins the face-off.' }
  if (winner?.participantId === participantId) return { kicker: 'Locked in', headline: 'You’re first!', detail: `${winner.playerName}, the answer is yours.` }
  if (winner) return { kicker: 'Buzzer locked', headline: `${winner.playerName} got it`, detail: `${teamName(room, winner.team)} buzzed first.` }
  return { kicker: 'Buzzer closed', headline: 'Stand by', detail: 'The host will open the buzzer after reading the question.' }
}

function PlayerBuzzerVariantA({ room, participantId, team, isBuzzing, error, onBuzz, chat }: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId)
  const isArmed = room.buzzer.status === 'armed'
  return (
    <div className="player-room-layout player-room-layout--buzzer-stage">
      <section className={`buzzer-stage buzzer-stage--${team} buzzer-state--${room.buzzer.status}`}>
        <span>{copy.kicker}</span>
        <button onClick={onBuzz} disabled={!isArmed || isBuzzing} aria-label={isArmed ? `Buzz for ${teamName(room, team)}` : copy.headline}>
          <i aria-hidden="true"><Bolt size={34} /></i>
          <strong>{isBuzzing ? 'Sending…' : copy.headline}</strong>
          <small>{copy.detail}</small>
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
      {chat}
    </div>
  )
}

function PlayerBuzzerVariantB({ room, participantId, team, isBuzzing, error, onBuzz, chat }: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId)
  const isArmed = room.buzzer.status === 'armed'
  return (
    <div className={`buzzer-takeover buzzer-takeover--${team} buzzer-state--${room.buzzer.status}`}>
      <section>
        <span>{teamName(room, team)} · {copy.kicker}</span>
        <button onClick={onBuzz} disabled={!isArmed || isBuzzing}>
          <i aria-hidden="true"><Bolt size={46} /></i>
          <strong>{isBuzzing ? 'Sending…' : copy.headline}</strong>
          <small>{copy.detail}</small>
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
      <details>
        <summary>Team chat <span>Open while you wait</span></summary>
        {chat}
      </details>
    </div>
  )
}

function PlayerBuzzerVariantC({ room, participantId, team, isBuzzing, error, onBuzz, chat }: PlayerBuzzerVariantProps) {
  const copy = playerBuzzerCopy(room, participantId)
  const isArmed = room.buzzer.status === 'armed'
  return (
    <div className="buzzer-dock-layout">
      <div className="player-room-layout">
        <aside className={`my-team-card my-team-card--${team}`}>
          <span>Your team · buzzer below</span>
          <h1>{teamName(room, team)}</h1>
          <div className="player-chips">
            {room.participants.filter((player) => player.team === team).map((player) => <span key={player.id}>{player.name}</span>)}
          </div>
        </aside>
        {chat}
      </div>
      <section className={`player-buzzer-dock player-buzzer-dock--${team} buzzer-state--${room.buzzer.status}`}>
        <span><small>{copy.kicker}</small><b>{copy.detail}</b></span>
        <button onClick={onBuzz} disabled={!isArmed || isBuzzing}>
          <Bolt size={22} /> {isBuzzing ? 'Sending…' : copy.headline}
        </button>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>
  )
}

// PROTOTYPE: Three realtime buzzer treatments on the existing player-room route, switchable via ?variant=.
function PlayerRoom({ room, onChooseTeam, onSendMessage, onBuzz, onExit }: PlayerRoomProps) {
  const [error, setError] = useState('')
  const [buzzError, setBuzzError] = useState('')
  const [isBuzzing, setIsBuzzing] = useState(false)
  const [variant, setVariant] = useState<PrototypeVariant>(getPrototypeVariant)
  const viewer = room.viewer
  if (viewer.role !== 'player') return null

  const chooseTeam = async (team: TeamId) => {
    setError('')
    try {
      await onChooseTeam(team)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join that team.')
    }
  }

  const changeVariant = (nextVariant: PrototypeVariant) => {
    const url = new URL(window.location.href)
    url.searchParams.set('variant', nextVariant)
    window.history.replaceState({}, '', url)
    setVariant(nextVariant)
  }

  const buzz = async () => {
    setBuzzError('')
    setIsBuzzing(true)
    try {
      await onBuzz()
      navigator.vibrate?.(70)
    } catch (cause) {
      setBuzzError(cause instanceof Error ? cause.message : 'That buzz did not register.')
    } finally {
      setIsBuzzing(false)
    }
  }

  return (
    <main className="player-shell">
      <header className="player-nav">
        <Brand compact />
        <span>Room <b>{room.code}</b></span>
        <button className="text-button text-button--light" onClick={onExit}>Leave</button>
      </header>
      <section className="player-room">
        {room.phase === 'playing' && (
          <div className="game-live-banner"><span className="live-dot" /><strong>Game in progress</strong><span>Eyes on the main screen—this phone is now your buzzer.</span></div>
        )}
        {!viewer.team ? (
          <>
            <div className="player-room__intro">
              <p className="eyebrow">You’re in</p>
              <h1>Choose your<br /><em>side.</em></h1>
              <p>Choose carefully—your team locks immediately to keep both chats private.</p>
            </div>
            <div className="roster-grid roster-grid--selectable">
              <TeamRoster room={room} team="one" selectable onSelect={chooseTeam} />
              <TeamRoster room={room} team="two" selectable onSelect={chooseTeam} />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </>
        ) : room.phase !== 'playing' ? (
          <div className="player-room-layout">
            <aside className={`my-team-card my-team-card--${viewer.team}`}>
              <span>Your team · waiting for host</span>
              <h1>{teamName(room, viewer.team)}</h1>
              <div className="player-chips">{room.participants.filter((player) => player.team === viewer.team).map((player) => <span key={player.id}>{player.name}</span>)}</div>
            </aside>
            <TeamChat
              team={viewer.team}
              teamLabel={teamName(room, viewer.team)}
              messages={room.messages}
              participantId={viewer.participantId}
              onSend={onSendMessage}
            />
          </div>
        ) : (
          <>
            {(() => {
              const chat = <TeamChat team={viewer.team} teamLabel={teamName(room, viewer.team)} messages={room.messages} participantId={viewer.participantId} onSend={onSendMessage} />
              const props: PlayerBuzzerVariantProps = { room, participantId: viewer.participantId, team: viewer.team!, isBuzzing, error: buzzError, onBuzz: buzz, chat }
              if (variant === 'B') return <PlayerBuzzerVariantB {...props} />
              if (variant === 'C') return <PlayerBuzzerVariantC {...props} />
              return <PlayerBuzzerVariantA {...props} />
            })()}
            <PrototypeSwitcher current={variant} onChange={changeVariant} />
          </>
        )}
      </section>
    </main>
  )
}

function ScoreCard({ team, score, accent, onAdjust }: ScoreCardProps) {
  return (
    <section className={`score-card score-card--${accent}`} aria-label={`${team}: ${score} points`}>
      <div>
        <span className="score-card__label">{accent === 'gold' ? 'Team one' : 'Team two'}</span>
        <h2>{team}</h2>
      </div>
      <div className="score-card__points">
        <strong>{score}</strong>
        <div className="score-adjust" aria-label={`Adjust ${team} score`}>
          <button onClick={() => onAdjust(-5)} aria-label={`Subtract 5 points from ${team}`}>−</button>
          <button onClick={() => onAdjust(5)} aria-label={`Add 5 points to ${team}`}>+</button>
        </div>
      </div>
    </section>
  )
}

function AnswerTile({ answer, points, number, revealed, onReveal }: AnswerTileProps) {
  return (
    <button
      className={`answer-tile ${revealed ? 'is-revealed' : ''}`}
      onClick={onReveal}
      aria-label={revealed ? `${answer}, ${points} points` : `Reveal answer ${number}`}
    >
      <span className="answer-tile__face answer-tile__front"><b>{number}</b><small>Reveal</small></span>
      <span className="answer-tile__face answer-tile__back"><b>{answer}</b><strong>{points}</strong></span>
    </button>
  )
}

function WinnerModal({ winner, score, onReplay, onHome }: WinnerModalProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="winner-title">
      <div className="winner-modal">
        <span className="winner-modal__rays" aria-hidden="true" />
        <p className="eyebrow">That’s the game</p>
        <h2 id="winner-title">{winner}<br /><em>take the night!</em></h2>
        <div className="winner-score"><strong>{score}</strong><span>points</span></div>
        <div className="winner-actions">
          <button className="primary-button" onClick={onReplay}>Run it back</button>
          <button className="secondary-button" onClick={onHome}>Game cabinet</button>
        </div>
      </div>
    </div>
  )
}

function HostBuzzerPanel({ room }: { room: RoomSnapshot }) {
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState('')
  const winner = room.buzzer.winner
  const statusCopy = winner
    ? `${winner.playerName} · ${teamName(room, winner.team)}`
    : room.buzzer.status === 'armed'
      ? 'Live — first tap wins'
      : 'Closed — players are standing by'

  const run = async (action: 'arm' | 'close' | 'reset') => {
    setError('')
    setIsUpdating(true)
    try {
      if (action === 'arm') await roomClient.armBuzzer()
      if (action === 'close') await roomClient.closeBuzzer()
      if (action === 'reset') await roomClient.resetBuzzer()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the buzzer.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <section className={`host-buzzer-panel host-buzzer-panel--${room.buzzer.status}`} aria-label="Buzzer controls">
      <div className="host-buzzer-panel__signal" aria-hidden="true"><Bolt size={24} /></div>
      <div>
        <span>Buzzer</span>
        <strong>{statusCopy}</strong>
        {error && <small role="alert">{error}</small>}
      </div>
      <div className="host-buzzer-panel__actions">
        {room.buzzer.status === 'armed' ? (
          <button onClick={() => run('close')} disabled={isUpdating}>Close buzzer</button>
        ) : (
          <button className="is-primary" onClick={() => run('arm')} disabled={isUpdating}>{winner ? 'Arm again' : 'Arm buzzer'} <kbd>Z</kbd></button>
        )}
        {winner && <button onClick={() => run('reset')} disabled={isUpdating}>Clear result</button>}
      </div>
    </section>
  )
}

function Game({ config, roomCode, room, onExit, onReplay }: GameProps) {
  const [round, setRound] = useState(1)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [revealed, setRevealed] = useState<number[]>([])
  const [strikes, setStrikes] = useState(0)
  const [scores, setScores] = useState<[number, number]>([0, 0])
  const [winner, setWinner] = useState<Winner | null>(null)

  const question = questions[questionIndex % questions.length]
  const multiplier = multiplierForRound(round)
  const roundPot = useMemo(
    () => revealed.reduce((sum, index) => sum + question.answers[index][1] * multiplier, 0),
    [revealed, question, multiplier],
  )

  const revealAnswer = (index: number) => {
    setRevealed((current) => current.includes(index) ? current : [...current, index])
  }

  const addStrike = () => setStrikes((current) => Math.min(3, current + 1))

  const awardRound = (teamIndex: TeamIndex) => {
    void roomClient.resetBuzzer()
    const nextScores: [number, number] = [scores[0], scores[1]]
    nextScores[teamIndex] += roundPot
    setScores(nextScores)
    if (nextScores[teamIndex] >= config.winningScore) {
      setWinner({ name: teamIndex === 0 ? config.teamOne : config.teamTwo, score: nextScores[teamIndex] })
      return
    }
    setRound((current) => current + 1)
    setQuestionIndex((current) => (current + 1) % questions.length)
    setRevealed([])
    setStrikes(0)
  }

  const adjustScore = (teamIndex: TeamIndex, change: number) => {
    setScores((current) => {
      const nextScores: [number, number] = [current[0], current[1]]
      nextScores[teamIndex] = Math.max(0, nextScores[teamIndex] + change)
      return nextScores
    })
  }

  const newQuestion = () => {
    void roomClient.resetBuzzer()
    setQuestionIndex((current) => (current + 1) % questions.length)
    setRevealed([])
    setStrikes(0)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '1' && event.key <= String(question.answers.length)) revealAnswer(Number(event.key) - 1)
      if (event.key.toLowerCase() === 'x') addStrike()
      if (event.key.toLowerCase() === 'a') awardRound(0)
      if (event.key.toLowerCase() === 'b') awardRound(1)
      if (event.key.toLowerCase() === 'z' && !event.repeat) {
        if (room.buzzer.status === 'armed') void roomClient.closeBuzzer()
        else void roomClient.armBuzzer()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <main className="game-shell">
      <header className="game-topbar">
        <Brand compact />
        <div className="round-indicator"><span>Room {roomCode}</span><span>Round {round}</span><b>{multiplier}× points</b></div>
        <button className="text-button text-button--light" onClick={onExit}>Exit game</button>
      </header>

      <section className="score-row">
        <ScoreCard team={config.teamOne} score={scores[0]} accent="gold" onAdjust={(change) => adjustScore(0, change)} />
        <div className="round-pot" aria-label={`${roundPot} points in the round`}><span>Round pot</span><strong>{roundPot}</strong></div>
        <ScoreCard team={config.teamTwo} score={scores[1]} accent="coral" onAdjust={(change) => adjustScore(1, change)} />
      </section>

      <section className="question-board">
        <header className="question-board__header">
          <span>We asked 100 people…</span>
          <button onClick={newQuestion}>Skip question ↗</button>
        </header>
        {room.buzzer.status === 'armed' && (
          <div className="buzzer-board-banner buzzer-board-banner--armed" role="status"><span className="live-dot" /> Buzzer is live</div>
        )}
        {room.buzzer.winner && (
          <div className={`buzzer-board-banner buzzer-board-banner--winner buzzer-board-banner--${room.buzzer.winner.team}`} role="status">
            <Bolt size={20} /> <strong>{room.buzzer.winner.playerName}</strong><span>{teamName(room, room.buzzer.winner.team)} buzzed first</span>
          </div>
        )}
        <h1>{question.prompt}</h1>
        <div className="answers-grid">
          {question.answers.map(([answer, points], index) => (
            <AnswerTile key={answer} answer={answer} points={points} number={index + 1} revealed={revealed.includes(index)} onReveal={() => revealAnswer(index)} />
          ))}
        </div>
      </section>

      <section className="host-controls">
        <HostBuzzerPanel room={room} />
        <div className="strike-panel">
          <span>Strikes</span>
          <div className="strike-marks" aria-label={`${strikes} strikes`}>
            {[0, 1, 2].map((index) => <i key={index} className={index < strikes ? 'is-active' : ''}>×</i>)}
          </div>
          <div className="strike-actions">
            <button onClick={() => setStrikes((current) => Math.max(0, current - 1))} aria-label="Remove a strike">Undo</button>
            <button onClick={addStrike}>Add strike <kbd>X</kbd></button>
          </div>
        </div>
        <div className="award-panel">
          <span>Award {roundPot} points</span>
          <div>
            <button disabled={roundPot === 0} onClick={() => awardRound(0)}>{config.teamOne} <kbd>A</kbd></button>
            <button disabled={roundPot === 0} onClick={() => awardRound(1)}>{config.teamTwo} <kbd>B</kbd></button>
          </div>
        </div>
      </section>

      <footer className="game-help">Host shortcuts: <kbd>Z</kbd> opens/closes buzzer · <kbd>1</kbd>–<kbd>6</kbd> reveal answers · <kbd>X</kbd> adds a strike · first team to {config.winningScore} wins</footer>

      {winner && <WinnerModal winner={winner.name} score={winner.score} onReplay={onReplay} onHome={onExit} />}
    </main>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [config, setConfig] = useState<GameConfig | null>(null)
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [roomNotice, setRoomNotice] = useState('')

  useEffect(() => roomClient.subscribe(
    (snapshot) => setRoom(snapshot),
    (message) => {
      setRoom(null)
      setRoomNotice(message)
      setScreen('home')
    },
  ), [])

  const createRoom = async (nextConfig: GameConfig) => {
    const snapshot = await roomClient.createRoom(nextConfig)
    setConfig(nextConfig)
    setRoom(snapshot)
    setScreen('host-lobby')
  }

  const joinRoom = async (code: string, name: string) => {
    const snapshot = await roomClient.joinRoom(code, name)
    setRoom(snapshot)
    setConfig(snapshot.config)
    setScreen('player-room')
  }

  const startGame = async () => {
    const snapshot = await roomClient.startGame()
    setRoom(snapshot)
    setConfig(snapshot.config)
    setScreen('game')
  }

  const leaveRoom = () => {
    roomClient.leaveRoom()
    setRoom(null)
    setConfig(null)
    setScreen('home')
  }

  const replay = () => {
    roomClient.leaveRoom()
    setRoom(null)
    setScreen('setup')
  }

  return (
    <>
      {screen === 'home' && (
        <>
          {roomNotice && <div className="room-notice" role="status">{roomNotice}<button onClick={() => setRoomNotice('')}>×</button></div>}
          <Home onChooseFeud={() => setScreen('setup')} onJoin={() => setScreen('join')} />
        </>
      )}
      {screen === 'setup' && <Setup onBack={() => setScreen('home')} onStart={createRoom} />}
      {screen === 'join' && <JoinRoom onBack={() => setScreen('home')} onJoin={joinRoom} />}
      {screen === 'host-lobby' && room && <HostLobby room={room} onStart={startGame} onExit={leaveRoom} />}
      {screen === 'player-room' && room && (
        <PlayerRoom
          room={room}
          onChooseTeam={(team) => roomClient.chooseTeam(team).then(setRoom)}
          onSendMessage={(text) => roomClient.sendMessage(text).then(() => undefined)}
          onBuzz={() => roomClient.pressBuzzer().then(() => undefined)}
          onExit={leaveRoom}
        />
      )}
      {screen === 'game' && config && room && (
        <Game
          key={`${config.teamOne}-${config.teamTwo}-${screen}`}
          config={config}
          roomCode={room.code}
          room={room}
          onExit={leaveRoom}
          onReplay={replay}
        />
      )}
    </>
  )
}
