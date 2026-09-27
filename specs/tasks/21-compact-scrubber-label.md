# 21 - compact layout - one scrubber label that follows the handle instead of overlapping kickoff labels

## Deliverable

The user reported that on mobile the scrubber's axis labels overlap and cannot be read.
The Live week has six labels (`THU 8:15 PM`, `SUN 1 PM`, `SUN 4:05 PM`, `SUN 8:20 PM`,
`MON 8:15 PM`, `END`), and a phone gives the scrubber roughly 200 px.

`src/ui/MatchupPage.tsx` already has a compact flag, `const compact = w < 760`, driven by
a ResizeObserver with default `w: 1200`, and it already computes the clock text
(`const clock = final ? 'FINAL' : liveClock && !isReplay && t < 1 ? liveClock() : slate.clockLabel(t)`).
The axis row renders every `slate.axis` mark as text in a `position: relative; height:
11px` div below the scrubber.

When `compact`:

1. **No per-mark text.** Render each `slate.axis` mark except the final `END` mark
   (`t === 1`) as a **notch** instead: an absolutely positioned
   `<div data-axis-notch>` at `left: axisLeft(mark.t)` in the same row, `width: 2px`,
   `height: 6px`, `top: 0`, `background: '#5b5566'`, `transform: 'translateX(-50%)'`.
2. **One position label**, `<div data-axis-now>`, showing the existing `clock` text in
   the same Silkscreen 9px `#5b5566` style as today's marks.
   - Anchor it by `t`: `left: 0` when `t < 0.15`, `right: 0` when `t > 0.85`, otherwise
     `left: t * 100 + '%'` with `transform: 'translateX(-50%)'`.
   - Give it `top: 7px`, so the row's height becomes `20px` in compact mode only.

When not compact, the axis row renders exactly as today, byte-identical.

Targets:

- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `MatchupPageProps` gains `initialWidth?: number`. It is the initial `w` in page state,
  default `1200`, the current value. It exists so the compact layout can be rendered in
  a static test. The ResizeObserver still updates `w` in the browser.
- `export function MatchupPage(props: MatchupPageProps): JSX.Element` - the signature is
  otherwise unchanged.

## Constraints

- Existing tests are append-only and byte-identical. Record the base branch's block
  count for `MatchupPage.test.tsx` in your report, because tasks 19 and 20 append to it.
- Wide-layout markup is byte-identical to the base branch when `initialWidth` is omitted.
- Do not touch anything outside the two targets. No new dependencies.

## Out of Scope

- Changing the compact breakpoint or other compact-layout elements.

## Acceptance Check

Baseline on the base branch: `grep -c "data-axis-notch\|data-axis-now\|initialWidth" src/ui/MatchupPage.tsx`
prints `0`. The mock slate's `axis` has 4 marks (`1 PM`, `4 PM`, `SNF`, `END`), and the
first frame is `t = 0.06` at clock `1:38 PM`.

The new tests assert:

1. `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} initialWidth={390} />)`
   contains:
   - exactly 3 `data-axis-notch`, for the 4 marks minus `END`
   - exactly 1 `data-axis-now`
   - `1:38 PM` inside it
   - none of the axis texts `>1 PM<`, `>4 PM<`, `>SNF<` or `>END<`

   The `data-axis-now` element's style has `left:0`, because `t = 0.06 < 0.15`.
2. The same render with `initialWidth={1200}`, or omitted, contains `>1 PM<`, `>4 PM<`,
   `>SNF<` and `>END<` and no `data-axis-`. Its markup equals the base branch's.
3. With a Live-style render (`liveNow={() => 0.5}` and `liveClock={() => 'SUN 5:15 AM'}`)
   and `initialWidth={390}`, `data-axis-now` shows `SUN 5:15 AM`.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base> --stat`
lists only the two targets.
