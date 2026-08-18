import { useEffect, useRef, useState } from "react";
import type {
  BuzzerStatus,
  FeudAnswer,
  FeudGameConfig,
  RoomSnapshot,
  SpinSolveGameConfig,
  SpinSolveView,
  TeamId,
} from "./roomTypes";

interface PresentationBase {
  code: string;
  teamOne: string;
  teamTwo: string;
}

export interface LobbyPresentation extends PresentationBase {
  mode: "lobby";
  game: "Family Feud" | "Spin & Solve";
  participants: Array<{ name: string; team: TeamId | null }>;
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
  scores: [number, number];
  roundPot: number;
  buzzer: {
    status: BuzzerStatus;
    winner: { playerName: string; team: TeamId } | null;
  };
  decision: {
    status: "closed" | "open" | "decided";
    activePlayerName: string | null;
    choice: "play" | "pass" | null;
    controllingTeam: TeamId | null;
  };
  winner: { name: string; score: number } | null;
}

export interface SpinPresentation extends PresentationBase {
  mode: "spin-solve";
  config: SpinSolveGameConfig;
  game: SpinSolveView;
}

export type PresentationState =
  | LobbyPresentation
  | FeudPresentation
  | SpinPresentation;

interface FeudBoardInput {
  room: RoomSnapshot;
  config: FeudGameConfig;
  round: number;
  multiplier: number;
  question: { prompt: string; answers: FeudAnswer[] };
  revealed: number[];
  strikes: number;
  scores: [number, number];
  roundPot: number;
  winner: { name: string; score: number } | null;
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

export function createLobbyPresentation(room: RoomSnapshot): LobbyPresentation {
  return {
    mode: "lobby",
    code: room.code,
    game: room.config.kind === "feud" ? "Family Feud" : "Spin & Solve",
    teamOne: room.config.teamOne,
    teamTwo: room.config.teamTwo,
    participants: room.participants.map(({ name, team }) => ({ name, team })),
  };
}

export function createFeudPresentation(
  input: FeudBoardInput,
): FeudPresentation {
  const activePlayer = input.room.participants.find(
    (participant) => participant.id === input.room.playPass.activePlayerId,
  );
  return {
    mode: "feud",
    code: input.room.code,
    teamOne: input.config.teamOne,
    teamTwo: input.config.teamTwo,
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
    scores: [...input.scores],
    roundPot: input.roundPot,
    buzzer: {
      status: input.room.buzzer.status,
      winner: input.room.buzzer.winner
        ? {
            playerName: input.room.buzzer.winner.playerName,
            team: input.room.buzzer.winner.team,
          }
        : null,
    },
    decision: {
      status: input.room.playPass.status,
      activePlayerName: activePlayer?.name ?? null,
      choice: input.room.playPass.decision,
      controllingTeam: input.room.playPass.controllingTeam,
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
    config: { ...room.config },
    game: { ...room.game },
  };
}

export function presenterRoomCode(): string | null {
  const code =
    new URLSearchParams(window.location.search)
      .get("present")
      ?.trim()
      .toUpperCase() ?? "";
  return /^[A-Z0-9]{5}$/.test(code) ? code : null;
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
