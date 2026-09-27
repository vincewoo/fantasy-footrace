# Audit sheet - 09 live wiring

## Must not have changed

- The Demo page's behavior. `MatchupPage` with no new props must render exactly as on
  the base branch. Compare
  `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)` on the base
  branch and this branch: the markup must be byte-identical.
- Existing test blocks in `client.test.ts`, `playback.test.ts` and
  `MatchupPage.test.tsx`. Diff them. Only appended blocks are allowed.
- `src/espn/proxy.ts`, `src/espn/slate.ts`, `src/espn/timeline.ts`, `src/model/*`,
  `src/sim/*`, `src/ui/Avatar.tsx`, `vite.config.ts`, the gate and the dependencies.

## Failure modes this change invites

- **Live clock bolted on wrong.**
  - `liveNow` must set `liveT` from real time on every tick, never from `dt`
    accumulation. Otherwise Live mode would drift like the simulation.
  - Replay (a scrubbed-back `t`) must still advance at `speed` and catch up to `liveT`.
  - Read the tick. A common mistake is calling `followLive` only, which freezes a
    scrubbed-back `t`, or calling `advance` only, which ignores real time.
- **Saved position collision.** Live must use `ff_live_v1`, and Demo keeps `gd_sim_v1`.
  A shared key would restore a demo `t` onto the live timeline.
- **Secrets in the browser.**
  - No `.env` reads.
  - No `credentials: 'include'`.
  - Grep `dist/` after the gate's build for `ESPN_S2`, `SWID=`, `espn_s2`: nothing.
  - `client.ts` is now imported by browser code, which the task-7 audit said to
    re-check. Also grep `dist/` for `lm-api-reads`. Only the `/espn` base should appear,
    unless `VITE_ESPN_BASE` is set, and it is not.
- **localStorage outside try/catch.** This includes the `ff_mode` and `ff_team` reads
  during render.
- **Unhandled promise.** Fetch failures must reach `ConnectError`, not an uncaught
  rejection or a blank screen. Look for `.catch`, or `try` around the `await`s.
- **Race on fast team switching.** A stale `loadLiveSlate` resolving after a newer one
  must not overwrite it. An ignore flag or an AbortController is enough. Note it if it's
  missing, but it is not a fail on its own.
- **Contract drift.** `loadLiveSlate` must return `{slate, toT}` (`LiveSlate`). Any
  other signature is a fail. `slate.ts` must be unchanged. The kickoff helper belongs in
  `load.ts`, and it must produce the same kickoff set `buildSlate` uses. Check that
  `toT` of the Sunday 1 PM kickoff is 0.200957.

## Real pass vs fake pass

A real pass needs both of the following:

- The load tests go through the real `fetchLeague`/`fetchSeason` with a fake
  `fetchImpl`, and assert the URL, the views and the `X-Fantasy-Filter` header string.
- The tests reach `buildSlate` with the fixture.

Stubbing `loadLiveSlate` itself proves nothing.

The **live check is strongly recommended**, because the user's `.env.local` exists in
the tree:

1. Start `pnpm dev --port 5199 --strictPort` in the background.
2. `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5199/espn/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam'`
   should print 200.
3. Then stop it.

Do not print response bodies. Do not create or edit `.env.local`, and do not print it.

## Prior art

- The fixtures and their shapes are described in `specs/tasks/08-espn-slate.md`.
- The orchestrator's capture showed that `mTeam`+`mSettings` returns `status`
  (`currentMatchupPeriod: 3`), `members`, `teams`, `settings.name` (`#fpandfriends`) and
  `scoringPeriodId`. The matchup call with the filter returns 6 `schedule` entries with
  rosters, `totalPointsLive`, `totalProjectedPointsLive` and `winProbability`.

## Baseline test-block counts (base `adw/8-espn-slate`)

The orchestrator counted with `grep -c '^\s*\(test\|it\)('`:

| file | blocks on base |
|---|---|
| `src/espn/client.test.ts` | 9 |
| `src/ui/playback.test.ts` | 10 |
| `src/ui/MatchupPage.test.tsx` | 6 |

On this branch, each file must have at least that many blocks, and the original blocks
must be byte-identical.
