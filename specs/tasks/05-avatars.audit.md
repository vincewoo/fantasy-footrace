# Audit sheet - 05 avatars

## Must not have changed

`src/model/*`, `src/sim/*`, `src/App.tsx`, `src/main.tsx`, `src/styles/global.css`,
`tools/adw/gate.sh`, `package.json` (no jsdom, no testing-library), `pnpm-lock.yaml` and
the configs. The diff should contain only `src/ui/Avatar.tsx` and
`src/ui/Avatar.test.tsx`.

## Failure modes this change invites

- **A simplified figure.** A worker may "clean up" 100 lines of nested
  `createElement` into fewer elements, dropping the shadow, the cheek blush, the
  helmet's facemask, or the second flame. The `<div` counts in the brief are the
  tripwire. A count that differs from the brief means the port is not faithful, even if
  the test was edited to match. Grep the test for the brief's numbers.
- **Unit drift.** React turns numeric `left: 24` into `24px`, which is correct. A
  string `'24'` without px, `'1.5px solid'` border widths changed, or `%` positions
  rounded all break the check. The `left:11.160714285714286%` string checks rounding.
- **Keys lost.** Without `key={'a' + ev.id}` on the figure root and `'fx' + ev.id` on
  the effects layer, a second play by the same player does not restart the CSS
  animation. The static markup cannot show this, so read the source for those keys.
- **CSS variables dropped.** React silently ignores unknown style keys only if they are
  mistyped. Check that `--dx:` appears in the passTD markup.
- **Hard-coded team colors or roster** inside `Avatar.tsx`. Colors must come from
  `props.colors`, and the only constants should be the design's `INK`, `CREAM`, `SK`,
  `ANIM`, `TDK` and `BK` if used.
- **`sgn` or `fmt` reimplemented** locally instead of imported from
  `src/model/derive.ts`.

## Real pass vs fake pass

A real pass: the test renders `<Avatar>` for all seven cases and asserts the literal
counts and strings. You can reproduce the baselines by concatenating lines 228-345
and 472-571 of the reference (the latter wrapped in a class) with React in node, as
the orchestrator did.

A fake pass: snapshot files (`toMatchSnapshot`) standing in for the counts, `>=`
comparisons, or tests that compute expectations from the component itself.

## Prior art

- Types come from task 4 (`src/model/types.ts`): the `Player.window` field exists but
  `Avatar` ignores it, and `PlayEvent.lane` replaces the design's `i`.
- The keyframes are in `src/styles/global.css` (task 1, verified byte-equal to the
  design).
