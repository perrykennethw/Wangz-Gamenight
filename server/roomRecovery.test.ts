import assert from "node:assert/strict";
import {
  createRoomRecoveryStore,
  ROOM_RECOVERY_STORAGE_KEY,
} from "../src/roomRecovery.js";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const hostIntent = {
  role: "host" as const,
  code: "ABCDE",
  credential: "host-recovery-credential-1234567890",
};
const playerIntent = {
  role: "player" as const,
  code: "FGHJK",
  sessionId: "player-session-12345",
};

{
  const storage = new MemoryStorage();
  const store = createRoomRecoveryStore(() => storage);
  store.write(hostIntent);
  assert.deepEqual(store.read(), hostIntent);
  store.write(playerIntent);
  assert.deepEqual(store.read(), playerIntent);
  store.clear();
  assert.equal(store.read(), null);
}

{
  const storage = new MemoryStorage();
  storage.setItem(ROOM_RECOVERY_STORAGE_KEY, "not json");
  const store = createRoomRecoveryStore(() => storage);
  assert.equal(store.read(), null);
  assert.equal(storage.getItem(ROOM_RECOVERY_STORAGE_KEY), null);
}

{
  const storage = new MemoryStorage();
  storage.setItem(ROOM_RECOVERY_STORAGE_KEY, JSON.stringify({
    role: "host",
    code: "OTHER",
    credential: "short",
  }));
  const store = createRoomRecoveryStore(() => storage);
  assert.equal(store.read(), null);
  assert.equal(storage.getItem(ROOM_RECOVERY_STORAGE_KEY), null);
}

{
  const blocked = createRoomRecoveryStore(() => {
    throw new Error("storage blocked");
  });
  assert.equal(blocked.read(), null);
  blocked.write(hostIntent);
  blocked.clear();
}

console.log("Room recovery storage validates, persists, clears, and fails safely.");
