import { normalizeAvatarId } from "./avatarId.js";
import { HOST_AVATAR_ID, type AvatarId } from "./roomTypes.js";

export const PLAYER_IDENTITY_STORAGE_KEY = "wangz-player-identity-v1";
export const LEGACY_AVATAR_STORAGE_KEY = "wangz-avatar-id";
export const MAX_PLAYER_NAME_LENGTH = 24;

export interface PlayerIdentityPreference {
  name: string;
  avatarId: AvatarId | null;
}

interface IdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): IdentityStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= MAX_PLAYER_NAME_LENGTH ? name : null;
}

function normalizedAvatarId(value: unknown): AvatarId | null {
  try {
    const avatarId = normalizeAvatarId(value);
    return avatarId === HOST_AVATAR_ID ? null : avatarId;
  } catch {
    return null;
  }
}

export function readPlayerIdentityPreference(
  storage: IdentityStorage | null = browserStorage(),
): PlayerIdentityPreference | null {
  if (!storage) return null;

  try {
    const value = storage.getItem(PLAYER_IDENTITY_STORAGE_KEY);
    if (!value) return null;
    const candidate = JSON.parse(value) as Record<string, unknown> | null;
    const name = normalizedName(candidate?.name);
    if (!name) return null;
    return {
      name,
      avatarId: normalizedAvatarId(candidate?.avatarId),
    };
  } catch {
    return null;
  }
}

export function rememberPlayerIdentity(
  name: string,
  avatarId: AvatarId | null,
  storage: IdentityStorage | null = browserStorage(),
): PlayerIdentityPreference | null {
  const normalized = normalizedName(name);
  if (!storage || !normalized) return null;

  const preference = {
    name: normalized,
    avatarId: normalizedAvatarId(avatarId),
  } satisfies PlayerIdentityPreference;

  try {
    storage.setItem(PLAYER_IDENTITY_STORAGE_KEY, JSON.stringify(preference));
    if (preference.avatarId) {
      storage.setItem(LEGACY_AVATAR_STORAGE_KEY, preference.avatarId);
    } else {
      storage.removeItem(LEGACY_AVATAR_STORAGE_KEY);
    }
    return preference;
  } catch {
    return null;
  }
}

export function forgetPlayerIdentity(
  storage: IdentityStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(PLAYER_IDENTITY_STORAGE_KEY);
    storage.removeItem(LEGACY_AVATAR_STORAGE_KEY);
  } catch {
    // Joining still works when a browser blocks device storage.
  }
}

export function updateRememberedAvatar(
  avatarId: AvatarId | null,
  storage: IdentityStorage | null = browserStorage(),
): void {
  if (!storage) return;

  const preference = readPlayerIdentityPreference(storage);
  if (preference) rememberPlayerIdentity(preference.name, avatarId, storage);

  try {
    const normalized = normalizedAvatarId(avatarId);
    if (normalized) storage.setItem(LEGACY_AVATAR_STORAGE_KEY, normalized);
    else storage.removeItem(LEGACY_AVATAR_STORAGE_KEY);
  } catch {
    // Avatar persistence is optional and should never block play.
  }
}
