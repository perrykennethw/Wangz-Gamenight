import type {
  FeudCommand,
  FeudGameConfig,
  FeudGameView,
  FeudQuestionResolutionView,
  TeamId,
} from "../src/roomTypes.js";
import { multiplierForRound } from "../src/feudScoring.js";

interface FeudQuestionState {
  revealed: number[];
  strikes: number;
  resolution: FeudQuestionResolutionView | null;
}

export interface FeudGameState {
  kind: "feud";
  round: number;
  activeQuestionIndex: number;
  questions: FeudQuestionState[];
  scores: Record<TeamId, number>;
  winnerTeam: TeamId | null;
}

export type FeudGameResult =
  | { ok: true; state: FeudGameState }
  | { ok: false; error: string };

function cloneFeudGame(state: FeudGameState): FeudGameState {
  return {
    ...state,
    questions: state.questions.map((question) => ({
      revealed: [...question.revealed],
      strikes: question.strikes,
      resolution: question.resolution ? { ...question.resolution } : null,
    })),
    scores: { ...state.scores },
  };
}

function activeQuestion(
  state: FeudGameState,
  config: FeudGameConfig,
): { question: FeudGameConfig["pack"]["questions"][number]; progress: FeudQuestionState } {
  return {
    question: config.pack.questions[state.activeQuestionIndex],
    progress: state.questions[state.activeQuestionIndex],
  };
}

function roundPot(state: FeudGameState, config: FeudGameConfig): number {
  const { question, progress } = activeQuestion(state, config);
  const displayRound = progress.resolution?.round ?? state.round;
  return progress.revealed.reduce(
    (total, answerIndex) => total + question.answers[answerIndex].points * multiplierForRound(displayRound),
    0,
  );
}

function commandTargetsActiveQuestion(
  command: Exclude<FeudCommand, { type: "set-score" }>,
  state: FeudGameState,
): boolean {
  return state.activeQuestionIndex === command.questionIndex;
}

export function createFeudGame(config: FeudGameConfig): FeudGameState {
  return {
    kind: "feud",
    round: 1,
    activeQuestionIndex: 0,
    questions: config.pack.questions.map(() => ({
      revealed: [],
      strikes: 0,
      resolution: null,
    })),
    scores: { one: 0, two: 0 },
    winnerTeam: null,
  };
}

export function applyFeudCommand(
  state: FeudGameState,
  config: FeudGameConfig,
  command: FeudCommand,
): FeudGameResult {
  if (!command || typeof command !== "object" || typeof command.type !== "string") {
    return { ok: false, error: "Choose a valid Family Feud action." };
  }
  if (state.winnerTeam) {
    if (command.type === "finish-round") return { ok: true, state };
    return { ok: false, error: "This Family Feud game is complete." };
  }

  const next = cloneFeudGame(state);

  if (command.type === "set-score") {
    if ((command.team !== "one" && command.team !== "two") || !Number.isSafeInteger(command.score) || command.score < 0 || command.score > 9999) {
      return { ok: false, error: "Enter a whole-number score from 0 to 9999." };
    }
    next.scores[command.team] = command.score;
    return { ok: true, state: next };
  }

  if (!commandTargetsActiveQuestion(command, state)) {
    return { ok: false, error: "The active Family Feud question changed. Try that action again." };
  }

  const { question, progress } = activeQuestion(next, config);

  if (command.type === "reveal-answer") {
    if (!Number.isSafeInteger(command.answerIndex) || command.answerIndex < 0 || command.answerIndex >= question.answers.length) {
      return { ok: false, error: "Choose an answer on the active board." };
    }
    if (progress.resolution?.advanced) {
      return { ok: false, error: "Completed Family Feud rounds are read-only." };
    }
    if (!progress.revealed.includes(command.answerIndex)) progress.revealed.push(command.answerIndex);
    return { ok: true, state: next };
  }

  if (command.type === "set-strikes") {
    if (progress.resolution) {
      return { ok: false, error: "Strikes are locked after the round is awarded." };
    }
    if (!Number.isSafeInteger(command.strikes)) {
      return { ok: false, error: "Choose a valid strike count." };
    }
    progress.strikes = Math.max(0, Math.min(3, command.strikes));
    return { ok: true, state: next };
  }

  if (command.type === "award-round") {
    if (command.team !== "one" && command.team !== "two") {
      return { ok: false, error: "Choose the team that won the round." };
    }
    if (progress.resolution) {
      return progress.resolution.team === command.team
        ? { ok: true, state }
        : { ok: false, error: "This round was already awarded." };
    }
    const points = roundPot(next, config);
    if (points <= 0) return { ok: false, error: "Reveal an answer before awarding the round." };
    progress.resolution = {
      team: command.team,
      points,
      round: next.round,
      advanced: false,
    };
    next.scores[command.team] += points;
    return { ok: true, state: next };
  }

  if (command.type === "finish-round") {
    if (!progress.resolution || progress.resolution.advanced) {
      return { ok: false, error: "Award the active round before finishing it." };
    }
    if (next.scores[progress.resolution.team] >= config.winningScore) {
      next.winnerTeam = progress.resolution.team;
      return { ok: true, state: next };
    }
    if (next.activeQuestionIndex >= config.pack.questions.length - 1) {
      return { ok: false, error: "This is the final question in the game pack." };
    }
    progress.resolution.advanced = true;
    next.activeQuestionIndex += 1;
    next.round += 1;
    return { ok: true, state: next };
  }

  if (progress.resolution && !progress.resolution.advanced) {
    return { ok: false, error: "Finish the awarded round before changing questions." };
  }
  const nextQuestionIndex = next.activeQuestionIndex + command.direction;
  if (command.direction !== -1 && command.direction !== 1 || !config.pack.questions[nextQuestionIndex]) {
    return { ok: false, error: "There is no Family Feud question in that direction." };
  }
  next.activeQuestionIndex = nextQuestionIndex;
  return { ok: true, state: next };
}

export function viewFeudGame(
  state: FeudGameState,
  config: FeudGameConfig,
): FeudGameView {
  const progress = state.questions[state.activeQuestionIndex];
  return {
    kind: "feud",
    round: state.round,
    activeQuestionIndex: state.activeQuestionIndex,
    revealed: [...progress.revealed],
    strikes: progress.strikes,
    resolution: progress.resolution ? { ...progress.resolution } : null,
    scores: { ...state.scores },
    roundPot: roundPot(state, config),
    winnerTeam: state.winnerTeam,
  };
}
