# Audit sheet - 26 own win probability fix

## Must not have changed

- Everything task 25 delivered: model math in `derive.ts`, the `data-espn-win` rendering.
- Every test other than the one load test named in the brief.

## Failure modes this change invites

- Loosening the assertion (deleting the `48`/`71`/`48` checks rather than moving them to `espnWinPct`).
- Hard-coding the model number in the new assertion instead of comparing to the odds-free snapshot.
- Editing source behavior to make the test pass.

## Real pass vs fake pass

- Real: full `pnpm test` is green (the previous failure was this file), and the load test asserts
  both `espnWinPct` 48/71/48 and that `winPct` ignores the reading.
- Task 25's original acceptance (model value identical with and without odds at t in 0.06, 0.3,
  0.45, 0.7, 1; ESPN line only with odds) must still hold; re-read the derive and MatchupPage tests.
