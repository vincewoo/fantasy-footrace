# Audit sheet - 25 own win probability

## Must not have changed

- The model math in `snapshotAt`: constants `1.8`, `0.4`, the erf call, the clamp to 0.01-0.99, final-step handling.
- Every existing test except the one named in the brief (that one must be replaced, not deleted without a successor).
- Markup of `MatchupPage` when a slate has no `odds` (hash compare to `main`).

## Failure modes this change invites

- Leaving the override in some path (grep `slate.odds` in `derive.ts`; it should only feed `espnWinPct`).
- `espnWinPct` set to `undefined` rather than omitted, breaking `'espnWinPct' in snap` checks.
- ESPN reading shown for the wrong side: `slate.odds[].me` is the viewer's side, same as `wp`.
- Rounding mismatch: `0.42 -> 42`, `0.6 -> 60`; watch for `59.999` float issues with `Math.round(me * 100)`.
- The secondary line rendered in only one of the two headers, or with no ESPN reading present.
- Changing the model to "fix" calibration. Out of scope; the model is already variance-additive.

## Real pass vs fake pass

- Real: model number is identical with and without `odds`; ESPN line appears only with odds; no-odds markup unchanged.
- Fake: test that only asserts `winPct` equality at t values where the override never applied (t=0.06, 1); the 0.3/0.45/0.7 cases matter.

## Prior art

- Thread analysis of ESPN's std-vs-variance error; our `snapshotAt` in `src/model/derive.ts`.
