export type RoomNoticeAction =
  | { type: "received"; message: string }
  | { type: "new-room-flow" }
  | { type: "room-created" }
  | { type: "room-joined" }
  | { type: "dismissed" };

export function roomNoticeReducer(
  notice: string,
  action: RoomNoticeAction,
): string {
  if (action.type === "received") return action.message;

  return "";
}
