# Audit sheet - 17 game clocks

## Must not have changed

- `src/espn/slate.ts`, `load.ts`, `live.ts`, `client.ts`, `proxy.ts`, `src/ui/*`, the
  worker, the model, the configs and the dependencies. All existing tests are unchanged.
- The fixture: `cmp reference/espn-fixtures/scoreboard-week3-sun-am.json src/espn/fixtures/scoreboard-week3-sun-am.json`.

## Failure modes this change invites

- **Scoreboard routed through the proxy or Worker.** It is public and CORS-open. Routing
  it through `/espn` or the Worker would fail the proxy's path allowlist, or would widen
  that allowlist. Neither is acceptable. Check that `scoreboardUrl` is the absolute
  `site.api.espn.com` URL and that `fetchScoreboard` sends no credentials and no key.
- **Keying by ESPN's abbreviation** instead of `proTeamById(id).abbrev`. The two can
  differ, for example WSH/WAS, and a mismatch silently drops a team's clock. Check the
  code uses the id.
- **Replay broken.** While scrubbed back, the status must be the timeline's label, not
  the live clock. `withGameStatus` must honor `t < liveT - 0.002`.
- **A second polling loop.** The scoreboard must ride the existing 15 s tick and its
  in-flight guard. An independent `setInterval` doubles the request rate and escapes
  the "only during games" condition.
- **A failed fetch blanking statuses.** It must keep the previous map.
- **A `pre` state overriding `KO …`.** `pre` must return `null` so the timeline label
  shows.
- **Mutating the input slate.** `withGameStatus` returns a new object.

## Real pass vs fake pass

- The fixture-backed tests (`GB` → FINAL, `BUF` → null) plus the synthetic `in` tests
  are required.
- **The `'in'` state is unverified against real data**, because no game was live at
  capture. If your audit runs while any NFL game is in progress (Sunday 2026-09-27 from
  10:00 AM PT), fetch the live scoreboard URL with curl. It is public and read-only.
  Confirm an in-progress event's status has `type.state 'in'`, a numeric `period` and a
  `displayClock` string, and that `gameLabel` renders it as `Q<n> <clock>`. Report
  whether you could run this check. If no game is live, say so. That is not a fail.

## Prior art

- `reference/espn-api.md` Q5/Q6 describes the site scoreboard: team ids equal fantasy
  `proTeamId`s, and the response is CORS-open.
- The raw fixture was captured with curl (`HTTP/2 200`,
  `access-control-allow-origin: *`, `cache-control: max-age=1`).
- Task 16 added the 15 s polling tick in `App.tsx`, which polls only while a lane
  player's game window contains now.
