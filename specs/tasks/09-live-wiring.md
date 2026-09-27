# 09 - load the user's league into the page: Live/Demo switch, team picker, real-time clock (pre-game, no scoring yet)

## Deliverable

The pieces exist but are not connected:

- `src/espn/client.ts` has `fetchLeague` (task 7).
- `src/espn/slate.ts` has `buildSlate` and `listTeams` (task 8).
- The page (`src/ui/MatchupPage.tsx`, task 6) renders a `Slate`, but `App` always gives
  it the mock.

This task makes the app open on the real league, league 918355353 in season 2026.

- Fetch the league, let the viewer pick their team, build the slate and render it.
- In Live mode the page's clock follows the real time of day on the slate timeline, not
  the simulation speed.
- Demo mode keeps today's mock behavior exactly.

No live scoring and no play events yet: that is the next task. Before kickoff the Live
page shows real names, projections, kickoff statuses and napping runners.

Targets:

- `src/espn/client.ts`
- `src/espn/client.test.ts`
- `src/espn/load.ts`
- `src/espn/load.test.ts`
- `src/ui/playback.ts`
- `src/ui/playback.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`
- `src/ui/Connect.tsx`
- `src/App.tsx`

## Interface Contract

`src/espn/client.ts` (**append**; existing exports unchanged):

- `export function seasonUrl(views: string[], opts?: { base?: string }): string` -
  `` `${base}/apis/v3/games/ffl/seasons/${SEASON}` `` plus `view=` params. This path is
  already allowed by the task-7 proxy.
- `export async function fetchSeason(views: string[], opts?: { fetchImpl?: typeof fetch }): Promise<unknown>` -
  the same error handling as `fetchLeague`.

`src/espn/load.ts`:

- `export interface LeagueInfo { week: number; name: string; teams: LeagueTeam[]; raw: any }`
- `export async function loadLeagueInfo(opts?: { fetchImpl?: typeof fetch }): Promise<LeagueInfo>`
  - One call: `fetchLeague(['mTeam', 'mSettings'])`.
  - `week = raw.status.currentMatchupPeriod`, `name = raw.settings.name`, and
    `teams = listTeams(raw)`.
- `export interface LiveSlate { slate: Slate; toT(ms: number): number }`
- `export async function loadLiveSlate(info: LeagueInfo, myTeamId: number, opts: { timeZone: string; fetchImpl?: typeof fetch }): Promise<LiveSlate>`
  - Calls `fetchLeague(['mMatchupScore', 'mScoreboard', 'mLiveScoring'], { scoringPeriodId: info.week, filter: { schedule: { filterMatchupPeriodIds: { value: [info.week] } } } })`
    and `fetchSeason(['proTeamSchedules_wl'])`, in parallel.
  - Then calls `buildSlate({ ...info.raw, scoringPeriodId: info.week, schedule: matchup.schedule }, season, myTeamId, { timeZone })`.

`src/ui/playback.ts` (**append**; existing exports unchanged):

- `export function followLive(p: Playback, liveT: number): Playback`
  - Sets `liveT` to `max(p.liveT, clamp(liveT, 0, 1))`.
  - If `t` was live (`p.t >= p.liveT - 1e-9`), `t` becomes the new `liveT`.
  - While scrubbing, only `liveT` moves.
  - `playing` becomes `false` once `liveT >= 1` and `t >= 1`.

`src/ui/MatchupPage.tsx` (**extend props**; the defaults keep today's behavior exactly):

- `export interface MatchupPageProps { slate: Slate; slateMinutes?: number; showTags?: boolean; subtitle?: string; headerExtra?: React.ReactNode; liveNow?: () => number; storageKey?: string }`
  - `subtitle` defaults to `'WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE'`. It replaces that
    literal in the header.
  - `headerExtra` renders immediately before the sound button, in the same flex row.
  - `liveNow`, when given, returns the current slate `t`. Each 100 ms tick then applies
    `followLive(p, liveNow())` instead of `advance(...)`, and does event firing on the
    resulting `t` exactly as before.
    - Replay still works: when the viewer scrubs back, `t` advances at `speed` toward
      `liveT` exactly as `advance` does for `t`. Only the `liveT` source changes.
    - Implement it by computing `advance` for `t`, then overriding `liveT` with
      `followLive`, or with an equivalent pure helper in `playback.ts`.
  - `storageKey` defaults to `'gd_sim_v1'`. It is the localStorage key for playback
    persistence, so Live and Demo do not share saved positions.

`src/ui/Connect.tsx`:

- `export function TeamPicker(props: { teams: LeagueTeam[]; leagueName: string; onPick(id: number): void; onDemo(): void }): JSX.Element`
  - A cream card in the design's style: `#fffaf0`, a `3px solid #1c1a22` border, 16px
    radius, a `0 6px 0 #1c1a22` shadow, and a Lilita One title.
  - The title is `Pick your team`, with the league name below.
  - One button per team, showing `name` and `owner`, in the taunt-button style.
  - A `Just watch the demo` button that calls `onDemo`.
- `export function ConnectError(props: { error: unknown; onRetry(): void; onDemo(): void }): JSX.Element`
  - The same card style, with a message chosen from `EspnError.kind`:
    - `private`: `ESPN says this league is private. The proxy isn't sending your cookies - check ESPN_S2 and SWID in .env.local and restart pnpm dev.`
    - `network`: `Can't reach the ESPN proxy.`
    - anything else: `ESPN returned an error (<status>).`
  - `Retry` and `Use demo` buttons.
- `export function ModeSwitch(props: { mode: 'live' | 'demo'; onMode(m: 'live' | 'demo'): void; onChangeTeam?: () => void }): JSX.Element`
  - Two pill buttons, `LIVE` and `DEMO`, in the sound button's style, with the active
    one filled `#1c1a22` and cream text. Then `CHANGE TEAM` when `onChangeTeam` is given.

`src/App.tsx`:

- `export default function App()`:
  - **Mode.** Read from `localStorage['ff_mode']` (`'live' | 'demo'`, default `'live'`).
  - **Team.** Read from `localStorage['ff_team']` (a number, or absent).
  - **Live flow.** `loadLeagueInfo()`, then if no saved team, or a saved team not in
    `info.teams`, show `TeamPicker`. Otherwise `loadLiveSlate(info, team,
    { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })`, then render
    `<MatchupPage>` with:
    - `slate`
    - `subtitle` = `` `WEEK ${info.week} · ${info.name.toUpperCase()}` ``
    - `liveNow` = `() => live.toT(Date.now())`
    - `storageKey = 'ff_live_v1'`
    - `headerExtra` = `<ModeSwitch>`
  - **Loading.** A centered `Loading league…` in Silkscreen while fetches are in flight.
  - **Errors.** Show `ConnectError`.
  - **Demo.** Exactly today's mock page, plus `headerExtra = <ModeSwitch mode="demo">`.
  - **Change team.** Clears `ff_team` and shows the picker.
  - Every localStorage access goes through try/catch.

## Behavior

- In Live mode before kickoff: all events are empty, runners nap until their game's
  window, the status shows `KO THU 8:15 PM`-style labels, the scrubber axis shows the
  real kickoff labels, and the clock label shows the real day and time.
- Remounting `MatchupPage` on a mode or team change is fine. Key it by mode and team.
- No cookies, secrets or `.env` reads anywhere in browser code.

## Constraints

- Only the targets change. The existing tests must keep passing unchanged, except that
  you may **append** new `test(...)` blocks to the three existing test files. Existing
  blocks stay byte-identical.
- No new dependencies. No router.

## Out of Scope

- Polling, live points, play events, game clocks and the Cloudflare Worker.

## Acceptance Check

Baselines come from the task-8 fixtures (`src/espn/fixtures/`, league 918355353, week 3).
The existing test counts on the base branch are preserved: every existing `test(` block
in the three edited test files is still present, unchanged.

The new tests assert:

- `loadLeagueInfo` with a fake `fetchImpl` serving
  `{status, scoringPeriodId, settings, members, teams}` from `week3-pregame.json`
  returns `week 3`, `name '#fpandfriends'` and 12 teams.
- `loadLiveSlate(info, 1, {timeZone: 'America/New_York', fetchImpl})`:
  - The fake serves `{schedule}` for the matchup URL and `season-proteams-week3.json`
    for the season URL.
  - The matchup request carries `scoringPeriodId=3`, the three views and the
    `X-Fantasy-Filter` header `{"schedule":{"filterMatchupPeriodIds":{"value":[3]}}}`.
  - `result.slate` has 10 lanes, with the first `Jared Goff | Dak Prescott` and the ninth
    `Giants D/ST | Bengals D/ST`.
  - `result.toT(1790528400000)` rounds to `0.200957`.
- `seasonUrl(['proTeamSchedules_wl'], {base: '/espn'})` is
  `'/espn/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl'`.
- `followLive({t: 0.2, liveT: 0.2, speed: 1, playing: true, scrubbing: false}, 0.35)`
  gives `t 0.35, liveT 0.35`.
- From replay `{t: 0.1, liveT: 0.2}`, `followLive(…, 0.3)` gives `t 0.1, liveT 0.3`.
- `followLive(p, 0.1)` with `p.liveT 0.2` keeps `liveT 0.2`, because it never goes
  backwards.
- `followLive(p, 1.5)` caps `liveT` at 1.
- `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} subtitle="WEEK 3 · #FPANDFRIENDS" />)`
  contains `WEEK 3 · #FPANDFRIENDS` and not `BACKYARD LEAGUE`. Without `subtitle` it
  still contains the design literal.
- `renderToStaticMarkup(<TeamPicker teams={...12} leagueName="#fpandfriends" .../>)`
  contains `Pick your team`, all 12 team names and `Just watch the demo`.
- `ConnectError` with `new EspnError(...)` of kind `private` contains `.env.local`.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, `git diff <base> --stat`
lists only targets, and `grep -rn "ESPN_S2\|SWID=" dist/` finds nothing.
