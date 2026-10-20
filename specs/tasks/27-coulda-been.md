# 27 - "Coulda Been" score under each team's PROJ line

## Deliverable

Request relayed from the user (via the dsh-tmux-adw orchestrator): add a "Coulda Been" score,
one per team, shown directly under each team's `PROJ` line on the live scoreboard header of the
matchup page (the LCD header showing the big score, `PROJ 103.7` / `PROJ 109.3`, `WIN %` and `ESPN 38%`).

The Coulda Been score is the hindsight-optimal score: the points the team would have scored this
week had it started its highest-scoring legal lineup from its full roster, bench included. It uses
actual points so far, so it moves as the week plays out, and it is never below the team's actual score.

1. **Calculation.** In `src/model/derive.ts` add
   `export function bestLineup(slate: Slate, snapshot: Snapshot, side: Side, t: number): number | undefined`.
   - Slots: every lane whose `lane[side].id !== 'empty'`, labelled `lane.slot`. Each slot takes at
     most one player and each player fills at most one slot.
   - Candidates: the side's starters (their points are `snapshot.laneTotals[i][side]`, the same
     number the lane shows) plus every `slate.bench?.[side]` seat, whose points are
     `seat.pts` when it is defined and `t >= seat.player.window[0]`, otherwise `0` (the same rule the
     bench tags use in `MatchupPage.tsx`). IR players are not in `slate.bench`, so they are never candidates.
   - Eligibility: `slotFits(lane.slot, player.pos)`, plus a starter is always eligible for the lane they
     currently hold, so an unknown slot label cannot lower the result.
   - Result: the maximum total over all legal assignments, found exactly (not greedily: FLEX, `RB/WR`
     and `OP` make greedy wrong). With at most about a dozen slots and twenty players, a bitmask DP over
     slots or a small assignment solver is fine. Fill every slot that has an eligible candidate, even when the
     candidate scored negative, before maximising points, as ESPN does not let a slot sit empty; a slot with
     no eligible candidate contributes 0. Equivalently: maximise (slots filled, then points).
   - Return `undefined` when `slate.bench` is undefined (no bench data, so nothing honest to show).
   - Because the actual lineup is itself a legal assignment, the result is always `>= snapshot.totals[side]`.
2. **Display.** In `src/ui/MatchupPage.tsx`, under each of the four `PROJ` lines (the compact
   header's left and right team blocks, and the wide header's left and right blocks), when
   `bestLineup(...)` is defined, render a line `<div data-coulda-been="me|opp">COULDA BEEN {fmt(value)}</div>`,
   same font (`SILK`) and size as the `PROJ` line next to it, `whiteSpace: 'nowrap'`, directly beneath it.
   When it is undefined nothing extra renders and the markup is byte-identical to the base branch.
   Compute both sides once per render next to `const snapshot = snapshotAt(slate, t)`.

Targets:

- `src/model/derive.ts`
- `src/model/derive.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `export function bestLineup(slate: Slate, snapshot: Snapshot, side: Side, t: number): number | undefined`
- `export function slotFits(slot: string, pos: Pos): boolean` - existing, reused, unchanged.
- `export function snapshotAt(slate: Slate, t: number): Snapshot` - unchanged.

## Constraints

- Append, never rewrite: existing tests stay byte-identical. Base top-level `it('` counts on `main`:
  `src/model/derive.test.ts` 6, `src/ui/MatchupPage.test.tsx` 27. Both may only grow.
- `Snapshot` and `snapshotAt` are not changed. No new dependencies, no files outside the four targets.
- The scoreboard tiles on the all-matchups page (`ScoreboardPage.tsx`) are not changed.

## Out of Scope

- The all-matchups `ScoreboardPage` tiles and `MnfPage`.
- Showing the lineup itself, or who should have started.

## Acceptance Check

Baseline on `main`: `git show main:src/ui/MatchupPage.tsx | grep -c "coulda\|COULDA"` prints `0`, and
`git show main:src/model/derive.ts | grep -c bestLineup` prints `0`. The mock slate `mockSlate('Half PPR')`
has a bench for both sides (confirm with a quick script before writing tests and note the bench seat points in your report).

New tests in `derive.test.ts` build small hand-made slates and assert exact numbers:
1. A starter outscored by a bench player of a legal position: `bestLineup` equals actual plus the gain; a bench
   player of an illegal position (e.g. a K for a WR slot) is never used.
2. FLEX/`RB/WR` case where greedy fails: e.g. slots `RB`, `FLEX`, bench of two RBs and one WR with points that
   make the best answer put the WR in FLEX; assert the exact optimum.
3. `bestLineup >= snapshot.totals[side]` for both sides of `mockSlate('Half PPR')` at t = 0.3, 0.6, 1.
4. `undefined` when `slate.bench` is undefined.
5. A bench seat with `pts` defined but `t < window[0]` counts as 0.

New tests in `MatchupPage.test.tsx`: render with the mock slate and assert `data-coulda-been="me"` and `"opp"`
each appear (compact via `initialWidth` 390 and wide via 1200) with text `COULDA BEEN` and a one-decimal number;
render with `bench` removed and assert none appear.

Run `pnpm test` and `pnpm typecheck`.
