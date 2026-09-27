# 08 - parse the user's ESPN league into a Slate: teams, lanes, projections and a real game timeline

## Deliverable

Tasks 4-6 drive the page from a `Slate` built by the mock (`src/sim/mock.ts`). This task
builds the same `Slate` from real ESPN league JSON, pre-kickoff, with **no events yet**.
Live scoring and play events are a later task. The page itself is not touched.

Two recorded responses from the user's private league 918355353 (season 2026, week 3)
are in `reference/espn-fixtures/`. They were captured through the task-7 dev proxy
before kickoff, and every owner SWID is replaced with `{SWID-nn}`.

- `week3-pregame.json` holds `status`, `scoringPeriodId`, `settings`
  (`lineupSlotCounts`, `scoringItems`), `members`, `teams` and `schedule` (the 6 week-3
  matchups, each side with `rosterForCurrentScoringPeriod.entries`,
  `totalProjectedPointsLive` and `winProbability`).
- `season-proteams-week3.json` holds `proTeams[]` with `id`, `abbrev`, `byeWeek` and
  `proGamesByScoringPeriod["3"]` (`{id, date (epoch ms), homeProTeamId, awayProTeamId}`).

Copy both files unchanged into `src/espn/fixtures/`, for example with
`cp reference/espn-fixtures/*.json src/espn/fixtures/`. Do not edit or reformat them.

This league does not match the design's roster. It starts **10** players:

| slot id | label |
|---|---|
| 0 | QB |
| 2 | RB |
| 3 | RB/WR |
| 4 | WR ×2 |
| 6 | TE |
| 23 | FLEX |
| 15 | DP |
| 16 | D/ST |
| 17 | K |

Slot 15 is an IDP slot (`DP`, a defensive player: linebackers are position id 11,
defensive ends 10). Bench is slot 20 and IR is 21.

NFL games also span Thursday to Monday, not one Sunday. Slate time `t ∈ [0, 1]`
therefore runs over a **timeline built from the week's real kickoffs**: each game is a
3.5 h window, overlapping windows merge, and the merged windows are placed end to end,
so the dead hours between game slots are skipped.

Reference: `reference/espn-api.md`, Q1 (views, slot and position maps, stats entries)
and Q6.

Targets:

- `src/espn/fixtures/week3-pregame.json`
- `src/espn/fixtures/season-proteams-week3.json`
- `src/espn/timeline.ts`
- `src/espn/timeline.test.ts`
- `src/espn/proTeams.ts`
- `src/espn/slate.ts`
- `src/espn/slate.test.ts`
- `src/model/types.ts`

## Interface Contract

`src/model/types.ts`: **append-only change.** Widen `Pos` to
`export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'DP'`. Nothing else in the
file changes.

`src/espn/timeline.ts`:

- `export const GAME_MS = 3.5 * 60 * 60 * 1000`
- `export interface Timeline { startMs: number; endMs: number; totalMs: number; toT(ms: number): number; toMs(t: number): number; axis: { label: string; t: number }[]; clockLabel(t: number): string }`
- `export function timeLabel(ms: number, timeZone: string, withMinutes: boolean): string`
  - Uses `Intl.DateTimeFormat('en-US', {timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit'})`.
  - Uppercases the weekday and turns every whitespace character (including U+202F and
    U+00A0) into a plain space.
  - When `withMinutes` is false and the minutes are `00`, it drops `:00`. For example
    `SUN 1 PM`, `THU 8:15 PM`.
- `export function buildTimeline(kickoffsMs: number[], timeZone: string): Timeline`
  - Sorts and dedups the kickoffs. Each kickoff opens a window `[k, k + GAME_MS]`, and a
    kickoff at or before the running window's end extends it. `totalMs` is the sum of
    the window lengths.
  - `toT(ms)`:
    - before the first window: 0
    - inside a window: (the length of all earlier windows + `ms` − the window start) /
      `totalMs`
    - in a gap: the `t` of the next window's start
    - after the last window: 1
  - `toMs` is the inverse on window points. `t = 1` maps to the last window's end.
  - `axis`: kickoffs are clustered, and a kickoff within 30 min of its cluster's first
    kickoff joins that cluster. Each cluster gets `{label: timeLabel(first, tz, false),
    t: toT(first)}`, then one final entry `{label: 'END', t: 1}`.
  - `clockLabel(t)` is `timeLabel(toMs(t), tz, true)`.

`src/espn/proTeams.ts`:

- `export interface ProTeam { id: number; abbrev: string; c1: string; c2: string; numC?: string }`
- `export const PRO_TEAMS: Record<number, ProTeam>`
  - All 32 NFL teams keyed by ESPN `proTeamId`, using the map in
    `reference/espn-api.md` Q1: 1 ATL, 2 BUF … 33 BAL, 34 HOU. There are no 31/32.
  - `c1` and `c2` are the primary and secondary colors. For the 15 teams in the design's
    `TEAMS` constant (`reference/footrace.dc.html` lines 233-242), copy `c1`/`c2`/`numC`
    exactly. For the other 17, use each team's official primary and secondary hex colors.
- `export function proTeamById(id: number): ProTeam` - throws `Error('unknown proTeamId ' + id)`
  for an unknown id.

`src/espn/slate.ts`:

- `export const SLOT_LABEL: Record<number, string>` - at least 0 QB, 1 TQB, 2 RB, 3 RB/WR,
  4 WR, 5 WR/TE, 6 TE, 7 OP, 15 DP, 16 D/ST, 17 K, 23 FLEX. Other IDP slots 8-14 use
  `DT DE LB DL CB S DB` in id order.
- `export const LANE_ORDER: number[]` - `[0, 1, 2, 3, 4, 5, 6, 23, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]`.
  Lanes follow this slot order, and within one slot the players keep their entry order.
- `export function posOf(defaultPositionId: number): Pos` - 1 QB, 2 RB, 3 WR, 4 TE, 5 K,
  16 DST, and the defensive-player ids 8-13 `'DP'`. This fixture has 10 (DE) and 11
  (LB). It throws on anything else, including 7 (punter) and 14 (head coach).
- `export interface LeagueTeam { id: number; name: string; owner: string }`
- `export function listTeams(league: any): LeagueTeam[]`
  - One entry per `league.teams[]`, in order. `owner` is the primary owner member's
    `firstName`, or `displayName` if empty.
- `export function buildSlate(league: any, season: any, myTeamId: number, opts: { timeZone: string }): Slate`
  - **Week:** `league.scoringPeriodId`. **Matchup:** the `schedule[]` entry whose home
    or away `teamId === myTeamId`. Throws `Error('no matchup for team ' + id)` if there
    is none.
  - **Teams:** `me = { name: <my team name>, owner: 'YOU' }`,
    `opp = { name: <opp team name>, owner: <opp owner firstName, UPPERCASE> }`.
  - **Timeline:** built from every week game's `date` across `season.proTeams`, deduped
    by game id.
  - **Starters:** the entries whose `lineupSlotId` is not 20 or 21. Lanes pair me/opp by
    `LANE_ORDER` slot and by position within the slot. If one side has more players in a
    slot than the other, the unpaired player is paired with an **empty player**: `name
    'EMPTY'`, `last 'EMPTY'`, `pos` the same as the other side, `team` the other
    player's team, `num 0`, `proj 0`, window `[1, 1]`.
  - **Player:**
    - `id`: `String(player.id)`
    - `name`, `last`: `fullName`, `lastName`
    - `pos`: `posOf(defaultPositionId)`
    - `team`: `proTeamById(proTeamId).abbrev`
    - `num`: `jersey` parsed as an int, `'D'` for D/ST, `0` if missing
    - `proj`: the `stats[]` entry with `statSourceId 1`, `statSplitTypeId 1` and
      `scoringPeriodId === week`, its `appliedTotal` rounded to 2 dp, or 0 if absent
    - `window`: `[toT(kickoff), toT(kickoff + GAME_MS)]` for the player's pro team's week
      game. A team with no week game (bye) gets `[1, 1]`.
    - `tag`: `'<ABBREV> D'` for D/ST, otherwise omitted
  - **Look:** `skin`, `hair`, `hc` and `beard` are deterministic in `player.id`.
    - Seed the task-4 `mulberry` with `player.id`.
    - `skin = floor(r*5)`.
    - `hair` is one of `short fade buzz curly locs`, except `'helmet'` for D/ST.
    - `hc` is one of the design's hair colors (`#1d1411 #5a3a22 #7a5534 #d4a650 #2a1d15`).
    - `beard = r < 0.35`.
  - **Colors:** `teamColors` holds one `TeamColors` for every abbrev that appears in the
    lanes.
  - `events: []`. `axis` is the timeline's axis. `clockLabel` is the timeline's.
  - `statusLabel(p, t)`:
    - `'BYE'` if `p.window[0] === 1 && p.proj === 0` and the team has no week game
    - `` 'KO ' + timeLabel(kickoff, tz, true) `` if `t < window[0]`
    - `'FINAL'` if `t >= window[1]`
    - `'LIVE'` otherwise

    A later task replaces `'LIVE'` with the real game clock.

## Behavior

- Pure functions only: no fetch and no React. They take parsed JSON.
- Timezone is always passed in. The app will pass the viewer's zone, and tests pass
  `'America/New_York'`.

## Constraints

- Do not edit anything outside the targets. `src/model/types.ts` gains only `'DP'`, and
  `git diff <base> -- src/model/types.ts` must show exactly one changed line.
- Do not change the fixtures' bytes: `cmp reference/espn-fixtures/X src/espn/fixtures/X`
  must succeed for both files.
- No new dependencies.

## Out of Scope

- Polling, live points, events, game clocks and injuries (later).
- Wiring into the page, the team picker, the mock/live switch (later).
- Using ESPN's `winProbability` (the page keeps its own model for now).

## Acceptance Check

Baselines were computed by the orchestrator from the two fixtures with python:

- **Timeline.** Week 3 has 16 games with kickoffs (ET) Thu 8:15 PM, Sun 1:00 PM ×9,
  Sun 4:05 PM ×2, Sun 4:25 PM ×2, Sun 8:20 PM and Mon 8:15 PM. That gives 4 merged
  windows and `totalMs = 62700000` (17.4167 h).
  - `toT` of the six distinct kickoffs 1790295300000, 1790528400000, 1790539500000,
    1790540700000, 1790554800000 and 1790640900000 is 0, 0.200957, 0.377990, 0.397129,
    0.598086 and 0.799043 (6 dp).
  - `endMs = 1790653500000`.
  - With `'America/New_York'`, `axis` is:
    - `THU 8:15 PM` @0
    - `SUN 1 PM` @0.200957
    - `SUN 4:05 PM` @0.377990 (4:25 joins that cluster)
    - `SUN 8:20 PM` @0.598086
    - `MON 8:15 PM` @0.799043
    - `END` @1
  - `clockLabel(0.200957)` is `SUN 1:00 PM`.
- **`listTeams`** returns 12 teams. The first is `{id: 1, name: 'Somethings Gotta Gibbs'}`.
- **`buildSlate(league, season, 1, {timeZone: 'America/New_York'})`:**
  - `me.name` is `Somethings Gotta Gibbs`, `opp.name` is `REAPR Sleepers`, and
    `opp.owner` is `IAN`.
  - It has 10 lanes. Slot labels and the me|opp player `name (proj)` per lane:

    | lane | slot | me | opp |
    |---|---|---|---|
    | 1 | QB | Jared Goff (16.62) | Dak Prescott (17.11) |
    | 2 | RB | Jahmyr Gibbs (23.4) | Chase Brown (14.62) |
    | 3 | RB/WR | Derrick Henry (17) | Parker Washington (12.36) |
    | 4 | WR | Davante Adams (13.04) | CeeDee Lamb (14.04) |
    | 5 | WR | Deebo Samuel Sr. (10.5) | Garrett Wilson (11.86) |
    | 6 | TE | George Kittle (10.53) | Isaiah Likely (9.94) |
    | 7 | FLEX | Jeremiyah Love (11.19) | TreVeyon Henderson (9.58) |
    | 8 | DP | Fred Warner (6.29) | Zack Baun (6.64) |
    | 9 | D/ST | Giants D/ST (6.96) | Bengals D/ST (6.69) |
    | 10 | K | Brandon Aubrey (8.73) | Ka'imi Fairbairn (8.31) |

  - The sum of `me` proj is 124.26, which equals the fixture's
    `totalProjectedPointsLive` for team 1, and the opp sum equals 111.15.
  - Fred Warner's `pos` is `'DP'`, the Giants D/ST's `num` is `'D'` and its `tag` is
    `'NYG D'`, and `events.length` is 0.
  - `snapshotAt(slate, 0)` (task 4) runs without throwing, and its
    `fmt(projected.me)` is `'124.3'`.
- **Determinism:** two `buildSlate` calls give deep-equal lanes. A player's look is the
  same regardless of which team is `me`.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the targets.
