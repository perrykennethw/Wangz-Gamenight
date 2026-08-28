import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { starterFeudPack } from "../src/gameData.js";
import type {
  ClientToServerEvents,
  GameConfig,
  HostRoomCreation,
  RoomResult,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from "../src/roomTypes.js";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const serverUrl = process.env.ROOM_SERVER_URL ?? "http://localhost:3001";
const config: GameConfig = {
  kind: "feud",
  teamOne: "Comets",
  teamTwo: "Rockets",
  winningScore: 300,
  pack: starterFeudPack,
};

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(serverUrl, {
      transports: ["websocket"],
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function result<T>(
  emit: (reply: (value: RoomResult<T>) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) =>
    emit((value) => (value.ok ? resolve(value.data) : reject(new Error(value.error)))),
  );
}

const createRoom = (socket: TestSocket) =>
  result<HostRoomCreation>((reply) => socket.emit("room:create", config, reply))
    .then((creation) => creation.room);
const sessionId = (name: string) => `turn-order-${name.toLowerCase()}-12345`;
const joinRoom = (
  socket: TestSocket,
  code: string,
  name: string,
  playerSessionId = sessionId(name),
) =>
  result<RoomSnapshot>((reply) =>
    socket.emit(
      "room:join",
      { code, name, avatarId: null, sessionId: playerSessionId },
      reply,
    ),
  );
const chooseTeam = (socket: TestSocket, team: TeamId) =>
  result<RoomSnapshot>((reply) => socket.emit("room:choose-team", team, reply));
const startGame = (socket: TestSocket) =>
  result<RoomSnapshot>((reply) => socket.emit("game:start", reply));
const armBuzzer = (socket: TestSocket) =>
  result<RoomSnapshot>((reply) => socket.emit("buzzer:arm", reply));
const pressBuzzer = (socket: TestSocket) =>
  result((reply) => socket.emit("buzzer:press", reply));
const openPoll = (socket: TestSocket, team: TeamId) =>
  result<RoomSnapshot>((reply) => socket.emit("feud:open-play-pass", { team }, reply));
const decide = (socket: TestSocket, choice: "play" | "pass") =>
  result<RoomSnapshot>((reply) => socket.emit("feud:decide-play-pass", choice, reply));
const advanceTurn = (socket: TestSocket) =>
  result<RoomSnapshot>((reply) => socket.emit("feud:advance-turn", reply));
const setTurnPlayer = (
  socket: TestSocket,
  team: TeamId,
  participantId: string,
) =>
  result<RoomSnapshot>((reply) =>
    socket.emit("feud:set-turn-player", { team, participantId }, reply),
  );
const endQuestion = (socket: TestSocket) =>
  result<RoomSnapshot>((reply) => socket.emit("feud:end-question", reply));
const settle = () => new Promise((resolve) => setTimeout(resolve, 35));

const [host, avery, bailey, casey, devon, ellis] = await Promise.all([
  connect(),
  connect(),
  connect(),
  connect(),
  connect(),
  connect(),
]);
const sockets = [host, avery, bailey, casey, devon, ellis];
const views = new Map<TestSocket, RoomSnapshot>();
for (const socket of sockets) {
  socket.on("room:snapshot", (snapshot) => views.set(socket, snapshot));
}

try {
  const created = await createRoom(host);
  const joined = new Map<string, RoomSnapshot>();
  for (const [socket, name, team] of [
    [avery, "Avery", "one"],
    [bailey, "Bailey", "one"],
    [casey, "Casey", "one"],
    [devon, "Devon", "two"],
    [ellis, "Ellis", "two"],
  ] as Array<[TestSocket, string, TeamId]>) {
    joined.set(name, await joinRoom(socket, created.code, name));
    await chooseTeam(socket, team);
  }

  const participantId = (name: string) => {
    const snapshot = joined.get(name);
    return snapshot?.viewer.role === "player" ? snapshot.viewer.participantId : "";
  };
  const ids = {
    avery: participantId("Avery"),
    bailey: participantId("Bailey"),
    casey: participantId("Casey"),
    devon: participantId("Devon"),
    ellis: participantId("Ellis"),
  };

  const started = await startGame(host);
  assert.deepEqual(started.feudTurns.teams.one, {
    order: [ids.avery, ids.bailey, ids.casey],
    currentPlayerId: ids.bailey,
    nextPlayerId: ids.casey,
  });
  assert.deepEqual(started.feudTurns.teams.two, {
    order: [ids.devon, ids.ellis],
    currentPlayerId: ids.ellis,
    nextPlayerId: ids.devon,
  });
  await assert.rejects(() => advanceTurn(avery), /only the host/i);
  await assert.rejects(() => advanceTurn(host), /finish Play or Pass/i);

  await armBuzzer(host);
  await pressBuzzer(avery);
  await openPoll(host, "one");
  const playing = await decide(avery, "play");
  assert.equal(playing.feudTurns.activeTeam, "one");
  assert.equal(playing.feudTurns.teams.one.currentPlayerId, ids.bailey);
  assert.equal(playing.feudTurns.teams.one.nextPlayerId, ids.casey);
  await settle();
  assert.equal(views.get(ellis)?.feudTurns.activeTeam, "one");
  assert.equal(views.get(casey)?.feudTurns.teams.one.currentPlayerId, ids.bailey);

  const advanced = await advanceTurn(host);
  assert.equal(advanced.feudTurns.teams.one.currentPlayerId, ids.casey);
  assert.equal(advanced.feudTurns.teams.one.nextPlayerId, ids.avery);
  await assert.rejects(
    () => setTurnPlayer(host, "one", ids.devon),
    /connected player from that team/i,
  );

  const overridden = await setTurnPlayer(host, "one", ids.bailey);
  assert.equal(overridden.feudTurns.teams.one.currentPlayerId, ids.bailey);
  const afterOverride = await advanceTurn(host);
  assert.equal(afterOverride.feudTurns.teams.one.currentPlayerId, ids.casey);

  casey.disconnect();
  await settle();
  assert.equal(views.get(host)?.feudTurns.teams.one.currentPlayerId, ids.avery);
  assert.deepEqual(views.get(host)?.feudTurns.teams.one.order, [ids.avery, ids.bailey]);

  const reconnectedCasey = await connect();
  sockets.push(reconnectedCasey);
  reconnectedCasey.on("room:snapshot", (snapshot) => views.set(reconnectedCasey, snapshot));
  const reconnected = await joinRoom(
    reconnectedCasey,
    created.code,
    "Casey",
    sessionId("Casey"),
  );
  assert.deepEqual(reconnected.feudTurns.teams.one.order, [
    ids.avery,
    ids.bailey,
    ids.casey,
  ]);
  assert.equal(reconnected.feudTurns.teams.one.currentPlayerId, ids.avery);
  assert.equal(reconnected.feudTurns.teams.one.nextPlayerId, ids.bailey);

  const ended = await endQuestion(host);
  assert.equal(ended.feudTurns.activeTeam, null);

  await armBuzzer(host);
  await pressBuzzer(avery);
  const openedForNonBuzzingTeam = await openPoll(host, "two");
  assert.equal(openedForNonBuzzingTeam.playPass.activePlayerId, ids.devon);
  assert.equal(openedForNonBuzzingTeam.buzzer.winner?.participantId, ids.avery);
  const played = await decide(devon, "play");
  assert.equal(played.feudTurns.activeTeam, "two");
  assert.equal(played.feudTurns.teams.two.currentPlayerId, ids.ellis);
  assert.equal(played.feudTurns.teams.two.nextPlayerId, ids.devon);

  console.log(
    "Family Feud turn order synchronizes Play/Pass activation and handoff, host advancement and overrides, disconnect skipping, and reconnect recovery.",
  );
} finally {
  for (const socket of sockets) socket.disconnect();
}
