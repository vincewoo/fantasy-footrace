# Audit sheet - 27 coulda been

## Must not have changed

- `snapshotAt`, `Snapshot`, win probability, `projected`, and every existing test.
- Markup of `MatchupPage` when the slate has no bench (hash compare to `main`).
- `ScoreboardPage.tsx`, `MnfPage.tsx`.

## Failure modes this change invites

- A greedy assignment (sort by points, place in first fitting slot). Construct a FLEX case yourself
  where greedy loses and run it; do not trust the worker's own case.
- Points double counted: a starter also appearing as a bench candidate, or one player filling two slots.
- Bench points shown before the player's game started (`t < window[0]`) or taken as `undefined` -> NaN.
- Result below the actual score (check negative-scoring starters and slots left empty).
- Negative-point candidate dropped to leave a slot empty; ESPN requires filled slots when a player is available.
- IR or empty-lane placeholders (`id === 'empty'`) counted as slots or players.
- Display only wired in one of the four places (compact left/right, wide left/right), or sides swapped.
- `0.0`/`NaN` rendering when bench seats lack `pts`.

## Real pass vs fake pass

- Real: hand-built slates with exact expected totals, including a FLEX case and an illegal-position bench player;
  `>= actual` property across times; four render sites covered.
- Fake: tests that only check the label appears, or that compare `bestLineup` to a value computed by the same function.
- If you can, run `pnpm dev` and compare against the screenshot layout; say whether you did.

## Prior art

- `slotFits` and `outscoresAStarter` in `src/model/derive.ts`; bench seat points gating in `benchHalf` in `MatchupPage.tsx`.
- The reference screenshot `/home/vince/.dsh/pastes/paste-20261019T020014Z-6ef1ce.png` shows the header being extended.
