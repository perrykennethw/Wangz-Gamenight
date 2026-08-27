# React Application Orchestration and Shared Lifecycle Review

- Issue: [#70](https://github.com/perrykennethw/Wangz-Gamenight/issues/70)
- Prerequisite: [review #69](https://github.com/perrykennethw/Wangz-Gamenight/issues/69), including the completed fixes in #76 and #77
- Reviewed revision: `546c9392fd8c45d0c20118309cb2f19bb1f7161a`
- Review date: 2026-08-26
- Method: findings-only review using the repo-scoped `react-quality` skill

## Scope

The review covered:

- [`src/App.tsx`](../../src/App.tsx#L194-L630) shared audio, timer, identity, presenter-tab, and invitation infrastructure
- [`src/App.tsx`](../../src/App.tsx#L4213-L4466) presenter entry and top-level application orchestration
- [`src/main.tsx`](../../src/main.tsx)
- The directly relevant lifecycle and failure paths in `src/roomClient.ts`, `src/presenterChannel.ts`, `src/gameAudio.ts`, `src/roomInvite.ts`, and `src/sharedTimer.ts`
- Focused coverage in `server/roomClient.test.ts`, `server/presenter.test.ts`, `server/gameAudio.test.ts`, `server/roomInvite.test.ts`, and `server/sharedTimer.test.ts`

The deeper browser-persistence, media-resource, and editor audit remains assigned to #71. Lobby and player media-query behavior remains assigned to #72, game-screen state and command ordering to #73, and presenter rendering, accessibility, and measured performance to #74. No runtime code was changed.

## Executive summary

The review found three actionable lifecycle problems. The most important is that the optional presenter transport can throw from a host-screen effect when `BroadcastChannel` is unavailable, allowing a presentation feature to disrupt live play. Two lower-impact findings concern a room-closure notice that survives into a later room lifecycle and transient status callbacks that are not cancelled or ordered.

The room snapshot subscription, reconnect intent, shared-timer interval, audio-state subscription, document-title restoration, URL normalization, and server-authority boundary were otherwise consistent with the repository guidance and React Strict Mode.

## Findings

### Medium: presenter transport availability is an unhandled host-flow dependency

Evidence:

- [`usePresentationPublisher`](../../src/presenterChannel.ts#L281-L310) constructs `BroadcastChannel` inside an effect and posts state without an availability check or failure boundary.
- [`usePresentation`](../../src/presenterChannel.ts#L312-L340) has the same unguarded constructor and schedules a repeating request that also assumes `postMessage` remains available.
- The publisher is mounted by existing-room setup, the host lobby, Spin & Solve, and Family Feud in [`src/App.tsx`](../../src/App.tsx#L951-L954), [`src/App.tsx`](../../src/App.tsx#L2022-L2026), [`src/App.tsx`](../../src/App.tsx#L3231-L3233), and [`src/App.tsx`](../../src/App.tsx#L3562-L3590). The presenter is optional, but its transport effect therefore runs throughout the host flow.
- Existing presenter tests validate projection privacy and URL parsing, but do not exercise a missing or throwing browser transport.

Impact:

- A browser without `BroadcastChannel`, or one whose policy rejects channel construction, raises from a React effect on every scoped host screen instead of allowing the room to continue without a presenter display.
- Presenter transport failure can therefore disrupt the host controls even though it is not part of room authority and should be an optional same-device projection.
- The successful path closes channels and clears the receiver request interval correctly, including React Strict Mode's setup-cleanup-setup cycle; the defect is failure containment, not ordinary cleanup.

Recommended fix:

- Put channel construction and posting behind a small failure-safe transport boundary.
- Let the publisher become unavailable without throwing into the host tree, and let presenter mode render useful unavailable or waiting copy.
- Preserve room-code isolation, the existing public projection, and deterministic channel/timer cleanup.

Recommended verification:

- Exercise an unavailable constructor, a constructor that throws, and a post failure on both publisher and receiver paths.
- Verify the host remains interactive, the presenter reports the unavailable state, and Strict Mode leaves no channel or interval behind.
- Retain the current presenter privacy assertions for successful transport.

Tracking: [#80 Make presenter transport failure-safe](https://github.com/perrykennethw/Wangz-Gamenight/issues/80)

### Low: a terminal room notice can reappear after a later room lifecycle

Evidence:

- The room-closure callback stores its message in `roomNotice` and returns to the home screen in [`App`](../../src/App.tsx#L4279-L4288).
- The notice is cleared only by its dismiss button in [`src/App.tsx`](../../src/App.tsx#L4366-L4378).
- Creating a room, joining a room, choosing a game, and explicitly leaving a later room change screens and room state without resetting the previous notice in [`src/App.tsx`](../../src/App.tsx#L4291-L4317) and [`src/App.tsx`](../../src/App.tsx#L4351-L4355).

Impact:

- A player can receive a correct closure message, navigate into and complete a later room flow without dismissing it, then return home and see the obsolete message again.
- The stale notice incorrectly describes the current lifecycle and can make a successful later room appear to have just failed.

Recommended fix:

- Define an explicit notice boundary: preserve a newly delivered terminal message on home, but clear it when the user begins or successfully enters a new room flow.
- Keep notice dismissal independent from server room state.

Recommended verification:

- Cover closure delivery, navigation into a new room flow, successful join or creation, and a later explicit return home.
- Assert that the current notice remains dismissible and that the obsolete notice does not return.

Tracking: [#81 Clear stale room notices before a new room flow](https://github.com/perrykennethw/Wangz-Gamenight/issues/81)

### Low: older shared-control callbacks can clear or replace newer feedback

Evidence:

- [`PresenterTabButton`](../../src/App.tsx#L545-L563) schedules a successful-status reset without retaining the timeout. A later popup result cannot cancel that timer, and unmount does not clear it.
- [`RoomInviteCard`](../../src/App.tsx#L565-L584) permits overlapping clipboard writes and schedules an independent reset after each result, also without replacement or unmount cleanup.
- No focused component test controls these timers or resolves clipboard actions out of order.

Impact:

- A success timer from an earlier presenter-tab attempt can erase a newer blocked-popup message before it can be read.
- A slower earlier clipboard operation can overwrite a newer result, and any earlier reset can clear the latest copy status prematurely.
- Pending callbacks are short-lived, but their ownership is inconsistent with the component lifecycle and produces observable stale feedback.

Recommended fix:

- Retain one reset handle per component, cancel it before a new action, and clear it on unmount.
- Ignore an obsolete clipboard result when a newer copy action owns the status.
- Keep the current user-facing success and failure messages.

Recommended verification:

- Use controlled timers and clipboard promises to resolve two actions out of order.
- Verify only the newest result controls the status and unmount leaves no pending reset callback.

Tracking: [#82 Cancel stale shared-control status callbacks](https://github.com/perrykennethw/Wangz-Gamenight/issues/82)

## Areas with no actionable findings

### Room subscription and reconnect lifecycle

`App` skips the room socket entirely in presenter mode and returns the `RoomClient.subscribe` cleanup from its effect. The callbacks depend only on stable React setters, so the intentionally mount-scoped subscription does not retain stale render state. `RoomClient` removes the exact snapshot and closure handlers on cleanup. The focused lifecycle test added by #77 now distinguishes transient reconnect, terminal closure, and explicit leave behavior.

### Shared countdown and timer audio

`useSharedTimerSeconds` recalculates immediately when status or deadline changes, starts an interval only for a running timer, and clears the exact interval during dependency changes and unmount. The host audio effect owns no external resource; its ref makes warning and expiration cues idempotent across rerenders and Strict Mode effect replay. Timer commands remain ordered through the typed room client and the server remains authoritative.

### Game-audio state subscription

`useGameAudioState` uses a lazy controller snapshot and returns the controller's exact unsubscribe function from its effect. `GameAudioController.subscribe` immediately supplies the current snapshot, preventing a state change between render and subscription from being lost. Storage, recorded-media, and controller-resource details are intentionally left for #71.

### Identity and invitation derivation

Avatar filtering, initials, portrait selection, invitation URL derivation, and local-URL detection are render-time derivations rather than duplicated effect state. Invalid configured invitation URLs fall back to the current HTTP(S) page, and clipboard rejection is surfaced without blocking the room. The stale asynchronous feedback lifecycle is isolated in finding #82; persistence details remain in #71.

### Top-level initialization, routing, and authority

The presenter and invitation query values are intentionally read once for this non-router SPA. The local `screen` value selects views, while room commands and snapshots continue through `RoomClient`; routing does not authorize actions or construct viewer-private state. Host-only configuration is established from successful server commands, and the only confirmed reset-boundary defect is the notice in finding #81. Game-screen ownership is reserved for #73.

### Document and scroll synchronization

`PresenterScreen` restores the previous document title with the same effect that changes it. The screen-change scroll effect owns no retained listener, timer, or asynchronous result. `src/main.tsx` deliberately enables React Strict Mode, and the scoped effects remain safe under setup-cleanup-setup except for the failure and transient-callback cases reported above.

### Browser listeners in the scoped ranges

The reviewed `App.tsx` ranges register no global media-query, keyboard, pointer, or visibility listeners. Those listeners occur in later component scopes or in media internals assigned to #71 through #74; they were not pulled into this review.

## Acceptance criteria

- **Passed:** The top-level `App` lifecycle, presenter entry, and every shared infrastructure component in the requested ranges were reviewed.
- **Passed:** Every scoped effect, subscription, interval, timeout, `BroadcastChannel`, and browser-side asynchronous callback was inventoried and checked for ownership and cleanup.
- **Passed:** State initialization, derivation, room/screen reset boundaries, and startup-only memoization were checked; the confirmed notice reset defect is tracked in #81.
- **Passed:** The review makes no runtime changes and recommends no speculative memoization or broad `App.tsx` rewrite.
- **Passed:** Each confirmed fix is isolated in a separate bug: #80, #81, and #82.

## Validation

- `npm run test:room-client`
- `npm run test:timers`
- `npm run test:audio`
- `npm run test:room-invites`
- `npm run test:presenter`
- `npm run verify`
- `git diff --check`
