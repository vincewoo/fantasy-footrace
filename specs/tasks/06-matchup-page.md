# 06 - build the matchup page from the design, driven by the mock slate

## Deliverable

Build the whole page in `reference/footrace.dc.html`. The layout is the `<x-dc>`
template, lines 54-225, whose `{{ }}` holes are filled by `renderVals()` at lines
581-661. The behavior is the `Component` class methods at lines 355-470 and 573-579.
Build it as React, rendering the same elements with the same inline styles so the
result is pixel-identical. Its data comes from a `Slate` (task 4), and the runners
come from `Avatar` (task 5). `App` renders it with the mock slate.

The page has these regions, top to bottom:

- **Header:** the logo, the title, the `WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE` line,
  and the sound toggle.
- **Scoreboard:** team names, scores, projections, the LIVE/REPLAY/FINAL indicator,
  the clock, the win-probability bar, and the trash-talk bubbles.
- **Trash-talk buttons.**
- **"The Race":** one lane per slot, with name cards, projection marker, both avatars,
  the axis header, and the TOUCHDOWN/INTERCEPTED/FUMBLE/INJURY banner.
- **Play-by-play ticker.**
- **Fixed bottom bar:** play/pause/again, speed, the scrubber with live fill, the axis
  labels, and the LIVE button.

The behavior to port:

- the 100 ms tick
- scrub with pointer capture
- go-live
- speed cycle
- replay vs live
- firing events into avatar animations, the banner and sound
- the opponent's random TD taunts
- taunt buttons with a delayed reply
- the WebAudio sound effects
- the compact layout under 760 px, via ResizeObserver
- `localStorage` persistence under key `gd_sim_v1`

Split the logic so it can be tested without a DOM: time and playback state live in a
pure module, and the component only wires it to React.

Targets:

- `public/logo.svg`
- `src/ui/playback.ts`
- `src/ui/playback.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`
- `src/App.tsx`

## Interface Contract

`src/ui/playback.ts` (pure, no React, no DOM, no timers):

- `export const SPEEDS = [1, 2, 4, 8, 16] as const`
- `export interface Playback { t: number; liveT: number; speed: number; playing: boolean; scrubbing: boolean }`
- `export function initPlayback(saved: unknown): Playback` - the design's `initState`
  for these five fields. `liveT` is the saved number, else `0.06`; `t` is the saved
  number capped at `liveT`, else `liveT`; `speed` is the saved speed, else `1`; `playing`
  is `liveT < 1`; `scrubbing` is `false`. Malformed input gives the defaults.
- `export function advance(p: Playback, slateMinutes: number): Playback` - one 100 ms
  tick of the design's `tick()`:
  - A paused state is returned unchanged.
  - `dt = 0.1 * speed / (slateMinutes * 60)`, and `liveT` grows by `dt`, capped at 1.
  - While scrubbing, only `liveT` moves.
  - Otherwise, when `t` was live (`t >= liveT - 1e-9`), `t` follows `liveT`. Otherwise
    `t` grows by `dt`, capped at the new `liveT`.
  - `playing` becomes `false` once `liveT >= 1` and `t >= 1`.
- `export function togglePlay(p: Playback): Playback` - at the end (`t >= 1 && liveT >=
  1`) it resets to `t = 0, liveT = 0, playing = true`; otherwise it flips `playing`.
- `export function cycleSpeed(p: Playback): Playback` - moves to the next entry of
  `SPEEDS`, wrapping from 16 back to 1.
- `export function goLive(p: Playback): Playback` - sets `t = liveT` and `playing =
  liveT < 1`.
- `export function scrubTo(p: Playback, f: number): Playback` - sets `t` to `f`, clamped
  to `[0, 1]` and then to `liveT`.

`src/ui/MatchupPage.tsx`:

- `export interface MatchupPageProps { slate: Slate; slateMinutes?: number; showTags?: boolean }`
  - `slateMinutes` defaults to 4 and `showTags` to true, as the design's props do.
- `export function MatchupPage(props: MatchupPageProps): JSX.Element`

`src/App.tsx`:

- `export default function App()` - renders `<MatchupPage slate={...} />`, where the
  slate is `mockSlate('Half PPR')` built once (`useMemo` or module scope).

## Behavior

- **Logo.** Copy the `<svg ...>...</svg>` on design line 59 byte-for-byte into
  `public/logo.svg`, adding only `xmlns="http://www.w3.org/2000/svg"`. Extract it with
  a shell command such as `sed -n 59p reference/footrace.dc.html | ...`; do not retype
  the rects. Render it with `<img src="/logo.svg" width={40} height={46} alt="Fantasy
  Footrace">`, carrying the svg's `display:block; flex:none; filter:drop-shadow(0 3px 0
  #1c1a22)` style.
- **Template.** Every element and inline style in lines 54-225 appears in the output
  with the same values. Converting to React syntax is fine: style objects, `onClick`.
  Map the design's `style-hover` and `style-active` to the equivalent React state or
  handlers: hover yellow on taunt buttons, and the pressed `translateY` and shorter
  shadow on buttons. `sc-for` becomes `.map`, and `sc-if` becomes a conditional.
- **Derived values.** Take all numbers from `snapshotAt(slate, t)` (task 4):
  - scores, projections, and win percentage with its bar width
  - lane totals, the `diffL`/`diffColor` of each lane, and each name card's
    `ptsL`/`sub`
  - the ticker, which holds the last 40 past events, newest first, with the design's
    `meta`, pill and background rules
  - the play count and `noPlays`

  Status and clock text come from `slate.statusLabel` and `slate.clockLabel`. The side
  names `YOU`/`DAVE` come from `slate.me.owner`/`slate.opp.owner`. The team names come
  from `slate.me.name`/`slate.opp.name`. The scrubber's axis labels come from
  `slate.axis`.
- **Lanes.** Port the design's `lead`/`off` field-scroll math, `stripeT`, `projLeft`,
  `projOp` and `moveT` exactly. Render `<Avatar>` with `napping = t < player.window[0]`
  and `event` equal to the design's `act(k)`: the last fired event for that lane side,
  within 2100 ms of firing, and with `event.t <= t`.
- **Tick.** A 100 ms `setInterval` calls `advance`. The page finds the events with
  `prevT < e.t <= t`, then records per-key animations and fire times. It sets the banner
  for TD/INT/FUMBLE/INJURY, picks the highest-ranked sound, and on an opponent TD sends a
  random taunt with 50% probability. Afterwards it schedules a 2200 ms re-render and
  saves `{t, liveT, speed}` to `localStorage['gd_sim_v1']`. Every `localStorage` access is
  wrapped in try/catch.
- **Scrub, go-live, speed, play, sound, taunts and bubbles:** as the design's methods.
  Scrubbing, go-live and restart clear the animations and the banner.
- **Compact layout.** A ResizeObserver on the root sets `w`, and `compact` is `w < 760`,
  which switches every compact-dependent value in `renderVals()`. Before the observer
  reports, `w` defaults to 1200, as in the design.
- **Cleanup.** Unmount clears the interval, the observer and every pending timeout.

## Constraints

- Do not edit `src/model/*`, `src/sim/*`, `src/ui/Avatar.tsx`, `src/styles/global.css`,
  configs or `tools/adw/gate.sh`. If something they export is missing, stop and report
  it rather than editing them.
- No new dependencies. The tests use `react-dom/server`, not jsdom.
- Inline styles as in the design; no CSS files beyond `global.css`.

## Out of Scope

- ESPN data, the Demo/Live switch and the team picker: later tasks. The header line and
  names stay as the design's literals, fed through `slate`.

## Acceptance Check

Baselines come from running the design's own functions in node with Half PPR scoring.
The page starts at `t = liveT = 0.06` when nothing is saved, so the first render
shows `t = 0.06`.

`src/ui/playback.test.ts` asserts:

- `initPlayback(undefined)` is `{t: 0.06, liveT: 0.06, speed: 1, playing: true, scrubbing: false}`.
- `initPlayback({t: 0.5, liveT: 0.3, speed: 4})` gives `t 0.3, liveT 0.3, speed 4`.
- From live `{t: 0.06, liveT: 0.06, speed: 1, playing: true}`, `advance(p, 4)` gives
  `liveT = t = 0.06 + 0.1/240`, within 1e-12.
- In replay, `{t: 0.2, liveT: 0.5, speed: 16}` advanced once gives `t = 0.2 + 1.6/240`
  and `liveT = 0.5 + 1.6/240`.
- A paused state is unchanged. While scrubbing, only `liveT` moves.
- At `{t: 1, liveT: 1}`, `advance` gives `playing: false`, and `togglePlay` resets to
  `t 0, liveT 0, playing true`.
- `cycleSpeed` wraps `16 -> 1`. `goLive` sets `t` to `liveT`. `scrubTo(p, 0.9)` with
  `liveT 0.5` gives `t 0.5`, and `scrubTo(p, -1)` gives `0`.

`src/ui/MatchupPage.test.tsx` renders
`renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)` and asserts the
markup contains:

- `Hail Mary Poppins`, `The Kupp Runneth Over`, `WEEK 4 · SUNDAY SLATE · BACKYARD LEAGUE`
- the scores `15.1` and `9.1`, and `PROJ 137.7` and `PROJ 132.9`
- `YOU 59%` and `41% DAVE`, the clock `1:38 PM`, the label `LIVE`, and `19 PLAYS`
- the first ticker text `Steelers D scoop up a loose ball` with meta
  `1:37 PM · D/ST · DAVE` and pill `+2.0`
- the lane diffs in order: `+6.8`, `+2.4`, `−8.1`, `+6.4`, `EVEN`, `EVEN`, `+0.5`,
  `EVEN`, `−2.0`
- Josh Allen's sub-line `BUF · Q1 3:25 · proj 22.4` and his points `6.8`
- exactly 6 taunt buttons, with the texts `TOO EASY`, `SCOREBOARD!`, `LUCKY BOUNCE`,
  `BENCH HIM`, `WAIT TILL SNF` and `GG NO RE`
- `SOUND: OFF`, `x1` and `PAUSE`
- `src="/logo.svg"`

A second slate time is checked through the pure path: `snapshotAt` at `t = 0.5` has
102 past events.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`. `grep -o '<rect'
public/logo.svg | wc -l` prints `348`, the same count as the design's line 59. `git diff <base> --stat` lists only the six targets.
