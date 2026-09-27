# ESPN data research for Fantasy Footrace (verified 2026-09-27, NFL week 3)

## Bottom line
1. **Public league: a pure static front-end works.** `lm-api-reads.fantasy.espn.com` echoes back any Origin with `Access-Control-Allow-Credentials: true`, and the preflight allows `x-fantasy-filter` (curl-verified, see Q3). Confidence: high.
2. **Private league: a static front-end can't send the espn_s2/SWID cookies itself.** `Cookie` is a forbidden header in fetch. That leaves `credentials:'include'`, which relies on the user's own espn.com cookies travelling cross-site. That only works if ESPN sets them `SameSite=None; Secure`, and it never works in Safari or Firefox. Unverified, confidence low. It takes one 30-second console test in the user's logged-in Chrome (see Q3).
3. **Play-by-play: the ESPN site/core APIs are open to any origin (`Access-Control-Allow-Origin: *`).** Both carry play text, period, clock and scoring flags. Core API plays list participant athlete ids. Confidence: high.
4. **Fantasy player id == ESPN athlete id, and proTeamId == site-API team id.** Checked on Jordan Love 4036378 and GB = 9. D/ST id = `-16000 - proTeamId` (GB D/ST = -16009). Confidence: high.
5. **Recommended architecture:** browser SPA plus one ~20-line forwarding proxy for the fantasy API only. Start with the Vite dev proxy for local use and deploy a Cloudflare Worker if needed. The cookies live in an env var or Worker secret and never sit in the page. Everything else (scoreboard, summary, core plays) goes straight from the browser.
6. **Fantasy points:** take the authoritative totals from the fantasy API (`appliedTotal`, stat split for the week). Per-play attribution comes from diffing polled stat totals and pinning each delta to the latest matching core-API play (see Q5).
7. **Polling:** site scoreboard/summary send `cache-control: max-age=5-6`, so poll every 10-15 s. Fantasy league: every 15-30 s. Neither host throttled 20 back-to-back GETs.
8. **Auth:** there's no sanctioned OAuth for third parties. Disney OneID login needs reCAPTCHA; espn-api dropped it (Q2). The user pastes espn_s2 and SWID from DevTools.
9. **ToS:** the Disney Terms of Use forbid "script or other automated means" to access or extract. This is personal hobby use of undocumented APIs and can break without notice.
10. **Win probability:** ESPN's `winprobability` in the summary is per NFL game, not per fantasy matchup. Compute the matchup win probability ourselves.

---

## Q1. Fantasy v3 API: hosts, paths, views, maps

**Host.** `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/...` is the working read host.
- curl-verified: `GET .../seasons/2026` -> `HTTP/2 200` with `{"currentScoringPeriod":{"id":3},"id":2026,"active":true,...}`.
- Also cited in espn-api `espn_api/requests/constant.py` (`FANTASY_BASE_ENDPOINT = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/"`) and in the JS lib `src/client/client.js:13`.

The old `fantasy.espn.com/apis/v3/...` no longer serves data. curl-verified: `GET https://fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/1?view=mSettings` -> `302`, `location: https://www.espn.com/fantasy/`. Confidence: high.

**League path (2026):**
`GET https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/{leagueId}?view=...&view=...&scoringPeriodId={week}`
You can repeat `view` in one request. Without cookies, a private league returns curl-verified `401` with `{"type":"AUTH_LEAGUE_NOT_VISIBLE"}`.

**Views** (sources: espn-api `espn_api/football/league.py`, `espn_api/requests/espn_requests.py:148`; JS `src/client/client.js:77,105,169,245`):

| Need | view(s) | Where in the JSON |
|---|---|---|
| Settings: roster slots, scoring | `mSettings` | `settings.rosterSettings.lineupSlotCounts` {slotId: count}; `settings.scoringSettings.scoringItems[]` {statId, points, pointsOverrides{slotId: pts}} ; `settings.scheduleSettings.matchupPeriods` |
| Teams / owners | `mTeam` | `teams[]` {id, name/location+nickname, abbrev, owners[] (SWIDs)}; `members[]` {id=SWID, displayName} |
| Matchup pairing | `mMatchup` / `mMatchupScore` (+ `mScoreboard`) | `schedule[]` {matchupPeriodId, home{teamId,totalPoints,...}, away{...}} |
| Lineups with slot | `mRoster` or `mMatchupScore`+`scoringPeriodId` | `teams[].roster.entries[]` {playerId, lineupSlotId, playerPoolEntry.player{...stats[]}}; in schedule: `home.rosterForCurrentScoringPeriod.entries[]` |
| Weekly projection + live actual | same entries' `player.stats[]` | `statSourceId` 0 = actual, 1 = projected; `statSplitTypeId` 1 = single scoring period, 0 = season; `scoringPeriodId`; `appliedTotal` = league-scored points; `stats` {statId: value}; `appliedStats` per statId |
| Live totals (ESPN web uses this) | `mLiveScoring` | `schedule[].home.totalPointsLive`, `totalProjectedPointsLive` (not verified, see Unknowns) |
| NFL schedule / kickoffs | `proTeamSchedules_wl` on `/seasons/2026` | `settings.proTeams[].proGamesByScoringPeriod["3"]` |
| Any players | `kona_player_info` on `/leaguedefaults/3` or a league | `players[].player` |

To get the week's box scores, espn-api `league.py:360-365` uses `view=mMatchupScore&view=mScoreboard&scoringPeriodId=W` plus the header `x-fantasy-filter: {"schedule":{"filterMatchupPeriodIds":{"value":[matchupPeriod]}}}`.

**X-Fantasy-Filter.** This JSON header filters and slices results. curl-verified: preflight returns `access-control-allow-headers: x-fantasy-filter`. Verified example on a public endpoint:
`-H 'X-Fantasy-Filter: {"players":{"filterIds":{"value":[4036378,-16009]}}}' ".../seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info&scoringPeriodId=3"` -> 200 with Jordan Love and Packers D/ST.

**Stats entries observed** (curl-verified, same request):
- Love, week 3 actual: `id "01401872948"`, `statSourceId 0`, `statSplitTypeId 1`, `appliedTotal 18.48`, `stats {"0":53,"1":28,"3":312,"4":2,...}`.
  - The actual-stats entry id is `"01" + ESPN eventId`, which links it directly to the site API game. Confidence: high (one sample, but it's structural).
- Season projection: `id "102026"`, `statSourceId 1`, `split 0`. Season actual: `"002026"`.
- The per-week projection entry for week 3 also existed (`kona_player_info` without a filter showed `scoringPeriodId 3, statSourceId 1, split 1`).
- Note: `appliedTotal` here uses ESPN default scoring. Inside a league view it uses the league's scoring (espn-api `box_player.py` relies on this).

**lineupSlotId map** (espn-api `espn_api/football/constant.py` POSITION_MAP; confidence high):
`0 QB, 1 TQB, 2 RB, 3 RB/WR, 4 WR, 5 WR/TE, 6 TE, 7 OP, 16 D/ST, 17 K, 18 P, 19 HC, 20 BE (bench), 21 IR, 23 FLEX (RB/WR/TE), 8-15 IDP, 24 ER, 25 Rookie`.

Our 9 slots are 0, 2, 2, 4, 4, 6, 23, 17, 16. Starters are entries with slotId not in {20, 21}.

**defaultPositionId** is a different map, curl-verified from the players above: `1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST`. Love = 1, Watson = 3, Packers D/ST = 16.

**proTeamId map** (espn-api `constant.py` PRO_TEAM_MAP): `1 ATL, 2 BUF, 3 CHI, 4 CIN, 5 CLE, 6 DAL, 7 DEN, 8 DET, 9 GB, 10 TEN, 11 IND, 12 KC, 13 LV, 14 LAR, 15 MIA, 16 MIN, 17 NE, 18 NO, 19 NYG, 20 NYJ, 21 PHI, 22 ARI, 23 PIT, 24 LAC, 25 SF, 26 SEA, 27 TB, 28 WSH, 29 CAR, 30 JAX, 33 BAL, 34 HOU`.

These are identical to site-API team ids. curl-verified: the scoreboard lists `9:GB, 1:ATL, 33:BAL, 34:HOU`.

**statId map for scoring** (espn-api `constant.py` PLAYER_STATS_MAP / SETTINGS_SCORING_FORMAT_MAP; confidence high for the common ones). The points per stat come from the league's `scoringItems`; don't hardcode them.
- Passing: 0 att, 1 cmp, 2 inc, 3 yds, 4 TD, 5/6/7/8/9/10 = per 5/10/20/25/50/100 yds (bucket counts), 15 TD40+, 16 TD50+, 17 300-399 game, 18 400+ game, 19 2PC, 20 INT, 64 sacked.
- Rushing: 23 att, 24 yds, 25 TD, 26 2PR, 27-32 yds buckets, 35/36 TD40/50, 37/38 100/200 game.
- Receiving: 41 rec (alt), 42 yds, 43 TD, 44 2PRE, 45/46 TD40/50, 47-52 yds buckets, 53 rec (PPR stat), 56/57 100/200 game, 58 targets.
- Misc: 62 total 2pt, 63 fumble recovered TD, 68 fumbles, 72 fumbles lost, 73 turnovers.
- K: 74/75/76 FG 50+ made/att/miss, 77-79 40-49, 80-82 0-39, 83-85 totals, 86/87/88 PAT made/att/miss, 198-200 FG 50-59, 201-203 FG 60+.
- D/ST:
  - 89 PA0, 90 PA1-6, 91 PA7-13, 92 PA14-17, 121 PA18-21, 122 22-27, 123 28-34, 124 35-45, 125 46+, 120 points allowed, 187 D/ST points allowed.
  - 93 blocked kick TD, 94 INT/fumble return TD, 95 INT, 96 fumble recovered, 97 blocked kick, 98 safety, 99 sack, 100 half-sack.
  - 101 KR TD, 102 PR TD, 103 INT TD, 104 FR TD, 105 total return TD, 106 forced fumble.
  - 127 yards allowed, 128-136 yards-allowed buckets.

---

## Q2. Auth for private leagues
- **Cookies needed:** `espn_s2` (long URL-encoded session token) and `SWID` (`{GUID}` in braces).
  - Sources: espn-api `espn_requests.py:82-86` raises "espn_s2 and swid are required"; JS README "Working with Private Leagues".
- **How to get them:** log in on espn.com, open DevTools > Application > Cookies > `https://www.espn.com` (or fantasy.espn.com), and copy `espn_s2` and `SWID` (JS README; https://github.com/cwendt94/espn-api/discussions/150).
  - Browser extensions exist that extract them (e.g. "ESPN Cookie Finder", https://chrome-stats.com/d/oapfffhnckhffnpiophbcmjnpomjkfcj).
  - Cookie lifetime isn't documented. Community reports say months until logout (low confidence).
- **Sanctioned OAuth or login flow: no.**
  - ESPN/Disney offers no public developer program or third-party OAuth for fantasy.
  - espn-api once logged in by POSTing to Disney OneID (`registerdisney.go.com/jgc/v5/client/ESPN-FANTASYLM-PROD/guest/login`) and reading `data.s2` and `profile.swid`. It is now commented out with "Username and password no longer works using their API without using google recaptcha" (`espn_api/requests/espn_requests.py` ~L283-315).
  - Embedding Disney's OneID login widget on a third-party origin wouldn't give us the cookies anyway: they are set on `.espn.com`/`.go.com`, not our origin. Confidence: high.
- **Public leagues** ("League viewable to public" setting) need no cookies. Source: espn-api README ("private leagues require espn_s2 and swid"), JS README. We didn't curl a public league because no known public id was at hand, so confidence is medium. The 401 body shows access is decided per league, not per endpoint.

## Q3. CORS and browser feasibility
curl-verified with `curl -D - -H 'Origin: http://localhost:5173' ...`:
- `GET lm-api-reads.../seasons/2026` -> `200`, `access-control-allow-origin: http://localhost:5173`, `access-control-allow-credentials: true`, `access-control-allow-methods: GET,PUT,POST,DELETE,OPTIONS,HEAD`, `vary: origin`.
  - `access-control-expose-headers` includes `X-Fantasy-Filter-Player-Count, X-Fantasy-Role, X-Fantasy-Last-Update-League, X-Fantasy-Server-Time, Polling-Interval`.
- `GET .../leagues/1?view=mSettings` (private) -> `401`, with the same ACAO/ACAC headers. The browser can therefore read the 401 and show "league is private".
- `OPTIONS` preflight with `Access-Control-Request-Headers: x-fantasy-filter` -> `200`, `access-control-allow-headers: x-fantasy-filter`, `access-control-max-age: 600`.
- `OPTIONS` with `Origin: https://evil.example.com` -> also reflected, with `allow-credentials: true`. **The API reflects arbitrary origins.** Confidence: high.
- `site.api.espn.com/.../nfl/scoreboard` and `.../summary` -> `access-control-allow-origin: *` (no credentials).
- `sports.core.api.espn.com/v2/.../events` and `/plays` -> `access-control-allow-origin: *`.

**Sending cookies from another origin:**
- A manual `Cookie` header is a forbidden request header (Fetch spec, https://fetch.spec.whatwg.org/#forbidden-request-header). The browser drops it silently. The JS lib's README confirms: "Private leagues currently only work with the NodeJS version ... due to limitations in setting headers in browsers."
  - Its `client.js:361-363` sets `Cookie` plus `withCredentials`, which does nothing in the browser.
- `fetch(url, {credentials:'include'})` from localhost:5173 attaches the user's own `.espn.com` cookies only if all of the following hold:
  - (a) the user is logged into espn.com in that browser;
  - (b) espn_s2/SWID are `SameSite=None; Secure`, because cookies with no SameSite default to Lax in Chrome and are not sent on cross-site fetch;
  - (c) the browser allows third-party cookies:
    - Chrome still does by default. Google abandoned deprecation (Apr 22 2025) and retired Privacy Sandbox (Oct 17 2025): https://secureprivacy.ai/blog/google-killed-privacy-sandbox-what-changes-for-cookie-consent-in-2026, https://www.emarketer.com/content/google-s-privacy-sandbox-elimination-ends-quest-cookieless-chrome
    - Safari ITP blocks them.
    - Firefox Total Cookie Protection partitions them, so they are effectively not sent.
  - The server side is already satisfied (reflected origin plus ACAC true).
  - We couldn't verify (b) without logging in: unauthenticated curl of www.espn.com returned `202` with no Set-Cookie. Confidence: low.
- **Empirical test for the user** (their logged-in Chrome, DevTools console on any http://localhost page):
  `fetch('https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leagues/<ID>?view=mTeam',{credentials:'include'}).then(r=>r.status)`
  A result of 200 means zero-backend works in Chrome. 401 means it doesn't.

**Verdict:**
- (a) Public league: a pure static front-end works (high).
- (b) Private league: not reliably. It is possible only in Chrome, and only if ESPN's cookies are SameSite=None (low, test it). Plan for a proxy.

## Q4. Minimal-backend options (closest to front-end-only first)
1. **Chrome-only credentials:'include' (zero backend).** Nothing to deploy. The cookies stay in the user's browser and ESPN manages them. This is the most secure option because we never see the cookie. It is fragile: Chrome only, and it depends on SameSite=None and the user staying logged in.
2. **Vite dev-server proxy (local only).**
   - `server.proxy['/espn'] = {target:'https://lm-api-reads.fantasy.espn.com', changeOrigin:true, rewrite:p=>p.replace(/^\/espn/,''), headers:{Cookie:`espn_s2=${env.ESPN_S2}; SWID=${env.SWID}`}}` (https://vite.dev/config/server-options#server-proxy).
   - Nothing to deploy. The cookies live in the gitignored `.env.local` on the user's machine, never in the bundle (don't prefix them with `VITE_`).
   - Security: best among the proxies. It only works while `npm run dev` runs, and the served bundle can't reach it from a phone off-LAN.
3. **Cloudflare Worker, or a Vercel/Netlify function (~20 lines).**
   - Forwards `GET /apis/v3/...` to lm-api-reads with the Cookie header and returns the JSON with ACAO locked to the app origin. The static site deploys alongside it on Pages, Vercel or Netlify, on the free tier.
   - Cookies: best kept as a Worker secret or env var (`wrangler secret put ESPN_S2`). The alternative is the page storing the cookies in localStorage and sending them per request in a custom header (`X-Espn-S2`); the Worker converts it to Cookie.
   - Security:
     - espn_s2 is a full ESPN session, able to change lineups and make trades via the write API. Anyone who can call the proxy gets that power.
     - Mitigate by allowing GET only, hard-coding the path prefix `/apis/v3/games/ffl/seasons/*/segments/0/leagues/<yourLeagueId>`, locking the allowed origin, and adding a shared secret or Cloudflare Access.
     - The server-side-secret variant keeps the cookie out of the browser entirely. The pass-through variant leaves it in localStorage, where any XSS could steal it.
     - Never log request headers.
4. **Browser extension (MV3).**
   - Request `host_permissions: ["https://*.espn.com/*"]`. The extension (or a content script bridging to the page) calls the API with the user's live cookies, or reads them via `chrome.cookies`.
   - The user side-loads the unpacked extension. The cookies stay in the browser and nothing is copied.
   - Security: good. The cost is packaging work and a per-browser install; Chrome and Firefox both support it.
   - Confidence: medium. Extension fetches carry host cookies when host permissions exist.
5. **Others:**
   - A local Node/Express proxy: same as Vite but separate.
   - A public CORS proxy: **don't**, it would hand your session to a third party.

**Recommendation:** try the zero-backend console test first. Fall back to the Vite proxy for development and a Worker with the cookie as a secret for deployment.

## Q5. Play-by-play source
- **Scoreboard** (`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`, optional `?dates=YYYYMMDD` or `?week=3&seasontype=2`).
  - curl-verified `200`, `access-control-allow-origin: *`, `cache-control: max-age=6`. It returned `week.number 3` and 16 events.
  - Each event has `id` (e.g. 401872953 LAC@BUF), `date`, `competitions[0].status{type.name STATUS_SCHEDULED|STATUS_IN_PROGRESS|STATUS_FINAL, shortDetail, displayClock, period}`, `competitors[].team.id/abbreviation`, and `playByPlayAvailable`.
- **Summary** (`.../nfl/summary?event={id}`).
  - curl-verified `200`, ACAO `*`, `cache-control: max-age=5`.
  - Keys: `boxscore, drives, scoringPlays, winprobability, injuries, header, ...`.
  - `drives.previous[].plays[]` has `id, sequenceNumber, type{id,text}, text` (e.g. "T.Smack kicks 59 yards..."), `period.number, clock.displayValue, scoringPlay, statYardage, start/end{down,distance,yardLine}, awayScore, homeScore, wallclock, modified, teamParticipants`.
  - **No athlete participants** (0 of 184 plays in event 401872948). Verified.
  - `scoringPlays[]` carries `type` (e.g. id 67 "Passing Touchdown"), `text` ("Christian Watson 4 Yd pass from Jordan Love (Trey Smack Kick)"), `period`, `clock`, and `team`.
  - The live drive is presumably in `drives.current` (only `previous` existed for the finished game).
- **Core plays** (`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/plays?limit=400`).
  - curl-verified `200`, ACAO `*`. Returned `count 185, pageCount 1`.
  - Items include `text, shortText, type, period, clock{value,displayValue}, scoringPlay, scoreValue, team.$ref`, and **`participants[]{athlete.$ref ".../athletes/4036378", type "passer"|"receiver"|..., order}`**.
  - `cache-control: max-age=900, stale-while-revalidate=7200` was seen for a *final* game. Freshness for live games is unverified (see Unknowns). The CDN may serve stale data; add a cache-busting query param if so.
  - Some `$ref`s in the data point to `sports.core.api.espn.pvt` (internal hostname). Parse the athlete id from the URL path rather than fetching it.
- **Id equality:** the fantasy `players[].id` 4036378 is Jordan Love, and the core athlete `$ref` `/athletes/4036378` is Love (passer on the Watson TD). Watson is 4248528 in both. Confidence: high.
  - D/ST has no athlete; attribute by team id (`-16000 - proTeamId`).
  - The actual-stat entry id `"01"+eventId` links a fantasy player to the game.
- **Deriving per-play fantasy points:**
  - (a) Parsing plays and re-scoring them with league settings is a lot of work: buckets like "every 25 yds", yardage bonuses, 100-yard-game bonuses and D/ST points-allowed tiers are non-local. It is also error-prone.
  - (b) Diffing polled totals: each poll of the league (`mMatchupScore`+`scoringPeriodId`) gives each starter's `appliedTotal` for the week. The delta since the last poll is the points earned.
  - **Recommend (b)** for the numbers, because it is always consistent with ESPN's scoreboard. Label the ticker line with the newest core-API play(s) since the previous poll where that athlete is a participant (or the team's play, for D/ST and K).
  - If several plays land in one poll window, show a combined line (e.g. "Allen: 2 plays, +7.4 pts"). Optionally split the delta using per-stat deltas × league `scoringItems` points.
  - Point-in-time data is enough for this "race"; exact per-play precision isn't needed.

## Q6. Game status, kickoff times, injuries
- **Per-NFL-team kickoff and status:**
  - Site scoreboard `events[].date` (ISO), `status.type.name/shortDetail` ("9/27 - 1:00 PM EDT", "Final", "Q2 4:31" style), `status.displayClock`, `status.period`. Verified shape.
  - Map it to each fantasy player via `proTeamId` == `competitors[].team.id` (verified identical).
  - Alternative: `GET /seasons/2026?view=proTeamSchedules_wl` gives `proGamesByScoringPeriod["3"] = [{id 401872948, date 1790295300000, homeProTeamId 9, awayProTeamId 1, statsOfficial true, validForLocking true}]` plus `byeWeek`. curl-verified 200. It has no live clock, so use the scoreboard for that.
- **Injury:**
  - Fantasy `player.injuryStatus` (verified values seen: `"ACTIVE"`; others per espn-api are QUESTIONABLE, DOUBTFUL, OUT, INJURY_RESERVE, SUSPENSION) and `player.injured` bool. Verified on Love.
  - Summary `injuries[].injuries[]{status "Questionable", athlete.id}`. Verified.
  - Use the fantasy field. It's already on the roster entries.

## Q7. Polling, rate limits, ToS
- **Cache headers (curl-verified):** scoreboard `max-age=6`, summary `max-age=5`, fantasy `/seasons/2026` `max-age=300`, `kona_player_info` `max-age=5`, fantasy league 401 `must-revalidate`.
  - The fantasy API exposes a `Polling-Interval` response header in `access-control-expose-headers`, but we didn't see it on the unauthenticated responses. Check it on a real league response.
- **Rate limits:** 20 back-to-back GETs to each of scoreboard and fantasy `/seasons/2026` all returned 200 (curl-verified). Nothing is published; community advice is "be respectful, back off on 429" (https://github.com/pseudo-r/Public-ESPN-API).
- **Suggested cadence on game day:**
  - scoreboard: 15 s
  - league matchup (1 request, both lineups): 15-20 s
  - core plays: 10-15 s, only for games with our starters in progress
  - nothing when no relevant game is live
  - That's about 10-15 requests per minute total.
- **ToS:** Disney Terms of Use §2.B forbids to "access, monitor, copy or extract the Disney Products using a robot, spider, script, or other automated means" (last updated May 24 2024, https://disneytermsofuse.com/english/). The APIs are undocumented and unsupported, and can change without notice (https://ffscrapr.ffverse.com/articles/espn_getendpoint.html). Personal, low-volume use is the practical norm (espn-api has many users), but that is not permission.

## Q8. Open-source libraries confirming this
- **cwendt94/espn-api** (Python, active):
  - `espn_api/requests/constant.py`: base host lm-api-reads.
  - `espn_api/requests/espn_requests.py`: views mTeam/mRoster/mMatchup/mSettings/mStandings (L148), proTeamSchedules_wl (L154), kona_player_info (L245), cookie check (L82-86), commented-out OneID login plus reCAPTCHA note (~L283-315).
  - `espn_api/football/constant.py`: POSITION_MAP (slot ids), PRO_TEAM_MAP, PLAYER_STATS_MAP, SETTINGS_SCORING_FORMAT_MAP.
  - `espn_api/football/league.py`: box_scores with mMatchupScore+mScoreboard and the x-fantasy-filter (L360-365).
  - `espn_api/football/box_player.py`: statSourceId 0 = actual per week.
- **mkreiser/ESPN-Fantasy-Football-API** (JS, npm `espn-fantasy-football-api`):
  - `src/client/client.js`: base URL (L13), views (L77, L105, L169, L245), Cookie header only in Node (L361-363).
  - `README.md`: "Private leagues currently only work with the NodeJS version".
- **Other references:** ffscrapr ESPN endpoint guide (https://ffscrapr.ffverse.com/articles/espn_getendpoint.html); Steven Morse's v3 write-up (https://stmorse.github.io/journal/espn-fantasy-v3.html); pseudo-r/Public-ESPN-API for site/core endpoints.

## Unknowns
- espn_s2/SWID `SameSite` and `Domain` attributes, and so whether `credentials:'include'` works from localhost in Chrome. This is decisive for zero-backend private access. Run the console test in Q3.
- `mLiveScoring` view fields (`totalPointsLive`) and the `Polling-Interval` value. These need an authenticated league response. Medium confidence they exist, from memory of ESPN web traffic.
- Core API plays cache freshness during live games. Only a final game was sampled (`max-age=900`). Test at 1 PM ET today. If it's stale, fall back to the summary for text and clock, which has no athlete ids, so match on names or on team plus scoringPlays.
- A public league without cookies was not curl-tested (no public league id at hand).
- Real rate-limit thresholds, and whether a Worker's datacenter IPs get treated differently from residential ones.
- Whether the week projection in a league view is already league-scored (`appliedTotal`). espn-api assumes yes.

## Dropped
- `site.api.espn.com/apis/fantasy/v3/...` news endpoint (espn-api NEWS_BASE_ENDPOINT): not needed.
- The per-play `participants[].statistics` $refs in the core API. They could give per-play stat lines, but that's one extra request per play; the diff approach avoids it.
- Summary `winprobability[]` (NFL game home-win %, per playId). This could feed a fancier fantasy win-probability model later.
- Write endpoints (PUT/POST are allowed by CORS): out of scope, and a reason to keep cookies away from any shared proxy.
- IDP, punter and head-coach stat ids.
