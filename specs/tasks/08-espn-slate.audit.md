# Audit sheet - 08 ESPN slate parser

## Must not have changed

- The fixtures: `cmp` each file in `src/espn/fixtures/` against
  `reference/espn-fixtures/`.
- `src/model/types.ts`: only the `Pos` union gains `'DP'`, a one-line diff.
- `src/model/derive.ts`, `src/sim/*`, `src/ui/*`, `src/App.tsx`, `src/espn/proxy.ts`,
  `src/espn/client.ts`, `vite.config.ts`, the gate and the dependencies.

## Failure modes this change invites

- **Private data leak.** The fixtures are scrubbed, but check that no SWID-shaped GUID
  (`\{[0-9A-F]{8}-`) appears anywhere in the diff or the tests. Also check that
  `.env.local` is not in the commit.
- **Expected values derived from the code.** Every row of the brief's 10-lane table,
  every timeline `t`, and the axis labels must appear as literals in the tests. A test
  that computes the expectation by re-running the parser is circular.
- **Pairing by array index across the whole starter list** instead of by slot. In this
  fixture both sides are ordered the same way, so a naive index zip would pass by
  accident. Read the code to confirm it groups by `lineupSlotId` in `LANE_ORDER` order.
  The empty-player path has no fixture case, so read its code as well.
- **Timeline bugs that the given fixture happens to hide:**
  - gap handling in `toT`: a time between the Thursday window end and the Sunday start
    should map to Sunday's start `t` (0.200957), not interpolate
  - `toMs(toT(x)) === x` inside a window
  - `toT` must be monotonic

  Probe these with a few timestamps of your own.
- **Timezone baked in.** Look for an `America/New_York` literal or `getHours()` in
  non-test code. `timeLabel` must use the passed `timeZone`.
- **The U+202F whitespace trap.** Newer ICU emits ` ` before `AM`/`PM`. The label
  normalization must handle it even though the node that ran the baseline printed
  plain spaces. Check that it is a regex over `\s` or explicit code points, not a
  `' '` replace.
- **Team colors.** The design's 15 colors must be byte-equal to the design's `TEAMS`.
  Spot-check 3 or 4 of the other 17 against the official palettes (the Giants
  `#0B2265`, and the 49ers red and gold). This is a fidelity note, not an automatic
  fail, unless a color is obviously another team's.
- **`posOf` silently mapping unknown ids to a default.** It must throw.

## Real pass vs fake pass

A real pass needs all of the following:

- The fixtures are byte-identical.
- The tests load them from disk with `node:fs`, or with a JSON import if tsconfig allows
  `resolveJsonModule`, which it does.
- `buildSlate(…, 1, …)` reproduces the brief's table.
- `snapshotAt` accepts the ESPN slate with no events.

## Prior art

- The orchestrator captured the fixtures on 2026-09-27 at about 5:50 AM ET via the
  task-7 proxy (GET only). It replaced 17 SWIDs with `{SWID-nn}`, and trimmed the season
  file to week 3.
- The baselines came from python over the same files.
- ESPN's own `totalProjectedPointsLive` (124.26 / 111.15) equals the sum of the
  per-player week projections. That is the cross-check for the `proj` extraction.
- `reference/espn-api.md` has the maps. Slot 15 is `DP` in the espn-api POSITION_MAP
  ordering.
