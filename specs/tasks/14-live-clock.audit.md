# Audit sheet - 14 live clock

## Must not have changed

- `toT`, `axis` and `clockLabel`'s formatting. Every existing `timeline.test.ts`
  expectation passes unchanged, apart from at most one named boundary `toMs`
  expectation.
- Demo rendering. `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)`
  must be byte-identical to the base branch.
- Everything from task 13 (talk): the socket, the presence and the bubble rules.
- `src/espn/slate.ts`, `load.ts`, the worker, the configs and the dependencies.

## Failure modes this change invites

- **An off-by-one at the last window.** `toMs(1)` must stay `endMs`. A "prefer the next
  window" rule applied at the final boundary would index past the array.
- **Inside-window drift.** The comparison change must not shift times inside a window.
  Probe a few `t` values inside the Sunday window and check the round trip
  `toMs(toT(x)) === x`.
- **`liveClock` used while replaying.** When the viewer scrubs back, the clock must show
  the timeline time of the replayed moment. Read the condition. It should use the
  page's existing `isReplay`, not a new notion of liveness.
- **A new interval or timer** for the clock. The page already re-renders every 100 ms.
- **The timezone hard-coded** in `App.tsx`. It must use the same resolved zone passed to
  `loadLiveSlate`.

## Real pass vs fake pass

A real pass needs all of the following:

- The timeline tests use the real fixture kickoffs and literal millisecond values from
  the brief.
- The page test shows the `liveClock` string replacing the timeline clock.
- A replay-state check exists, either as a test or by reading the code.

## Prior art

- The user's report: the deployed Live clock read `THU 8:45 PM` at Sunday 5:15 AM PT.
- The orchestrator reproduced the cause from `toMs`'s `<=` comparison and the gap
  mapping in `toT`. Before this fix, a gap maps to the earlier window's end.
