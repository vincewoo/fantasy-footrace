# Audit sheet - 16 live scoring

## Must not have changed

- `src/ui/*`. The page must pick up new events through its existing `slate` effect
  dependency, with no edits.
- `src/espn/slate.ts`, `timeline.ts`, `client.ts`, `proxy.ts`, `src/worker/*`,
  `src/model/*`, the fixtures, the configs and the dependencies.
- The 3 existing `load.test.ts` blocks are byte-identical.
- Demo mode is untouched: `App` only polls in Live mode.

## Failure modes this change invites

- **Totals that drift from ESPN.** The core promise is that event points sum to
  `appliedTotal` exactly. Check the remainder rule and the spread rule's last-piece
  correction. A worker who divides evenly and rounds every piece will be off by a cent
  on Golden, Bijan and London. Those rows in the brief's table are the tripwire. Grep
  the test for `1.76`, `2.39` and `3.72`.
- **Double counting across polls.**
  - `pollLive` must diff against `live.poll`, the previous actuals. Re-seeding from
    `null` on every poll would multiply points.
  - The identical-response test (0 new events) guards this. Confirm it exists and
    passes.
- **The previous poll not advanced.** If `pollLive` returns the old `poll` instead of
  `cur`, every later poll re-emits the same delta.
- **Bench players counted.** Slot 20 and 21 players, such as MarShawn Lloyd, Kyle Pitts
  and Josh Jacobs in the fixture, have actuals. They must not produce events or points.
  REAPR Sleepers' `totalPointsLive` is 0.0 although its bench has points. That is the
  cross-check.
- **Timing outside the window.** Seeded events must stay within `[w0, end]`. Polled
  events must be `> tNow`, so the page's `prevT < e.t <= t` firing catches them on the
  next tick, not at or before `tNow`.
- **Polling cadence.** Look for polling in gaps or before kickoff, overlapping polls,
  and a missing cleanup. The interval must be cleared on team or mode switch.
  Otherwise a switched-away team keeps polling, and its events land on the new slate.
- **Unsorted merge.** `withEvents` must re-sort by `t`, because `snapshotAt` and the
  ticker assume time order. Check that ids are preserved and not renumbered.
- **Fallback kinds firing banners.** Negative remainders with no pieces use the
  fallback kind by position (`pass`/`rush`/`catch`/`xp`/`sack`), which never shows a
  banner. A worker who picked `fumble` or `int` for negative values would put false
  FUMBLE and INTERCEPTED banners on screen.

## Real pass vs fake pass

- A real pass: the tests assert every row of the brief's decomposition table, the delta
  case, the 21-event seed for team 6 with `41.6`, the Devin Lloyd injury event, and both
  `pollLive` cases, all against the real fixture.
- **Live check (required, as in task 11).**
  1. Start `pnpm dev --port 5199 --strictPort`.
  2. Use a vite-node or Vite SSR harness under `.adw/tmp/` to call `loadLeagueInfo` and
     `loadLiveSlate` for every team.
  3. For each team, assert that `fmt(totals)` from `snapshotAt(slate, toT(now))` equals
     the live matchup response's `totalPointsLive` for that team, fetched in the same
     harness, to 0.1. Print only team ids and the two numbers. Stop the dev server.

  That comparison against ESPN's own number is the real proof, and it should now pass
  for the Thursday teams (41.58, 34.3, 24.65, 19.1 …) and any Sunday games in progress.

## Prior art

- The fixture findings: actual entries carry `stats`, `appliedStats` and
  `appliedTotal`. The team `totalPointsLive` equals the starters' sum, and bench
  actuals exist but do not count.
- Unknown stat `108` appears on Drake London and Chris Brooks. It is why the remainder
  rule exists.
- The page's tick effect depends on `[slate, …]`, so a new slate object restarts the
  interval with the new events while playback state persists in `stateRef`
  (`MatchupPage.tsx` around line 239-285).
