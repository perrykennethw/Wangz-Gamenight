# Rendering and State

Use these rules when the work touches React components or hooks.

## Keep state minimal

- Derive values during render when they are completely determined by current props and state.
- Use state for values that must survive renders and affect the UI. Use a ref for transient values that must survive renders but should not trigger rendering.
- When an editable draft is initialized from props, make the reset boundary explicit. Prefer a keyed component or an intentional reset action over an effect that silently overwrites user edits whenever a prop changes.
- Use a lazy state initializer when computing the initial value is meaningfully expensive or reads browser storage.

## Use effects for synchronization

- Put consequences of a user interaction in the event handler that owns the interaction. Do not route an interaction through state merely so an effect can react to it.
- Use effects to synchronize React with an external system such as Socket.IO, a timer, a browser listener, media playback, or storage.
- Clean up subscriptions, listeners, timers, and other external resources. In React Strict Mode, setup followed by cleanup and setup again must remain correct.
- Keep effect dependencies complete and narrow. Prefer primitive dependencies or stable values rather than broad objects whose identity changes every render.
- Use functional state updates when the next value depends on the previous value.

## Keep render behavior explicit

- Define components at module scope rather than inside another component's render path.
- Avoid `condition && <Element />` when the condition can be `0`, `NaN`, or an empty string; use an explicit Boolean comparison or ternary.
- Hoist static JSX only when it is truly invariant and the change improves clarity or a measured hot path.
- Preserve stable keys that represent domain identity. Do not use array indexes for reorderable players, answers, chat messages, or game items.

## Add memoization only with evidence

- Do not wrap a simple Boolean, property access, short array lookup, or primitive expression in `useMemo`.
- Consider `useMemo` only for a demonstrated expensive calculation or when stable identity is required at a verified memoized boundary.
- Consider `useCallback` only when a consumer benefits from stable identity, such as a memoized child or external subscription boundary.
- Remove memoization that adds dependency risk without avoiding meaningful work.

## Review checklist

- Is duplicated state derivable from existing props or state?
- Could an effect be an event handler or a render-time derivation?
- Does every external synchronization have complete cleanup and dependencies?
- Could a prop-to-state effect erase an in-progress edit?
- Is memoization supported by profiling or an expensive, repeated computation?
- Do keys and state boundaries preserve the identity of game-domain objects?
