# 13 - live trash talk in the page: connect to the matchup's room, show real taunts, free-text box, presence

## Deliverable

Task 12 added a WebSocket room per matchup on the Worker. This task connects the page to
it in **Live** mode, so the two GMs in a matchup see each other's taunts as speech
bubbles, and each sees whether the other is watching. The user chose preset buttons plus
free text of up to 24 characters, and trusts the league about identity.

Mode behavior:

- **Demo mode (no `liveNow`).** Exactly today's behavior: the canned `REPLIES` after your
  taunt, and the random `OPP_TAUNTS` on an opponent TD.
- **Live mode with a room** (the deployed site: an absolute `VITE_ESPN_BASE` and a saved
  passphrase):
  - Your taunt shows your bubble and is sent to the room.
  - The opponent's taunts arrive as their bubble.
  - A presence line shows whether they are here.
  - No canned or random taunts at all.
- **Live mode without a room** (local dev with the relative `/espn` base, or no saved
  passphrase):
  - Your taunt shows only your bubble.
  - The status line says `TALK OFFLINE`.
  - No canned or random taunts.

The protocol is fixed by task 12 (`specs/tasks/12-talk-room.md`, section "Protocol").
The room relays a taunt to the **others** only, never back to the sender.

Targets:

- `src/talk/socket.ts`
- `src/talk/socket.test.ts`
- `src/espn/load.ts`
- `src/espn/load.test.ts`
- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`
- `src/App.tsx`

## Interface Contract

`src/talk/socket.ts`:

- `export function talkUrl(base: string, p: { season: number; week: number; matchupId: number; team: number }): string | null`
  - Returns `null` unless `base` is an absolute `http:` or `https:` URL.
  - Otherwise the scheme becomes `ws:` or `wss:`, any trailing `/` on the base path is
    dropped, and the result is
    `` `${wsBase}/talk/${season}/${week}/${matchupId}?team=${team}` ``.
- `export function keyProtocol(key: string): string` - `'key.' + base64url(utf8(key))`,
  with no padding, using `TextEncoder` and `btoa`, not `Buffer`.
- `export interface TalkHandlers { onTaunt(team: number, text: string): void; onPresence(teams: number[]): void; onStatus(connected: boolean): void }`
- `export interface TalkConnection { send(text: string): boolean; close(): void }`
- `export function connectTalk(url: string, key: string, handlers: TalkHandlers, opts?: { WebSocketImpl?: typeof WebSocket; setTimeoutImpl?: typeof setTimeout; clearTimeoutImpl?: typeof clearTimeout }): TalkConnection`
  - Opens `new WebSocketImpl(url, ['footrace', keyProtocol(key)])`.
  - `onopen` calls `onStatus(true)` and resets the backoff.
  - `onmessage` parses JSON:
    - a `taunt` frame with numeric `team` and string `text` calls `onTaunt`
    - a `presence` frame with a number array calls `onPresence`
    - anything else is ignored
  - `onclose` calls `onStatus(false)`, then schedules a reconnect with a backoff of
    1, 2, 4, 8, 16, 30, 30… seconds, unless `close()` was called.
  - `send(text)` runs `cleanTaunt({type: 'taunt', text})`, imported from
    `../worker/talk`. It returns `false` if the text cleans to null or the socket is not
    open. Otherwise it sends `{"type":"taunt","text":<cleaned>}` and returns `true`.
  - `close()` stops reconnecting, clears the pending timer and closes the socket.

`src/espn/load.ts` (**extend** `LiveSlate`; existing fields unchanged):

- `export interface LiveSlate { slate: Slate; toT(ms: number): number; season: number; week: number; matchupId: number; myTeamId: number; oppTeamId: number }`
  - `matchupId` is the `schedule[]` entry's `id` for the viewer's matchup, and
    `oppTeamId` is the other side's `teamId`.

`src/ui/MatchupPage.tsx` (**extend props**; Demo rendering is byte-identical when the new
props are absent):

- `talk?: { send(text: string): boolean; connected: boolean; oppWatching: boolean } | null`
- `remoteTaunt?: { id: number; text: string } | null` - when its `id` changes, show it as
  the opponent's bubble and play the `reply` sound.
- Rules:
  - **Canned taunts.** The canned `REPLIES` and the random `OPP_TAUNTS` run only when
    `liveNow` is undefined, which means Demo.
  - **Own taunt in Live.** A preset or typed taunt shows your bubble, calls
    `talk?.send(text)` and plays the `taunt` sound.
  - **Text box.** In Live mode only, the TALK TRASH row gains an input after the preset
    buttons:
    - It is in the taunt-button style (cream, `2px solid #1c1a22`, 999px radius,
      Lilita One 14px), with placeholder `SAY SOMETHING`, `maxLength={24}`, and width
      about 160px.
    - Enter sends, then clears the box.
    - It is disabled when `talk` is falsy or not `connected`.
  - **Status line.** In Live mode, a line in the row's Silkscreen 11px `#5b5566` style:
    - `` `${slate.opp.owner} IS WATCHING` `` when connected and `oppWatching`
    - `` `${slate.opp.owner} ISN'T HERE` `` when connected and not `oppWatching`
    - `TALK OFFLINE` otherwise

`src/App.tsx`:

- In Live mode, after `loadLiveSlate` resolves:
  - Compute `url = talkUrl(espnBase(), {season, week, matchupId, team: myTeamId})` and
    `key = savedKey()`.
  - If both are non-null, `connectTalk(url, key, …)`:
    - `onTaunt(team, text)` is used only if `team === oppTeamId`. It sets `remoteTaunt`
      to `{id: ++n, text}`. Taunts from your own team id, for example another tab, are
      ignored.
    - `onPresence(teams)` sets `oppWatching = teams.includes(oppTeamId)`.
    - `onStatus` sets `connected`.
  - Pass `talk = {send, connected, oppWatching}` and `remoteTaunt` to `MatchupPage`.
  - Otherwise pass `talk = null`.
  - Close the connection on unmount and on team or mode change.
- Demo mode passes neither prop.

## Behavior

- Never send or log the passphrase anywhere except in the `keyProtocol` entry.
- A dropped connection must not throw or blank the page. The status just flips to
  `TALK OFFLINE` until the reconnect succeeds.

## Constraints

- Existing test blocks are byte-identical. On `main` there are 9 in
  `MatchupPage.test.tsx` and 2 in `load.test.ts`. Append only.
- No new dependencies. Tests use a fake WebSocket class and fake timers passed through
  `opts`. No network, and no jsdom.
- Do not edit `src/worker/*`, `src/espn/client.ts` or `src/espn/slate.ts`.

## Out of Scope

- Chat history, emoji pickers, per-team codes and moderation.

## Acceptance Check

Baseline on the base branch (task 12's): `src/talk/` does not exist, and `LiveSlate` has
only `slate` and `toT`. For fixture team 1, the week-3 matchup is `schedule` id **16**
(home 10, REAPR Sleepers, vs away 1). The orchestrator read this from
`src/espn/fixtures/week3-pregame.json`.

Tests assert:

- `talkUrl('https://footrace-espn.x.workers.dev', {season: 2026, week: 3, matchupId: 16, team: 1})`
  is `'wss://footrace-espn.x.workers.dev/talk/2026/3/16?team=1'`. `http://localhost:8787/`
  gives `ws://localhost:8787/talk/…`. `'/espn'` gives `null`.
- `keyProtocol('hunter2')` is `'key.aHVudGVyMg'`, the same value task 12's test decodes.
- `connectTalk` with a fake WebSocket:
  - It opens with protocols `['footrace', 'key.aHVudGVyMg']`.
  - `send` before open returns `false`.
  - After open, `send('  GG ')` sends `{"type":"taunt","text":"GG"}` and returns `true`,
    and a 25-character text returns `false` without sending.
  - A server taunt frame calls `onTaunt(10, 'COPE')`, and a presence frame calls
    `onPresence([1, 10])`.
  - A close schedules a reconnect at 1000 ms, then 2000 ms after a second close. It
    resets to 1000 after a successful open.
  - `close()` stops reconnecting.
- `loadLiveSlate(info, 1, …)` with the fixtures gives `matchupId 16`, `oppTeamId 10`,
  `week 3` and `season 2026`.
- `renderToStaticMarkup` of `MatchupPage` with `liveNow={() => 0.06}`:
  - With `talk={{connected: true, oppWatching: true, send}}` it contains
    `DAVE IS WATCHING` and `placeholder="SAY SOMETHING"`.
  - With `talk={null}` it contains `TALK OFFLINE`, and the input is disabled.
  - Without `liveNow` it contains no `SAY SOMETHING`. The existing 9 blocks pass,
    unchanged.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the targets.
