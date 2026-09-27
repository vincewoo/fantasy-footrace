# 05 - port the design's pixel runner avatars to a React component

## Deliverable

In `reference/footrace.dc.html`, each lane shows two little runners that move along a
field, animate on every play, nap before kickoff, fly a jetpack when well ahead of their
projection, and grey out with an OUT tag when injured. That is drawn by four methods of
the design's `Component` class: `hair` (lines 472-489), `figure` (491-536), `fx`
(538-554) and `avatar` (556-571), using the constants `INK`, `CREAM`, `SK`, `ANIM` and
`TDK` (lines 229-269). Port them to a React component that renders **the same element
tree with the same inline styles**, so the result is pixel-identical. The CSS
`@keyframes` they reference already exist in `src/styles/global.css`.

Use the model types from `src/model/types.ts` (`Player`, `TeamColors`, `PlayEvent`,
`Side`, `EventKind`, `Hair`) and `fmt`/`sgn` from `src/model/derive.ts`. Do not
redefine them.

Targets:

- `src/ui/Avatar.tsx`
- `src/ui/Avatar.test.tsx`

## Interface Contract

- `export const ANIM: Record<EventKind, string>` - the design's `ANIM` map.
- `export interface AvatarProps { player: Player; colors: TeamColors; side: Side; lane: number; pts: number; event: PlayEvent | null; out: boolean; scrubbing: boolean; showTag: boolean; scale: number; napping: boolean; offset: number }`
  - These map one-to-one to the design's `avatar(p, side, i, pts, ev, isOut, scrubbing,
    showTags, scale, nap, off)`, with `T = colors` and `i = lane`.
- `export function Avatar(props: AvatarProps): JSX.Element` - the design's `avatar()`.

## Behavior

- Port each method's logic as-is. That covers the body, leg, arm and ball animation
  selection, mood and mouth, beard, all six hair styles, the jetpack when boosted, speed
  lines, zzz while napping, the points pop, the badge, 10 confetti pieces on a TD, the
  name tag, the OUT tag, the horizontal position `left: pct%` with the `transition`, and
  the `grayscale` filter when out.
- The design's `figure(..., i + (side === 'opp' ? 5 : 0), ...)` animation-delay offset
  must be kept.
- The design's `key` values drive animation restarts (`'a' + ev.id`, `'fx' + ev.id`,
  `'nap'`, `'boost'`, `'idle'`). Keep them on the same elements.
- CSS custom properties `--dx`/`--dy` on confetti must render. In React, pass them in
  the style object, casting the object type if needed.
- Use `react-dom/server`'s `renderToStaticMarkup` in the test. The Vitest environment
  is `node`, so do not add jsdom or testing-library.

## Constraints

- Inline styles only, as in the design. No CSS modules, no new classes, no new
  dependencies.
- Do not edit any other file. `src/model/*`, `src/sim/*`, `src/App.tsx` and configs stay
  byte-identical to the base branch.

## Out of Scope

- Lanes, scoreboard, ticker, banner, bubbles, playback: the next task.
- Deciding when an event is "active" (the design's `act()`). The caller passes `event`.

## Acceptance Check

Baselines came from rendering the design's own `avatar()` with
`renderToStaticMarkup` in node, using the design's roster. `M` is the markup and `P` is
Josh Allen with `colors = BUF {c1:'#00338D', c2:'#C60C30'}`, `scale 44.8`, `offset 0`,
`scrubbing false` and `showTag true`. `ev(kind)` is
`{id:1, kind, yds:10, pts, t:0.1, side:'me', lane:0, text:''}`.

| case | props | `<div` count | other exact counts in `M` |
|---|---|---|---|
| idle | P, pts 5, event null | 19 | `left:11.160714285714286%`; tag text `ALLEN 5.0` |
| passTD | P, pts 5, `ev('passTD')` pts 4.4 | 34 | `confetti 1s` x10; badge text `TD PASS!` |
| int | P, pts 5, `ev('int')` pts -2 | 24 | badge text `INT` |
| out | Derrick Henry (opp, lane 2, BAL `{c1:'#241773',c2:'#9E7C0C'}`, scale 31.6), pts 3, out true | 23 | `>OUT<` x1; tag `HENRY 3.0`; `left:9.493670886075948%` |
| nap | P, pts 0, napping true | 21 | `zzz 2.4s` x3; no tag |
| boost | P, pts 40 | 26 | `flame .` x2; `speedline` x3; `left:89.28571428571429%` |
| dst | Broncos D/ST (tag `DEN D`, DEN `{c1:'#FB4F14',c2:'#002244'}`, scale 16.4), pts 2 | 20 | tag `DEN D 2.0` |

`src/ui/Avatar.test.tsx` asserts every number in this table, building the players
inline from the design's `ROSTER` values: skin, hair, hc, beard, num, tag, proj and a
`window` of `[0.005, 0.29]`, which `Avatar` does not use.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the two targets.
