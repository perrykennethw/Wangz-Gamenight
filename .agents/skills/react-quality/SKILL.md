---
name: react-quality
description: Write or review React client code in Wangz Game Night for correctness, maintainability, and evidence-backed performance. Use for React components, hooks, browser storage, client event handling, or Vite bundle and code-splitting work. Do not use for server-only game logic or deployment changes.
---

# React Quality

Apply project-specific React guidance without importing assumptions from Next.js or server-rendered applications.

## Start with project context

1. Read the root `AGENTS.md`.
2. Read `docs/architecture.md` before changing state ownership, Socket.IO boundaries, viewer-specific projections, privacy behavior, or deployment topology.
3. Inspect the affected component, its callers, and the most relevant existing tests before proposing a pattern change.
4. Preserve the server as the authority for shared game state. Keep browser-only preferences and presenter state local as documented.

## Load only the relevant guidance

- For component state, effects, hook dependencies, render behavior, or memoization, read [references/rendering-and-state.md](references/rendering-and-state.md).
- For browser storage, global listeners, asynchronous client work, imports, or bundle size, read [references/browser-and-bundle.md](references/browser-and-bundle.md).
- For the upstream source, pinned revision, adopted rules, and exclusions, read [references/upstream.md](references/upstream.md) only when auditing or updating this skill.

## Work in this order

1. Fix correctness and data-flow problems before considering performance work.
2. Prefer the smallest change that makes ownership and synchronization explicit.
3. Add performance-specific complexity only when a profile, bundle report, repeated hot path, or clearly expensive boundary supports it.
4. When reviewing code, report concrete findings with file and line evidence. Do not recommend speculative memoization or broad rewrites.
5. Keep application refactors, dependency additions, lint configuration, and CI changes outside a skill-only task unless they are explicitly requested.

## Project constraints

- This is a React 19 Vite single-page application with an Express and Socket.IO server.
- Do not apply Next.js APIs or advice, including `next/dynamic`, React Server Components, Server Actions, route handlers, or server-rendering and hydration patterns.
- Do not move shared game decisions into the browser or weaken viewer-specific privacy projections to simplify a component.
- Do not parallelize Socket.IO commands or other stateful operations whose ordering affects game behavior.
- Do not add a dependency for a pattern that the platform or existing code can express clearly.

## Verify the result

- Run the most relevant focused test first when behavior changes.
- Run `npm run typecheck` and `npm run build` for application changes, then `npm run verify` before publication when feasible.
- Exercise changed user interactions in a browser. Use the responsive viewports required by the root instructions when contestant UI is affected.
- For a bundle optimization, record comparable production-build output before and after the change.
- For a render optimization, identify the measured rerender or expensive computation and verify that the change removes it without changing behavior.
