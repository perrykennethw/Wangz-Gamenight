import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  FeudCommand,
  GameConfig,
  HostRoomCreation,
  RoomResult,
  RoomRecoveryRequest,
  RoomSnapshot,
  ServerToClientEvents,
  TeamId,
} from "../src/roomTypes.js";

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const serverUrl = process.env.ROOM_SERVER_URL ?? "http://localhost:3001";
const config: GameConfig = {
  kind: "feud",
  teamOne: "Alpha",
  teamTwo: "Beta",
  winningScore: 100,
  pack: {
    version: 1,
    kind: "feud",
    title: "Recovery regression",
    questions: [
      {
        id: "question-one",
        prompt: "Name something worth 34 points.",
        answers: [{ id: "answer-34", label: "A reliable reload", points: 34 }],
      },
      {
        id: "question-two",
        prompt: "Name the question shown after recovery.",
        answers: [{ id: "answer-two", label: "Question two", points: 20 }],
      },
    ],
  },
};

function connect(): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(serverUrl, { transports: ["websocket"], forceNew: true });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function result<T>(emit: (reply: (value: RoomResult<T>) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the room command.")), 2_000);
    emit((value) => {
      clearTimeout(timeout);
      if (value.ok) resolve(value.data);
      else reject(new Error(value.error));
    });
  });
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
const startGame = (socket: TestSocket) =>
  result<RoomSnapshot>((reply) => socket.emit("game:start", reply));
const feudAction = (socket: TestSocket, command: FeudCommand) =>
  result<RoomSnapshot>((reply) => socket.emit("feud:action", command, reply));
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
  const alpha = await trackedConnect();
  const beta = await trackedConnect();
  const creation = await createRoom(host);

  await joinRoom(alpha, creation.room.code, "Avery", "feud-recovery-alpha-session");
  await chooseTeam(alpha, "one");
  await joinRoom(beta, creation.room.code, "Blake", "feud-recovery-beta-session");
  await chooseTeam(beta, "two");

  const started = await startGame(host);
  assert.equal(started.game?.kind, "feud", "starting Family Feud creates an authoritative game view");

  await feudAction(host, { type: "reveal-answer", questionIndex: 0, answerIndex: 0 });
  await feudAction(host, { type: "set-strikes", questionIndex: 0, strikes: 2 });
  await feudAction(host, { type: "award-round", questionIndex: 0, team: "one" });
  const advanced = await feudAction(host, { type: "finish-round", questionIndex: 0 });
  assert.deepEqual(advanced.game, {
    kind: "feud",
    round: 2,
    activeQuestionIndex: 1,
    revealed: [],
    strikes: 0,
    resolution: null,
    scores: { one: 34, two: 0 },
    roundPot: 0,
    winnerTeam: null,
  });

  const hostReconnecting = waitForSnapshot(
    alpha,
    (snapshot) => snapshot.hostConnection.status === "reconnecting",
  );
  host.disconnect();
  await hostReconnecting;

  const recoveredHostSocket = await trackedConnect();
  const recovered = await recoverRoom(recoveredHostSocket, {
    role: "host",
    code: creation.room.code,
    credential: creation.recoveryCredential,
  });
  assert.deepEqual(recovered.game, advanced.game, "host recovery preserves the exact active board and scores");

  const previous = await feudAction(recoveredHostSocket, {
    type: "navigate-question",
    questionIndex: 1,
    direction: -1,
  });
  assert.deepEqual(previous.game, {
    kind: "feud",
    round: 2,
    activeQuestionIndex: 0,
    revealed: [0],
    strikes: 2,
    resolution: {
      team: "one",
      points: 34,
      round: 1,
      advanced: true,
    },
    scores: { one: 34, two: 0 },
    roundPot: 34,
    winnerTeam: null,
  }, "completed board progress also survives recovery");

  await feudAction(recoveredHostSocket, {
    type: "navigate-question",
    questionIndex: 0,
    direction: 1,
  });
  await feudAction(recoveredHostSocket, { type: "set-score", team: "one", score: 80 });
  await feudAction(recoveredHostSocket, {
    type: "reveal-answer",
    questionIndex: 1,
    answerIndex: 0,
  });
  await feudAction(recoveredHostSocket, {
    type: "award-round",
    questionIndex: 1,
    team: "one",
  });
  const playerWinner = waitForSnapshot(
    alpha,
    (snapshot) => snapshot.game?.kind === "feud" && snapshot.game.winnerTeam === "one",
  );
  const completed = await feudAction(recoveredHostSocket, {
    type: "finish-round",
    questionIndex: 1,
  });
  const completedForPlayer = await playerWinner;
  assert.equal(completed.game?.kind === "feud" ? completed.game.scores.one : null, 100);
  assert.equal(completed.game?.kind === "feud" ? completed.game.winnerTeam : null, "one");
  assert.equal(
    completedForPlayer.game?.kind === "feud" ? completedForPlayer.game.winnerTeam : null,
    "one",
    "players receive the server-owned game winner",
  );

  console.log("Family Feud recovery preserves progress, and players receive the server-owned winner.");
} finally {
  for (const socket of sockets) socket.disconnect();
}
