import type { RoomPhase } from "../src/roomTypes.js";

export type RoomConnectionDiagnostic = {
  event:
    | "disconnected"
    | "recovered"
    | "recovery-failed"
    | "recovery-expired";
  role: "host" | "player";
  roomCode: string;
  phase: RoomPhase;
  reason?: string;
  recoveryDurationMs?: number;
};

export function writeRoomConnectionDiagnostic(
  diagnostic: RoomConnectionDiagnostic,
  write: (message: string) => void = console.info,
): void {
  write(JSON.stringify({
    source: "room-connection",
    ...diagnostic,
    recordedAt: new Date().toISOString(),
  }));
}
