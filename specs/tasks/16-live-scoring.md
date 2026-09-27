# 16 - live scoring: turn ESPN's actual points into play events, seed finished games, poll every 15s during games

## Deliverable

The user reported that teams with Thursday Night Football starters show no points. The
Live slate is built with `events: []` (task 8), so every score reads 0.0, and the page
fetches ESPN once and never again.

The data is already in the matchup response. A starter's
`playerPoolEntry.player.stats[]` entry with `statSourceId 0`, `statSplitTypeId 1` and
`scoringPeriodId === week` holds:

- `appliedTotal`: league-scored points, equal to ESPN's own team total
- `stats`: raw counts and yards, keyed by stat id
- `appliedStats`: points per stat id

For example, Jordan Love in the week-3 fixture has
`stats {3: 312, 4: 2, 20: 1, …}`, `appliedStats {3: 12.48, 4: 8.0, 20: -2.0}` and
`appliedTotal 18.48`. Back to Back Champs' `totalPointsLive` of 41.58 equals the sum of
its starters' `appliedTotal` (Love 18.48, Golden 18.5, Kraft 4.6).

This task turns those numbers into `PlayEvent`s that the page already animates. There
are two parts:

- **Seeding at load.** For points earned before the page opened, events are spread
  across the part of the player's game window that has already elapsed.
- **Polling.** Every 15 s while any lane player's game is in progress, the page
  re-fetches the matchup. Each starter's change since the last poll becomes new events
  at the current slate time.

Event points always sum exactly to ESPN's `appliedTotal`, so the scoreboard matches
ESPN.

Targets:

- `src/espn/live.ts`
- `src/espn/live.test.ts`
- `src/espn/load.ts`
- `src/espn/load.test.ts`
- `src/App.tsx`

## Interface Contract

`src/espn/live.ts` (pure, no fetch and no React):

- `export interface Actual { total: number; stats: Record<string, number>; applied: Record<string, number> }`
- `export function actualOf(player: any, week: number): Actual | null` - reads the entry
  described above, with `total` rounded to 2 dp. Missing `stats` or `appliedStats`
  become `{}`. Returns `null` if there is no such entry.
- `export interface Piece { kind: EventKind; yds: number; pts: number }`
- `export function decompose(pos: Pos, prev: Actual | null, cur: Actual): Piece[]` - see
  "Decomposition".
- `export function describeLive(kind: EventKind, last: string, yds: number): string` -
  see "Text".
- `export interface PollState { actuals: Record<string, Actual>; out: string[] }` -
  keyed by `String(player.id)`, starters of **both** sides only (slot not 20 or 21).
  `out` is the starters whose `player.injuryStatus === 'OUT'`.
- `export function readPoll(schedule: any[], myTeamId: number, week: number): PollState` -
  uses the schedule entry that contains `myTeamId`.
- `export function eventsFromPoll(slate: Slate, prev: PollState | null, cur: PollState, tNow: number, firstId: number): PlayEvent[]` -
  see "Timing".
- `export function withEvents(slate: Slate, events: PlayEvent[]): Slate` - a new slate
  whose `events` are the old ones plus the new ones, stably sorted by `t`. Ids are kept,
  and every other field is unchanged.

`src/espn/load.ts` (**extend**; existing exports keep their behavior):

- `LiveSlate` gains `poll: PollState`.
- `loadLiveSlate(info, myTeamId, opts)`:
  - `opts` gains `now?: number`, defaulting to `Date.now()`.
  - After building the slate as today, it computes
    `cur = readPoll(matchup.schedule, myTeamId, info.week)` and
    `seed = eventsFromPoll(slate, null, cur, toT(now), 1)`.
  - It returns `slate: withEvents(slate, seed)` and `poll: cur`.
- `export async function pollLive(info: LeagueInfo, live: LiveSlate, opts?: { fetchImpl?: typeof fetch; now?: number }): Promise<LiveSlate>`
  - Re-fetches **only** the matchup, with the same views, `scoringPeriodId` and filter
    as `loadLiveSlate`.
  - `cur = readPoll(...)`, and
    `events = eventsFromPoll(live.slate, live.poll, cur, live.toT(now), maxId + 1)`,
    where `maxId` is the largest existing event id, or 0.
  - Returns `{...live, slate: withEvents(live.slate, events), poll: cur}`.

`src/App.tsx`:

- In Live mode, while a `LiveSlate` is shown, run a 15000 ms interval. On each tick:
  - `tNow = live.toT(Date.now())`.
  - If some lane player on either side has `window[0] < tNow < window[1]`, call
    `pollLive(info, live)` and `setLive` with the result.
  - A failed poll keeps the current slate, is ignored silently, and is retried on the
    next tick.
  - Only one poll is in flight at a time.
  - The interval is cleared on unmount and on team or mode change.

## Decomposition (`decompose`)

1. **Work on the delta.** `d.stats[k] = cur.stats[k] − (prev?.stats[k] ?? 0)`, and
   likewise for `d.applied`. `dTotal = round2(cur.total − (prev?.total ?? 0))`. If
   `|dTotal| < 0.005` and no `d.stats` value is positive, return `[]`.
2. **Yardage pieces.** In this order, pass, then rush, then catch:
   - **pass** uses yards stat `3` and points `applied[3]`.
   - **rush** uses yards stat `24` and points `applied[24]`.
   - **catch** uses yards stat `42` and points `applied[42] + applied[53]`. If the
     yards delta is ≤ 0 but `d.stats[53] > 0`, use `n = min(d.stats[53], 8)` catch
     pieces of 0 yds.

   For each, when the yards delta `y > 0`:
   - `n = min(max(1, round(y / 15)), 8)` pieces.
   - The yards are split as integers: the first `y mod n` pieces get `floor(y/n)+1`,
     the rest `floor(y/n)`.
   - The points are split by the **spread rule**: every piece gets `round2(total/n)`
     except the last, which gets `round2(total − sum(others))`.
3. **Special pieces**, one per counted unit of `d.stats`, with points split by the
   spread rule over that stat's `d.applied` and `yds 0`. In this order:
   - `4` gives `passTD`, `25` gives `rushTD`, `43` gives `recTD`
   - `20` gives `int`, `72` gives `fumble`
   - K: `74`, `77`, `80`, `198`, `201` (made FGs) give `fg`, and `86` (made PAT) gives
     `xp`
   - D/ST and DP: `99` gives `sack`, `95` gives `dint`, `96` gives `fumrec`, and `93`,
     `94`, `101`, `102`, `103`, `104` give `dtd`
4. **Order.** With `n` yardage pieces and `k` special pieces, special `j` (0-based) goes
   right after the first `floor((j+1)*n/(k+1))` yardage pieces.
5. **Remainder.**
   - `rem = round2(dTotal − sum(pieces.pts))`. This covers bonuses, D/ST points-allowed
     tiers and unknown stat ids.
   - If there are pieces and `|rem| ≥ 0.005`, add `rem` to the last piece, rounded to
     2 dp.
   - If there are no pieces and `|dTotal| ≥ 0.005`, return one fallback piece with
     `yds 0` and `pts dTotal`. Its kind comes from `pos`: QB `pass`, RB `rush`, WR/TE
     `catch`, K `xp`, DST/DP `sack`.
6. The sum of the returned `pts` always equals `dTotal` to 2 dp.

## Timing (`eventsFromPoll`)

For every lane `i` and side `s` whose player is not the empty player, with
`[w0, w1] = player.window`:

- **First observation** (`prev` null, or the player id absent from `prev.actuals`):
  - Let `end = min(max(tNow, w0), w1)`.
  - Place piece `j` of `N` at `w0 + (j+1)/(N+1) * (end − w0)`.
  - If the id is in `cur.out`, prepend an `injury` event (pts 0, yds 0) at `w0`.
- **Later polls:** place piece `j` at `max(tNow, w0) + (j+1) * 1e-6`. If the id is in
  `cur.out` but not in `prev.out`, prepend an `injury` event at `max(tNow, w0)`.
- **Event fields:** `{id, t, side: s, lane: i, kind, yds, pts, text: describeLive(kind, player.last, yds)}`.
- **Order and ids:** all new events are sorted by `t` and numbered `firstId,
  firstId+1, …` in that order.

## Text (`describeLive`)

| kind | text |
|---|---|
| `pass` | `` `${last} completes ${yds} yds` `` |
| `passTD` | `` `${last} throws a TD!` `` |
| `int` | `` `${last} throws a pick` `` |
| `rush` | `` `${last} runs for ${yds} yds` `` |
| `rushTD` | `` `${last} punches it in. TD!` `` |
| `catch` | `` `${last} hauls in ${yds} yds` `` |
| `recTD` | `` `${last} catches a TD!` `` |
| `fumble` | `` `${last} fumbles it away` `` |
| `fg` | `` `${last} drills a field goal` `` |
| `xp` | `` `${last} extra point is good` `` |
| `sack` | `` `${last} bring the heat` `` |
| `dint` | `` `${last} pick one off` `` |
| `fumrec` | `` `${last} recover a fumble` `` |
| `dtd` | `` `${last} defensive TD!` `` |
| `injury` | `` `${last} ruled OUT` `` |

When `yds` is 0, the yardage kinds drop the yardage: `completes a pass`, `runs it`,
`hauls one in`.

## Constraints

- Append-only tests. `load.test.ts` has 3 blocks on `main`, and those stay
  byte-identical.
- Do not edit `src/ui/*`, `src/espn/slate.ts`, `timeline.ts`, `client.ts`, the worker,
  the model types or the fixtures. `MatchupPage`'s interval already restarts when the
  `slate` prop changes, so newly appended events fire with no page change.
- No new dependencies.

## Out of Scope

- Real game clocks (`Q2 4:31`) from ESPN's public scoreboard. `statusLabel` keeps
  `LIVE`.
- Per-play text from ESPN's core plays API.

## Acceptance Check

Baselines were computed by the orchestrator with python over
`src/espn/fixtures/week3-pregame.json`, implementing exactly the rules above.

- **`actualOf`, Jordan Love** gives `total 18.48`, `stats['3'] 312`, `stats['4'] 2`,
  `applied['20'] -2`.
- **`decompose(…, null, cur)`**, listed as `kind yds pts`:

  | player | pieces, in order | count | sum |
  |---|---|---|---|
  | Love (QB) | pass 39 1.56, pass 39 1.56, passTD 0 4.0, pass 39 1.56, pass 39 1.56, passTD 0 4.0, pass 39 1.56, pass 39 1.56, int 0 -2.0, pass 39 1.56, pass 39 1.56 | 11 | 18.48 |
  | Matthew Golden (WR) | catch 15 1.79, catch 15 1.79, catch 14 1.79, recTD 0 6.0, catch 14 1.79, catch 14 1.79, catch 14 1.79, catch 14 1.76 | 8 | 18.5 |
  | Tucker Kraft (TE) | catch 13 2.3, catch 13 2.3 | 2 | 4.6 |
  | Bijan Robinson (RB) | rush 25 2.43, rush 25 2.43, rush 24 2.43, rushTD 0 6.0, rush 24 2.43, rush 24 2.43, rush 24 2.43, rushTD 0 6.0, rush 24 2.43, rush 24 2.39, catch 19 2.9 | 11 | 34.3 |
  | Drake London (WR) | 8 catches, 25/25/24/24/24/24/24/24 yds, 2.99 ×7, then 3.72 | 8 | 24.65 |

  Drake London's unknown stat `108` (0.75) lands on his last piece.
- **Delta.** `prev = {total: 12.0, stats: {'3': 200, '4': 1}, applied: {'3': 8.0, '4': 4.0}}`
  against Love's `cur` gives 9 pieces: pass 16 0.64, pass 16 0.64, passTD 0 4.0,
  pass 16 0.64, pass 16 0.64, int 0 -2.0, pass 16 0.64, pass 16 0.64, pass 16 0.64. The
  sum is 6.48.
- **No change.** `decompose(pos, x, x)` gives `[]`.
- **No pieces.** `{total: 3, stats: {}, applied: {'999': 3}}` for a DST gives one
  `sack 0 3`.
- **`loadLiveSlate(info, 6, {timeZone: 'America/New_York', fetchImpl, now: 1790528400000})`**,
  at Sunday 1 PM ET with fixture fakes:
  - `slate.events.length` is 21 (Love 11, Golden 8, Kraft 2). The Blue Js have no
    actuals.
  - `snapshotAt(slate, toT(1790528400000))` gives `fmt(totals.me) '41.6'` and
    `fmt(totals.opp) '0.0'`.
  - Every event has `side 'me'`.
  - The first event is Love's: `kind 'pass'`, text `Love completes 39 yds`, `t`
    rounding to `0.016746` (6 dp), which is `0.200957 × 1/12`.
- **OUT.** `loadLiveSlate(info, 14, …)` contains exactly one `injury` event, for Devin
  Lloyd (the DP slot, `injuryStatus 'OUT'` in the fixture), at `t === window[0]` with
  pts 0.
- **`pollLive`**, using the same `now`, a fake serving the identical matchup gives 0
  new events. A fake where Love's actual has `stats['3'] 342`, `applied['3'] 13.68` and
  `appliedTotal 19.68` gives 2 new `pass` events of 15 yds and 0.6 pts, with ids 22 and
  23, and `t` just above `toT(now)`.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff main --stat`
lists only the targets.
