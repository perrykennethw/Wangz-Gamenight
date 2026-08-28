export type FeudTeamIndex = 0 | 1;

export interface FeudQuestionResolution {
  teamIndex: FeudTeamIndex;
  points: number;
  round: number;
  advanced: boolean;
}

export interface FeudQuestionProgress {
  revealed: number[];
  strikes: number;
  resolution: FeudQuestionResolution | null;
}

export interface FeudQuestionNavigationState {
  order: string[];
  activeQuestionId: string;
  questions: Record<string, FeudQuestionProgress>;
}

export type FeudQuestionNavigationAction =
  | { type: "navigate"; direction: -1 | 1 }
  | { type: "reveal"; answerIndex: number }
  | { type: "set-strikes"; strikes: number }
  | {
      type: "award";
      teamIndex: FeudTeamIndex;
      points: number;
      round: number;
    }
  | { type: "advance-award" };

const emptyQuestionProgress = (): FeudQuestionProgress => ({
  revealed: [],
  strikes: 0,
  resolution: null,
});

export function createFeudQuestionNavigationState(
  questionIds: string[],
): FeudQuestionNavigationState {
  if (questionIds.length === 0) {
    throw new Error("Family Feud question navigation requires at least one question.");
  }

  return {
    order: [...questionIds],
    activeQuestionId: questionIds[0],
    questions: Object.fromEntries(
      questionIds.map((questionId) => [questionId, emptyQuestionProgress()]),
    ),
  };
}

export function activeFeudQuestionIndex(
  state: FeudQuestionNavigationState,
): number {
  return state.order.indexOf(state.activeQuestionId);
}

export function activeFeudQuestionProgress(
  state: FeudQuestionNavigationState,
): FeudQuestionProgress {
  return state.questions[state.activeQuestionId];
}

function updateActiveQuestion(
  state: FeudQuestionNavigationState,
  progress: FeudQuestionProgress,
): FeudQuestionNavigationState {
  return {
    ...state,
    questions: {
      ...state.questions,
      [state.activeQuestionId]: progress,
    },
  };
}

export function feudQuestionNavigationReducer(
  state: FeudQuestionNavigationState,
  action: FeudQuestionNavigationAction,
): FeudQuestionNavigationState {
  const progress = activeFeudQuestionProgress(state);

  if (action.type === "navigate") {
    if (progress.resolution && !progress.resolution.advanced) return state;
    const nextIndex = activeFeudQuestionIndex(state) + action.direction;
    const nextQuestionId = state.order[nextIndex];
    return nextQuestionId
      ? { ...state, activeQuestionId: nextQuestionId }
      : state;
  }

  if (action.type === "reveal") {
    if (progress.resolution?.advanced || progress.revealed.includes(action.answerIndex)) {
      return state;
    }
    return updateActiveQuestion(state, {
      ...progress,
      revealed: [...progress.revealed, action.answerIndex],
    });
  }

  if (action.type === "set-strikes") {
    if (progress.resolution) return state;
    const strikes = Math.max(0, Math.min(3, action.strikes));
    return strikes === progress.strikes
      ? state
      : updateActiveQuestion(state, { ...progress, strikes });
  }

  if (action.type === "award") {
    if (progress.resolution || action.points <= 0) return state;
    return updateActiveQuestion(state, {
      ...progress,
      resolution: {
        teamIndex: action.teamIndex,
        points: action.points,
        round: action.round,
        advanced: false,
      },
    });
  }

  if (!progress.resolution || progress.resolution.advanced) return state;
  return updateActiveQuestion(state, {
    ...progress,
    resolution: { ...progress.resolution, advanced: true },
  });
}
