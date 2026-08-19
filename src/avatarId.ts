import type { AvatarId } from "./roomTypes.js";

const AVATAR_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/ -]{0,127}$/;

export function normalizeAvatarId(value: unknown): AvatarId | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("Choose a valid avatar.");

  const avatarId = value.trim();
  if (!AVATAR_ID_PATTERN.test(avatarId) || avatarId.includes("..")) {
    throw new Error("Choose a valid avatar.");
  }
  return avatarId;
}

export function isValidAvatarId(value: unknown): value is AvatarId {
  try {
    return normalizeAvatarId(value) !== null;
  } catch {
    return false;
  }
}
