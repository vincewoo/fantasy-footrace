# 12 - trash-talk rooms on the Worker: a WebSocket relay per matchup (Durable Object)

## Deliverable

The page's TALK TRASH buttons only produce canned replies today. The user wants GMs who
are looking at the same matchup to taunt each other live. The deployed Cloudflare Worker
(`src/worker/index.ts`, task 10) gains a second route, `/talk/...`. It upgrades to a
WebSocket and joins a **room**, a Durable Object, with one room per matchup per week.
Each room relays taunts between the connected GMs and tells them who is watching.

Decisions the user made:

- **Content.** Messages are the preset taunts **or** short free text, capped at 24
  characters.
- **Identity.** The league is trusted. The passphrase proves league membership. A client
  says which team it is, and nobody verifies that further.

The browser side is the next task. This task only builds the server, and defines the
protocol exactly so the next task can rely on it.

Targets:

- `src/worker/index.ts`
- `src/worker/index.test.ts`
- `src/worker/talk.ts`
- `src/worker/talk.test.ts`
- `src/worker/wrangler.jsonc`

## Protocol (the contract the browser task will code against)

- **URL.** `wss://<worker host>/talk/<season 4 digits>/<week 1-2 digits>/<matchupId 1-4 digits>?team=<teamId 1-2 digits>`
- **Auth.** Browsers cannot set headers on a WebSocket, so the passphrase travels in the
  subprotocol list. The client opens
  `new WebSocket(url, ['footrace', 'key.' + base64url(utf8(passphrase))])`.
  - The server must accept with `Sec-WebSocket-Protocol: footrace`.
  - `base64url` means no padding, with `-`/`_` in place of `+`/`/`.
- **Client to server.** One JSON text frame per taunt: `{"type":"taunt","text":"<string>"}`.
- **Server to other clients in the room**, never back to the sender:
  `{"type":"taunt","team":<sender teamId>,"text":"<cleaned text>","at":<epoch ms>}`
- **Server to everyone in the room** on each join and leave:
  `{"type":"presence","teams":[<sorted unique teamIds currently connected>]}`
- **Text cleaning.** Trim, then remove control characters (`\p{Cc}`). The cleaned text
  must have 1-24 characters, counted in code points (`[...s].length`). Anything else is
  dropped silently.
- **Rate limit.** At most one taunt per socket per 1500 ms. Extra taunts are dropped
  silently.
- **Room cap.** At most 8 sockets per room. A 9th is accepted and immediately closed
  with code `1013` and reason `room full`.
- **Room name.** `` `${leagueId}:${season}:${week}:${matchupId}` ``, where `leagueId`
  is `env.LEAGUE_ID ?? '918355353'`.

## Interface Contract

`src/worker/talk.ts` (no `cloudflare:*` imports, because the tests run in node):

- `export interface TalkPath { season: number; week: number; matchupId: number; team: number }`
- `export function parseTalkPath(url: URL): TalkPath | null` - matches
  `^/talk/(\d{4})/(\d{1,2})/(\d{1,4})$`, with `team` from the query matching
  `^\d{1,2}$`. Anything else is `null`.
- `export function keyFromProtocols(header: string | null): string | null` - splits
  `Sec-WebSocket-Protocol` on commas, trims, and returns the base64url-decoded UTF-8 of
  the first `key.`-prefixed entry. Returns `null` when `footrace` is absent or there is
  no valid key entry.
- `export function cleanTaunt(raw: unknown): string | null` - the protocol's cleaning
  rules. `raw` is the parsed frame, so anything that is not
  `{type: 'taunt', text: string}` is `null`.
- `export const TALK_RATE_MS = 1500`
- `export const ROOM_CAP = 8`
- `export interface TalkSocket { send(data: string): void; close(code?: number, reason?: string): void; serializeAttachment(v: unknown): void; deserializeAttachment(): unknown }`
- `export interface TalkState { getWebSockets(): TalkSocket[]; acceptWebSocket(ws: TalkSocket): void }`
- `export class TalkRoom`:
  - `constructor(state: TalkState, env: unknown)`
  - `join(ws: TalkSocket, team: number, now: number): void` - accepts `ws`, stores the
    attachment `{team, last: 0}`, closes with 1013 if the room already holds `ROOM_CAP`,
    and otherwise broadcasts presence.
  - `webSocketMessage(ws: TalkSocket, message: string | ArrayBuffer): void` - parses,
    cleans, rate-limits by `Date.now()` against the attachment's `last`, updates `last`,
    and relays to the others. Bad JSON or binary frames are ignored.
  - `webSocketClose(ws: TalkSocket): void` and `webSocketError(ws: TalkSocket): void` -
    broadcast presence without this socket.
  - `async fetch(request: Request): Promise<Response>` - creates
    `new WebSocketPair()`, calls `join(server, team, Date.now())` with `team` from the
    request URL, and returns
    `new Response(null, {status: 101, webSocket: client, headers: {'Sec-WebSocket-Protocol': 'footrace'}})`.
    - Declare the minimal ambient types this needs (`WebSocketPair`, and the `webSocket`
      field of `ResponseInit`) locally in `talk.ts` with `declare`. Do not add
      `@cloudflare/workers-types`.
  - Presence is computed from `state.getWebSockets()` attachments, so it survives
    hibernation. Do not keep a private in-memory socket list.

`src/worker/index.ts` (**extend**; the proxy path's behavior and existing tests are
unchanged):

- `WorkerEnv` gains `TALK?: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } }`.
- `handle`: **after** the origin check and **before** the method/key checks, a request
  whose path starts with `/talk/` is handled by the talk route:
  1. It requires `Origin === ALLOWED_ORIGIN`. A missing Origin gives 403
     `FOOTRACE_ORIGIN`, which differs from the proxy route, where curl is allowed.
  2. It requires `Upgrade: websocket` (case-insensitive), else 426 `FOOTRACE_UPGRADE`.
  3. `PASSPHRASE` must be non-empty, else 500 `FOOTRACE_CONFIG`.
  4. `keyFromProtocols(...)` must match `PASSPHRASE` via the existing digest compare,
     else 403 `FOOTRACE_KEY`.
  5. `parseTalkPath` must succeed, else 404 `FOOTRACE_PATH`.
  6. `TALK` must be bound, else 500 `FOOTRACE_CONFIG`.
  7. Then return `env.TALK.get(env.TALK.idFromName(roomName)).fetch(request)`.

  The talk route never reads or forwards the ESPN cookies.
- `export { TalkRoom } from './talk'` - the Durable Object class must be exported from
  the Worker's main module.

`src/worker/wrangler.jsonc`:

```jsonc
{
  "name": "footrace-espn",
  "main": "index.ts",
  "compatibility_date": "2026-09-01",
  "durable_objects": { "bindings": [{ "name": "TALK", "class_name": "TalkRoom" }] },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["TalkRoom"] }]
}
```

## Behavior

- A plain class with the hibernation handler methods is a valid Durable Object, so no
  `extends DurableObject` is needed.
- Messages are never stored. There is no history.
- Never log message text, keys or env values.

## Constraints

- The 13 existing test blocks in `src/worker/index.test.ts` stay byte-identical; append
  new ones.
- No new dependencies. `tsc --noEmit` must pass with the repo's current `types`. Keep
  the Cloudflare-only globals `declare`d in `talk.ts`.
- Do not touch `src/espn/*`, `src/ui/*`, `App.tsx` or the configs at the repo root.

## Out of Scope

- The browser client, the UI and the free-text box: the next task.
- Deploying: the user runs `pnpm dlx wrangler deploy -c src/worker/wrangler.jsonc`.

## Acceptance Check

Baseline on `main` (e35157e):

- `src/worker/` holds `index.ts` and `index.test.ts`, and `index.test.ts` has 13 test
  blocks.
- `talk.ts` and `wrangler.jsonc` do not exist.
- `grep -c "talk" src/worker/index.ts` prints `0`.

`talk.test.ts` asserts:

- **`parseTalkPath`**
  - `/talk/2026/3/14?team=1` gives `{season 2026, week 3, matchupId 14, team 1}`.
  - These give `null`: `/talk/2026/3/14` (no team), `?team=abc`, `/talk/26/3/14?team=1`
    and `/talk/2026/3/14/x?team=1`.
- **`keyFromProtocols`**
  - `'footrace, key.aHVudGVyMg'` gives `'hunter2'`.
  - `'key.aHVudGVyMg'` (no `footrace`) gives `null`.
  - `'footrace'` gives `null`.
- **`cleanTaunt`**
  - `{type: 'taunt', text: '  TOO EASY '}` gives `'TOO EASY'`.
  - 24 characters are kept. 25 characters give `null`.
  - `'😀'.repeat(24)` is kept, because it is 24 code points.
  - `'a\u0000b'` gives `'ab'`.
  - `''`, `'   '`, `{type: 'x', text: 'hi'}` and `'hi'` (a bare string) give `null`.
- **`TalkRoom`**, with a fake state and fake sockets recording `send`/`close` and
  attachments:
  - Two joins, teams 1 and 10, each broadcast presence. The second presence is
    `{"type":"presence","teams":[1,10]}` and reaches both sockets.
  - A taunt from team 1 reaches only team 10's socket, as `{type: 'taunt', team: 1,
    text, at}`.
  - A second taunt from team 1 within 1500 ms is dropped. Stub `Date.now`.
  - Invalid JSON is ignored with no throw.
  - Closing team 10 broadcasts `{"type":"presence","teams":[1]}` to team 1.
  - A 9th join gets `close(1013, 'room full')`.

`index.test.ts` (appended) asserts, using a fake `TALK` namespace that records
`idFromName`:

- A `/talk/2026/3/14?team=1` request with the right origin, `Upgrade: websocket` and
  protocol `footrace, key.aHVudGVyMg` (env `PASSPHRASE 'hunter2'`) calls
  `idFromName('918355353:2026:3:14')` and returns the stub's response.
- The same request with a wrong key gives 403 `FOOTRACE_KEY`.
- With no Origin it gives 403 `FOOTRACE_ORIGIN`.
- Without `Upgrade` it gives 426.
- A bad path gives 404.
- With `TALK` unbound it gives 500.
- The proxy route's behavior is unchanged: all 13 old blocks pass.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff main --stat`
lists only the targets.
