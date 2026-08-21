import type { Participant, TeamId } from "./roomTypes.js";

export interface FeudTeamTurnState {
  order: string[];
  currentPlayerId: string | null;
}

export interface FeudTurnState {
  activeTeam: TeamId | null;
  teams: Record<TeamId, FeudTeamTurnState>;
}

export interface FeudTeamTurnView extends FeudTeamTurnState {
  nextPlayerId: string | null;
}

export interface FeudTurnOrderView {
  activeTeam: TeamId | null;
  teams: Record<TeamId, FeudTeamTurnView>;
}

const teams: TeamId[] = ["one", "two"];

function nextEligiblePlayer(
  order: string[],
  afterPlayerId: string | null,
  eligiblePlayerIds: ReadonlySet<string>,
): string | null {
  if (!order.length || !eligiblePlayerIds.size) return null;
  const currentIndex = afterPlayerId ? order.indexOf(afterPlayerId) : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(currentIndex + offset + order.length) % order.length];
    if (eligiblePlayerIds.has(candidate)) return candidate;
  }
  return null;
}

export function createFeudTurnState(
  participants: Participant[],
  representatives: Record<TeamId, string | null>,
  connectedPlayerIds: ReadonlySet<string>,
): FeudTurnState {
  const state: FeudTurnState = {
    activeTeam: null,
    teams: {
      one: { order: [], currentPlayerId: null },
      two: { order: [], currentPlayerId: null },
    },
  };

  for (const team of teams) {
    const order = participants
      .filter((participant) => participant.team === team)
      .map((participant) => participant.id);
    state.teams[team] = {
      order,
      currentPlayerId: nextEligiblePlayer(
        order,
        representatives[team],
        connectedPlayerIds,
      ),
    };
  }
  return state;
}

export function repairFeudTurnState(
  state: FeudTurnState,
  participants: Participant[],
  connectedPlayerIds: ReadonlySet<string>,
): FeudTurnState {
  const nextState: FeudTurnState = {
    activeTeam: state.activeTeam,
    teams: {
      one: { ...state.teams.one, order: [...state.teams.one.order] },
      two: { ...state.teams.two, order: [...state.teams.two.order] },
    },
  };

  for (const team of teams) {
    const rosterIds = participants
      .filter((participant) => participant.team === team)
      .map((participant) => participant.id);
    const rosterSet = new Set(rosterIds);
    const previous = state.teams[team];
    const order = previous.order.filter((participantId) => rosterSet.has(participantId));
    for (const participantId of rosterIds) {
      if (!order.includes(participantId)) order.push(participantId);
    }

    let currentPlayerId = previous.currentPlayerId;
    if (
      !currentPlayerId ||
      !order.includes(currentPlayerId) ||
      !connectedPlayerIds.has(currentPlayerId)
    ) {
      currentPlayerId = nextEligiblePlayer(
        previous.order,
        previous.currentPlayerId,
        new Set(order.filter((participantId) => connectedPlayerIds.has(participantId))),
      );
      if (!currentPlayerId) {
        currentPlayerId = nextEligiblePlayer(order, null, connectedPlayerIds);
      }
    }

    nextState.teams[team] = { order, currentPlayerId };
  }
  return nextState;
}

export function seedFeudTurnsAfterRepresentatives(
  state: FeudTurnState,
  representatives: Record<TeamId, string | null>,
  connectedPlayerIds: ReadonlySet<string>,
): FeudTurnState {
  const nextState: FeudTurnState = {
    activeTeam: state.activeTeam,
    teams: {
      one: { ...state.teams.one, order: [...state.teams.one.order] },
      two: { ...state.teams.two, order: [...state.teams.two.order] },
    },
  };
  for (const team of teams) {
    nextState.teams[team].currentPlayerId = nextEligiblePlayer(
      nextState.teams[team].order,
      representatives[team],
      connectedPlayerIds,
    );
  }
  return nextState;
}

export function activateFeudTurnTeam(
  state: FeudTurnState,
  team: TeamId,
): FeudTurnState {
  return { ...state, activeTeam: team };
}

export function deactivateFeudTurns(state: FeudTurnState): FeudTurnState {
  return { ...state, activeTeam: null };
}

export function advanceFeudTurn(
  state: FeudTurnState,
  connectedPlayerIds: ReadonlySet<string>,
): FeudTurnState {
  const team = state.activeTeam;
  if (!team) return state;
  const current = state.teams[team];
  return {
    ...state,
    teams: {
      ...state.teams,
      [team]: {
        ...current,
        order: [...current.order],
        currentPlayerId: nextEligiblePlayer(
          current.order,
          current.currentPlayerId,
          connectedPlayerIds,
        ),
      },
    },
  };
}

export function selectFeudTurnPlayer(
  state: FeudTurnState,
  team: TeamId,
  participantId: string,
): FeudTurnState {
  return {
    ...state,
    teams: {
      ...state.teams,
      [team]: {
        ...state.teams[team],
        order: [...state.teams[team].order],
        currentPlayerId: participantId,
      },
    },
  };
}

export function viewFeudTurnOrder(
  state: FeudTurnState,
  connectedPlayerIds: ReadonlySet<string>,
): FeudTurnOrderView {
  const teamView = (team: TeamId): FeudTeamTurnView => {
    const current = state.teams[team];
    const order = current.order.filter((participantId) =>
      connectedPlayerIds.has(participantId),
    );
    return {
      order,
      currentPlayerId:
        current.currentPlayerId && connectedPlayerIds.has(current.currentPlayerId)
          ? current.currentPlayerId
          : null,
      nextPlayerId: nextEligiblePlayer(
        current.order,
        current.currentPlayerId,
        connectedPlayerIds,
      ),
    };
  };

  return {
    activeTeam: state.activeTeam,
    teams: { one: teamView("one"), two: teamView("two") },
  };
}
