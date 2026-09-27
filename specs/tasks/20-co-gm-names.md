# 20 - show every co-GM's name, not just the primary owner

## Deliverable

The user's league has co-GMs, but the app only shows each team's primary owner.
`ownerOf` in `src/espn/slate.ts` (around line 64) reads only `team.primaryOwner`.

ESPN lists every owner in `teams[].owners[]`, with names in `members[]`. The task-8
fixture (`src/espn/fixtures/week3-pregame.json`) has 5 co-GM teams, and in every team
the primary owner is `owners[0]`:

| id | team | owners (firstName) |
|---|---|---|
| 1 | Somethings Gotta Gibbs | tejas, Vince |
| 6 | Back to Back Champs | Emma, Emily |
| 9 | immaculate concepcion | Gene, Alex |
| 11 | Autodrafted and Afraid | Brian, Swapnil |
| 17 | The Blue Js | Jezmin, Julia |

The other 7 teams have one owner. There are 17 members, none with a blank `firstName`.

Show all owners, joined with ` & `, in the team picker and on the opponent's side of the
page. The viewer's own side stays `YOU`.

Targets:

- `src/espn/slate.ts`
- `src/espn/slate.test.ts`
- `src/espn/load.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `function ownerOf(members, team): string` in `src/espn/slate.ts` returns every owner's
  name joined with `' & '`.
  - The order is `team.primaryOwner` first, then the rest of `team.owners` in array
    order, with no duplicates.
  - A name is the member's `firstName`, else `displayName`.
  - Owners not found in `members` are skipped.
  - It returns `''` when no owner is found.
- `listTeams` and `buildSlate` keep their signatures. They use `ownerOf` as today, so
  `LeagueTeam.owner` becomes `'tejas & Vince'`, and `opp.owner` becomes the upper-cased
  join, for example `'EMMA & EMILY'`.
- In `src/ui/MatchupPage.tsx`, the Live presence line picks its verb from the owner
  string. When `slate.opp.owner` contains `' & '`, it reads
  `` `${owner} ARE WATCHING` `` and `` `${owner} AREN'T HERE` ``. Otherwise it stays
  `IS WATCHING` and `ISN'T HERE`. Nothing else in the page changes.

## Constraints

- Existing tests are append-only, except these named edits, which change an expected
  owner string only:
  - `src/espn/slate.test.ts`, the `teams[0]` expectation (about line 167): `owner: 'tejas'`
    becomes `owner: 'tejas & Vince'`.
  - `src/espn/load.test.ts`, the `info.teams[0]` expectation (about line 48): the same
    change.
  - `teams[5]` (REAPR Sleepers, `'Ian'`), the `IAN` opponent expectation and the mini
    `'BOB'` case have a single owner, so they stay unchanged.
- Do not edit `src/model/types.ts`. `FantasyTeam.owner` stays a string.
- No other files and no new dependencies.

## Out of Scope

- Showing which co-GM is watching. Presence is per team.
- Per-GM identity in trash talk.

## Acceptance Check

Baseline on the base branch:
- `slate.test.ts` has 25 blocks and `load.test.ts` has 7, measured on `main` at
  09c6c15. Task 19 does not touch either file.
- `grep -n "owner: 'tejas'" src/espn/slate.test.ts src/espn/load.test.ts` finds 2 lines.

After the change:

1. `listTeams(fixture)` gives these owners:
   - `teams[0]` `'tejas & Vince'`
   - team 6 `'Emma & Emily'`
   - team 9 `'Gene & Alex'`
   - team 11 `'Brian & Swapnil'`
   - team 17 `'Jezmin & Julia'`
   - team 10 still `'Ian'`
2. `buildSlate(league, season, 17, …).opp.owner` is `'EMMA & EMILY'` (matchup 15,
   Blue Js vs Back to Back Champs). `buildSlate(…, 10, …).opp.owner` is
   `'TEJAS & VINCE'`. `buildSlate(…, 1, …).opp.owner` is still `'IAN'`.
3. A synthetic team whose `primaryOwner` is the second entry of `owners` lists the
   primary's name first. A team listing the same SWID twice shows it once.
4. `renderToStaticMarkup` of `MatchupPage`, with `liveNow`, a mock slate whose
   `opp.owner` is `'EMMA & EMILY'`, and `talk={{connected: true, oppWatching: true, send}}`,
   contains `EMMA & EMILY ARE WATCHING`. With `oppWatching: false` it contains
   `EMMA & EMILY AREN&#x27;T HERE` (React escapes the apostrophe; match either form). The
   single-owner `DAVE IS WATCHING` test still passes.
5. `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base> --stat`
   lists only the targets.
