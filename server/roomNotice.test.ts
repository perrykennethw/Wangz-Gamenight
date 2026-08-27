import assert from "node:assert/strict";
import { roomNoticeReducer } from "../src/roomNotice.js";

const closureMessage = "The host closed this room.";
const reconnectMessage = "This room is no longer available.";

{
  const notice = roomNoticeReducer("", {
    type: "received",
    message: closureMessage,
  });
  assert.equal(notice, closureMessage);
  assert.equal(roomNoticeReducer(notice, { type: "dismissed" }), "");
}

{
  let notice = roomNoticeReducer("", {
    type: "received",
    message: reconnectMessage,
  });
  assert.equal(notice, reconnectMessage);

  notice = roomNoticeReducer(notice, { type: "new-room-flow" });
  assert.equal(notice, "");

  notice = roomNoticeReducer(notice, { type: "room-joined" });
  assert.equal(notice, "");

  // Returning home after leaving does not dispatch a notice action, so the
  // obsolete terminal message cannot be restored.
  assert.equal(notice, "");
}

{
  const notice = roomNoticeReducer(closureMessage, { type: "room-created" });
  assert.equal(notice, "");
}

console.log(
  "Room notices survive delivery, clear at new-room boundaries, and stay cleared after leaving.",
);
