# Audit sheet - 22 injured bench avatars

## Must not have changed

- Healthy `BenchSitter` markup: render a healthy player's seat on `main` and on the branch,
  compare sha256; must match.
- `Avatar`/`figure()` output for starters, all existing tests, `src/espn/live.ts`.
- `Player` objects for healthy players: no `injured` key at all (check `'injured' in p`, not just falsy),
  so existing `toEqual` assertions keep passing.

## Failure modes this change invites

- Treating only `OUT` as injured; the user asked for any non-healthy status. `QUESTIONABLE`,
  `DAY_TO_DAY`, `DOUBTFUL`, `INJURY_RESERVE` must set the flag; `ACTIVE`/`NORMAL`/missing must not.
- Reading the status from the wrong object: it lives on `entry.playerPoolEntry.player.injuryStatus`.
- Flag applied to starters or only wired to the test fixture path, not `toPlayer`.
- Cast hidden behind the seat plank (z-order), so tests pass but nothing is visible. Look at
  the z-index of the cast against `wood(88, 8, 2)`.
- Crutches or bandage overflowing the 58px seat box and overlapping neighbours.
- Tests asserting only that attributes exist while the elements are empty (zero-size or no children).

## Real pass vs fake pass

- Real: all three data attributes present, each element has visible drawn content, slate
  tests cover all five injured statuses and the two healthy ones, healthy markup hash equal.
- If possible run `pnpm dev` with the mock slate or a fixture containing a bench injury and
  look at the bench; say whether you did.

## Prior art

- `BenchSitter` and `wood()` in `src/ui/Avatar.tsx`; `toPlayer` in `src/espn/slate.ts`.
- `injuryStatus === 'OUT'` handling in `src/espn/live.ts` is separate and untouched.
