# Audit sheet - 24 bandage headband

## Must not have changed

- Cast and crutches geometry, healthy `BenchSitter` markup (sha256 equal to `main`), existing tests.

## Failure modes this change invites

- Band moved up but still overlapping the eyes: eyes are at seat y `top + 2.2`, eye height
  roughly 3-4 px. Compute the band's bottom edge yourself from the diff.
- Band drawn off the skull (floating above the head) or wider than the head.
- Tails drawn on the face side (right) instead of the back.
- Waving seat (`top` 48): geometry is relative to `top`, so it must still sit above the eyes.
- Test that only counts the attribute and never checks position.

## Real pass vs fake pass

- Real: numeric assertion on band position for both standing and seated `top`; if possible view in `pnpm dev` and say whether you did.
