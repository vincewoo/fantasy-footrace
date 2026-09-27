# Audit sheet - 20 co-GM names

## Must not have changed

- `src/model/types.ts`. `FantasyTeam.owner` stays a string.
- The existing test expectations. The only changes allowed are the two `'tejas'` →
  `'tejas & Vince'` lines the brief names. Diff both test files.
- Everything in `MatchupPage.tsx` except the presence line's verb.
- `load.ts`, `live.ts`, the scoreboard, the worker, the configs and the dependencies.

## Failure modes this change invites

- **The primary owner not first.** Joining `team.owners` in raw order happens to work on
  this fixture, where the primary is always `owners[0]`. That hides a missing primary-first
  step. The synthetic test with the primary second must exist and must pass.
- **Duplicates, or blank names** from an unknown SWID producing `'tejas & '`. Owners not
  found are skipped.
- **The verb rule inverted**, or applied to `YOU`. Only the opponent's presence line
  changes.
- **The escaped apostrophe.** React renders `'` as `&#x27;` in static markup. A test
  asserting a raw `'` fails, and a worker "fixing" that by changing the text is wrong.
  The brief accepts either form.
- **Private data.** The fixture already has these first names, which the orchestrator
  and the user saw. SWIDs remain scrubbed. Check that no new fixture or test introduces
  a real SWID-shaped GUID.

## Real pass vs fake pass

- A real pass: `listTeams` over the real fixture gives the five co-GM strings, and
  `buildSlate` for teams 17, 10 and 1 gives the three opponent strings.
- Optional live check, as in tasks 11 and 16, with a dev server and a vite-node harness:
  `listTeams` on the live league shows the same five co-GM teams. Print only team ids
  and owner strings.

## Prior art

- The user asked for this and confirmed their league has co-GMs. Team 1 (tejas &
  Vince) is likely the user's own.
- `ownerOf` was written in task 8 to read only `primaryOwner`.
