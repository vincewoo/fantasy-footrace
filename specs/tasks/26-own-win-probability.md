# 26 - own win probability: fix the load test that still expects the ESPN override

## Deliverable

Task 25 (branch `adw/25-own-win-probability`, which is your base) made `snapshotAt` always return
our model's `winPct` and moved ESPN's reading to `espnWinPct`. The diff is correct, but the full suite
is red: `src/espn/load.test.ts` also encodes the old override and the earlier brief missed it.

Update that one test, the one titled `shows ESPN’s matchup win probability from each poll instead of
the local model` (around lines 334-355 of `src/espn/load.test.ts`):

- Rename it to `records ESPN’s matchup win probability from each poll beside the local model`.
- `expect(live.slate.odds).toEqual([{ t: tNow, me: 0.48 }])` stays.
- Replace each `snapshotAt(...).winPct` assertion (the `48`, `71` and `48` ones) with an assertion
  on `.espnWinPct`, with the same expected numbers `48`, `71`, `48`.
- Add one assertion that the headline number ignores the reading:
  `snapshotAt(live.slate, tNow).winPct` equals `snapshotAt({ ...live.slate, odds: undefined }, tNow).winPct`.
  Before writing it, run the test once and confirm the values.

Do not change any other file's behavior. `src/model/derive.ts`, `src/model/derive.test.ts`,
`src/ui/MatchupPage.tsx` and `src/ui/MatchupPage.test.tsx` are already correct from task 25.
Confirm that task 25's new `MatchupPage` tests include one asserting that a slate with no `odds` renders
no `data-espn-win`; if it is missing, append it.

Targets:

- `src/espn/load.test.ts`
- `src/model/derive.ts`
- `src/model/derive.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `espnWinPct?: number;` on `export interface Snapshot` in `src/model/derive.ts` - already present, unchanged.
- `export function snapshotAt(slate: Slate, t: number): Snapshot` - unchanged.

## Constraints

- Every other existing test stays byte-identical. Record the count of `it(` blocks in
  `src/espn/load.test.ts` on the base branch and confirm it does not change.
- No change to model math, constants, or UI markup.

## Out of Scope

- Anything else in the original brief 25.

## Acceptance Check

Baseline on the base branch (`git show adw/25-own-win-probability:src/espn/load.test.ts`):
`grep -c "winPct).toBe(" ` over that file prints a nonzero number (record it); after the change no
`winPct).toBe(48|71)` remains. `pnpm test` and `pnpm typecheck` both pass; the full suite is green.
