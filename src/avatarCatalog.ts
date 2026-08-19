import { HOST_AVATAR_ID, type AvatarId, type Participant } from "./roomTypes";

export interface AvatarOption {
  id: AvatarId;
  label: string;
  url: string;
}

const baseUrl = (import.meta.env.VITE_AVATAR_BASE_URL ?? "").replace(/\/$/, "");
const objectKeys = (import.meta.env.VITE_AVATAR_KEYS ?? "")
  .split(",")
  .map((key: string) => key.trim())
  .filter(Boolean);

function labelFromKey(key: string, index: number): string {
  const filename = key.split("/").at(-1) ?? "";
  const label = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return label || `Avatar ${index + 1}`;
}

const configuredAvatars: AvatarOption[] = baseUrl
  ? objectKeys.map((key: string, index: number) => ({
      id: key,
      label: labelFromKey(key, index),
      url: `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`,
    }))
  : [];

const hostAvatar: AvatarOption | null = baseUrl
  ? configuredAvatars.find((avatar) => avatar.id === HOST_AVATAR_ID) ?? {
      id: HOST_AVATAR_ID,
      label: "Mudkip",
      url: `${baseUrl}/${encodeURIComponent(HOST_AVATAR_ID)}`,
    }
  : null;

export const avatarOptions = configuredAvatars.filter(
  (avatar) => avatar.id !== HOST_AVATAR_ID,
);

const avatarsById = new Map(
  [...configuredAvatars, ...(hostAvatar ? [hostAvatar] : [])].map((avatar) => [avatar.id, avatar]),
);
const selectableAvatarsById = new Map(avatarOptions.map((avatar) => [avatar.id, avatar]));

export function avatarFor(avatarId: AvatarId | null): AvatarOption | null {
  return avatarId ? avatarsById.get(avatarId) ?? null : null;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return `${words[0][0]}${words.length > 1 ? words.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
}

export function participantAvatar(participant: Pick<Participant, "avatarId">): AvatarOption | null {
  return avatarFor(participant.avatarId);
}

export function rememberedAvatarId(): AvatarId | null {
  const avatarId = window.localStorage.getItem("wangz-avatar-id");
  return avatarId ? selectableAvatarsById.get(avatarId)?.id ?? null : null;
}

export function rememberAvatarId(avatarId: AvatarId | null): void {
  if (avatarId) window.localStorage.setItem("wangz-avatar-id", avatarId);
  else window.localStorage.removeItem("wangz-avatar-id");
}
