# Audit sheet - 13 talk client

## Must not have changed

- The Demo page. `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)`
  must be byte-identical between the base branch and this branch. Also check the Demo
  canned-reply and random-taunt code paths still exist, gated only by
  `liveNow === undefined`.
- Existing tests are append-only: `MatchupPage.test.tsx` has 9 base blocks and
  `load.test.ts` has 2.
- `src/worker/*`, `src/espn/client.ts`, `src/espn/slate.ts`, the proxy, the configs and
  the dependencies.

## Failure modes this change invites

- **Fake taunts leaking into Live.** Look for any path in Live mode, with or without
  `talk`, that can still produce `REPLIES` or `OPP_TAUNTS`. A GM seeing "HE COOKS" that
  their opponent never sent is the bug the user asked to remove.
- **Double bubbles.** The room never echoes to the sender, and the sender draws its own
  bubble locally. If the client also draws on receiving its own team id (another tab),
  that is a bug. The brief says to ignore it.
- **Passphrase exposure.**
  - The key must only ever appear inside `keyProtocol(...)`.
  - It must not be in the URL query or in `console.*` calls.
  - It must not reach React state rendered anywhere.
  - Grep `src/talk` and `App.tsx`.
- **Reconnect storms.**
  - The backoff must cap at 30 s.
  - `close()` must cancel the pending timer.
  - An effect cleanup must call `close()`, so a team switch does not leave a zombie
    socket reconnecting forever.
  - Check that the `useEffect` dependencies are the team, mode and slate identity.
- **`Buffer` in browser code.** `keyProtocol` must use `TextEncoder` and `btoa`.
- **Validation diverging from the server.** `send` must use the imported `cleanTaunt`,
  not a re-implementation.
- **`maxLength={24}` relied on alone.** It counts UTF-16 units, while the server counts
  code points. That is fine, provided `send` still validates with `cleanTaunt`.

## Real pass vs fake pass

- A real pass:
  - `connectTalk` tests drive a fake WebSocket through open, message, close and
    reconnect, with injected timers, and assert the exact frames and delays.
  - The page tests render the Live variants.
  - The load test reads `matchupId 16` and `oppTeamId 10` from the real fixture.
- An end-to-end check is not possible without deploying, so say so in the verdict. The
  user will test on the deployed site with two browsers.

## Prior art

- Task 12's protocol section is the contract: subprotocols `footrace` +
  `key.<base64url>`, taunt and presence frames, no echo, 24 code points and 1500 ms rate.
- The user chose free text plus presets, trusting the league.
- In the fixture, team 1's week-3 matchup id is 16 and its opponent is team 10.
