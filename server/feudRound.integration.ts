import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { starterFeudPack } from "../src/gameData.js";
import type {
  ClientToServerEvents,
  FeudRoundCommand,
  GameConfig,
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
    const socket: TestSocket = io(serverUrl, { transports: ["websocket"], forceNew: true });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function result<T>(emit: (reply: (value: RoomResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    emit((value) => value.ok ? resolve(value.data) : reject(new Error(value.error))),
  );
}

const createRoom = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit("room:create", config, reply));
const joinRoom = (socket: TestSocket, code: string, name: string, sessionId: string) =>
  result<RoomSnapshot>((reply) => socket.emit("room:join", { code, name, avatarId: null, sessionId }, reply));
const chooseTeam = (socket: TestSocket, team: TeamId) =>
  result<RoomSnapshot>((reply) => socket.emit("room:choose-team", team, reply));
const startGame = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit("game:start", reply));
const arm = (socket: TestSocket) => result<RoomSnapshot>((reply) => socket.emit("buzzer:arm", reply));
const buzz = (socket: TestSocket) => result((reply) => socket.emit("buzzer:press", reply));
const openPoll = (socket: TestSocket, team: TeamId) => result<RoomSnapshot>((reply) => socket.emit("feud:open-play-pass", { team }, reply));
const decide = (socket: TestSocket, choice: "play" | "pass") => result<RoomSnapshot>((reply) => socket.emit("feud:decide-play-pass", choice, reply));
const action = (socket: TestSocket, command: FeudRoundCommand) =>
  result<RoomSnapshot>((reply) => socket.emit("feud:round-action", command, reply));
const settle = () => new Promise((resolve) => setTimeout(resolve, 35));

const [host, one, two] = await Promise.all([connect(), connect(), connect()]);
const sockets = [host, one, two];
const views = new Map<TestSocket, RoomSnapshot>();
for (const socket of sockets) socket.on("room:snapshot", (snapshot) => views.set(socket, snapshot));

try {
  const created = await createRoom(host);
  const oneSession = "feud-round-one-session-12345";
  await joinRoom(one, created.code, "Avery", oneSession);
  await joinRoom(two, created.code, "Blake", "feud-round-two-session-12345");
  await chooseTeam(one, "one");
  await chooseTeam(two, "two");
  const started = await startGame(host);
  assert.equal(started.game?.kind, "feud");
  assert.equal(started.game?.kind === "feud" ? started.game.strikes : null, 0);
  await assert.rejects(
    () => action(host, { type: "add-strike" }),
    /finish Play or Pass/i,
  );

  await arm(host);
  await buzz(one);
  await openPoll(host, "one");
  const controlled = await decide(one, "play");
  assert.equal(controlled.game?.kind === "feud" ? controlled.game.controllingTeam : null, "one");
  assert.equal(controlled.feudTurns.activeTeam, "one");
  await assert.rejects(() => action(one, { type: "add-strike" }), /only the host/i);

  const override = await action(host, { type: "set-control", team: "two" });
  assert.equal(override.game?.kind === "feud" ? override.game.controllingTeam : null, "two");
  assert.equal(override.feudTurns.activeTeam, "two");
  assert.equal(override.chat.lockedTeam, "two");
  await action(host, { type: "set-control", team: "one" });

  const faceoffStrikeRevision = override.game?.kind === "feud" ? override.game.strikeRevision : -1;
  await action(host, { type: "reveal-answer", index: 0 });
  await action(host, { type: "add-strike" });
  const warning = await action(host, { type: "add-strike" });
  assert.equal(warning.game?.kind === "feud" ? warning.game.strikes : null, 2);
  assert.equal(warning.game?.kind === "feud" ? warning.game.phase : null, "playing");
  assert.equal(warning.game?.kind === "feud" ? warning.game.strikeRevision : -1, faceoffStrikeRevision + 2);
  await settle();
  const oneView = views.get(one)?.game;
  const twoView = views.get(two)?.game;
  assert.equal(oneView?.kind === "feud" ? oneView.strikes : null, 2);
  assert.equal(twoView?.kind === "feud" ? twoView.originalControllingTeam : null, "one");

  one.disconnect();
  const reconnectedOne = await connect();
  sockets.push(reconnectedOne);
  const reconnected = await joinRoom(reconnectedOne, created.code, "Avery", oneSession);
  assert.equal(reconnected.game?.kind === "feud" ? reconnected.game.strikes : null, 2);
  assert.equal(reconnected.game?.kind === "feud" ? reconnected.game.roundPot : null, starterFeudPack.questions[0].answers[0].points);

  const steal = await action(host, { type: "add-strike" });
  assert.equal(steal.game?.kind === "feud" ? steal.game.phase : null, "steal");
  assert.equal(steal.game?.kind === "feud" ? steal.game.selectedAwardTeam : null, "two");
  const failed = await action(host, { type: "set-steal-outcome", outcome: "failed" });
  assert.equal(failed.game?.kind === "feud" ? failed.game.selectedAwardTeam : null, "one");
  assert.deepEqual(failed.game?.kind === "feud" ? failed.game.scores : null, { one: 0, two: 0 });
  const corrected = await action(host, { type: "select-award-team", team: "two" });
  assert.deepEqual(corrected.game?.kind === "feud" ? corrected.game.scores : null, { one: 0, two: 0 });
  const confirmed = await action(host, { type: "confirm-award" });
  assert.equal(confirmed.game?.kind === "feud" ? confirmed.game.scores.two : null, starterFeudPack.questions[0].answers[0].points);
  assert.equal(confirmed.game?.kind === "feud" ? confirmed.game.round : null, 2);
  assert.equal(confirmed.game?.kind === "feud" ? confirmed.game.strikes : null, 0);
  assert.equal(confirmed.feudTurns.activeTeam, null);

  await action(host, { type: "set-control", team: "one" });
  await action(host, { type: "reveal-answer", index: 0 });
  await action(host, { type: "add-strike" });
  await action(host, { type: "add-strike" });
  await action(host, { type: "add-strike" });
  const successful = await action(host, { type: "set-steal-outcome", outcome: "success" });
  assert.equal(successful.game?.kind === "feud" ? successful.game.selectedAwardTeam : null, "two");

  console.log("Family Feud multiplayer state synchronizes control overrides, private steal cues, strikes, corrections, confirmation, rotation, authorization, and reconnect recovery.");
} finally {
  for (const socket of sockets) socket.disconnect();
}
