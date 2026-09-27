# Audit sheet - 21 compact scrubber label

## Must not have changed

- The wide layout. `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)`
  must be byte-identical to the base branch (compare sha256).
- Every existing test block.
- Everything outside `MatchupPage.tsx` and its test.

## Failure modes this change invites

- **A second clock computation.** The label must reuse the existing `clock` value.
  Otherwise replay, live and final can drift from the big clock. Grep for a new
  `clockLabel(` or `liveClock(` call in the axis code.
- **The END mark rendered as a notch** at the far right edge, where it overlaps the
  border. The brief excludes it.
- **The label overflowing the viewport** near the ends. It must anchor `left: 0`/`right: 0`
  under 0.15 and above 0.85. Check both branches are in the code.
- **`initialWidth` used for more than the initial state.** It must seed `w` only. The
  ResizeObserver still owns updates. It must not become a forced layout override.
- **Row height changed in the wide layout.** The 20 px height applies only when compact.

## Real pass vs fake pass

- A real pass: static renders at 390 and 1200 assert the counts and texts from the
  brief, and the wide render's markup hash equals the base branch's.
- If you can, run `pnpm dev` at a phone-sized viewport and scrub. The label should
  follow the handle and stay on screen at both ends. Say whether you checked.

## Prior art

- The user reported overlapping labels on mobile and asked for a single label showing
  the current position.
- Task 6 introduced `compact = w < 760` from the design. Task 14 made `clock` show real
  time when live and timeline time in replay.
