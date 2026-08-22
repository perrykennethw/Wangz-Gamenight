import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { avatarFor, initials } from "./avatarCatalog";
import { restoreManagedFormInputFocus } from "./formFocus";
import { gameAudio } from "./gameAudio";
import { roomClient } from "./roomClient";
import type {
  FastMoneyCommand,
  FastMoneyContestantView,
  FastMoneyView,
  RoomSnapshot,
} from "./roomTypes";

function MoneyPortrait({ person }: { person: Pick<FastMoneyContestantView, "name" | "avatarId"> }) {
  const avatar = avatarFor(person.avatarId);
  const [failed, setFailed] = useState(false);
  return (
    <span className="fast-money-portrait" aria-hidden="true">
      {avatar && !failed
        ? <img src={avatar.url} alt="" onError={() => setFailed(true)} />
        : <b>{initials(person.name)}</b>}
    </span>
  );
}

function ContestantCard({
  person,
  order,
  durationSeconds,
}: {
  person: FastMoneyContestantView | null;
  order: 1 | 2;
  durationSeconds: number;
}) {
  return (
    <article className={`fast-money-contestant fast-money-contestant--${order}`}>
      <span className="fast-money-contestant__order">Contestant {order}</span>
      {person ? (
        <>
          <MoneyPortrait person={person} />
          <strong>{person.name}</strong>
          <small>{durationSeconds} seconds</small>
        </>
      ) : (
        <><i>?</i><strong>To be chosen</strong></>
      )}
    </article>
  );
}

export function FastMoneyClock({ timer }: { timer: FastMoneyView["timer"] }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (timer.status !== "running") return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [timer.status, timer.deadline]);
  const remaining = timer.status === "running" && timer.deadline
    ? Math.max(0, timer.deadline - now)
    : timer.remainingMs;
  const seconds = Math.ceil(remaining / 1000);
  return (
    <div className={`fast-money-clock fast-money-clock--${timer.status}`} aria-live="polite">
      <span>{timer.status === "paused" ? "Clock paused" : "Time remaining"}</span>
      <strong>{seconds}</strong>
      <small>seconds</small>
    </div>
  );
}

function BlankResponse() {
  return <span className="fast-money-blank">—</span>;
}

export function FastMoneyBoard({ game }: { game: FastMoneyView }) {
  const progress = Math.min(100, (game.combinedScore / game.goal) * 100);
  return (
    <section className="fast-money-board" aria-label="Fast Money answer board">
      <header>
        <div>
          <span>Fast Money</span>
          <h1>{game.message}</h1>
        </div>
        <div className="fast-money-total" aria-label={`${game.combinedScore} of ${game.goal} points`}>
          <strong>{game.combinedScore}</strong>
          <span>/ {game.goal}</span>
        </div>
      </header>
      <div className="fast-money-progress" aria-hidden="true">
        <i style={{ width: `${progress}%` }} />
        <b>200</b>
      </div>
      <div className="fast-money-ledger">
        <div className="fast-money-ledger__head">
          <span>Question</span>
          <strong>{game.contestants[0]?.name ?? "Contestant 1"}</strong>
          <strong>{game.contestants[1]?.name ?? "Contestant 2"}</strong>
        </div>
        {game.questions.map((question, index) => (
          <article className={question.revealed ? "is-revealed" : ""} key={question.id}>
            <b>{index + 1}</b>
            <div>
              {question.responses[0].text !== null ? (
                <><span>{question.responses[0].text || "No answer"}</span><strong>{question.responses[0].points ?? 0}</strong></>
              ) : <BlankResponse />}
            </div>
            <div className={question.responses[1].repeated ? "is-repeat" : ""}>
              {question.responses[1].text !== null ? (
                <><span>{question.responses[1].repeated ? "Repeat" : question.responses[1].text || "No answer"}</span><strong>{question.responses[1].points ?? 0}</strong></>
              ) : <BlankResponse />}
            </div>
          </article>
        ))}
      </div>
      {game.phase === "reveal-one" && game.revealIndex === 4 && game.subtotals[0] !== null && (
        <div className="fast-money-first-subtotal" role="status">
          <span>Contestant 1 subtotal</span>
          <strong>{game.subtotals[0]} points</strong>
        </div>
      )}
      {(game.phase === "complete") && (
        <div className={`fast-money-outcome fast-money-outcome--${game.outcome}`} role="status">
          <span>{game.outcome === "win" ? "Goal cleared" : "Final total"}</span>
          <strong>{game.message}</strong>
        </div>
      )}
    </section>
  );
}

function AnswerForm({
  game,
}: {
  game: FastMoneyView;
}) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focusRevision, setFocusRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const selectTextOnFocus = useRef(false);
  const question = game.currentQuestionIndex === null ? null : game.questions[game.currentQuestionIndex];
  const inputBlocked = busy;
  const firstResponse = game.currentContestant === 1 ? question?.responses[0] : null;

  useEffect(() => {
    if (busy) return;
    const frame = window.requestAnimationFrame(() => {
      restoreManagedFormInputFocus({
        input: inputRef.current,
        activeElement: document.activeElement,
        body: document.body,
        isWithinForm: (element) => Boolean(
          element && formRef.current?.contains(element as Node),
        ),
        selectText: selectTextOnFocus.current,
      });
      selectTextOnFocus.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busy, focusRevision]);

  const requestInputFocus = (selectText = false) => {
    selectTextOnFocus.current = selectText;
    setFocusRevision((current) => current + 1);
  };

  const run = async (command: FastMoneyCommand) => {
    setBusy(true);
    setError("");
    let selectText = false;
    try {
      await roomClient.fastMoneyAction(command);
      setAnswer("");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "That answer did not register.";
      setError(message);
      selectText = true;
    } finally {
      setBusy(false);
      requestInputFocus(selectText);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (answer.trim()) void run({ type: "submit", answer });
  };

  return (
    <section className="fast-money-answer-console">
      <div className="fast-money-answer-console__status">
        <span>Host transcription</span>
        <b>{game.answeredCount} of 5 answered</b>
      </div>
      <h2>{question?.prompt ?? "Listen for the next question."}</h2>
      {game.currentContestant === 1 && (
        <aside className="fast-money-repeat-reference" aria-label="Private repeat reference">
          <span>Private · contestant 1 answered</span>
          <strong>{firstResponse?.text || "No recorded answer"}</strong>
          <small>Keep this off the presenter screen. A matching answer will trigger the repeat buzzer.</small>
        </aside>
      )}
      <form ref={formRef} onSubmit={submit}>
        <label htmlFor="host-fast-money-answer">Spoken answer</label>
        <input
          ref={inputRef}
          id="host-fast-money-answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder="Type the contestant’s spoken answer"
          disabled={inputBlocked}
        />
        <button className="primary-button" disabled={inputBlocked || !answer.trim()}>Lock answer</button>
        <button type="button" className="secondary-button" disabled={inputBlocked} onClick={() => void run({ type: "pass" })}>Pass</button>
      </form>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </section>
  );
}

function ReviewRow({
  game,
  contestant,
  questionIndex,
}: {
  game: FastMoneyView;
  contestant: 0 | 1;
  questionIndex: number;
}) {
  const question = game.questions[questionIndex];
  const response = question.responses[contestant];
  const [text, setText] = useState(response.text ?? "");
  const [answerId, setAnswerId] = useState(response.answerId ?? "");
  const [repeated, setRepeated] = useState(response.repeated);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setText(response.text ?? "");
    setAnswerId(response.answerId ?? "");
    setRepeated(response.repeated);
  }, [response.text, response.answerId, response.repeated]);

  const save = async () => {
    setStatus("Saving…");
    try {
      await roomClient.fastMoneyAction({
        type: "score-response",
        contestant,
        questionIndex,
        text,
        answerId: answerId || null,
        repeated,
      });
      if (repeated) void gameAudio.play("repeat-answer");
      setStatus("Saved");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Could not save this score.");
    }
  };

  return (
    <article className="fast-money-review-row">
      <div>
        <span>Question {questionIndex + 1}</span>
        <strong>{question.prompt}</strong>
      </div>
      <label>
        <span>Recorded answer</span>
        <input value={text} maxLength={100} onChange={(event) => setText(event.target.value)} />
      </label>
      <label>
        <span>Survey match</span>
        <select value={answerId} disabled={repeated} onChange={(event) => setAnswerId(event.target.value)}>
          <option value="">No match · 0</option>
          {(question.answerOptions ?? []).map((answer) => (
            <option value={answer.id} key={answer.id}>{answer.label} · {answer.points}</option>
          ))}
        </select>
      </label>
      {contestant === 1 && (
        <label className="fast-money-repeat-check">
          <input type="checkbox" checked={repeated} onChange={(event) => setRepeated(event.target.checked)} />
          <span>Repeat answer</span>
        </label>
      )}
      <button type="button" onClick={() => void save()}>Save row</button>
      {status && <small role="status">{status}</small>}
    </article>
  );
}

function HostSelection({ room, game }: { room: RoomSnapshot; game: FastMoneyView }) {
  const candidates = room.participants.filter((participant) => participant.team === game.eligibleTeam);
  const leaders = useMemo(() => [...candidates]
    .sort((a, b) => (game.voteCounts[b.id] ?? 0) - (game.voteCounts[a.id] ?? 0))
    .slice(0, 2), [candidates, game.voteCounts]);
  const [lineup, setLineup] = useState<[string, string]>(() => [
    game.contestants[0]?.id ?? leaders[0]?.id ?? "",
    game.contestants[1]?.id ?? leaders[1]?.id ?? "",
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await roomClient.fastMoneyAction({ type: "set-lineup", contestantIds: lineup });
      await roomClient.fastMoneyAction({ type: "confirm-lineup" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not lock the lineup.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fast-money-selection">
      <header>
        <p className="eyebrow">Winning team ballot</p>
        <h1>Choose the<br /><em>final two.</em></h1>
        <p>Team votes suggest the pair. The host sets the order and locks it.</p>
      </header>
      <div className="fast-money-vote-board">
        {candidates.map((candidate) => (
          <article key={candidate.id}>
            <MoneyPortrait person={candidate} />
            <strong>{candidate.name}</strong>
            <b>{game.voteCounts[candidate.id] ?? 0}</b>
            <span>votes</span>
          </article>
        ))}
      </div>
      <div className="fast-money-order-controls">
        {([0, 1] as const).map((index) => (
          <label key={index}>
            <span>Contestant {index + 1} · {game.attemptDurations[index]} sec</span>
            <select
              value={lineup[index]}
              onChange={(event) => setLineup((current) => {
                const next: [string, string] = [...current];
                next[index] = event.target.value;
                return next;
              })}
            >
              <option value="">Choose a player</option>
              {candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        ))}
        <button
          type="button"
          onClick={() => leaders.length === 2 && setLineup([leaders[0].id, leaders[1].id])}
          disabled={leaders.length < 2}
        >Use vote leaders</button>
        <button className="primary-button" disabled={busy || !lineup[0] || !lineup[1] || lineup[0] === lineup[1]} onClick={() => void confirm()}>
          Lock contestant order
        </button>
      </div>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </section>
  );
}

function HostReady({ game, room }: { game: FastMoneyView; room: RoomSnapshot }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contestant = game.currentContestant ?? 0;
  const candidates = room.participants.filter((participant) => (
    participant.team === game.eligibleTeam
    && participant.id !== game.contestants[contestant === 0 ? 1 : 0]?.id
  ));
  const [replacementId, setReplacementId] = useState(game.contestants[contestant]?.id ?? candidates[0]?.id ?? "");
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await roomClient.fastMoneyAction({ type: "start-attempt" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the clock.");
    } finally {
      setBusy(false);
    }
  };
  const replace = async () => {
    if (!replacementId) return;
    setBusy(true);
    setError("");
    try {
      await roomClient.fastMoneyAction({ type: "replace-contestant", contestant, participantId: replacementId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not replace that contestant.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="fast-money-ready">
      <p className="eyebrow">Contestant {contestant + 1} ready</p>
      <div className="fast-money-lineup">
        <ContestantCard person={game.contestants[0]} order={1} durationSeconds={game.attemptDurations[0]} />
        <span>+</span>
        <ContestantCard person={game.contestants[1]} order={2} durationSeconds={game.attemptDurations[1]} />
      </div>
      <h1>{game.contestants[contestant]?.name ?? "Contestant"}, the clock is yours.</h1>
      <p>{contestant === 1 ? "First answers are sealed. Repeats will buzz immediately." : "Five questions. Pass when you need to; we’ll circle back."}</p>
      <details className="fast-money-replacement">
        <summary>Need a different contestant?</summary>
        <div>
          <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
            {candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}
          </select>
          <button
            type="button"
            disabled={busy || !replacementId || replacementId === game.contestants[contestant]?.id}
            onClick={() => void replace()}
          >Replace contestant {contestant + 1}</button>
        </div>
      </details>
      <button className="primary-button" disabled={busy} onClick={() => void start()}>Start {game.attemptDurations[contestant]}-second clock</button>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </section>
  );
}

function HostActive({ game }: { game: FastMoneyView }) {
  const [error, setError] = useState("");
  const run = async (command: FastMoneyCommand) => {
    setError("");
    try { await roomClient.fastMoneyAction(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That control did not register."); }
  };
  return (
    <section className="fast-money-active-layout">
      <FastMoneyClock timer={game.timer} />
      <AnswerForm game={game} />
      <div className="fast-money-timer-controls">
        <button onClick={() => void run({ type: game.timer.status === "paused" ? "resume-timer" : "pause-timer" })}>
          {game.timer.status === "paused" ? "Resume clock" : "Pause clock"}
        </button>
        <button onClick={() => void run({ type: "add-time" })}>Add 5 seconds</button>
        <button onClick={() => void run({ type: "end-attempt" })}>End attempt</button>
      </div>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </section>
  );
}

function HostReview({ game }: { game: FastMoneyView }) {
  const contestant = game.phase === "review-one" ? 0 : 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = async () => {
    setBusy(true);
    setError("");
    try { await roomClient.fastMoneyAction({ type: "lock-review" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not lock these scores."); }
    finally { setBusy(false); }
  };
  return (
    <section className="fast-money-review">
      <header>
        <div><span>Host review</span><h1>Check {game.contestants[contestant]?.name}’s answers.</h1></div>
        <strong>{game.subtotals[contestant] ?? 0}<small> points</small></strong>
      </header>
      <p>Correct the transcription, choose the survey match, and mark repeats before locking.</p>
      <div>
        {game.questions.map((_, index) => <ReviewRow game={game} contestant={contestant} questionIndex={index} key={index} />)}
      </div>
      <button className="primary-button" disabled={busy} onClick={() => void lock()}>
        {contestant === 0 ? "Lock scores and open contestant 1 reveal" : "Lock scores and open the final reveal"}
      </button>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </section>
  );
}

function HostFirstReveal({ game }: { game: FastMoneyView }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (command: FastMoneyCommand) => {
    setBusy(true);
    setError("");
    try { await roomClient.fastMoneyAction(command); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That reveal control did not register."); }
    finally { setBusy(false); }
  };
  const revealComplete = game.revealIndex === 4;
  return (
    <div className="fast-money-reveal-layout">
      <FastMoneyBoard game={game} />
      <div className="fast-money-between-controls">
        {revealComplete ? (
          <button className="primary-button" disabled={busy} onClick={() => void run({ type: "finish-first-reveal" })}>
            Call contestant 2
          </button>
        ) : (
          <button className="primary-button" disabled={busy} onClick={() => void run({ type: "reveal-next" })}>
            Reveal question {game.revealIndex + 2} of 5
          </button>
        )}
        {!revealComplete && (
          <button className="secondary-button" disabled={busy} onClick={() => void run({ type: "skip-first-reveal" })}>
            Skip reveal and call contestant 2
          </button>
        )}
      </div>
      {error && <p className="fast-money-error" role="alert">{error}</p>}
    </div>
  );
}

export function FastMoneyHost({ room }: { room: RoomSnapshot }) {
  const game = room.game?.kind === "fast-money" ? room.game : null;
  const previousAudioState = useRef<{
    phase: FastMoneyView["phase"];
    revealIndex: number;
    outcome: FastMoneyView["outcome"];
  } | null>(null);

  useEffect(() => {
    if (!game) return;
    const previous = previousAudioState.current;
    const attemptStarted = (game.phase === "active-one" || game.phase === "active-two")
      && game.phase !== previous?.phase;
    if (attemptStarted) void gameAudio.play("fast-money-start");
    if (previous && game.revealIndex > previous.revealIndex) {
      void gameAudio.play(game.phase === "complete" && game.outcome === "win"
        ? "fast-money-win"
        : "fast-money-reveal");
    }
    previousAudioState.current = {
      phase: game.phase,
      revealIndex: game.revealIndex,
      outcome: game.outcome,
    };
  }, [game]);

  if (!game) return null;
  if (game.phase === "selecting") return <HostSelection room={room} game={game} />;
  if (game.phase === "ready-one" || game.phase === "ready-two") return <HostReady game={game} room={room} />;
  if (game.phase === "active-one" || game.phase === "active-two") return <HostActive game={game} />;
  if (game.phase === "review-one" || game.phase === "review-two") return <HostReview game={game} />;
  if (game.phase === "reveal-one") return <HostFirstReveal game={game} />;
  return (
    <div className="fast-money-reveal-layout">
      <FastMoneyBoard game={game} />
      {game.phase === "reveal" && (
        <button className="primary-button fast-money-reveal-button" onClick={() => void roomClient.fastMoneyAction({ type: "reveal-next" })}>
          Reveal question {game.revealIndex + 2} of 5
        </button>
      )}
    </div>
  );
}

function PlayerVote({ room, game }: { room: RoomSnapshot; game: FastMoneyView }) {
  const candidates = room.participants.filter((participant) => participant.team === game.eligibleTeam);
  const [selected, setSelected] = useState<string[]>(game.viewerVotes);
  const [status, setStatus] = useState("");
  const toggle = (participantId: string) => setSelected((current) => current.includes(participantId)
    ? current.filter((id) => id !== participantId)
    : current.length < 2 ? [...current, participantId] : current);
  const vote = async () => {
    if (selected.length !== 2) return;
    setStatus("Sending vote…");
    try {
      await roomClient.fastMoneyAction({ type: "vote", participantIds: selected as [string, string] });
      setStatus("Vote locked. The host sets the order.");
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : "Your vote did not register.");
    }
  };
  return (
    <section className="fast-money-player-vote">
      <p className="eyebrow">Your team’s finale</p>
      <h1>Pick two<br /><em>for the clock.</em></h1>
      <p>Select two teammates. The host will choose who answers first.</p>
      <div>
        {candidates.map((candidate) => (
          <button
            key={candidate.id}
            className={selected.includes(candidate.id) ? "is-selected" : ""}
            onClick={() => toggle(candidate.id)}
            aria-pressed={selected.includes(candidate.id)}
          >
            <MoneyPortrait person={candidate} />
            <strong>{candidate.name}</strong>
            <span>{selected.includes(candidate.id) ? "Selected" : "Choose"}</span>
          </button>
        ))}
      </div>
      <button className="primary-button" disabled={selected.length !== 2} onClick={() => void vote()}>Vote for these two</button>
      {status && <p role="status">{status}</p>}
    </section>
  );
}

function PlayerWaiting({ game }: { game: FastMoneyView }) {
  return (
    <section className="fast-money-player-waiting">
      <p className="eyebrow">Fast Money</p>
      <div className="fast-money-lineup">
        <ContestantCard person={game.contestants[0]} order={1} durationSeconds={game.attemptDurations[0]} />
        <span>+</span>
        <ContestantCard person={game.contestants[1]} order={2} durationSeconds={game.attemptDurations[1]} />
      </div>
      <h1>{game.message}</h1>
      {game.timer.status !== "idle" && <FastMoneyClock timer={game.timer} />}
    </section>
  );
}

function PlayerVerbalAttempt({ game }: { game: FastMoneyView }) {
  return (
    <section className="fast-money-player-verbal">
      <FastMoneyClock timer={game.timer} />
      <div>
        <p className="eyebrow">Your Fast Money attempt</p>
        <h1>Answer the host<br /><em>out loud.</em></h1>
        <p>The host will read each question and record your spoken response. Say “pass” when you want to come back to one.</p>
        <strong>Nothing to type here — keep your attention on the host.</strong>
      </div>
    </section>
  );
}

export function FastMoneyPlayer({ room }: { room: RoomSnapshot }) {
  if (room.game?.kind !== "fast-money") return null;
  const game = room.game;
  if (game.phase === "selecting" && game.viewerRole === "eligible-team") return <PlayerVote room={room} game={game} />;
  if (game.isIsolated) {
    return (
      <section className="fast-money-isolation">
        <p className="eyebrow">Contestant 2 · private holding screen</p>
        <h1>Answers are<br /><em>sealed.</em></h1>
        <p>Keep this screen open and stay away from the presenter. The host will call you when the {game.attemptDurations[1]}-second clock is ready.</p>
      </section>
    );
  }
  const activeForViewer = (game.phase === "active-one" && game.viewerRole === "contestant-one")
    || (game.phase === "active-two" && game.viewerRole === "contestant-two");
  if (activeForViewer) {
    return <PlayerVerbalAttempt game={game} />;
  }
  if (game.phase === "reveal-one" || game.phase === "reveal" || game.phase === "complete") return <FastMoneyBoard game={game} />;
  return <PlayerWaiting game={game} />;
}
