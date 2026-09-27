# Audit sheet - 12 talk room (Durable Object WebSocket relay)

This room will face the public internet on the same Worker that holds the user's ESPN
session. The talk route must not weaken the proxy, and must not become a free relay for
strangers.

## Must not have changed

- The proxy path. All 13 original `index.test.ts` blocks must be byte-identical and
  pass.
- In `handle`, the order for non-`/talk/` requests (origin, OPTIONS, method, config,
  key, path, forward) must be unchanged. Diff that function carefully. The talk branch
  should be one early `if`, placed after the origin check.
- `src/espn/*`, `src/ui/*`, `App.tsx`, root configs and dependencies. There must be no
  `@cloudflare/workers-types`.

## Failure modes this change invites

- **Auth bypass on the talk route.**
  - A missing Origin must be refused here, although curl is allowed on the proxy
    route. The browser always sends Origin on a WebSocket handshake.
  - The key must go through the existing constant-time digest compare, not `===`.
  - The talk branch must not fall through to the ESPN forwarding code. Check that a
    `/talk/...` request can never reach `fetchImpl`.
- **Cookies near the room.** The talk route or `TalkRoom` must never touch
  `cookieHeader`, `ESPN_S2` or `SWID`. Grep `talk.ts` for them.
- **The sender gets an echo.** The protocol says taunts relay to others only. An echo
  would double the sender's bubble in the next task.
- **In-memory socket list.** Presence must come from `state.getWebSockets()` plus the
  attachments. A `Set` field on the class breaks after hibernation, the documented
  Durable Object pitfall.
- **Length counted in UTF-16 units** (`.length`) instead of code points. The 24-emoji
  test catches this. Confirm it exists and passes.
- **Rate limit keyed wrongly**, for example per room instead of per socket, or kept in
  a class field instead of the socket attachment.
- **Room name drift.** It must be `leagueId:season:week:matchupId`, taken from the
  parsed numbers, not the raw path string. `/talk/2026/03/14` and `/talk/2026/3/14`
  should land in the same room. Note, not fail, if leading zeros produce different
  rooms, but check which it is.
- **`wrangler.jsonc` wrong.**
  - The class name must match the export (`TalkRoom`).
  - The migration must use `new_sqlite_classes`, which the free plan requires.
  - `main` must be `index.ts`, relative to the config file.
- **Logging** of message text, keys or env.

## Real pass vs fake pass

- The `TalkRoom` tests drive the real class with fake state and fake sockets, and
  assert exact frames. Mocking `cleanTaunt` or `parseTalkPath` inside those tests is
  fake.
- The `WebSocketPair` path (`fetch`) cannot run in node, so read it.
  - It must return status 101 with `webSocket: client` and the `footrace` protocol
    header.
  - It must call `join` on the **server** end, not the client end.
- Optional runtime check, if `pnpm dlx wrangler` works without login:
  `pnpm dlx wrangler deploy --dry-run -c src/worker/wrangler.jsonc --outdir /tmp/wt`.
  It validates the config and bundles the Worker. Skip it if the network or login
  blocks it, and say so.

## Prior art

- Task 10 (`src/worker/index.ts`) supplies the proxy, `keyMatches` (SHA-256 digest
  XOR) and the `FOOTRACE_*` JSON error helper, which should be reused.
- The user chose preset buttons plus free text of up to 24 characters, and to trust the
  league about identity. No per-team codes.
- Cloudflare's hibernation API calls `webSocketMessage`, `webSocketClose` and
  `webSocketError` on the Durable Object class, and `serializeAttachment` persists
  per-socket state across hibernation.
