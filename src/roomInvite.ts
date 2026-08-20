const ROOM_CODE_PATTERN = /^[A-Z0-9]{5}$/;

export function normalizeRoomCode(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? "";
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function roomCodeFromSearch(
  search: string,
  parameter: "join" | "present",
): string | null {
  return normalizeRoomCode(new URLSearchParams(search).get(parameter));
}

export function joinRoomCodeFromSearch(search: string): string | null {
  return roomCodeFromSearch(search, "join");
}

export function buildRoomInviteUrl(roomCode: string, baseUrl: string): string {
  const code = normalizeRoomCode(roomCode);
  if (!code) throw new Error("A room invitation requires a five-character room code.");

  const url = new URL(baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Room invitations require an HTTP or HTTPS URL.");
  }

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", code);
  return url.toString();
}

export function resolveRoomInviteUrl(
  roomCode: string,
  configuredBaseUrl: string | undefined,
  currentUrl: string,
): string {
  const configured = configuredBaseUrl?.trim();
  if (configured) {
    try {
      return buildRoomInviteUrl(roomCode, configured);
    } catch {
      // A bad optional override should not make the lobby unusable.
    }
  }
  return buildRoomInviteUrl(roomCode, currentUrl);
}

export function browserRoomInviteUrl(roomCode: string): string {
  return resolveRoomInviteUrl(
    roomCode,
    import.meta.env.VITE_PUBLIC_APP_URL,
    window.location.href,
  );
}

export function isLocalRoomInviteUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}
