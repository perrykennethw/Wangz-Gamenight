# Browser and Bundle

Use these rules for browser APIs, client-side asynchronous work, imports, and production bundle changes.

## Treat browser storage as optional input

- Namespace and version persisted keys. Persist only the minimum user preference needed across sessions.
- Parse and validate stored values before using them. Invalid, missing, or old data must fall back safely.
- Wrap storage reads, writes, and removal in failure handling. Privacy mode, quota limits, or browser policy must not prevent joining or playing a game.
- Keep storage access behind a small interface when more than one component uses the value. Follow `src/playerIdentityPreference.ts` as the local model.
- Do not persist shared game authority, secrets, room access decisions, or viewer-private projections in browser storage.

## Own browser listeners and async work

- Register each global listener once at the narrowest useful owner and remove it with the same target, event, handler, and options.
- Use passive scroll or touch listeners only when the handler never calls `preventDefault()`.
- Run independent asynchronous reads concurrently only when they have no ordering or shared-state dependency.
- Preserve the order of Socket.IO commands, state transitions, audio cues, and presenter actions when order is behaviorally significant.
- Ignore or cancel stale asynchronous results when a component can unmount or its request inputs can change before completion.

## Keep the initial Vite bundle intentional

- Use ordinary static imports by default because they are simpler and easier to analyze.
- Consider `React.lazy()` with a dynamic `import()` for a large screen or feature that is not needed during the initial room flow.
- Place `Suspense` at a stable feature boundary and provide a fallback that does not disrupt live play.
- Keep dynamic import paths statically analyzable by Vite. Do not use `next/dynamic`.
- Measure the production build before and after code splitting. A new chunk is useful only if it reduces the critical path without adding a disruptive loading transition.
- Avoid introducing broad barrel imports when a direct module import makes the dependency and tree-shaking boundary clearer.

## Avoid speculative micro-optimization

- Build a `Map` or `Set` for repeated lookups only when the collection or call frequency makes it worthwhile.
- Do not replace readable array methods or straightforward expressions without a measured hot path.
- Prefer eliminating unnecessary work or moving it out of the critical path over making small expressions harder to read.

## Review checklist

- Can storage failure or malformed data break a game flow?
- Is a listener duplicated, leaked, or recreated unnecessarily?
- Does asynchronous parallelism preserve required gameplay ordering?
- Is a proposed lazy boundary absent from the initial user journey?
- Does before-and-after production output show a meaningful critical-bundle improvement?
