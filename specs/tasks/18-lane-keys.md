# 18 - fix: Live mode never animates plays or shows OUT, because the page looks them up by player id instead of the lane key

## Deliverable

The user reported that in Live mode, scrubbing back and replaying shows the plays in the
ticker and moves the runners, but no play animations run. The orchestrator traced it to
a key mismatch in `src/ui/MatchupPage.tsx`, and to nothing in the playback logic. A
simulation of the page's exact tick math over the live slate fires all 21 of team 6's
Thursday events during replay.

- The tick records a fired play under `anims[`${e.side}${e.lane}`]`, for example `me0`
  or `opp3`. `snapshotAt` (task 4) likewise builds `out` from `${side}${lane}`.
- The render looks them up with the **player id**:
  - `act(me.id)` and `act(opp.id)` in the two `<Avatar event=…>` props
  - `out.has(me.id)` and `out.has(opp.id)` in the two `<Avatar out=…>` props
  - `out.has(p.id)` inside `info(p, …)` for the name card's `OUT` status
- In Demo this works by coincidence, because the mock's player ids are literally
  `` `${side}${lane}` `` (task 6's audit noted this). In Live, ids are ESPN player ids
  such as `'4036378'`, so every lookup misses. No play ever animates, live or in replay,
  and the OUT tag and status never show. Devin Lloyd is OUT this week.

Fix it by keying every lookup by lane.

Targets:

- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `export function laneKey(side: Side, lane: number): string` in
  `src/ui/MatchupPage.tsx`: returns `` `${side}${lane}` ``.
- Every site that builds or reads an animation or OUT key uses `laneKey`:
  - the tick's `anims[...]` and `firedAtRef` writes
  - `act(...)`, both `<Avatar event=…>`, both `<Avatar out=…>`
  - the `info(...)` OUT check. Change `info` to receive the lane key, for example
    `info(p, pts, laneKey('me', i))`.
- `export function MatchupPage(props: MatchupPageProps): JSX.Element` - the signature is
  unchanged.

## Behavior

- Nothing else changes. Demo output must be byte-identical, because for the mock
  `laneKey(side, lane) === player.id`.

## Constraints

- Append-only tests. `MatchupPage.test.tsx` has 13 blocks on the base branch, and they
  stay byte-identical.
- Do not edit `src/model/derive.ts`, which is already lane-keyed, `Avatar.tsx`,
  `playback.ts` or any `src/espn/*` file.

## Out of Scope

- `scale = proj * 2` when a player's projection is 0. That is a separate issue.

## Acceptance Check

Baseline on the base branch:
- `grep -c "act(me.id)\|act(opp.id)\|out.has(me.id)\|out.has(opp.id)\|out.has(p.id)" src/ui/MatchupPage.tsx`
  prints `5`.
- `MatchupPage.test.tsx` has 13 blocks.

After the change:

1. The same grep prints `0`, and `grep -c "laneKey(" src/ui/MatchupPage.tsx` prints at
   least `6`: the definition plus the call sites.
2. New test, `laneKey('opp', 3) === 'opp3'`.
3. New test, a live-shaped slate. Take `mockSlate('Half PPR')` and give every player an
   ESPN-style id, for example `id: String(4000000 + i)`, so no id equals its lane key.
   Replace its events with one
   `{id: 1, t: 0.01, side: 'opp', lane: 2, kind: 'injury', yds: 0, pts: 0, text: 'Henry ruled OUT'}`.
   `renderToStaticMarkup(<MatchupPage slate={that} />)`, whose first frame is
   `t = 0.06`, contains `BAL · OUT` (Henry's name-card status) and exactly one `>OUT<`
   (the avatar's OUT badge). On the base branch it contains neither.
4. The existing 13 blocks pass unchanged, and Demo markup is byte-identical to the base
   branch.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the two targets.
