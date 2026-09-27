# 14 - live clock shows the real time; timeline gaps resolve to the next window, not the previous one

## Deliverable

The user reported that on the deployed site, on Sunday 2026-09-27 at about 5:15 AM
Pacific, the Live clock was stuck at `THU 8:45 PM`. Two causes, both confirmed by the
orchestrator:

1. **Gap boundary picks the wrong side.** The week's timeline (`src/espn/timeline.ts`)
   joins the game windows end to end, so every real time between Thursday's window end
   (Thu 11:45 PM ET, which is `Thu 8:45 PM` Pacific) and Sunday's first kickoff
   (`Sun 10:00 AM` Pacific) maps to one `t`, the boundary 0.200957. At that `t`,
   `toMs` returns the **earlier** window's end, because its test is
   `at <= before[i] + w.end - w.start`. It should return the **later** window's start.
   The last window's end at `t = 1` stays `endMs`.
2. **The Live clock shows timeline time even when watching live.** `MatchupPage` shows
   `slate.clockLabel(t)` always. In Live mode, when the viewer is live (not replaying),
   the clock should show the real current time in the viewer's zone. It should show the
   timeline time only while replaying a scrubbed-back moment.

Targets:

- `src/espn/timeline.ts`
- `src/espn/timeline.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`
- `src/App.tsx`

## Interface Contract

- `export function buildTimeline(kickoffsMs: number[], timeZone: string): Timeline` -
  the signature is unchanged. Only `toMs` changes: for `0 < t < 1`, a `t` that lands
  exactly on a join between window `i` and window `i+1` returns window `i+1`'s `start`.
  Everywhere else the results are unchanged.
- `MatchupPage` props gain `liveClock?: () => string`.
  - When it is given, the page is live (not replaying), and `t < 1`, the clock text is
    `liveClock()`.
  - While replaying (the existing `isReplay`), it is `slate.clockLabel(t)`.
  - At final it stays `FINAL`.
  - When `liveClock` is absent, the page behaves exactly as today, which covers Demo.
- `App.tsx`, in Live mode, passes
  `liveClock={() => timeLabel(Date.now(), timeZone, true)}`, using the same `timeZone`
  it already passes to `loadLiveSlate`, and `timeLabel` from `src/espn/timeline.ts`.

## Behavior

- The live clock updates on the page's existing 100 ms tick, with no new timer.
- Nothing else about playback, firing, the scrubber or the axis changes.

## Constraints

- Append-only for tests:
  - `timeline.test.ts` has 13 blocks on `main`.
  - `MatchupPage.test.tsx` has 12 blocks on the base branch `adw/13-talk-client`.

  Existing blocks stay byte-identical. The one exception is an existing `toMs`
  assertion that pins the old boundary behavior. If one exists, change only that
  expectation, and name it in your report.
- No other files and no new dependencies.

## Out of Scope

- Replacing the blinking `LIVE` label during gaps with "next kickoff" text. That is a
  possible follow-up and not asked for.

## Acceptance Check

The baselines were verified by the orchestrator with node `Intl` and the task-8 fixture
timeline:

- The Thursday window end is 1790295300000 + 12600000 = 1790307900000, which is
  `Thu 8:45 PM` in `America/Los_Angeles`.
- Sunday's first kickoff, 1790528400000, is `Sun 10:00 AM` Pacific and `SUN 1:00 PM`
  ET.
- `toT` of any time in between is 0.200957 (6 dp).

The new tests, using the week-3 fixture timeline built as `timeline.test.ts` already
builds it, with `'America/New_York'`, assert:

- `toMs(toT(1790400000000))` is `1790528400000`. That input is a Saturday time inside
  the Thu-Sun gap, and the result is Sunday's kickoff, not `1790307900000`.
- `clockLabel(toT(1790400000000))` is `SUN 1:00 PM`.
- `toMs(toT(1790307900000))`, the exact Thursday end, is `1790528400000`.
- Inside a window nothing changes: `toMs(toT(1790530000000))` is `1790530000000`.
- `toMs(1)` is still `endMs`, `1790653500000`, and `toMs(0)` is `1790295300000`.

In `MatchupPage` with `liveNow={() => 0.06}` and `liveClock={() => 'SUN 5:15 AM'}`, the
first render contains `SUN 5:15 AM` and does not contain `1:38 PM`. Without `liveClock`,
the existing Live and Demo tests pass unchanged.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the targets.
