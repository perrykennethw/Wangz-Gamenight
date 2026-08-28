import { isValidPlayerSessionId } from "./playerSessionIdentity.js";
import type { RoomRecoveryRequest } from "./roomTypes.js";

export const ROOM_RECOVERY_STORAGE_KEY = "wangz-room-recovery-v1";

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomRecoveryStore {
  read(): RoomRecoveryRequest | null;
  write(intent: RoomRecoveryRequest): void;
  clear(): void;
}

function browserSessionStorage(): RecoveryStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{5}$/.test(value);
}

function isRecoveryCredential(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{32,128}$/.test(value);
}

export function parseRoomRecoveryIntent(value: unknown): RoomRecoveryRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!isRoomCode(candidate.code)) return null;

  if (candidate.role === "host" && isRecoveryCredential(candidate.credential)) {
    return {
      role: "host",
      code: candidate.code,
      credential: candidate.credential,
    };
  }

  if (candidate.role === "player" && isValidPlayerSessionId(candidate.sessionId)) {
    return {
      role: "player",
      code: candidate.code,
      sessionId: candidate.sessionId,
    };
  }

  return null;
}

export function createRoomRecoveryStore(
  getStorage: () => RecoveryStorage | null = browserSessionStorage,
): RoomRecoveryStore {
  return {
    read() {
      let storage: RecoveryStorage | null;
      try {
        storage = getStorage();
      } catch {
        return null;
      }
      if (!storage) return null;

      try {
        const serialized = storage.getItem(ROOM_RECOVERY_STORAGE_KEY);
        if (!serialized) return null;
        const intent = parseRoomRecoveryIntent(JSON.parse(serialized));
        if (!intent) storage.removeItem(ROOM_RECOVERY_STORAGE_KEY);
        return intent;
      } catch {
        try {
          storage.removeItem(ROOM_RECOVERY_STORAGE_KEY);
        } catch {
          // Recovery storage is optional and must never block normal entry.
        }
        return null;
      }
    },

    write(intent) {
      const normalized = parseRoomRecoveryIntent(intent);
      if (!normalized) return;
      try {
        getStorage()?.setItem(ROOM_RECOVERY_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        // Live play continues even when session storage is unavailable.
      }
    },

    clear() {
      try {
        getStorage()?.removeItem(ROOM_RECOVERY_STORAGE_KEY);
      } catch {
        // Explicit leave still succeeds when session storage is unavailable.
      }
    },
  };
}

export const roomRecoveryStore = createRoomRecoveryStore();
