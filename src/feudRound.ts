import type {
  FeudGameConfig,
  FeudRoundCommand,
  FeudRoundView,
  TeamId,
} from "./roomTypes.js";

export type FeudRoundResult =
  | { ok: true; state: FeudRoundView; event: "updated" | "round-awarded" | "game-won" | "question-skipped" }
  | { ok: false; error: string };

export function multiplierForFeudRound(round: number): number {
  if (round >= 5) return 3;
  if (round >= 3) return 2;
  return 1;
}

export function createFeudRoundState(): FeudRoundView {
  return {
    kind: "feud",
    round: 1,
    questionIndex: 0,
    multiplier: 1,
    revealed: [],
    strikes: 0,
    strikeRevision: 0,
    phase: "faceoff",
    controllingTeam: null,
    originalControllingTeam: null,
    stealOutcome: null,
    selectedAwardTeam: null,
    scores: { one: 0, two: 0 },
    roundPot: 0,
    winnerTeam: null,
  };
}

export function otherFeudTeam(team: TeamId): TeamId {
  return team === "one" ? "two" : "one";
}

export function setFeudControl(state: FeudRoundView, team: TeamId): FeudRoundView {
  return {
    ...state,
    phase: state.strikes >= 3 ? "steal" : "playing",
    controllingTeam: team,
    originalControllingTeam: team,
    stealOutcome: null,
    selectedAwardTeam: state.strikes >= 3 ? otherFeudTeam(team) : team,
  };
}

function resetQuestion(state: FeudRoundView, questionIndex: number, round: number): FeudRoundView {
  return {
    ...state,
    round,
    questionIndex,
    multiplier: multiplierForFeudRound(round),
    revealed: [],
    strikes: 0,
    phase: "faceoff",
    controllingTeam: null,
    originalControllingTeam: null,
    stealOutcome: null,
    selectedAwardTeam: null,
    roundPot: 0,
  };
}

export function applyFeudRoundCommand(
  state: FeudRoundView,
  config: FeudGameConfig,
  command: FeudRoundCommand,
): FeudRoundResult {
  const question = config.pack.questions[state.questionIndex % config.pack.questions.length];
  if (!question) return { ok: false, error: "This game pack has no question to play." };

  if (command.type === "reveal-answer") {
    if (!Number.isInteger(command.index) || !question.answers[command.index]) {
      return { ok: false, error: "Choose an answer on the current board." };
    }
    if (state.revealed.includes(command.index)) {
      return { ok: false, error: "That answer is already revealed." };
    }
    return {
      ok: true,
      event: "updated",
      state: {
        ...state,
        revealed: [...state.revealed, command.index],
        roundPot: state.roundPot + question.answers[command.index].points * state.multiplier,
      },
    };
  }

  if (command.type === "add-strike") {
    if (state.strikes >= 3) return { ok: false, error: "The team already has three strikes." };
    const strikes = state.strikes + 1;
    return {
      ok: true,
      event: "updated",
      state: {
        ...state,
        strikes,
        strikeRevision: state.strikeRevision + 1,
        phase: strikes === 3 ? "steal" : state.phase,
        stealOutcome: strikes === 3 ? null : state.stealOutcome,
        selectedAwardTeam: strikes === 3 && state.originalControllingTeam
          ? otherFeudTeam(state.originalControllingTeam)
          : state.selectedAwardTeam,
      },
    };
  }

  if (command.type === "remove-strike") {
    if (state.strikes === 0) return { ok: false, error: "There are no strikes to remove." };
    const strikes = state.strikes - 1;
    return {
      ok: true,
      event: "updated",
      state: {
        ...state,
        strikes,
        phase: state.phase === "steal" ? "playing" : state.phase,
        stealOutcome: null,
        selectedAwardTeam: state.originalControllingTeam,
      },
    };
  }

  if (command.type === "set-control") {
    return { ok: true, event: "updated", state: setFeudControl(state, command.team) };
  }

  if (command.type === "set-steal-outcome") {
    if (state.phase !== "steal" || !state.originalControllingTeam) {
      return { ok: false, error: "A steal opportunity must be active first." };
    }
    const selectedAwardTeam = command.outcome === "success"
      ? otherFeudTeam(state.originalControllingTeam)
      : state.originalControllingTeam;
    return {
      ok: true,
      event: "updated",
      state: { ...state, stealOutcome: command.outcome, selectedAwardTeam },
    };
  }

  if (command.type === "select-award-team") {
    return { ok: true, event: "updated", state: { ...state, selectedAwardTeam: command.team } };
  }

  if (command.type === "adjust-score") {
    if (!Number.isFinite(command.change) || Math.abs(command.change) > 100) {
      return { ok: false, error: "Choose a valid score adjustment." };
    }
    return {
      ok: true,
      event: "updated",
      state: {
        ...state,
        scores: {
          ...state.scores,
          [command.team]: Math.max(0, state.scores[command.team] + command.change),
        },
      },
    };
  }

  if (command.type === "skip-question") {
    return {
      ok: true,
      event: "question-skipped",
      state: resetQuestion(state, (state.questionIndex + 1) % config.pack.questions.length, state.round),
    };
  }

  if (!state.selectedAwardTeam) {
    return { ok: false, error: "Choose which team receives the round before confirming." };
  }
  if (state.roundPot <= 0) {
    return { ok: false, error: "Reveal at least one answer before awarding the round." };
  }
  const awardedTeam = state.selectedAwardTeam;
  const scores = { ...state.scores, [awardedTeam]: state.scores[awardedTeam] + state.roundPot };
  if (scores[awardedTeam] >= config.winningScore) {
    return { ok: true, event: "game-won", state: { ...state, scores, winnerTeam: awardedTeam } };
  }
  return {
    ok: true,
    event: "round-awarded",
    state: resetQuestion(
      { ...state, scores },
      (state.questionIndex + 1) % config.pack.questions.length,
      state.round + 1,
    ),
  };
}
