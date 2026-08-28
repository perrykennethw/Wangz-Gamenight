import assert from "node:assert/strict";
import {
  RoomClient,
  type RoomClientSocket,
  type RoomConnectionStatus,
} from "../src/roomClient.js";
import type { RoomRecoveryStore } from "../src/roomRecovery.js";
import type {
  GameConfig,
  JoinRoomDetails,
  RoomRecoveryRequest,
  RoomSnapshot,
} from "../src/roomTypes.js";

type Listener = (...args: unknown[]) => void;

const config: GameConfig = {
  kind: "spin-solve",
  teamOne: "Comets",
  teamTwo: "Rockets",
  rounds: 3,
};

function snapshot(
  viewer: RoomSnapshot["viewer"] = { role: "player", participantId: "player-1", team: "one" },
): RoomSnapshot {
  return {
    code: "ABCDE",
    phase: "playing",
    hostConnection: { status: "connected", recoveryDeadline: null },
    gameRevision: 1,
    config,
    participants: [],
    messages: [],
    teamChats: {},
    chat: { lockedTeam: null, reason: null },
    playPass: {
      status: "closed",
      team: null,
      activePlayerId: null,
      votes: { play: 0, pass: 0 },
      viewerVote: null,
      decision: null,
      controllingTeam: null,
    },
    feudTurns: {
      activeTeam: null,
      teams: {
        one: { order: [], currentPlayerId: null, nextPlayerId: null },
        two: { order: [], currentPlayerId: null, nextPlayerId: null },
      },
    },
    buzzer: { status: "idle", winner: null, representatives: { one: null, two: null } },
    timer: { status: "idle", durationSeconds: null, startedAt: null, deadline: null },
    viewer,
    game: null,
  };
}

class MemoryRecoveryStore implements RoomRecoveryStore {
  intent: RoomRecoveryRequest | null;
  writes: RoomRecoveryRequest[] = [];
  clears = 0;

  constructor(intent: RoomRecoveryRequest | null = null) {
    this.intent = intent;
  }

  read(): RoomRecoveryRequest | null {
    return this.intent;
  }

  write(intent: RoomRecoveryRequest): void {
    this.intent = intent;
    this.writes.push(intent);
  }

  clear(): void {
    this.intent = null;
    this.clears += 1;
  }
}

class FakeSocket {
  connected = false;
  readonly joinAttempts: JoinRoomDetails[] = [];
  readonly recoveryAttempts: RoomRecoveryRequest[] = [];
  leaveCommands = 0;
  recoveryResult: { ok: true; data: RoomSnapshot } | { ok: false; error: string } = {
    ok: true,
    data: snapshot(),
  };
  private readonly listeners = new Map<string, Set<Listener>>();

  connect(): this {
    this.connected = true;
    this.dispatch("connect");
    return this;
  }

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    if (event === "room:join") {
      const [details, reply] = args as [
        JoinRoomDetails,
        (result: { ok: true; data: RoomSnapshot }) => void,
      ];
      this.joinAttempts.push(details);
      reply({ ok: true, data: snapshot() });
    }

    if (event === "room:recover") {
      const [details, reply] = args as [
        RoomRecoveryRequest,
        (result: typeof this.recoveryResult) => void,
      ];
      this.recoveryAttempts.push(details);
      reply(this.recoveryResult);
    }

    if (event === "room:leave") this.leaveCommands += 1;
    return this;
  }

  dispatch(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  disconnectTransport(): void {
    this.connected = false;
    this.dispatch("disconnect", "transport close");
  }
}

{
  const intent: RoomRecoveryRequest = {
    role: "host",
    code: "ABCDE",
    credential: "host-recovery-credential-abcdefghijklmnopqrstuvwxyz",
  };
  const store = new MemoryRecoveryStore(intent);
  const socket = new FakeSocket();
  socket.recoveryResult = { ok: true, data: snapshot({ role: "host" }) };
  const client = new RoomClient(socket as unknown as RoomClientSocket, store);
  const statuses: RoomConnectionStatus[] = [];
  const recovered: RoomSnapshot[] = [];

  client.subscribe(() => {}, () => {}, (status) => statuses.push(status), (room) => recovered.push(room));

  assert.deepEqual(socket.recoveryAttempts, [intent]);
  assert.equal(recovered[0]?.viewer.role, "host");
  assert.equal(statuses.at(-1)?.state, "back-online");
  assert.deepEqual(store.intent, intent, "successful recovery keeps the credential for another refresh");
}

{
  const store = new MemoryRecoveryStore();
  const socket = new FakeSocket();
  const client = new RoomClient(socket as unknown as RoomClientSocket, store);
  const statuses: RoomConnectionStatus[] = [];
  client.subscribe(() => {}, () => {}, (status) => statuses.push(status));

  await client.joinRoom("ABCDE", "Avery", null);
  assert.equal(store.intent?.role, "player");
  assert.equal(store.writes.length, 1);
  socket.dispatch("connect");
  assert.equal(
    socket.recoveryAttempts.length,
    0,
    "the initial connection must not be mistaken for a recovery",
  );

  socket.disconnectTransport();
  assert.equal(statuses.at(-1)?.state, "reconnecting");
  socket.connect();
  assert.equal(socket.recoveryAttempts.length, 1);
  assert.equal(statuses.at(-1)?.state, "back-online");
}

{
  const intent: RoomRecoveryRequest = {
    role: "player",
    code: "ABCDE",
    sessionId: "player-session-avery-12345",
  };
  const store = new MemoryRecoveryStore(intent);
  const socket = new FakeSocket();
  socket.recoveryResult = { ok: false, error: "That recovery expired or is no longer available." };
  const client = new RoomClient(socket as unknown as RoomClientSocket, store);
  const closedMessages: string[] = [];

  client.subscribe(() => {}, (message) => closedMessages.push(message));

  assert.equal(store.intent, null);
  assert.equal(client.hasRecoveryIntent(), false);
  assert.match(closedMessages[0] ?? "", /Recovery expired/);
}

{
  const store = new MemoryRecoveryStore();
  const socket = new FakeSocket();
  const client = new RoomClient(socket as unknown as RoomClientSocket, store);
  client.subscribe(() => {}, () => {});
  await client.joinRoom("ABCDE", "Blake", null);

  socket.dispatch("room:closed", "The host closed this room.");
  assert.equal(client.hasRecoveryIntent(), false);

  await client.joinRoom("ABCDE", "Blake", null);
  client.leaveRoom();
  assert.equal(socket.leaveCommands, 1);
  assert.equal(client.hasRecoveryIntent(), false);
}

console.log("Room client persists, restores, expires, and explicitly clears recovery intent.");
