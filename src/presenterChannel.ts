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
  strikeRevision: number;
  phase: "faceoff" | "playing" | "steal";
  controllingTeam: TeamId | null;
  originalControllingTeam: TeamId | null;
  stealOutcome: "success" | "failed" | null;
  selectedAwardTeam: TeamId | null;
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
  question: { prompt: string; answers: FeudAnswer[] };
}

type PresentationMessage =
  | { version: 1; roomCode: string; kind: "request" }
  | { version: 1; roomCode: string; kind: "state"; state: PresentationState };

const channelName = (code: string) => `wangz-presenter-${code}`;

function postState(channel: BroadcastChannel, state: PresentationState): void {
  const message: PresentationMessage = {
    version: 1,
    roomCode: state.code,
    kind: "state",
    state,
  };
  channel.postMessage(message);
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
  if (input.room.game?.kind !== "feud") {
    throw new Error("A Family Feud round must be active before publishing its board.");
  }
  const game = input.room.game;
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
    round: game.round,
    multiplier: game.multiplier,
    question: {
      answers: input.question.answers.map(({ id, label, points }, index) =>
        game.revealed.includes(index)
          ? { id, label, points }
          : { id, label: "", points: 0 },
      ),
    },
    revealed: [...game.revealed],
    strikes: game.strikes,
    strikeRevision: game.strikeRevision,
    phase: game.phase,
    controllingTeam: game.controllingTeam,
    originalControllingTeam: game.originalControllingTeam,
    stealOutcome: game.stealOutcome,
    selectedAwardTeam: game.selectedAwardTeam,
    scores: [game.scores.one, game.scores.two],
    roundPot: game.roundPot,
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
    winner: game.winnerTeam
      ? {
          name: game.winnerTeam === "one" ? input.config.teamOne : input.config.teamTwo,
          score: game.scores[game.winnerTeam],
        }
      : null,
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

export function usePresentationPublisher(
  state: PresentationState | null,
): void {
  const stateRef = useRef(state);
  const channelRef = useRef<BroadcastChannel | null>(null);
  stateRef.current = state;

  useEffect(() => {
    if (!state) return;
    const channel = new BroadcastChannel(channelName(state.code));
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        isPresentationMessage(event.data, state.code) &&
        event.data.kind === "request" &&
        stateRef.current
      )
        postState(channel, stateRef.current);
    };
    postState(channel, state);
    return () => {
      channelRef.current = null;
      channel.close();
    };
  }, [state?.code]);

  useEffect(() => {
    if (channelRef.current && state) postState(channelRef.current, state);
  }, [state]);
}

export function usePresentation(roomCode: string): PresentationState | null {
  const [state, setState] = useState<PresentationState | null>(null);

  useEffect(() => {
    const channel = new BroadcastChannel(channelName(roomCode));
    const request = () => {
      const message: PresentationMessage = {
        version: 1,
        roomCode,
        kind: "request",
      };
      channel.postMessage(message);
    };
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        isPresentationMessage(event.data, roomCode) &&
        event.data.kind === "state"
      )
        setState(event.data.state);
    };
    request();
    const requestTimer = window.setInterval(request, 1000);
    return () => {
      window.clearInterval(requestTimer);
      channel.close();
    };
  }, [roomCode]);

  return state;
}
