# Audit sheet - 11 season shape fix

## What went wrong, so you can check it cannot recur

Tasks 8 and 9 passed audit against a fixture the orchestrator had reshaped. The live
ESPN response nests the pro teams under `settings.proTeams`, and the code's
`season.proTeams ?? []` silently produced an empty schedule, which crashed the timeline.
The lesson for this audit: **a fixture test proves nothing if the fixture is not the
real payload.** The new season fixture is the raw response, byte-for-byte.

## Must not have changed

- Every expected value in the existing tests. Diff the test files. The only changes
  allowed in existing blocks are the fixture filename and `{proTeams}` changing to
  `{settings: {proTeams}}` in synthetic objects.
- `src/espn/proxy.ts`, `client.ts`, `src/worker/*`, `src/ui/MatchupPage.tsx`,
  `playback.ts`, `src/model/*`, `src/sim/*`, `App.tsx`, the gate and the dependencies.
- `reference/`. The fixture must be byte-identical (`cmp`).

## Failure modes this change invites

- **Accepting both shapes.** For example `season.settings?.proTeams ?? season.proTeams
  ?? []`. That keeps the silent-empty path. The code must throw on anything but an
  array at `settings.proTeams`, and there must be a test proving the old shape throws.
- **The check duplicated** in `slate.ts` and `load.ts` instead of one shared helper.
  That is a note, not a fail.
- **The `?? []` fallbacks kept** somewhere else on the same path. Grep for them.
- **`buildTimeline([])` returning a degenerate timeline** with `NaN`s instead of
  throwing.
- **`ConnectError` still printing `(0)`** for non-ESPN errors, or printing a stack
  trace. It should show a message only.

## Real pass vs fake pass

**The live check is required this time**, because the fixture-only audit is exactly
what missed this bug. The user's `.env.local` is in the tree.

1. Start `pnpm dev --port 5199 --strictPort` in the background.
2. Run the app's own load path in node through vite-node:
   - Use `node node_modules/.pnpm/vite-node@*/node_modules/vite-node/vite-node.mjs <script.ts>`
     with `VITE_ESPN_BASE=http://localhost:5199/espn`.
   - The script calls `loadLeagueInfo()` and then `loadLiveSlate(info, id,
     {timeZone: 'America/Los_Angeles'})` for **every** team in `info.teams`.
3. All 12 must return a slate with 10 lanes. On the base branch all 12 threw
   `reading 'start'`.
4. Put the script under `.adw/tmp/`, never in `src/`, and stop the dev server
   afterwards.
5. Print only team ids, lane counts and error messages. Never print response bodies or
   env values.

## Prior art

- The orchestrator's probe (the same vite-node approach) produced the failure list.
- The raw season fixture has top-level keys `display` and `settings`, and 17 weeks per
  team in `proGamesByScoringPeriod`. Its week 3 matches the old trimmed fixture exactly,
  with 16 games and 6 distinct kickoffs.
- The other fixture, `week3-pregame.json`, is a merge of the `mTeam`/`mSettings` and
  matchup responses in the same shape `load.ts` builds (`{...info.raw, scoringPeriodId,
  schedule}`). The live probe got past `loadLeagueInfo` and into the matchup parsing
  before failing on the timeline, so that shape matches reality. Still, keep an eye out
  for anything the live check turns up.
