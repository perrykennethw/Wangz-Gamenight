import assert from "node:assert/strict";
import {
  buildRoomInviteUrl,
  isLocalRoomInviteUrl,
  joinRoomCodeFromSearch,
  normalizeRoomCode,
  resolveRoomInviteUrl,
  roomCodeFromSearch,
} from "../src/roomInvite.js";

assert.equal(normalizeRoomCode(" bwfnn "), "BWFNN");
assert.equal(normalizeRoomCode("ABC1"), null);
assert.equal(normalizeRoomCode("ABC-1"), null);
assert.equal(normalizeRoomCode(null), null);

assert.equal(joinRoomCodeFromSearch("?join=bwfnn"), "BWFNN");
assert.equal(joinRoomCodeFromSearch("?join=ABC%201"), null);
assert.equal(joinRoomCodeFromSearch("?join=TOO-LONG"), null);
assert.equal(joinRoomCodeFromSearch("?present=BWFNN"), null);
assert.equal(roomCodeFromSearch("?present=bwfnn", "present"), "BWFNN");

const invite = new URL(
  buildRoomInviteUrl(
    "abc12",
    "https://host:secret@example.com/games/night?present=OLD12#moderator",
  ),
);
assert.equal(invite.toString(), "https://example.com/games/night?join=ABC12");
assert.equal(invite.username, "");
assert.equal(invite.password, "");
assert.equal(invite.searchParams.get("present"), null);
assert.equal(invite.hash, "");

assert.throws(
  () => buildRoomInviteUrl("ABCDE", "javascript:alert(1)"),
  /HTTP or HTTPS/,
);
assert.equal(
  resolveRoomInviteUrl("abc12", "not a url", "http://192.168.1.4:5173/?present=OLD12"),
  "http://192.168.1.4:5173/?join=ABC12",
);

assert.equal(isLocalRoomInviteUrl("http://localhost:5173/?join=ABCDE"), true);
assert.equal(isLocalRoomInviteUrl("http://127.0.0.1:5173/?join=ABCDE"), true);
assert.equal(isLocalRoomInviteUrl("http://192.168.1.4:5173/?join=ABCDE"), false);
assert.equal(isLocalRoomInviteUrl("https://games.example.com/?join=ABCDE"), false);

console.log("Room invite links normalize codes, strip private URL data, and fall back safely.");
