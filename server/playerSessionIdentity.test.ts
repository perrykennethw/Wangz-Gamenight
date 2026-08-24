import assert from "node:assert/strict";
import {
  LEGACY_PLAYER_SESSION_STORAGE_KEY,
  PLAYER_SESSION_STORAGE_KEY,
  createPlayerSessionIdProvider,
} from "../src/playerSessionIdentity.js";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const generatedSessionId = "generated-session-12345";

const missingStorageValue = new MemoryStorage();
let missingCreateCalls = 0;
const getMissingSessionId = createPlayerSessionIdProvider({
  getStorage: () => missingStorageValue,
  createId: () => {
    missingCreateCalls += 1;
    return generatedSessionId;
  },
});
assert.equal(getMissingSessionId(), generatedSessionId);
assert.equal(getMissingSessionId(), generatedSessionId);
assert.equal(missingCreateCalls, 1);
assert.equal(
  missingStorageValue.getItem(PLAYER_SESSION_STORAGE_KEY),
  generatedSessionId,
);

const validStorageValue = new MemoryStorage();
validStorageValue.setItem(PLAYER_SESSION_STORAGE_KEY, "returning-session-12345");
const getValidSessionId = createPlayerSessionIdProvider({
  getStorage: () => validStorageValue,
  createId: () => {
    throw new Error("A valid stored ID should not be replaced.");
  },
});
assert.equal(getValidSessionId(), "returning-session-12345");

const malformedStorageValue = new MemoryStorage();
malformedStorageValue.setItem(PLAYER_SESSION_STORAGE_KEY, "invalid value");
const getReplacementSessionId = createPlayerSessionIdProvider({
  getStorage: () => malformedStorageValue,
  createId: () => generatedSessionId,
});
assert.equal(getReplacementSessionId(), generatedSessionId);
assert.equal(
  malformedStorageValue.getItem(PLAYER_SESSION_STORAGE_KEY),
  generatedSessionId,
);

const legacyStorageValue = new MemoryStorage();
legacyStorageValue.setItem(
  LEGACY_PLAYER_SESSION_STORAGE_KEY,
  "legacy-session-12345",
);
const getMigratedSessionId = createPlayerSessionIdProvider({
  getStorage: () => legacyStorageValue,
  createId: () => {
    throw new Error("A valid legacy ID should be migrated.");
  },
});
assert.equal(getMigratedSessionId(), "legacy-session-12345");
assert.equal(
  legacyStorageValue.getItem(PLAYER_SESSION_STORAGE_KEY),
  "legacy-session-12345",
);
assert.equal(
  legacyStorageValue.getItem(LEGACY_PLAYER_SESSION_STORAGE_KEY),
  null,
);

const throwingReadStorage = new MemoryStorage();
throwingReadStorage.getItem = () => {
  throw new Error("Storage reads are blocked.");
};
throwingReadStorage.setItem = () => {
  throw new Error("Storage writes are blocked too.");
};
let readFallbackCreateCalls = 0;
const getReadFallbackSessionId = createPlayerSessionIdProvider({
  getStorage: () => throwingReadStorage,
  createId: () => {
    readFallbackCreateCalls += 1;
    return generatedSessionId;
  },
});
assert.equal(getReadFallbackSessionId(), generatedSessionId);
assert.equal(getReadFallbackSessionId(), generatedSessionId);
assert.equal(readFallbackCreateCalls, 1);

const throwingWriteStorage = new MemoryStorage();
throwingWriteStorage.setItem = () => {
  throw new Error("Storage writes are blocked.");
};
let writeFallbackCreateCalls = 0;
const getWriteFallbackSessionId = createPlayerSessionIdProvider({
  getStorage: () => throwingWriteStorage,
  createId: () => {
    writeFallbackCreateCalls += 1;
    return generatedSessionId;
  },
});
assert.equal(getWriteFallbackSessionId(), generatedSessionId);
assert.equal(getWriteFallbackSessionId(), generatedSessionId);
assert.equal(writeFallbackCreateCalls, 1);

let unavailableStorageCreateCalls = 0;
const getUnavailableStorageSessionId = createPlayerSessionIdProvider({
  getStorage: () => {
    throw new Error("Session storage is unavailable.");
  },
  createId: () => {
    unavailableStorageCreateCalls += 1;
    return generatedSessionId;
  },
});
assert.equal(getUnavailableStorageSessionId(), generatedSessionId);
assert.equal(getUnavailableStorageSessionId(), generatedSessionId);
assert.equal(unavailableStorageCreateCalls, 1);

console.log(
  "Player session identity supports missing, returning, malformed, migrated, blocked-read, blocked-write, and unavailable storage.",
);
