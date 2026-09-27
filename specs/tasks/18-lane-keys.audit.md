# Audit sheet - 18 lane keys

## Must not have changed

- Demo markup must be byte-identical. Compare
  `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)` between the
  base branch and this branch.
- `src/model/*`, `src/ui/Avatar.tsx`, `playback.ts`, `src/espn/*`, `App.tsx`, the
  configs and the dependencies.
- The 13 existing test blocks.

## Failure modes this change invites

- **A partial fix.** Five lookup sites plus the tick's writes. Fixing `act` but not the
  OUT sites, or the Avatar prop but not `info()`, leaves a half-broken Live page. The
  brief's grep must print 0.
- **The wrong direction.** Keying the tick by `player.id` instead of fixing the reads
  would also make them agree. But `snapshotAt`'s `out` is lane-keyed in
  `src/model/derive.ts`, so the OUT path would still miss. The brief requires `laneKey`
  everywhere. Reject a player-id scheme.
- **Duplicate player across lanes.** Lane keys are unique by construction, so no new
  collision risk. Just confirm nothing still uses the id.
- **A test that proves nothing.** The live-shaped slate test must use ids that differ
  from the lane keys. If the worker reused the mock's ids, the test passes on the base
  branch too. Run the new test against the base branch's `MatchupPage.tsx` (with
  `git stash` or a worktree) and confirm it fails there.

## Real pass vs fake pass

- A real pass: the new OUT test fails on the base branch and passes here, and the grep
  prints 0.
- Animations can't be seen in a static render. The `act` fix is proven by the grep plus
  reading the tick. If you can, run `pnpm dev`, open Live and pick team 6, scrub back
  into Thursday, and watch Love's passes animate. Say whether you did.

## Prior art

- The user's report: in Live replay, the plays show in the ticker but have no
  animations.
- The orchestrator simulated the page's tick math with `advance`/`followLive` over the
  real team-6 live slate. It fired 21 of 21 events in 48 s at x1, which ruled out
  playback. It then found the key mismatch by reading the render.
- Task 6's audit noted that `act(me.id)` "resolves to the same keyspace because the
  mock's player ids are literally `${side}${lane}`". That was true only for the mock.
