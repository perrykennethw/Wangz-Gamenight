import assert from "node:assert/strict";
import { writeRoomConnectionDiagnostic } from "./roomDiagnostics.js";

const output: string[] = [];
writeRoomConnectionDiagnostic({
  event: "recovered",
  role: "host",
  roomCode: "ABCDE",
  phase: "playing",
  reason: "transport close",
  recoveryDurationMs: 742,
}, (message) => output.push(message));

assert.equal(output.length, 1);
const parsed = JSON.parse(output[0]) as Record<string, unknown>;
assert.equal(parsed.source, "room-connection");
assert.equal(parsed.event, "recovered");
assert.equal(parsed.role, "host");
assert.equal(parsed.roomCode, "ABCDE");
assert.equal(parsed.recoveryDurationMs, 742);
assert.equal("credential" in parsed, false);
assert.equal("sessionId" in parsed, false);
assert.equal("participantId" in parsed, false);
assert.equal("playerName" in parsed, false);

console.log("Room connection diagnostics remain structured and credential-free.");
