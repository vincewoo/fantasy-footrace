# 22 - injured bench players look injured: head bandage, leg cast, crutches

## Deliverable

Bench avatars (`BenchSitter` in `src/ui/Avatar.tsx`) for players ESPN lists with an injury
designation are drawn injured: a bandage wrapping the head, a cast over one leg, and a pair
of crutches beside them. Healthy bench players and every starter avatar are unchanged.

1. **Data.** `Player` gains `injured?: boolean`. In `src/espn/slate.ts`, `toPlayer` sets
   `player.injured = true` when the ESPN player's `injuryStatus` is present and is neither
   `'ACTIVE'` nor `'NORMAL'` (so `QUESTIONABLE`, `DOUBTFUL`, `DAY_TO_DAY`, `OUT`,
   `INJURY_RESERVE` all count). Otherwise the key is left unset (not `false`), so healthy
   players stay deep-equal to today's objects.
2. **Drawing.** In `BenchSitter`, when `p.injured` is true, render, positioned inside the
   existing 58px-wide seat box and carrying these attributes:
   - `<div data-injury-bandage>`: a cream (`CREAM`) gauze band with an `INK` outline wrapping
     the player's head (a band across the forehead plus a small knot or trailing tail is
     enough), drawn over the head.
   - `<div data-injury-cast>`: a chunky white/cream cast with an `INK` outline over the
     front leg (the right-hand leg of the figure) from knee to just above the boot. The
     seat plank covers most of a seated leg, so draw the cast above the plank in z-order
     (it may extend below the plank) so it is visible.
   - `<div data-injury-crutches>`: two crutches (diagonal wooden poles with an underarm pad
     and a hand grip) leaning against the bench next to the cast leg. They stay inside the
     seat box so neighbouring seats do not overlap.
   Draw all three as inline SVG or styled divs, in the existing pixel-cartoon style
   (`INK` outlines, flat fills). No new image assets.
3. A waving injured player (`waving` true) still waves; the bandage and cast still show.
   Crutches may be omitted while waving only if they would clip the arms; say so in your report.

Targets:

- `src/model/types.ts`
- `src/espn/slate.ts`
- `src/ui/Avatar.tsx`
- `src/espn/slate.test.ts`
- `src/ui/Avatar.test.tsx`

## Interface Contract

- `injured?: boolean;` field on `export interface Player` in `src/model/types.ts`.
- `export function BenchSitter({ player: p, colors: T, side, seat: i, pts, width = SEAT_W, waving = false }: ...): JSX.Element` -
  signature unchanged.
- `export function buildSlate(` signature unchanged.

## Constraints

- Append, never rewrite: existing tests stay byte-identical. Base counts of top-level
  test blocks: `src/espn/slate.test.ts` has `41` `it('` blocks and `src/ui/Avatar.test.tsx` has
  `27` `^it('` blocks. Both counts must only grow.
- Starters (`Avatar`) are not changed; do not touch `figure()` output for any non-injured
  case. A healthy `BenchSitter` renders byte-identical markup to the base branch.
- No new dependencies, no changes outside the five targets.

## Out of Scope

- Injury treatment for starter-lane avatars, the live `OUT` handling in `src/espn/live.ts`,
  and any text badge or tooltip about the injury designation.

## Acceptance Check

Baseline on `main`: `git show main:src/model/types.ts | grep -c injured`, the same for
`src/ui/Avatar.tsx` and `src/espn/slate.ts`, each print `0`. The fixtures contain statuses
`ACTIVE`, `NORMAL`, `DAY_TO_DAY`, `DOUBTFUL`, `INJURY_RESERVE`, `OUT`, `QUESTIONABLE`.

New tests assert:

1. `buildSlate` on an existing slate-test fixture, with `injuryStatus` overridden on a bench
   entry's player to each of `'OUT'`, `'QUESTIONABLE'`, `'DAY_TO_DAY'`, `'DOUBTFUL'`,
   `'INJURY_RESERVE'`, yields `injured === true`; overridden to `'ACTIVE'` or `'NORMAL'`, or
   absent, yields a player with no `injured` key (`'injured' in player` is false).
2. `renderToStaticMarkup(<BenchSitter player={{...p, injured: true}} .../>)` contains exactly
   one each of `data-injury-bandage`, `data-injury-cast`, `data-injury-crutches`.
3. The same render with `injured` unset contains none of them, and is string-equal to a
   render with `injured: false`.

Run `pnpm test` and `pnpm typecheck` (or the repo's equivalents in `package.json`).
