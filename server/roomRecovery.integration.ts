import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  GameConfig,
  HostRoomCreation,
  RoomRecoveryRequest,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from "../src/roomTypes.js";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const serverUrl = process.env.ROOM_SERVER_URL ?? "http://localhost:3001";
const config: GameConfig = {
  kind: "spin-solve",
  teamOne: "Comets",
  teamTwo: "Rockets",
  rounds: 3,
};

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(serverUrl, { transports: ["websocket"], forceNew: true });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function result<T>(emit: (reply: (value: RoomResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => emit((value) => (
    value.ok ? resolve(value.data) : reject(new Error(value.error))
  )));
}

const createRoom = (socket: TestSocket) =>
  result<HostRoomCreation>((reply) => socket.emit("room:create", config, reply));
const joinRoom = (socket: TestSocket, code: string, name: string, sessionId: string) =>
  result<RoomSnapshot>((reply) => socket.emit("room:join", {
    code,
    name,
    avatarId: null,
    sessionId,
  }, reply));
const chooseTeam = (socket: TestSocket, team: TeamId) =>
  result<RoomSnapshot>((reply) => socket.emit("room:choose-team", team, reply));
const recoverRoom = (socket: TestSocket, request: RoomRecoveryRequest) =>
  result<RoomSnapshot>((reply) => socket.emit("room:recover", request, reply));

function waitForSnapshot(
  socket: TestSocket,
  predicate: (snapshot: RoomSnapshot) => boolean,
): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("room:snapshot", onSnapshot);
      reject(new Error("Timed out waiting for the expected room snapshot."));
    }, 2_000);
    const onSnapshot = (snapshot: RoomSnapshot) => {
      if (!predicate(snapshot)) return;
      clearTimeout(timeout);
      socket.off("room:snapshot", onSnapshot);
      resolve(snapshot);
    };
    socket.on("room:snapshot", onSnapshot);
  });
}

const sockets: TestSocket[] = [];
const trackedConnect = async () => {
  const socket = await connect();
  sockets.push(socket);
  return socket;
};

try {
  const host = await trackedConnect();
  const player = await trackedConnect();
  const creation = await createRoom(host);
  const sessionId = "integration-recovery-player-12345";
  const joined = await joinRoom(player, creation.room.code, "Avery", sessionId);
  const assigned = await chooseTeam(player, "one");
  assert.equal(assigned.viewer.role === "player" ? assigned.viewer.team : null, "one");
  const participantId = joined.viewer.role === "player" ? joined.viewer.participantId : "";

  player.disconnect();
  const recoveredPlayerSocket = await trackedConnect();
  const recoveredPlayer = await recoverRoom(recoveredPlayerSocket, {
    role: "player",
    code: creation.room.code,
    sessionId,
  });
  assert.deepEqual(recoveredPlayer.viewer, {
    role: "player",
    participantId,
    team: "one",
  });
  assert.equal(
    recoveredPlayer.participants.filter((participant) => participant.id === participantId).length,
    1,
    "recovery must reclaim the existing seat rather than duplicate it",
  );

  const wrongCredentialSocket = await trackedConnect();
  await assert.rejects(() => recoverRoom(wrongCredentialSocket, {
    role: "host",
    code: creation.room.code,
    credential: "wrong-host-recovery-credential-abcdefghijklmnopqrstuvwxyz",
  }), /recovery expired/i);

  const hostReconnecting = waitForSnapshot(
    recoveredPlayerSocket,
    (snapshot) => snapshot.hostConnection.status === "reconnecting",
  );
  host.disconnect();
  const reconnectingSnapshot = await hostReconnecting;
  assert.ok(reconnectingSnapshot.hostConnection.recoveryDeadline);

  const recoveredHostSocket = await trackedConnect();
  const recoveredHost = await recoverRoom(recoveredHostSocket, {
    role: "host",
    code: creation.room.code,
    credential: creation.recoveryCredential,
  });
  assert.equal(recoveredHost.viewer.role, "host");
  assert.equal(recoveredHost.hostConnection.status, "connected");
  assert.equal(recoveredHost.participants[0]?.id, participantId);
  assert.equal(JSON.stringify(recoveredHost).includes(creation.recoveryCredential), false);
  assert.equal(JSON.stringify(recoveredPlayer).includes(sessionId), false);

  recoveredHostSocket.emit("room:leave");
  const expiredSocket = await trackedConnect();
  await assert.rejects(() => recoverRoom(expiredSocket, {
    role: "host",
    code: creation.room.code,
    credential: creation.recoveryCredential,
  }), /recovery expired/i);

  console.log("Host and player sessions recover without duplicate seats or credential disclosure.");
} finally {
  for (const socket of sockets) socket.disconnect();
}
