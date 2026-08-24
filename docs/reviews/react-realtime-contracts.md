# React Realtime Contracts and Privacy Review

- Issue: [#69](https://github.com/perrykennethw/Wangz-Gamenight/issues/69)
- Reviewed revision: `a8ee3c9554f3d7e7afd16e62e39361cdb11d84e9`
- Review date: 2026-08-24
- Method: findings-only review using the repo-scoped `react-quality` skill

## Scope

The review covered:

- `docs/architecture.md`
- `src/roomTypes.ts`
- `src/roomClient.ts`
- `src/presenterChannel.ts`
- The relevant authority, snapshot, join, disconnect, and redaction paths in `server/index.ts` and `server/fastMoney.ts`
- `server/privacy.integration.ts`
- `server/roomReplay.integration.ts`
- `server/presenter.test.ts`

Call sites in `src/App.tsx` were inspected only where needed to verify ownership and lifecycle assumptions. No runtime code was changed.

## Executive summary

The review found two actionable client-lifecycle problems. Neither currently exposes viewer-private game data or moves shared game authority into React.

The server-authoritative command flow, per-viewer snapshot construction, presenter projections, hidden Fast Money answer handling, and BroadcastChannel cleanup were otherwise consistent with the documented architecture and existing tests.

## Findings

### High: unavailable or malformed session storage can block every player join

Evidence:

- [`RoomClient.sessionId`](../../src/roomClient.ts#L311-L317) reads and writes `window.sessionStorage` without failure handling.
- The same method accepts any existing non-empty value without validating it against the server contract.
- [`normalizeSessionId`](../../server/index.ts#L183-L187) rejects malformed values, but the client retains the rejected value. Refreshing the page does not clear session storage in the same tab, despite the returned instruction to refresh.
- No focused test exercises unavailable storage, a throwing read or write, or a malformed persisted session identifier.

Impact:

- A storage policy, privacy mode, quota or security exception can prevent a player from joining at all.
- A corrupt or legacy value under `wangz-player-session` causes every join attempt to fail until the value is manually removed or the browser session ends.
- This affects player entry and reconnect intent, but not host room creation or server-side authorization.

Recommended fix:

- Put session identifier creation behind a small failure-safe helper.
- Validate a stored value before reuse and replace malformed data when possible.
- Keep an in-memory identifier for the current page when storage is unavailable so joining and transient reconnects still work.
- Version the persisted key when changing its schema or semantics.

Recommended verification:

- Test a missing value, a valid returning value, a malformed value, a throwing read, and a throwing write.
- Verify the fallback remains stable for repeated joins and reconnect attempts during the same page lifetime.
- Verify server-side session validation and duplicate-participant protection remain unchanged.

Existing tracking:

- Issue [#35](https://github.com/perrykennethw/Wangz-Gamenight/issues/35) already requires malformed recovery data to fail safely. To avoid a duplicate, implement this as a narrow first slice of that issue: **Make player session identity storage failure-safe and validated**.

### Low: terminal room closure leaves stale automatic-resume intent

Evidence:

- The socket `connect` handler automatically rejoins whenever `canResume` and `joinedRoom` remain set in [`RoomClient`](../../src/roomClient.ts#L29-L38).
- [`RoomClient.subscribe`](../../src/roomClient.ts#L41-L54) forwards `room:closed` directly to the UI without clearing either field.
- Only an explicit [`leaveRoom`](../../src/roomClient.ts#L305-L309) clears resume intent.
- When a host disconnects, [`leaveCurrentRoom`](../../server/index.ts#L530-L552) emits `room:closed` and permanently deletes the room.

Impact:

- After the UI correctly returns a player to the home screen, a later transport reconnect can silently attempt to rejoin the deleted room.
- The usual result is a second, confusing reconnect failure notice. In the unlikely event that the short room code has been reused, the stale attempt could join an unrelated lobby under the old player identity.
- This does not bypass server authorization, but it violates the terminal lifecycle implied by `room:closed`.

Recommended fix:

- Wrap terminal closure handling inside `RoomClient` so it clears `canResume` and `joinedRoom` before notifying the UI.
- Keep transient transport-disconnect recovery unchanged.

Recommended verification:

- Trigger `room:closed`, then a later socket `connect`, and assert that no `room:join` command is emitted.
- Verify an ordinary transport disconnect still attempts recovery with the current join details.
- Verify explicit leave continues to suppress automatic recovery.

Existing tracking:

- Issue [#35](https://github.com/perrykennethw/Wangz-Gamenight/issues/35) already requires closing a room to clear local recovery data. To avoid a duplicate, implement this as a separate narrow slice: **Clear RoomClient resume intent after terminal room closure**.

## Areas with no actionable findings

### Server authority and typed contracts

Client methods emit typed commands and consume snapshots; they do not mutate shared room truth. `server/index.ts` resolves the actor, validates commands, mutates process-local room state, and returns viewer-specific snapshots. The reviewed types accurately distinguish the full host Family Feud configuration from the player-facing public configuration.

### Viewer-specific snapshot privacy

`snapshotFor` limits team chats to the host or the player's own team, hides the Family Feud pack from players, filters Play/Pass vote details, and delegates game views to redaction functions. The privacy and replay integration tests exercise team-chat isolation, hidden Spin & Solve state, player configuration redaction, authorization, reconnect identity, and replay isolation.

### Presenter projections

Presenter builders select explicit audience fields rather than forwarding the host snapshot. They remove chat content, votes, private participant identifiers, unrevealed Family Feud answers, hidden Fast Money responses, answer options, and premature subtotals. `server/presenter.test.ts` directly exercises those exclusions.

### BroadcastChannel ownership and cleanup

The publisher channel is keyed to the active room code and closes when that code changes or the publisher unmounts. The presenter channel clears its request interval and closes on cleanup. The reviewed setup remains correct across React Strict Mode's setup-cleanup-setup cycle.

### Server reconnect behavior

The server preserves disconnected player seats for the documented 30-second grace period, rejects duplicate active connections, restores the existing participant identity, clears the expiry timer after recovery, and synchronizes a fresh viewer-specific snapshot. The replay integration test covers participant identity and team restoration.

## Coverage observations

The server integration and presenter projection coverage is strong for the reviewed privacy boundaries. The two findings share one material gap: `RoomClient` lifecycle and browser-storage behavior has no focused test seam. The proposed fixes should introduce focused tests around session identity and terminal-versus-transient reconnect handling rather than expanding unrelated integration suites.

## Acceptance criteria

- **Passed:** Every file in scope and the architecture context was reviewed; relevant server paths and client call sites were inspected where needed.
- **Passed:** The listed tests were inspected to distinguish protected behavior from gaps.
- **Passed:** Recommendations retain server authority and viewer-specific privacy.
- **Passed:** This review contains no runtime changes or speculative performance refactors.
- **Passed:** Both confirmed fixes are proposed as separate narrow slices of existing issue #35, avoiding duplicate backlog entries.

## Validation

- `npm run test:presenter` — passed.
- `npm run verify` — passed, including type-checking, the production build, all 16 repository test scripts, and the integration server suite.
