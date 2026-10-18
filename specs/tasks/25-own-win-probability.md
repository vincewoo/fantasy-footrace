# 25 - show our own win probability; keep ESPN's reading as a secondary line

## Deliverable

A published analysis (https://x.com/will_j_5/status/2111844628710215817) shows ESPN's fantasy
win probability is miscalibrated: it treats a team's upside as a standard deviation that adds across
starters and shrinks linearly with the share of the game left, when only variances add and
the standard deviation shrinks with the square root. Teams ESPN gives 70% actually win about 82%
before games start, and ESPN overrates the favorite late in the week.

Our own model in `snapshotAt` (`src/model/derive.ts`) already sums per-player variances
(`v += r * 1.8`, `sd = Math.sqrt(v) + 0.4`), so it does not make that error. But line 70-71 overrides
it with ESPN's latest reading (`slate.odds`) whenever one exists. Change that:

1. `Snapshot.winPct` is always our model's number (the existing clamped `pw`, with the existing
   `t >= 1` final handling). Delete the `slate.odds` override.
2. `Snapshot` gains `espnWinPct?: number`: the latest `slate.odds` entry with `o.t <= t`, as
   `Math.round(me * 100)`, only when `t < 1`; otherwise undefined (the key is absent from the
   object, not set to undefined).
3. `src/ui/MatchupPage.tsx` shows ESPN's reading as a secondary line, only when
   `snapshot.espnWinPct !== undefined`, in both places the win % bar is drawn (the compact header
   around line 519-523 and the wide header around 556-566). Render one small element
   `<div data-espn-win>ESPN {n}%</div>` (n = `espnWinPct`, the viewer-side value, same side as `wp`),
   Silkscreen, `opacity: 0.7`, font size no bigger than the label next to it, placed directly under
   that win % row. When there is no ESPN reading, nothing extra renders and the markup is
   byte-identical to the base branch.

Targets:

- `src/model/derive.ts`
- `src/model/derive.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `winPct: number;` in `export interface Snapshot` - unchanged.
- `espnWinPct?: number;` added to `export interface Snapshot`.
- `export function snapshotAt(slate: Slate, t: number): Snapshot` - signature unchanged.

## Constraints

- The one existing test that this change makes false is `takes ESPN’s latest win probability at or
  before t, and the model before the first reading` in `src/model/derive.test.ts`. Replace it with the
  new behavior (its title should say winPct now ignores ESPN's reading). Every other existing test
  stays byte-identical. Base counts of `it(`/`it('` blocks: `src/model/derive.test.ts` 6,
  `src/ui/MatchupPage.test.tsx` 26 (top-level; record what you find).
- Do not change the variance constants (`1.8`, `0.4`), the erf approximation, the clamp, or any
  other model math. `Snapshot.projected`, totals and `slate.odds` collection in `src/espn` stay as is.
- `MnfPage` and `ScoreboardPage` read `winPct` and need no edits; they will now show the model value.
- No new dependencies. Do not touch files outside the four targets.

## Out of Scope

- Retuning the model's variance, using player ceilings, and removing `slate.odds` plumbing.

## Acceptance Check

Baseline: `git show main:src/model/derive.ts | grep -c "slate.odds"` prints `1`;
`git show main:src/ui/MatchupPage.tsx | grep -c "data-espn-win"` prints `0`.
In `derive.test.ts` the existing odds test shows the model gives 59 at `t = 0.06` for the
`mockSlate('Half PPR')` slate with no odds; the worker records the model values at t = 0.3, 0.5,
0.7 before editing.

New tests assert, with `slate = { ...HALF, odds: [{ t: 0.3, me: 0.42 }, { t: 0.5, me: 0.6 }] }`:

1. `snapshotAt(slate, t).winPct === snapshotAt(HALF, t).winPct` for t in 0.06, 0.3, 0.45, 0.7, 1.
2. `espnWinPct` is `undefined` (and `'espnWinPct' in snap` false) at 0.06 and at 1; is `42` at 0.3 and
   0.45; is `60` at 0.7.
3. Rendering `MatchupPage` with that slate at a time after t=0.3 contains `data-espn-win` in the
   output; rendering with `HALF` (no odds) contains none and equals the base markup.

Run `pnpm test` and `pnpm typecheck`.
