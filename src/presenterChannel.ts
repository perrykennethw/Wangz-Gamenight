import { useEffect, useRef, useState } from "react";
import { roomCodeFromSearch } from "./roomInvite";
import type {
  BuzzerStatus,
  FeudAnswer,
  FeudGameConfig,
  FastMoneyView,
  RoomSnapshot,
  SharedTimerState,
  SpinSolveGameConfig,
  SpinSolveView,
  TeamId,
} from "./roomTypes";

interface PresentationBase {
  code: string;
  teamOne: string;
  teamTwo: string;
  timer: SharedTimerState;
}

export interface LobbyPresentation extends PresentationBase {
  mode: "lobby";
  game: "Family Feud" | "Spin & Solve";
  teamRevealRevision: number;
  participants: Array<{ name: string; avatarId: string | null; team: TeamId | null }>;
}

export interface FeudPresentation extends PresentationBase {
  mode: "feud";
  title: string;
  winningScore: number;
  round: number;
  multiplier: number;
  question: { answers: FeudAnswer[] };
  revealed: number[];
  strikes: number;
  wrongAnswerCueRevision: number;
  scores: [number, number];
  roundPot: number;
  buzzer: {
    status: BuzzerStatus;
    winner: { playerName: string; avatarId: string | null; team: TeamId } | null;
  };
  decision: {
    status: "closed" | "open" | "decided";
    team: TeamId | null;
    activePlayer: { name: string; avatarId: string | null } | null;
    choice: "play" | "pass" | null;
    controllingTeam: TeamId | null;
  };
  turn: {
    activeTeam: TeamId | null;
    currentPlayer: { name: string; avatarId: string | null } | null;
    nextPlayer: { name: string; avatarId: string | null } | null;
  };
  winner: { name: string; score: number } | null;
}

export interface SpinPresentation extends PresentationBase {
  mode: "spin-solve";
  config: SpinSolveGameConfig;
  game: SpinSolveView;
}

export interface FastMoneyPresentation extends PresentationBase {
  mode: "fast-money";
  game: FastMoneyView;
}

export type PresentationState =
  | LobbyPresentation
  | FeudPresentation
  | FastMoneyPresentation
  | SpinPresentation;

interface FeudBoardInput {
  room: RoomSnapshot;
  config: FeudGameConfig;
  round: number;
  multiplier: number;
  question: { prompt: string; answers: FeudAnswer[] };
  revealed: number[];
  strikes: number;
  wrongAnswerCueRevision: number;
  scores: [number, number];
  roundPot: number;
  winner: { name: string; score: number } | null;
}

type PresentationMessage =
  | { version: 1; roomCode: string; kind: "request" }
  | { version: 1; roomCode: string; kind: "state"; state: PresentationState };

const channelName = (code: string) => `wangz-presenter-${code}`;

export interface PresentationTransportChannel {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
  close(): void;
}

export type PresentationChannelFactory = (
  name: string,
) => PresentationTransportChannel | null;

interface PresentationPublisher {
  publish(state: PresentationState): void;
  close(): void;
}

interface PresentationSubscriber {
  close(): void;
}

interface PresentationTimerScheduler {
  setInterval(callback: () => void, delayMs: number): number;
  clearInterval(timer: number): void;
}

const createBroadcastChannel: PresentationChannelFactory = (name) => {
  if (typeof BroadcastChannel !== "function") return null;
  return new BroadcastChannel(name);
};

const browserTimerScheduler: PresentationTimerScheduler = {
  setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
  clearInterval: (timer) => window.clearInterval(timer),
};

function openChannel(
  name: string,
  createChannel: PresentationChannelFactory,
): PresentationTransportChannel | null {
  try {
    return createChannel(name);
  } catch {
    return null;
  }
}

function closeChannel(channel: PresentationTransportChannel): void {
  channel.onmessage = null;
  try {
    channel.close();
  } catch {
    // Presenter transport is optional; cleanup failures must not interrupt play.
  }
}

function postMessage(
  channel: PresentationTransportChannel,
  message: PresentationMessage,
): boolean {
  try {
    channel.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

function postState(
  channel: PresentationTransportChannel,
  state: PresentationState,
): boolean {
  const message: PresentationMessage = {
    version: 1,
    roomCode: state.code,
    kind: "state",
    state,
  };
  return postMessage(channel, message);
}

function isPresentationMessage(
  value: unknown,
  roomCode: string,
): value is PresentationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<PresentationMessage>;
  return (
    message.version === 1 &&
    message.roomCode === roomCode &&
    (message.kind === "request" || message.kind === "state")
  );
}

export function createLobbyPresentation(
  room: RoomSnapshot,
  teamRevealRevision = 0,
): LobbyPresentation {
  return {
    mode: "lobby",
    code: room.code,
    game: room.config.kind === "feud" ? "Family Feud" : "Spin & Solve",
    teamOne: room.config.teamOne,
    teamTwo: room.config.teamTwo,
    timer: { ...room.timer },
    teamRevealRevision,
    participants: room.participants.map(({ name, avatarId, team }) => ({ name, avatarId, team })),
  };
}

export function createFeudPresentation(
  input: FeudBoardInput,
): FeudPresentation {
  const activePlayer = input.room.participants.find(
    (participant) => participant.id === input.room.playPass.activePlayerId,
  );
  const activeTurn = input.room.feudTurns.activeTeam
    ? input.room.feudTurns.teams[input.room.feudTurns.activeTeam]
    : null;
  const currentTurnPlayer = input.room.participants.find(
    (participant) => participant.id === activeTurn?.currentPlayerId,
  );
  const nextTurnPlayer = input.room.participants.find(
    (participant) => participant.id === activeTurn?.nextPlayerId,
  );
  return {
    mode: "feud",
    code: input.room.code,
    teamOne: input.config.teamOne,
    teamTwo: input.config.teamTwo,
    timer: { ...input.room.timer },
    title: input.config.pack.title,
    winningScore: input.config.winningScore,
    round: input.round,
    multiplier: input.multiplier,
    question: {
      answers: input.question.answers.map(({ id, label, points }, index) =>
        input.revealed.includes(index)
          ? { id, label, points }
          : { id, label: "", points: 0 },
      ),
    },
    revealed: [...input.revealed],
    strikes: input.strikes,
    wrongAnswerCueRevision: input.wrongAnswerCueRevision,
    scores: [...input.scores],
    roundPot: input.roundPot,
    buzzer: {
      status: input.room.buzzer.status,
      winner: input.room.buzzer.winner
        ? {
            playerName: input.room.buzzer.winner.playerName,
            avatarId: input.room.buzzer.winner.avatarId,
            team: input.room.buzzer.winner.team,
          }
        : null,
    },
    decision: {
      status: input.room.playPass.status,
      team: input.room.playPass.team,
      activePlayer: activePlayer ? { name: activePlayer.name, avatarId: activePlayer.avatarId } : null,
      choice: input.room.playPass.decision,
      controllingTeam: input.room.playPass.controllingTeam,
    },
    turn: {
      activeTeam: input.room.feudTurns.activeTeam,
      currentPlayer: currentTurnPlayer
        ? { name: currentTurnPlayer.name, avatarId: currentTurnPlayer.avatarId }
        : null,
      nextPlayer: nextTurnPlayer
        ? { name: nextTurnPlayer.name, avatarId: nextTurnPlayer.avatarId }
        : null,
    },
    winner: input.winner ? { ...input.winner } : null,
  };
}

export function createSpinPresentation(
  room: RoomSnapshot,
): SpinPresentation | null {
  if (room.config.kind !== "spin-solve" || room.game?.kind !== "spin-solve")
    return null;
  return {
    mode: "spin-solve",
    code: room.code,
    teamOne: room.config.teamOne,
    teamTwo: room.config.teamTwo,
    timer: { ...room.timer },
    config: { ...room.config },
    game: { ...room.game },
  };
}

export function createFastMoneyPresentation(
  room: RoomSnapshot,
): FastMoneyPresentation | null {
  if (room.config.kind !== "feud" || room.game?.kind !== "fast-money") return null;
  const questions = room.game.questions.map((question) => ({
    ...question,
    prompt: question.revealed ? question.prompt : null,
    answerOptions: null,
    responses: question.revealed
      ? question.responses.map((response) => ({ ...response, answerId: null })) as typeof question.responses
      : ([
          { text: null, answerId: null, points: null, repeated: false },
          { text: null, answerId: null, points: null, repeated: false },
        ] as typeof question.responses),
  }));
  const combinedScore = questions.reduce((total, question) => total
    + (question.responses[0].points ?? 0)
    + (question.responses[1].points ?? 0), 0);
  const game: FastMoneyView = {
    ...room.game,
    contestants: room.game.contestants.map((contestant) => contestant
      ? { ...contestant, id: "" }
      : null) as FastMoneyView["contestants"],
    viewerRole: "spectator",
    viewerVotes: [],
    voteCounts: {},
    currentQuestionIndex: null,
    questions,
    combinedScore,
    subtotals: room.game.phase === "complete"
      ? [...room.game.subtotals]
      : room.game.phase === "reveal-one" && room.game.revealIndex === 4
        ? [room.game.subtotals[0], null]
        : [null, null],
    isIsolated: false,
  };
  return {
    mode: "fast-money",
    code: room.code,
    teamOne: room.config.teamOne,
    teamTwo: room.config.teamTwo,
    timer: { ...room.timer },
    game,
  };
}

export function presenterRoomCodeFromSearch(search: string): string | null {
  return roomCodeFromSearch(search, "present");
}

export function presenterRoomCode(): string | null {
  return presenterRoomCodeFromSearch(window.location.search);
}

export function openPresenterTab(code: string): boolean {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("present", code);
  const presenter = window.open(url, "_blank");
  if (!presenter) return false;
  presenter.opener = null;
  return true;
}

export function startPresentationPublisher(
  state: PresentationState,
  currentState: () => PresentationState | null,
  createChannel: PresentationChannelFactory = createBroadcastChannel,
): PresentationPublisher | null {
  const channel = openChannel(channelName(state.code), createChannel);
  if (!channel) return null;

  let closed = false;
  const publisher: PresentationPublisher = {
    publish: (nextState) => {
      if (!closed) postState(channel, nextState);
    },
    close: () => {
      if (closed) return;
      closed = true;
      closeChannel(channel);
    },
  };
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      isPresentationMessage(event.data, state.code) &&
      event.data.kind === "request"
    ) {
      const latestState = currentState();
      if (latestState) publisher.publish(latestState);
    }
  };
  publisher.publish(state);
  return publisher;
}

export function startPresentationSubscriber(
  roomCode: string,
  onState: (state: PresentationState) => void,
  createChannel: PresentationChannelFactory = createBroadcastChannel,
  timers: PresentationTimerScheduler = browserTimerScheduler,
): PresentationSubscriber | null {
  const channel = openChannel(channelName(roomCode), createChannel);
  if (!channel) return null;

  let closed = false;
  let requestTimer: number | null = null;
  const request = () => postMessage(channel, {
    version: 1,
    roomCode,
    kind: "request",
  });
  const subscriber: PresentationSubscriber = {
    close: () => {
      if (closed) return;
      closed = true;
      if (requestTimer !== null) timers.clearInterval(requestTimer);
      closeChannel(channel);
    },
  };
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (
      isPresentationMessage(event.data, roomCode) &&
      event.data.kind === "state"
    )
      onState(event.data.state);
  };

  if (!request()) {
    subscriber.close();
    return null;
  }
  try {
    requestTimer = timers.setInterval(request, 1000);
  } catch {
    subscriber.close();
    return null;
  }
  return subscriber;
}

export function usePresentationPublisher(
  state: PresentationState | null,
): void {
  const stateRef = useRef(state);
  const publisherRef = useRef<PresentationPublisher | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (!state) return;
    const publisher = startPresentationPublisher(
      state,
      () => stateRef.current,
    );
    publisherRef.current = publisher;
    return () => {
      publisherRef.current = null;
      publisher?.close();
    };
  }, [state?.code]);

  useEffect(() => {
    if (publisherRef.current && state) publisherRef.current.publish(state);
  }, [state]);
}

export type PresentationTransportStatus = "waiting" | "connected" | "unavailable";

export function usePresentation(roomCode: string): {
  state: PresentationState | null;
  status: PresentationTransportStatus;
} {
  const [state, setState] = useState<PresentationState | null>(null);
  const [status, setStatus] = useState<PresentationTransportStatus>("waiting");

  useEffect(() => {
    setState(null);
    setStatus("waiting");
    const subscriber = startPresentationSubscriber(roomCode, (nextState) => {
      setState(nextState);
      setStatus("connected");
    });
    if (!subscriber) {
      setStatus("unavailable");
      return;
    }
    return () => subscriber.close();
  }, [roomCode]);

  return { state, status };
}
