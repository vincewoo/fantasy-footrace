# 17 - real game clocks from ESPN's public NFL scoreboard in each player's status line

## Deliverable

In Live mode, each name card's status reads `KO …`, `LIVE` or `FINAL`, computed from the
timeline window (`statusLabel` in `src/espn/slate.ts`). The user wants the real game
state instead: `Q2 4:31`, `HALF`, `OT 2:10` or `FINAL`.

ESPN's public scoreboard provides it. It is CORS-open (`access-control-allow-origin: *`,
verified by the orchestrator), so the browser calls it directly with no proxy, no
Worker and no cookies:

`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=<week>&dates=<season>`

A raw, unmodified capture from Sunday 2026-09-27 at about 6:49 AM PT is in
`reference/espn-fixtures/scoreboard-week3-sun-am.json`. It has 16 events: 15
`STATUS_SCHEDULED` and 1 `STATUS_FINAL` (GB 9 vs ATL 1, the Thursday game).

- `events[].competitions[0].status` holds `{clock, displayClock, period, type: {name,
  state, completed, shortDetail, …}}`.
- `type.state` is `'pre' | 'in' | 'post'`.
- `events[].competitions[0].competitors[].team.id` is a string equal to the fantasy
  `proTeamId`. All 32 ids appear: 1-30, 33 and 34.

No game was in progress at capture time, so the `'in'` state is **not in the fixture**.
Its fields (`period`, `displayClock`, `type.name`) are the same keys as in the captured
pre and post statuses. Tests for `'in'` use synthetic status objects built by copying the
fixture's status shape and changing those fields.

Targets:

- `src/espn/fixtures/scoreboard-week3-sun-am.json` - copy it with `cp` from
  `reference/espn-fixtures/`, byte-identical
- `src/espn/scoreboard.ts`
- `src/espn/scoreboard.test.ts`
- `src/App.tsx`

## Interface Contract

`src/espn/scoreboard.ts`:

- `export interface GameStatus { state: 'pre' | 'in' | 'post'; name: string; period: number; displayClock: string; shortDetail: string; completed: boolean }`
- `export function scoreboardUrl(season: number, week: number): string` - the URL above.
- `export async function fetchScoreboard(season: number, week: number, opts?: { fetchImpl?: typeof fetch }): Promise<unknown>`
  - A GET with `credentials: 'omit'` and no custom headers.
  - A non-2xx response or a thrown fetch rejects with an `Error` whose message contains
    the status or the cause.
- `export function statusesByTeam(scoreboard: any): Record<string, GameStatus>`
  - Keyed by **team abbrev** as `proTeamById(Number(team.id)).abbrev`, from
    `src/espn/proTeams.ts`, so the keys match `Player.team`.
  - Both competitors of each event map to that event's status.
  - Unknown ids are skipped, not thrown.
- `export function gameLabel(s: GameStatus): string | null`, applying the first rule
  that matches:
  1. `state === 'post'`: `'FINAL'` if `completed`, else `shortDetail.toUpperCase()`.
  2. `state === 'pre'`: `null`, meaning "use the timeline label" (`KO …`).
  3. `name === 'STATUS_HALFTIME'`: `'HALF'`.
  4. `name === 'STATUS_END_PERIOD'`: `` `END Q${period}` ``, or `'END OT'` when
     `period >= 5`.
  5. Otherwise, while `in`: `` `Q${period} ${displayClock}` ``, or
     `` `OT ${displayClock}` `` when `period >= 5`.
- `export function withGameStatus(slate: Slate, statuses: Record<string, GameStatus>, liveT: number): Slate`
  - Returns a new slate, otherwise identical, whose `statusLabel(p, t)` is:
    - `gameLabel(statuses[p.team])` when `t >= liveT - 0.002` and the label is non-null
    - the original `slate.statusLabel(p, t)` otherwise, which covers replay and games
      not started
  - Events are unchanged (the same array reference).

`src/App.tsx`:

- In Live mode, fetch the scoreboard once after the slate loads, and again on the
  **same** 15 s tick that already calls `pollLive` (task 16). Poll when that tick polls
  the matchup, in parallel with it, with the same in-flight guard.
- Keep the latest `statuses` in state, and render `MatchupPage` with
  `withGameStatus(live.slate, statuses, live.toT(Date.now()))`. Memoize it on
  `[live.slate, statuses]`.
- A failed scoreboard fetch keeps the previous statuses, silently.
- Demo mode is untouched.

## Constraints

- Do not edit `src/espn/slate.ts`, `load.ts`, `live.ts`, `client.ts`, `src/ui/*`, the
  worker or the configs. The existing tests are untouched.
- No new dependencies.

## Out of Scope

- Down and distance, possession and red-zone indicators. Game scores.

## Acceptance Check

Baselines are from the raw fixture, checked by the orchestrator with python:

- 16 events, with `state` counts `pre` 15 and `post` 1.
- `statusesByTeam` has 32 keys, including `GB` and `ATL` mapping to `{state: 'post',
  completed: true, shortDetail: 'Final', period: 4}` and `BUF`/`LAC` mapping to
  `{state: 'pre', shortDetail: '9/27 - 1:00 PM EDT', period: 0}`.
  - The test asserts ESPN id 28 maps to key `WSH` if `proTeamById(28).abbrev` is
    `'WSH'`. Read `proTeams.ts` first and assert whatever abbrev it holds for id 28.
    Keys come from `proTeams.ts`, not from ESPN's abbreviation.
- `gameLabel`:
  - GB's status gives `'FINAL'`, and BUF's gives `null`.
  - Synthetic statuses built from BUF's status with `state: 'in'`,
    `name: 'STATUS_IN_PROGRESS'`:
    - `period 2, displayClock '4:31'` gives `'Q2 4:31'`
    - `period 5, displayClock '2:10'` gives `'OT 2:10'`
  - `name 'STATUS_HALFTIME'` gives `'HALF'`.
  - `name 'STATUS_END_PERIOD', period 3` gives `'END Q3'`.
  - `state 'post', completed false, shortDetail 'Postponed'` gives `'POSTPONED'`.
- `withGameStatus(buildSlate(…team 1…), statuses, 0.5)`, with the task-8 fixtures:
  - For a player on a team whose synthetic status is `in`/Q2 4:31: `statusLabel(p, 0.5)`
    is `'Q2 4:31'`, and `statusLabel(p, 0.3)` (replay) is the original label.
  - For a BUF player (`pre`), `statusLabel(p, 0.5)` equals the original label.
  - `slate.events` is the same reference.
- `scoreboardUrl(2026, 3)` is
  `'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=3&dates=2026'`.
- `fetchScoreboard` with a fake `fetchImpl` returning 500 rejects. With the fixture it
  resolves to the parsed body.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, `cmp` of the two fixture
copies succeeds, and `git diff main --stat` lists only the targets.
