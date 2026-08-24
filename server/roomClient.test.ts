import assert from "node:assert/strict";
import {
  RoomClient,
  type RoomClientSocket,
} from "../src/roomClient.js";
import type { JoinRoomDetails, RoomSnapshot } from "../src/roomTypes.js";

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  readonly joinAttempts: JoinRoomDetails[] = [];
  leaveCommands = 0;
  private readonly listeners = new Map<string, Set<Listener>>();

  connect(): this {
    this.connected = true;
    return this;
  }

  on(event: string, listener: Listener): this {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener): this {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): this {
    if (event === "room:join") {
      const [details, reply] = args as [
        JoinRoomDetails,
        (result: { ok: true; data: RoomSnapshot }) => void,
      ];
      this.joinAttempts.push(details);
      reply({ ok: true, data: {} as RoomSnapshot });
    }

    if (event === "room:leave") this.leaveCommands += 1;
    return this;
  }

  dispatch(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }
}

function createClient(): { client: RoomClient; socket: FakeSocket } {
  const socket = new FakeSocket();
  const client = new RoomClient(socket as unknown as RoomClientSocket);
  client.subscribe(() => {}, () => {});
  return { client, socket };
}

{
  const socket = new FakeSocket();
  const client = new RoomClient(socket as unknown as RoomClientSocket);
  const closedMessages: string[] = [];

  client.subscribe(
    () => {},
    (message) => {
      closedMessages.push(message);
      socket.dispatch("connect");
    },
  );
  await client.joinRoom("ABCDE", "Avery", null);

  socket.dispatch("connect");
  assert.equal(
    socket.joinAttempts.length,
    2,
    "a transient reconnect should attempt to resume the joined room",
  );

  const closureMessage = "The host closed this room.";
  socket.dispatch("room:closed", closureMessage);
  assert.deepEqual(closedMessages, [closureMessage]);
  assert.equal(
    socket.joinAttempts.length,
    2,
    "resume intent should be cleared before the room-closed callback runs",
  );

  socket.dispatch("connect");
  assert.equal(
    socket.joinAttempts.length,
    2,
    "a later reconnect should not attempt to join a closed room",
  );
}

{
  const { client, socket } = createClient();
  await client.joinRoom("FGHIJ", "Blake", null);
  client.leaveRoom();

  assert.equal(socket.leaveCommands, 1);
  socket.dispatch("connect");
  assert.equal(
    socket.joinAttempts.length,
    1,
    "an explicit leave should continue to suppress automatic recovery",
  );
}

console.log(
  "Room client distinguishes transient reconnects from terminal closures and explicit leaves.",
);
