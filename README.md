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
- Choose one face-off representative from each team, then press `Z` or use the buzzer panel to open and close their buzzers. The server rejects teammates outside the selected pair and accepts only the first representative’s buzz.
- Award the round pot to either team; `A` awards team one and `B` awards team two.
- Use the small `−` and `+` controls to correct a team score in five-point increments.
- Rounds one and two score normally, round three scores double, and later rounds score triple.

## Buzzer UX prototype

This branch contains a throwaway, in-memory proof of concept for testing the player buzzer experience. Start it with the normal development command:

```bash
npm run dev
```

Create a room in one tab, join both teams in additional tabs or phones, and start the game. The host chooses the two face-off representatives, arms their buzzers, and watches the first response lock every connected screen. **Next pair** rotates to the next player on each team; awarding a round rotates the pair automatically.

In development, the player screen has a floating switcher for three deliberately different treatments. Use its arrows, the keyboard’s left/right arrows, or open a player tab with `?variant=A`, `?variant=B`, or `?variant=C`:

- **A — Stage + chat:** a large rectangular buzz surface beside persistent team chat.
- **B — Full takeover:** the buzzer owns the screen, with chat collapsed below it.
- **C — Buzzer dock:** the original team/chat layout stays intact with a persistent bottom action bar.

## GCP deployment

The production service is deployed to Cloud Run in `us-central1`:

<https://wangz-gamenight-404444556589.us-central1.run.app>

The application runs as one same-origin container: the Node server serves the built Vite frontend and the Socket.IO endpoint. Room and chat state is held in memory, so the Cloud Run service is manually scaled to exactly one instance.

Build and publish a new image with a unique tag:

```bash
gcloud builds submit \
  --tag=us-central1-docker.pkg.dev/wangz-505715/wangz-gamenight/wangz-gamenight:TAG \
  --region=us-central1 \
  --project=wangz-505715 \
  .
```

Deploy that image while preserving the realtime-service configuration:

```bash
gcloud run deploy wangz-gamenight \
  --image=us-central1-docker.pkg.dev/wangz-505715/wangz-gamenight/wangz-gamenight:TAG \
  --region=us-central1 \
  --project=wangz-505715 \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --timeout=3600 \
  --concurrency=200 \
  --scaling=1 \
  --session-affinity \
  --no-invoker-iam-check \
  --service-account=wangz-gamenight-runtime@wangz-505715.iam.gserviceaccount.com \
  --startup-probe=httpGet.path=/health,httpGet.port=8080,timeoutSeconds=2,periodSeconds=5,failureThreshold=6 \
  --liveness-probe=httpGet.path=/health,httpGet.port=8080,initialDelaySeconds=10,timeoutSeconds=2,periodSeconds=30,failureThreshold=3
```

Deployments and instance replacements clear active rooms. Cloud Run also limits each WebSocket request to 60 minutes, so longer or restart-safe games require reconnect/resume handling and external room state.

### Continuous deployment

The GitHub Actions workflow in `.github/workflows/deploy.yml` runs on every push to `main`, including merged pull requests. It type-checks, builds, and runs the multiplayer privacy test before authenticating to GCP. It then publishes an image tagged with the Git commit SHA, deploys that immutable image, and repeats the health and multiplayer tests against production.

GitHub authenticates with short-lived credentials through Workload Identity Federation. No Google Cloud service-account key or GitHub secret is required. The GCP identity provider is restricted to repository ID `1336056422`, the `main` branch, and this specific workflow file.
