# Audit sheet - 10 ESPN Worker proxy

This Worker will sit on the public internet holding the user's full ESPN session. Treat
every lockdown rule as a security requirement. A missing rule is a fail, not a note.

## Must not have changed

- `src/espn/proxy.ts`. The Worker imports its functions and must not copy them.
- `src/espn/slate.ts`, `load.ts`, `timeline.ts`, `src/model/*`, `src/sim/*`,
  `src/ui/Avatar.tsx`, `src/ui/MatchupPage.tsx`, `src/ui/playback.ts`,
  `vite.config.ts`, the gate and the dependencies.
- The 15 existing blocks in `src/espn/client.test.ts`, which must be byte-identical.

## Failure modes this change invites

- **Open relay.** The Worker must never forward to anything but `ESPN_HOST +` an
  `isAllowedPath` path. Try these against `handle` with a spy fetch:
  - an absolute URL smuggled in the path (`//evil.example/...`)
  - `@` in the path
  - an uppercase `%2F`
  - a double-encoded `%252f`
  - `.../leagues/918355353?view=mTeam#frag`

  None may reach `fetchImpl` with a non-ESPN host. `new URL(request.url).pathname`
  normalizes some of these, so check what actually reaches `isAllowedPath`.
- **Header leaks.**
  - The incoming `cookie`, `authorization`, `x-footrace-key` and `origin` must not be
    forwarded. Read the forwarding code. It should build a fresh header object and not
    copy `request.headers`.
  - Upstream `set-cookie` must not be returned.
  - Error bodies must not echo env, header or key values.
- **CORS too loose.** Check for:
  - `Access-Control-Allow-Origin: *`
  - an echo of any origin
  - `Allow-Credentials: true`

  A reflected origin is exactly ESPN's own weakness. The Worker must pin
  `ALLOWED_ORIGIN`.
- **Passphrase compare.**
  - `===` on the raw strings is a fail, because the brief requires a digest-and-loop.
  - The comparison must not short-circuit on length before digesting.
  - An empty `PASSPHRASE` must be a 500, never "no key needed".
- **Key in the bundle or logs.** Grep `dist/` for `hunter2`. Grep `src/worker` for
  `console.`, where none is expected.
- **The browser sends the key to ESPN directly.** In dev (`/espn` base) the key header
  goes to the Vite proxy, which forwards what? The dev proxy only sets `cookie` and
  strips `cookie`/`referer`, so an `x-footrace-key` sent in dev would pass through to
  ESPN. That is harmless (ESPN ignores it), but confirm the client only sends it when
  `savedKey()` is set, which it normally is not in dev.
- **`localStorage` access outside try/catch** in `savedKey` or `saveKey`.
- **Node-only APIs in the Worker** (`Buffer`, `node:crypto`, `process`). Grep for them.

## Real pass vs fake pass

- A real pass: the Worker tests call the real `handle` with web `Request` objects and a
  spy `fetchImpl`, and assert the exact status, headers and forwarded URL/headers for
  every brief case. A test that mocks `isAllowedPath` itself proves nothing.
- Optional: bundle-check the Worker with
  `pnpm dlx esbuild src/worker/index.ts --bundle --format=esm --platform=neutral --outfile=/tmp/w.js`.
  If `pnpm dlx` needs the network and is blocked, note that and skip it. It proves there
  are no node-only imports.

## Prior art

- The task-7 dev proxy (`src/espn/proxy.ts`) and its audit hold the path rules and the
  traversal cases already tried.
- `reference/espn-api.md` Q4 option 3 is the design this implements. ESPN's own API
  reflects any origin with credentials, which is why this Worker must not.
- The user chose the Worker route (option B) because the league is private and cannot be
  made public, and the other GMs must be able to use the app.
