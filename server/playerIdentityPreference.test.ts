import assert from "node:assert/strict";
import {
  LEGACY_AVATAR_STORAGE_KEY,
  PLAYER_IDENTITY_STORAGE_KEY,
  forgetPlayerIdentity,
  readPlayerIdentityPreference,
  rememberPlayerIdentity,
  updateRememberedAvatar,
} from "../src/playerIdentityPreference.js";
import { HOST_AVATAR_ID } from "../src/roomTypes.js";

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

const firstVisit = new MemoryStorage();
assert.equal(readPlayerIdentityPreference(firstVisit), null);

const returningPlayer = new MemoryStorage();
assert.deepEqual(
  rememberPlayerIdentity("  Avery Wang  ", "contestants/Space Cat.webp", returningPlayer),
  { name: "Avery Wang", avatarId: "contestants/Space Cat.webp" },
);
assert.deepEqual(readPlayerIdentityPreference(returningPlayer), {
  name: "Avery Wang",
  avatarId: "contestants/Space Cat.webp",
});
assert.equal(
  returningPlayer.getItem(LEGACY_AVATAR_STORAGE_KEY),
  "contestants/Space Cat.webp",
);

rememberPlayerIdentity("Avery W.", null, returningPlayer);
assert.deepEqual(readPlayerIdentityPreference(returningPlayer), {
  name: "Avery W.",
  avatarId: null,
});
assert.equal(returningPlayer.getItem(LEGACY_AVATAR_STORAGE_KEY), null);

updateRememberedAvatar("contestants/Disco Ball.webp", returningPlayer);
assert.deepEqual(readPlayerIdentityPreference(returningPlayer), {
  name: "Avery W.",
  avatarId: "contestants/Disco Ball.webp",
});

forgetPlayerIdentity(returningPlayer);
assert.equal(readPlayerIdentityPreference(returningPlayer), null);
assert.equal(returningPlayer.getItem(LEGACY_AVATAR_STORAGE_KEY), null);

const invalidStoredValues = [
  "not-json",
  JSON.stringify({ name: "" }),
  JSON.stringify({ name: "A".repeat(25), avatarId: null }),
  JSON.stringify({ name: 42, avatarId: null }),
];
for (const value of invalidStoredValues) {
  const storage = new MemoryStorage();
  storage.setItem(PLAYER_IDENTITY_STORAGE_KEY, value);
  assert.equal(readPlayerIdentityPreference(storage), null);
}

for (const invalidAvatarId of [
  "contestants/../private.webp",
  "https://example.com/avatar.webp",
  HOST_AVATAR_ID,
  42,
]) {
  const storage = new MemoryStorage();
  storage.setItem(
    PLAYER_IDENTITY_STORAGE_KEY,
    JSON.stringify({ name: "Casey", avatarId: invalidAvatarId }),
  );
  assert.deepEqual(readPlayerIdentityPreference(storage), {
    name: "Casey",
    avatarId: null,
  });
}

console.log(
  "Player identity preferences support first-time, returning, edited, cleared, and invalid device data.",
);
