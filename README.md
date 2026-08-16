# Wangz Game Night

A TypeScript and React host-led game night app with a playable Family Feud-style game and room for more game types.

## Run locally

Use Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. For a production check, run `npm run build`.

Run `npm run typecheck` to verify the TypeScript source independently of the production build.

`npm run dev` starts both the Vite app and the realtime room server. Friends on the same Wi-Fi network can open the Network URL printed by Vite, select **Join a room**, and enter the five-character code shown on the host screen.

## Multiplayer rooms

- The host creates an ephemeral room after configuring the teams.
- Players join with a display name and select a team; that choice locks immediately.
- Team chat history is filtered on the server. Players receive only their own team’s messages, and the host receives neither channel.
- Rooms and chat history are held in memory for the game session and clear when the host leaves or the server restarts.

## Family Feud host controls

- Click an answer or press `1`–`6` to reveal it.
- Click **Add strike** or press `X` to mark a strike.
- Award the round pot to either team; `A` awards team one and `B` awards team two.
- Use the small `−` and `+` controls to correct a team score in five-point increments.
- Rounds one and two score normally, round three scores double, and later rounds score triple.
