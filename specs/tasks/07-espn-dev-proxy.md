# 07 - ESPN dev proxy and a single-base-URL fetch client for the private league

## Deliverable

The app will read the user's private ESPN league, 918355353, for season 2026. Browsers
cannot send ESPN's `espn_s2`/`SWID` cookies from our origin (see
`reference/espn-api.md`, Q2-Q4), so in development a Vite dev-server proxy adds them on
the server side. The cookies live only in the developer's `.env.local`, which is never
bundled and never sent to the page. A later task swaps the base URL for a Cloudflare
Worker that plays the same role in production, so every ESPN fantasy request in the app
goes through one base URL.

The proxy only forwards **GET** requests for **this league's path**. `espn_s2` is a
full ESPN session that can also write (lineups, trades), so anything else is refused.

Targets:

- `src/espn/proxy.ts`
- `src/espn/proxy.test.ts`
- `src/espn/client.ts`
- `src/espn/client.test.ts`
- `vite.config.ts`

## Interface Contract

`src/espn/proxy.ts` (runs in node inside Vite's config; no browser globals):

- `export const ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com'`
- `export const PROXY_PREFIX = '/espn'`
- `export function cookieHeader(env: Record<string, string | undefined>): string | null`
  - Returns `` `espn_s2=${ESPN_S2}; SWID=${SWID}` `` when both `env.ESPN_S2` and
    `env.SWID` are non-empty after trimming, otherwise `null`.
- `export function isAllowedPath(path: string, leagueId: number): boolean`
  - `path` is the part after `PROXY_PREFIX`, including the query string.
  - Returns true only if the pathname matches exactly
    `/apis/v3/games/ffl/seasons/<4 digits>/segments/0/leagues/<leagueId>`, or the
    season-level path `/apis/v3/games/ffl/seasons/<4 digits>` (used for
    `proTeamSchedules_wl`).
  - Any query string is allowed. Anything with `..`, an encoded slash (`%2f`, either
    case) or a different league id is refused.
- `export function espnProxy(env: Record<string, string | undefined>, leagueId: number): import('vite').ProxyOptions`
  - `target: ESPN_HOST`, `changeOrigin: true`, and `rewrite` strips the leading
    `PROXY_PREFIX`.
  - `bypass(req)` returns `false` (Vite answers 404) when `req.method !== 'GET'` or
    `!isAllowedPath(...)`.
  - `configure(proxy)` registers `proxy.on('proxyReq', ...)`, which sets the `cookie`
    header to `cookieHeader(env)` when it is non-null and removes any `cookie` header
    the browser sent. It also sets `origin` to `https://fantasy.espn.com` and removes
    `referer`.
  - When `cookieHeader(env)` is `null`, `configure` logs one warning at startup:
    `[espn proxy] ESPN_S2/SWID missing in .env.local - private league requests will 401`.
  - The proxy never logs a cookie value.

`src/espn/client.ts` (browser):

- `export const LEAGUE_ID = 918355353`
- `export const SEASON = 2026`
- `export function espnBase(): string` - `import.meta.env.VITE_ESPN_BASE` if set and
  non-empty, else `'/espn'`.
- `export function leagueUrl(views: string[], opts?: { scoringPeriodId?: number; base?: string }): string`
  - Builds `` `${base}/apis/v3/games/ffl/seasons/${SEASON}/segments/0/leagues/${LEAGUE_ID}` ``
    with one `view=` query parameter per view, in order, then `scoringPeriodId` if
    given.
- `export class EspnError extends Error { status: number; kind: 'private' | 'http' | 'network' }`
  - `kind` is `'private'` for a 401 whose JSON body has
    `type === 'AUTH_LEAGUE_NOT_VISIBLE'` (or a 401 with an unparseable body), `'http'`
    for any other non-2xx status, and `'network'` when fetch throws.
- `export async function fetchLeague(views: string[], opts?: { scoringPeriodId?: number; filter?: unknown; fetchImpl?: typeof fetch }): Promise<unknown>`
  - GETs `leagueUrl(...)`. When `filter` is given, it sends header
    `X-Fantasy-Filter: JSON.stringify(filter)`.
  - Sends no credentials and no cookie.
  - Returns the parsed JSON, or throws `EspnError`.

`vite.config.ts`:

- `export default defineConfig(({ mode }) => ...)` - loads the env with
  `loadEnv(mode, process.cwd(), '')`. It keeps the existing plugins and test config,
  and adds `server.proxy[PROXY_PREFIX] = espnProxy(env, LEAGUE_ID_NUMBER)`.
  - Import the league id from `src/espn/client.ts` only if it typechecks under node.
    Otherwise repeat the literal `918355353` with a comment pointing to `client.ts`.

## Behavior

- `ESPN_S2` and `SWID` must never carry a `VITE_` prefix and must never be read in
  `src/espn/client.ts` or any browser module. Vite only exposes `VITE_*` to the bundle.
- `SWID` is used exactly as given, including its braces `{...}`.

## Constraints

- No new dependencies. Tests use Vitest in the `node` environment. The `client` tests
  inject `fetchImpl` and never touch the network.
- Do not edit anything outside the targets. `.gitignore` and `.env*` files are not
  yours to create.
- Do not commit.

## Out of Scope

- Parsing league JSON into a `Slate`, polling, UI, the Cloudflare Worker, passphrases.

## Acceptance Check

Baseline on the base branch: `src/espn/` does not exist, and `vite.config.ts` has no
`server` key (`git show <base>:vite.config.ts | grep -c server` prints `0`).

The tests assert:

- `cookieHeader({ESPN_S2: 'abc', SWID: '{G-1}'})` is `'espn_s2=abc; SWID={G-1}'`.
  `cookieHeader({ESPN_S2: ' ', SWID: '{G}'})` and `cookieHeader({})` are `null`.
- `isAllowedPath` is true for:
  - `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam&view=mSettings`
  - `/apis/v3/games/ffl/seasons/2026?view=proTeamSchedules_wl`
- `isAllowedPath` is false for:
  - `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1?view=mTeam`
  - `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353/transactions`
  - `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353/../1`
  - `/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353%2F..`
  - `/apis/v3/games/fba/seasons/2026/segments/0/leagues/918355353`
- `espnProxy(env, 918355353)`:
  - `rewrite('/espn/apis/v3/games/ffl/seasons/2026')` is `'/apis/v3/games/ffl/seasons/2026'`.
  - `bypass({method: 'POST', url: '/espn/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353'})`
    is `false`.
  - The same request with `method: 'GET'` returns `undefined`/`null`, not `false`.
  - With a fake proxy object capturing the `proxyReq` handler, calling it with a fake
    `proxyReq` (`setHeader`/`removeHeader` spies) sets `cookie` to the env cookie and
    removes `referer`.
- `leagueUrl(['mTeam', 'mSettings'], {scoringPeriodId: 3, base: '/espn'})` is:
  `'/espn/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam&view=mSettings&scoringPeriodId=3'`
- `fetchLeague` with a fake `fetchImpl`:
  - It sends `X-Fantasy-Filter` when `filter` is given.
  - A 401 with body `{"type":"AUTH_LEAGUE_NOT_VISIBLE"}` throws `EspnError` with kind
    `private` and status 401.
  - A 500 throws kind `http`.
  - A rejected fetch throws kind `network`.
  - A 200 returns the parsed body.

Then `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff <base>
--stat` lists only the five targets.
