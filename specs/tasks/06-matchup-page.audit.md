# Audit sheet - 06 matchup page

## Must not have changed

`src/model/*`, `src/sim/*`, `src/ui/Avatar.tsx`, `src/ui/Avatar.test.tsx`,
`src/styles/global.css`, `src/main.tsx`, `tools/adw/gate.sh`, `package.json`,
`pnpm-lock.yaml` and the configs. The diff covers only the six targets.

## Failure modes this change invites

- **Tests that pass while the page is wrong.** The static render only checks the first
  frame. The tick, scrub and animation wiring is only exercised live. Read
  `MatchupPage.tsx` against design lines 396-470 for the event-firing loop:
  - events are fired strictly `prevT < e.t <= t`
  - animations are keyed per `side+lane`
  - fire times use `Date.now()`
  - there is a 2100 ms active window and a 2200 ms re-render
  - banner precedence (the last banner-worthy event wins)
  - sound rank `td > hurt > bad > kick > pos`
  - a 50% opponent-TD taunt
  A worker short on context tends to drop the re-render timer, which leaves avatars
  frozen mid-animation, or to fire events by `>=` on both ends, which double-fires them.
- **Logic duplicated instead of reused.** Totals, win probability and status must come
  from `snapshotAt`, `slate.statusLabel` and `slate.clockLabel`. Grep `MatchupPage.tsx`
  for a local `erf`, a `score(` or a `WINDOWS` constant. Any of these is a fail.
- **Hard-coded names.** `YOU`/`DAVE` and the team names must come from `slate.me` and
  `slate.opp`, because a later task feeds ESPN names through the same fields. Grep for
  the literal `'DAVE'` in the component. It may appear only in tests. The header's
  `WEEK 4 ...` literal is allowed.
- **Style drift.** Spot-check at least these against the template:
  - the scoreboard grid (`sbCols`)
  - lane height `96px`
  - the stripe `width:600%` background
  - the projection marker labels
  - the ticker `max-height` in compact vs wide
  - the fixed bottom bar gradient
  - the scrubber's two fills and its thumb

  Numeric React styles gain `px`. The design's string values must stay strings.
- **Logo retyped or truncated.** It must have 348 `<rect` and `shape-rendering=
  "crispEdges"`, and it must be the only svg in `public/`.
- **Leaks.** Unmount must clear the interval, the ResizeObserver and the timeouts.
  Check for an effect cleanup that runs.
- **localStorage outside try/catch.** A node render or a privacy-mode browser would
  throw.
- **`style-hover`/`style-active` ignored.** This is a minor fidelity miss. Note it, but
  it is not a fail on its own.

## Real pass vs fake pass

A real pass needs all of the following:

- The playback tests assert the literal fractions from the brief.
- The page test asserts every string from the brief, including the nine lane diffs in
  order, using the real minus sign U+2212.
- `pnpm dev` would show the design. Optionally run `pnpm run build` and inspect
  `dist/`.

If you can, open `pnpm dev` in a browser and watch a minute of the slate at x16: the
runners move, TD banners fire, the ticker grows and scrubbing works. A static render
proves none of that.

## Prior art

- Baselines come from lines 229-345 of the reference, evaluated in node. The page's
  first frame is `t = 0.06` (design `initState` default) with 19 plays.
- `Avatar` (task 5) takes `{player, colors, side, lane, pts, event, out, scrubbing,
  showTag, scale, napping, offset}`, and `colors` is `slate.teamColors[player.team]`.
