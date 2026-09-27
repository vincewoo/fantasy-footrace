# 10 - Cloudflare Worker proxy for the shared deploy, with a league passphrase

## Deliverable

The user wants to share the app with the other 11 GMs in private league 918355353. The
task-7 dev proxy only runs on the user's laptop. For the shared deploy, a Cloudflare
Worker plays the same role: it holds the user's `espn_s2`/`SWID` as Worker secrets and
forwards read-only league requests to ESPN. The static site, built with
`VITE_ESPN_BASE=<worker url>`, calls it directly.

`espn_s2` is the user's full ESPN session and can also write (lineups, trades). The
Worker is therefore locked down:

- **GET** (and the CORS preflight `OPTIONS`) only.
- **This league's paths only**, using the same `isAllowedPath` rules as the dev proxy.
- **The app's origin only**, for CORS.
- **A shared passphrase** that the user gives to the GMs. The browser sends it as
  `X-Footrace-Key`.
- The cookies never leave the Worker, and the ESPN response's `Set-Cookie` is never
  passed on.

The browser side gains the passphrase: it sends it when a key is saved, and asks for it
when the Worker says it is missing or wrong.

The Worker is a plain module (`export default { fetch }`) using only web-standard
`Request`/`Response`/`fetch`/`crypto`. It is deployed by the user with
`pnpm dlx wrangler deploy src/worker/index.ts --name footrace-espn
--compatibility-date 2026-09-01`. There is no wrangler dependency, no `wrangler.toml`
and no deploy step in this task.

Targets:

- `src/worker/index.ts`
- `src/worker/index.test.ts`
- `src/espn/client.ts`
- `src/espn/client.test.ts`
- `src/ui/Connect.tsx`
- `src/ui/Connect.test.tsx`
- `src/App.tsx`

## Interface Contract

`src/worker/index.ts`:

- `export interface WorkerEnv { ESPN_S2?: string; SWID?: string; ALLOWED_ORIGIN?: string; PASSPHRASE?: string; LEAGUE_ID?: string }`
- `export async function handle(request: Request, env: WorkerEnv, fetchImpl?: typeof fetch): Promise<Response>`
- `export default { fetch: (request: Request, env: WorkerEnv) => handle(request, env) }`
- It imports `ESPN_HOST`, `cookieHeader` and `isAllowedPath` from `../espn/proxy`. These
  must not be reimplemented.

`src/espn/client.ts` (**append**, and extend `EspnError.kind`):

- `EspnError.kind` becomes `'private' | 'http' | 'network' | 'key'`. A **403** whose JSON
  body has `type === 'FOOTRACE_KEY'` gives kind `'key'`.
- `export const KEY_STORAGE = 'ff_key'`
- `export function savedKey(): string | null` - reads `localStorage[KEY_STORAGE]` in
  try/catch, and returns null on any failure or an empty value.
- `export function saveKey(key: string): void` - writes it, in try/catch.
- `fetchLeague` and `fetchSeason`: when `savedKey()` is non-null, they add header
  `X-Footrace-Key: <key>`. Nothing else changes, and credentials stay `'omit'`.

`src/ui/Connect.tsx` (extend):

- `ConnectError`: for kind `'key'` the message is `This app needs the league passphrase.`,
  and the card adds a password `<input>` plus a `Unlock` button. `Unlock` calls
  `saveKey(value.trim())` and then `onRetry()`. Other kinds are unchanged.

`src/App.tsx`: no API change. The only edit allowed is whatever `ConnectError`'s new
behavior needs, which should be none.

## Behavior (Worker `handle`)

Let `origin = request.headers.get('Origin')`, `allowed = env.ALLOWED_ORIGIN`, and
`league = Number(env.LEAGUE_ID ?? '918355353')`.

1. **CORS headers.** Every response the Worker returns carries these when `origin` is
   non-null and `origin === allowed`:
   - `Access-Control-Allow-Origin: <allowed>`
   - `Vary: Origin`
   - `Access-Control-Allow-Headers: X-Fantasy-Filter, X-Footrace-Key`
   - `Access-Control-Allow-Methods: GET, OPTIONS`
   - `Access-Control-Max-Age: 600`

   There is never `Access-Control-Allow-Credentials`.
2. **Foreign origin.** If `origin` is non-null and `!== allowed`, respond **403**
   `{"type":"FOOTRACE_ORIGIN"}` with no CORS headers. A missing `Origin` (curl) is
   allowed through to the next checks.
3. **Preflight.** `OPTIONS` from the allowed origin responds **204** with the CORS
   headers.
4. **Method.** Any method other than GET responds **405**.
5. **Configuration.** If `cookieHeader(env)` is null, or `PASSPHRASE` is empty, respond
   **500** `{"type":"FOOTRACE_CONFIG"}`. The body must not say which one is missing.
6. **Passphrase.** The `X-Footrace-Key` header must equal `PASSPHRASE`. Compare
   SHA-256 digests with `crypto.subtle.digest`, and compare the bytes in a
   length-independent loop, not with `===` on the raw strings. Otherwise respond
   **403** `{"type":"FOOTRACE_KEY"}`.
7. **Path.** `path = url.pathname + url.search`. If `!isAllowedPath(path, league)`,
   respond **404**.
8. **Forward.** Call `fetchImpl(ESPN_HOST + path, { method: 'GET', headers })` where
   `headers` has:
   - `cookie`: `cookieHeader(env)`
   - `x-fantasy-filter`, copied only if present on the request
   - `accept: application/json`

   No other request headers are forwarded, including the incoming `cookie` and
   `X-Footrace-Key`.
9. **Respond.** Return the upstream status and body with `content-type` copied from
   upstream, `cache-control: no-store`, and the CORS headers. Upstream `set-cookie` is
   never copied.
10. **Errors.** A thrown `fetchImpl` responds **502** `{"type":"FOOTRACE_UPSTREAM"}`.
11. **Logging.** Never log headers, env values or the key.

## Constraints

- Web-standard APIs only in `src/worker/index.ts`. No `node:*` imports and no Vite
  imports, except that the type-only import already inside `proxy.ts` is fine.
- The existing test blocks in `client.test.ts` stay byte-identical; append new ones.
  `Connect.test.tsx` is new.
- No new dependencies. Tests run in Vitest's node environment with Node's global
  `Request`/`Response`/`crypto`.
- Do not create `wrangler.toml` or `.dev.vars`, and do not touch `.env*`.

## Out of Scope

- Deploying, wrangler login, secrets and Pages hosting. The user does these by hand from
  the orchestrator's instructions.
- Rate limiting and caching.

## Acceptance Check

Baseline on `adw/9-live-wiring`: `src/worker/` does not exist.
`git show adw/9-live-wiring:src/espn/client.test.ts | grep -c '^\s*\(test\|it\)('`
prints `15`. Those 15 blocks must survive unchanged.

`src/worker/index.test.ts` uses:

- `env = {ESPN_S2: 's2', SWID: '{G}', ALLOWED_ORIGIN: 'https://ff.example', PASSPHRASE: 'hunter2'}`
- a spy `fetchImpl` returning `new Response('{"ok":1}', {status: 200, headers: {'content-type': 'application/json', 'set-cookie': 'x=1'}})`
- `L = 'https://w.example/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam'`

It asserts:

- A GET `L` with Origin `https://ff.example` and key `hunter2`:
  - returns 200, body `{"ok":1}`
  - `access-control-allow-origin: https://ff.example`
  - no `set-cookie`, and no `access-control-allow-credentials`
  - `fetchImpl` is called once with
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam`
    and a `cookie` header of `espn_s2=s2; SWID={G}`
- The same request with `X-Fantasy-Filter: {"a":1}` forwards that header, and forwards
  no `x-footrace-key`.
- A wrong key returns 403 with `type` `FOOTRACE_KEY`, and `fetchImpl` is not called.
- A missing key returns 403 `FOOTRACE_KEY`.
- Origin `https://evil.example` returns 403 `FOOTRACE_ORIGIN`, with no
  `access-control-allow-origin`.
- `OPTIONS` from the allowed origin returns 204, with
  `access-control-allow-headers` containing `X-Footrace-Key`.
- A POST with the right key returns 405.
- A path with league `1` returns 404, and so does `/leagues/918355353/transactions`.
- The season path `.../seasons/2026?view=proTeamSchedules_wl` with the right key
  returns 200.
- `env` without `SWID` returns 500 `FOOTRACE_CONFIG`, whose body contains neither
  `SWID` nor `ESPN_S2`.
- A throwing `fetchImpl` returns 502 `FOOTRACE_UPSTREAM`.
- A request with no Origin header and the right key returns 200 with no
  `access-control-allow-origin`.

`client.test.ts` (appended) asserts:

- A 403 `{"type":"FOOTRACE_KEY"}` throws `EspnError` kind `key`.
- With a stubbed `localStorage` holding `ff_key = 'k1'`, `fetchLeague` sends
  `X-Footrace-Key: k1`.
- Without a stubbed key, no such header is sent.

`Connect.test.tsx` asserts that `renderToStaticMarkup(<ConnectError error={new
EspnError('x', 403, 'key')} .../>)` contains `league passphrase`,
`type="password"` and `Unlock`.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, `git diff <base> --stat`
lists only targets, and `grep -rn "hunter2\|ESPN_S2" dist/` finds nothing.
