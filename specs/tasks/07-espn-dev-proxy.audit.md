# Audit sheet - 07 ESPN dev proxy

This task handles the user's real ESPN session cookie. Security properties come first,
before fidelity.

## Must not have changed

Everything under `src/ui`, `src/model`, `src/sim`, `public/`, `src/App.tsx`, the gate,
`package.json` and the lockfile. `vite.config.ts` keeps its `plugins` and `test` config
unchanged and only gains the env loading and `server.proxy`.

## Failure modes this change invites

- **The cookie reaches the bundle.**
  - Grep `dist/` after the gate's build for `ESPN_S2`, `SWID`, `espn_s2`. Only the
    string `espn_s2=` is allowed, and only in the server-side `proxy.ts`, which must
    not be imported by any browser module.
  - Check that `src/espn/client.ts` and anything it imports never reads
    `process.env` or a non-`VITE_` env var.
  - Check that no `VITE_ESPN_S2`/`VITE_SWID` appears anywhere.
- **Open proxy.**
  - `bypass` must refuse non-GET and every path `isAllowedPath` rejects.
  - Traversal or encoded-slash tricks must be refused. The brief's test paths are the
    minimum, so try a couple more yourself, for example
    `.../leagues/9183553530`, a trailing `/`, and an uppercase `%2F`.
  - A prefix-match bug (`startsWith` without an anchored end) lets
    `/leagues/918355353/transactions` through, which would expose write-capable
    endpoints.
- **Cookie logged.** Grep for `console.` in `proxy.ts`. The only log allowed is the
  missing-cookie warning, and it must not include values.
- **Browser cookie passed through.** The `proxyReq` handler must remove the incoming
  `cookie` before setting its own. Otherwise the developer's localhost cookies leak to
  ESPN.
- **`credentials: 'include'` in `fetchLeague`.** It must not be there. Such a request
  would pass the browser's own cookies to whatever `VITE_ESPN_BASE` points at.
- **Tests that hit the network.** Grep for `lm-api-reads` in the test files. It may
  appear only as a string compared against, never fetched.

## Real pass vs fake pass

- A real pass requires:
  - the unit tests exercise the real `espnProxy` object's `rewrite`, `bypass` and
    `configure`
  - they run under the gate
  - the path tests include the traversal cases
- Optional live check, only if `.env.local` exists in the tree (it may not, and you
  must not create it or print its contents):
  - start `pnpm dev`
  - `curl -s -o /dev/null -w '%{http_code}' 'http://localhost:5173/espn/apis/v3/games/ffl/seasons/2026/segments/0/leagues/918355353?view=mTeam'`
    should print 200
  - `curl -X POST` to the same URL should print 404
  - Do not print response bodies (they contain owners' SWIDs).

## Prior art

- `reference/espn-api.md` Q3/Q4 covers CORS, the forbidden `Cookie` header and the
  proxy option.
- The orchestrator read Vite 5.4's `bypass` contract in the installed
  `node_modules/vite/dist/node`: a return of `false` sends a 404, and a string rewrites
  the URL.
