# Upstream Provenance

This project guidance is adapted from Vercel Labs' React Best Practices skill, version 1.0.0, pinned to commit [`dd089a8c752c966dee8bf0f27cb625ba193ffd9e`](https://github.com/vercel-labs/agent-skills/tree/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices). The upstream `SKILL.md` identifies the material as MIT licensed.

## Sources selected for this Vite application

- Async: [`async-parallel`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/async-parallel.md)
- Bundle: [`bundle-dynamic-imports`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/bundle-dynamic-imports.md) and [`bundle-barrel-imports`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/bundle-barrel-imports.md)
- Browser APIs: [`client-localstorage-schema`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/client-localstorage-schema.md), [`client-event-listeners`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/client-event-listeners.md), and [`client-passive-event-listeners`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/client-passive-event-listeners.md)
- State and effects: [`rerender-derived-state-no-effect`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-derived-state-no-effect.md), [`rerender-move-effect-to-event`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-move-effect-to-event.md), [`rerender-functional-setstate`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-functional-setstate.md), and [`rerender-lazy-state-init`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-lazy-state-init.md)
- Memoization and rendering: [`rerender-simple-expression-in-memo`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-simple-expression-in-memo.md), [`rerender-dependencies`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-dependencies.md), [`rerender-use-ref-transient-values`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rerender-use-ref-transient-values.md), and [`rendering-conditional-render`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/rendering-conditional-render.md)
- JavaScript hot paths: [`js-set-map-lookups`](https://github.com/vercel-labs/agent-skills/blob/dd089a8c752c966dee8bf0f27cb625ba193ffd9e/skills/react-best-practices/rules/js-set-map-lookups.md)

The project text is intentionally summarized and adapted rather than copied as a general React performance manual.

## Explicit exclusions

Do not import guidance that depends on Next.js, React Server Components, Server Actions, route handlers, server-only caching, server rendering, hydration, or `next/dynamic`. Those runtime assumptions do not match this repository.

Do not automatically adopt every upstream micro-optimization. This project requires local evidence before adding memoization, lookup structures, hoisted JSX, code splitting, or concurrency that makes live game behavior harder to reason about.

## Updating this skill

Review upstream changes deliberately. Update the pinned commit, the selected-source links, and the project-specific guidance together, then rerun skill validation and repository verification.
