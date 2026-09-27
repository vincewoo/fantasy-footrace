# 11 - fix: read the NFL schedule from ESPN's real response shape (`settings.proTeams`), and fail loudly when it is missing

## Deliverable

Live mode fails for every team with `TypeError: Cannot read properties of undefined
(reading 'start')`. The error card then shows the unhelpful `ESPN returned an error
(0).`

The orchestrator reproduced this by running `loadLeagueInfo` and then `loadLiveSlate`
for all 12 teams against the live league through the dev proxy. The root cause is a
**fixture the orchestrator reshaped**. ESPN's `proTeamSchedules_wl` response nests the
NFL teams at `settings.proTeams[]`, and each team's `proGamesByScoringPeriod` holds all
17 weeks. The task-8 fixture `season-proteams-week3.json` had moved them to a top-level
`proTeams`, so `slate.ts` and `load.ts` read `season.proTeams ?? []`. On live data that
yields no kickoffs, `buildTimeline` gets an empty list, and `windows[0].start` throws.

The fix has four parts:

1. **Fixture.** Replace the reshaped fixture with the **raw, unmodified** response:
   `reference/espn-fixtures/season-2026-proteams.json`, 109097 bytes, top-level keys
   `display` and `settings`. Copy it with `cp` to
   `src/espn/fixtures/season-2026-proteams.json`, and delete
   `src/espn/fixtures/season-proteams-week3.json` with `rm`.
2. **Read the real shape.** In both places that walk the pro teams, read
   `season.settings.proTeams`.
3. **Fail loudly.**
   - If `season?.settings?.proTeams` is not an array, throw
     `Error('season response has no settings.proTeams')`.
   - `buildTimeline` with no kickoffs throws `Error('no NFL kickoffs for this week')`.

   An empty list must never fall through silently again.
4. **Readable errors.** In `ConnectError`, an error that is not an `EspnError` shows
   ``Couldn't read the league data: ${error.message}`` (or `String(error)` for a
   non-Error). It never shows `(0)`.

Targets:

- `src/espn/fixtures/season-2026-proteams.json`
- `src/espn/fixtures/season-proteams-week3.json` (deleted)
- `src/espn/slate.ts`
- `src/espn/slate.test.ts`
- `src/espn/load.ts`
- `src/espn/load.test.ts`
- `src/espn/timeline.ts`
- `src/espn/timeline.test.ts`
- `src/ui/Connect.tsx`
- `src/ui/Connect.test.tsx`

## Interface Contract

- `export function buildSlate(league: any, season: any, myTeamId: number, opts: { timeZone: string }): Slate` -
  the signature is unchanged. It reads `season.settings.proTeams`.
- `export async function loadLiveSlate(info: LeagueInfo, myTeamId: number, opts: { timeZone: string; fetchImpl?: typeof fetch }): Promise<LiveSlate>` -
  the signature is unchanged. Its kickoff helper reads `season.settings.proTeams`.
- `export function buildTimeline(kickoffsMs: number[], timeZone: string): Timeline` -
  the signature is unchanged. It throws on an empty input.
- `export function ConnectError(props: { error: unknown; onRetry(): void; onDemo(): void }): JSX.Element` -
  the signature is unchanged, with the new message for non-`EspnError` errors.

## Behavior

- Put the `settings.proTeams` check in one small exported helper in `slate.ts`, for
  example `export function proTeamsOf(season: any): any[]`, and have `load.ts` import it.
  Do not write the check twice.
- Every expected value in the existing tests stays the same: the raw fixture has the
  same 16 week-3 games and the same six kickoffs. Only the fixture file name and any
  synthetic `season` objects built inside the tests change shape, from
  `{proTeams: [...]}` to `{settings: {proTeams: [...]}}`.

## Constraints

- Existing test blocks may be edited **only** to switch the fixture file name or the
  synthetic season shape. No expected value may change.
- Do not edit `reference/`. Do not modify the fixture bytes:
  `cmp reference/espn-fixtures/season-2026-proteams.json src/espn/fixtures/season-2026-proteams.json`
  must succeed.
- No other files change. No new dependencies.

## Out of Scope

- Live scoring and polling, the Worker, and the page.

## Acceptance Check

Baseline on `adw/10-espn-worker`:

- Test-block counts are `slate.test.ts` 23, `load.test.ts` 2, `timeline.test.ts` 12 and
  `Connect.test.tsx` 1.
- `slate.ts:87` and `load.ts:31` read `season.proTeams ?? []`.
- `slate.test.ts:14` and `load.test.ts:28` load `season-proteams-week3.json`.
- The raw fixture yields 16 week-3 games with kickoffs 1790295300000, 1790528400000,
  1790539500000, 1790540700000, 1790554800000 and 1790640900000. The orchestrator
  verified this with python.

After the change:

1. `grep -rn "season.proTeams\|season-proteams-week3" src/` prints nothing.
2. `ls src/espn/fixtures/` lists exactly `season-2026-proteams.json` and
   `week3-pregame.json`.
3. All previous expected values still pass unchanged: the 10-lane table, the timeline
   `t`s and axis labels, and `load.test`'s lanes and `toT`.
4. New tests, appended:
   - `buildSlate(league, {display: {}, settings: {}}, 1, …)` throws
     `season response has no settings.proTeams`.
   - `buildSlate(league, {proTeams: []}, 1, …)` throws the same error, which pins that
     the old shape is rejected.
   - `buildTimeline([], 'America/New_York')` throws `no NFL kickoffs for this week`.
   - `renderToStaticMarkup(<ConnectError error={new TypeError('boom')} .../>)`
     contains `Couldn't read the league data: boom` and does not contain `(0)`.
5. Test-block counts are at least `slate.test.ts` 25, `load.test.ts` 2,
   `timeline.test.ts` 13 and `Connect.test.tsx` 2.
6. `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`.
