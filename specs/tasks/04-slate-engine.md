# 04 - port the design's mock slate to a pure TypeScript engine behind a data model a live ESPN source can fill later

## Deliverable

`reference/footrace.dc.html` drives its whole page from a seeded mock simulation written
inline in its `<script data-dc-script>` block (the constants `TEAMS`, `ROSTER`, `ANIM`,
`TDK`, `WINDOWS`, and the functions `mulberry`, `score`, `pick`, `genEvents`, `describe`,
`fmt`, `sgn`, `clock`, `status`, `erf`, plus the totals / projection / win-probability
math at the top of `renderVals()`). Port that logic, with **no React and no DOM**, into
typed modules, separated into:

- a **data model** (`Slate`) that says what the page needs, independent of where the data
  comes from - a later task fills it from ESPN (see `reference/espn-api.md`, which you do
  not need to act on here);
- a **mock source** that builds a `Slate` exactly as the design's simulation does;
- **derive** functions that compute everything the page shows at slate time `t`.

The numbers must match the design bit-for-bit; the Acceptance Check pins them.

Targets:

- `src/model/types.ts`
- `src/model/derive.ts`
- `src/model/derive.test.ts`
- `src/sim/mock.ts`
- `src/sim/mock.test.ts`

## Interface Contract

`src/model/types.ts`:

- `export type Side = 'me' | 'opp'`
- `export type Pos = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST'`
- `export type EventKind = 'pass' | 'passTD' | 'int' | 'rush' | 'rushTD' | 'catch' | 'recTD' | 'fumble' | 'fg' | 'xp' | 'sack' | 'dint' | 'fumrec' | 'dtd' | 'injury'`
- `export type Hair = 'short' | 'fade' | 'buzz' | 'curly' | 'locs' | 'helmet'`
- `export interface TeamColors { c1: string; c2: string; numC?: string }`
- `export interface Player { id: string; name: string; last: string; tag?: string; pos: Pos; team: string; num: number | 'D'; proj: number; skin: number; hair: Hair; hc?: string; beard?: boolean; window: [number, number] }`
  - `window` is the player's game as slate fractions `[kickoff, final]`; in the mock it is
    `WINDOWS[TEAMS[team].w]`.
- `export interface Lane { slot: string; me: Player; opp: Player }`
- `export interface FantasyTeam { name: string; owner: string }`
- `export interface PlayEvent { id: number; t: number; side: Side; lane: number; kind: EventKind; yds: number; pts: number; text: string }`
  - `lane` is the index into `Slate.lanes` (the design's `i`); `text` is the ticker line
    (the design's `describe(e)`).
- `export interface Slate { me: FantasyTeam; opp: FantasyTeam; lanes: Lane[]; events: PlayEvent[]; teamColors: Record<string, TeamColors>; clockLabel(t: number): string; statusLabel(p: Player, t: number): string; axis: { label: string; t: number }[] }`
  - `events` sorted by `t` ascending, `id` 1..n in that order.
  - `axis` is the scrubber's tick labels (the design's `1 PM` / `4 PM` / `SNF` / `END`
    at `0` / `0.286` / `0.698` / `1`).

`src/model/derive.ts`:

- `export function fmt(n: number): string` - the design's `fmt`.
- `export function sgn(n: number): string` - the design's `sgn` (uses the U+2212 minus).
- `export function erf(x: number): number` - the design's `erf`.
- `export interface SideTotals { me: number; opp: number }`
- `export interface Snapshot { totals: SideTotals; projected: SideTotals; winPct: number; laneTotals: { me: number; opp: number }[]; out: Set<string>; past: PlayEvent[] }`
- `export function snapshotAt(slate: Slate, t: number): Snapshot` - the design's
  `renderVals()` math: sums `pts` of events with `event.t <= t`; `out` holds
  `` `${side}${lane}` `` for every `injury` event so far; remaining projection per player
  is `0` if out else `proj * (1 - f)`, with `f` clamped `(t - window[0]) / (window[1] -
  window[0])`; `projected = totals + remaining`; win probability via `erf` with
  `sd = sqrt(sum(remaining * 1.8)) + 0.4`, clamped to `[0.01, 0.99]` before final, and
  `1 / 0 / 0.5` at `t >= 1`; `winPct = Math.round(p * 100)`. `past` is the events so far,
  in time order.

`src/sim/mock.ts`:

- `export type Scoring = 'PPR' | 'Half PPR' | 'Standard'`
- `export function mulberry(seed: number): () => number`
- `export function scorePlay(kind: EventKind, yds: number, mode: Scoring): number` - the
  design's `score`.
- `export function mockSlate(scoring: Scoring): Slate` - seed `20260927`, the design's
  `ROSTER` / `TEAMS` / `WINDOWS`, `genEvents` exactly (event generation always uses
  `'Half PPR'` to size each player's list, as the design does), then
  `pts = Math.round(scorePlay(...) * 100) / 100` under `scoring`. Teams:
  `me = { name: 'Hail Mary Poppins', owner: 'YOU' }`,
  `opp = { name: 'The Kupp Runneth Over', owner: 'DAVE' }`. `clockLabel` is the design's
  `clock`; `statusLabel` is the design's `status`. Player `id` is `` `${side}${i}` ``.

## Behavior

- Preserve the design's RNG call order exactly (per side, per player: target, then the
  `pick` draws, then the time draws; the `injuryAt` cut for Derrick Henry), or the numbers
  will not match.
- `mockSlate` is pure and deterministic: two calls return equal slates.
- No module in this task imports React, touches `window`, `document` or `localStorage`.

## Constraints

- Do not edit any file outside the targets. `src/App.tsx`, `src/main.tsx`,
  `src/styles/global.css`, `src/smoke.test.ts`, `tools/adw/gate.sh` and all config files
  must be byte-identical to the base branch.
- No new dependencies.

## Out of Scope

- Rendering, avatars, animations, sound, taunts, playback state: later tasks.
- ESPN fetching or parsing.

## Acceptance Check

Baselines were taken by running the design's own script functions under node:

- Event count 135 for every scoring mode. Kind counts: pass 24, passTD 3, int 3, rush 24,
  rushTD 5, catch 39, recTD 10, fumble 7, fg 5, xp 2, sack 6, dint 2, fumrec 4, injury 1.
- Final totals (`t = 1`): PPR me 188.5 / opp 140.4; Half PPR 172.0 / 132.4; Standard
  155.5 / 124.4 (as `fmt` strings).
- First event: `pass`, 16 yds, side `me`, lane 0, id 1, Half PPR pts 0.64, text
  `Allen dials up a 16-yd strike`. Last event: id 135, `catch`, 24 yds, side `opp`,
  lane 6, pts 2.4.
- `clockLabel`: `0 -> '1:00 PM'`, `0.5 -> '6:15 PM'`, `1 -> '11:30 PM'`.
  `statusLabel(Josh Allen, t)`: `0 -> 'KO 1:03 PM'`, `0.1 -> 'Q2 10:00'`, `0.5 -> 'FINAL'`.
- `sgn(3.14) = '+3.1'`, `sgn(-2) = '−2.0'`, `sgn(0.01) = '0.0'`; `erf(0.5)` rounds to
  `0.521` (3 dp), `erf(-1)` to `-0.843`.
- `snapshotAt(mockSlate('Half PPR'), t)` -> `[fmt(totals.me), fmt(totals.opp),
  fmt(projected.me), fmt(projected.opp), winPct]`:
  - `t=0`: `['0.0','0.0','138.5','136.1',54]`
  - `t=0.06`: `['15.1','9.1','137.7','132.9',59]`
  - `t=0.3`: `['82.1','57.3','138.0','129.4',71]`
  - `t=0.5`: `['102.4','83.8','133.7','120.1',88]`
  - `t=1`: `['172.0','132.4','172.0','132.4',100]`

The two test files assert every value above. Then `sh tools/adw/gate.sh --full` ends
`ADW_RESULT: pass`, and `git diff <base> --stat` lists only the five targets.
