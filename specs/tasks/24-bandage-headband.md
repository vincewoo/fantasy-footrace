# 24 - injured bench bandage sits above the eyes like a headband

## Deliverable

The head bandage on injured bench avatars (task 23) currently covers the eyes. Move it up so it
wraps the forehead above the eyes, positioned like a headband.

In `injuryArt(top, width)` in `src/ui/Avatar.tsx`, the `data-injury-bandage` group is drawn at
`y = top + 2 .. top + 7.4`. The head is drawn at figure-local `translate(17 5.2)`, so in seat
coordinates the head centre is `(cx, top + 5.2)`, the skull is an ellipse of rx 13, ry 11.5,
and the eyes sit at head-local `y = -3` (seat `y = top + 2.2`) and the face looks right. Redraw
the bandage so that:

- The band runs horizontally across the forehead with its bottom edge at least 2 px above the
  eye top (head-local y of about -6.5 or higher, seat `y <= top - 1.5` at the bottom edge) and
  its top edge below the crown, so roughly head-local y -9.5 to -6.5. It is about 5 px thick
  and as wide as the skull at that height (about 21 px, centred on `cx`), so it reads as wrapping
  the head. It is drawn over the hair.
- The knot and the two trailing tails stay, moved to the back of the head (the left side,
  since the face looks right), at the same height as the band.
- Keep `data-injury-bandage`, the `CREAM` fill and `INK` outline. The cast and crutches are unchanged.

Targets:

- `src/ui/Avatar.tsx`
- `src/ui/Avatar.test.tsx`

## Interface Contract

- `function injuryArt(top: number, width: number): JSX.Element` - signature unchanged.

## Constraints

- Append, never rewrite: existing tests stay byte-identical. Base `src/ui/Avatar.test.tsx` has
  `29` `it('` blocks at top level; the count must only grow.
- Healthy `BenchSitter` markup is unchanged. Do not touch the cast, crutches, `figure()`, or any
  file outside the two targets.

## Out of Scope

- Cast, crutches and starter avatars.

## Acceptance Check

Baseline on `main`: `git show main:src/ui/Avatar.test.tsx | grep -c "^it('"` prints `29`.
`git show main:src/ui/Avatar.tsx | grep -n "top + 2} width={24}"` prints one line (the band
being replaced).

Add a test that renders `BenchSitter` with `injured: true` (not waving, so `top` is 58) and
asserts the bandage group's main band rect has `y + height` at most `top + 2.2 - 2` (that is,
the bottom edge sits at least 2 px above the eyes), by parsing the rendered markup. Run
`pnpm test` and `pnpm typecheck`.
