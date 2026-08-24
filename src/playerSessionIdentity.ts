export const PLAYER_SESSION_STORAGE_KEY = "wangz-player-session-v1";
export const LEGACY_PLAYER_SESSION_STORAGE_KEY = "wangz-player-session";

interface SessionIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PlayerSessionIdProviderOptions {
  getStorage?: () => SessionIdentityStorage | null;
  createId?: () => string;
}

function browserSessionStorage(): SessionIdentityStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function isValidPlayerSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{10,100}$/.test(value);
}

function readStorage(
  storage: SessionIdentityStorage | null,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function persistSessionId(
  storage: SessionIdentityStorage | null,
  sessionId: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(PLAYER_SESSION_STORAGE_KEY, sessionId);
  } catch {
    return;
  }

  try {
    storage.removeItem(LEGACY_PLAYER_SESSION_STORAGE_KEY);
  } catch {
    // The versioned value is already safe to reuse.
  }
}

export function createPlayerSessionIdProvider({
  getStorage = browserSessionStorage,
  createId = () => crypto.randomUUID(),
}: PlayerSessionIdProviderOptions = {}): () => string {
  let inMemorySessionId: string | null = null;

  return () => {
    if (inMemorySessionId) return inMemorySessionId;

    let storage: SessionIdentityStorage | null;
    try {
      storage = getStorage();
    } catch {
      storage = null;
    }

    const storedSessionId = readStorage(storage, PLAYER_SESSION_STORAGE_KEY);
    if (isValidPlayerSessionId(storedSessionId)) {
      inMemorySessionId = storedSessionId;
      return storedSessionId;
    }

    const legacySessionId = readStorage(
      storage,
      LEGACY_PLAYER_SESSION_STORAGE_KEY,
    );
    if (isValidPlayerSessionId(legacySessionId)) {
      inMemorySessionId = legacySessionId;
      persistSessionId(storage, legacySessionId);
      return legacySessionId;
    }

    const createdSessionId = createId();
    if (!isValidPlayerSessionId(createdSessionId)) {
      throw new Error("Player session ID generation returned an invalid value.");
    }

    inMemorySessionId = createdSessionId;
    persistSessionId(storage, createdSessionId);
    return createdSessionId;
  };
}

export const getPlayerSessionId = createPlayerSessionIdProvider();
