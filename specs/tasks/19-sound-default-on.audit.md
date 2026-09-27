# Audit sheet - 19 sound default on

## Must not have changed

- Everything except `MatchupPage.tsx` and its test. Diff the test file: the only
  modified existing line is `SOUND: OFF` → `SOUND: ON`, and everything else is appended.
- Demo markup differs from `main` **only** in that button label. Diff the
  `renderToStaticMarkup` output of the two branches. Any other difference is a fail.

## Failure modes this change invites

- **An AudioContext created at render or mount without a gesture.** Browsers log an
  autoplay warning, and it stays suspended. Creation must happen in `ensureAudio()`,
  called only from the gesture listener or the toggle.
- **A leaking listener.** The document `pointerdown`/`keydown` listeners must be removed
  after the first run and on unmount. Check that the remover uses the same function
  reference and the same `capture` flag. A mismatched `capture` silently fails to remove
  the listener.
- **localStorage outside try/catch** in `readSoundPref` or `saveSoundPref`, including
  during the initial-state read at render.
- **The preference inverted.** Only the exact value `'off'` turns sound off. A missing
  or garbage value means on.
- **Toggle not persisted**, or persisted as a boolean that gets stringified oddly
  (`'false'`). The brief says `'on'`/`'off'`.

## Real pass vs fake pass

- A real pass: the pref tests stub `localStorage`, including one whose `getItem`
  throws, and the static render shows `SOUND: ON`.
- The unlock behavior can't be exercised in node. Read the effect. Optionally, in
  `pnpm dev`, confirm there is no autoplay warning on load and that a click anywhere
  then lets a play's sound through. Say whether you checked.

## Prior art

- The design's original `toggleSound` created the AudioContext on click. That is why the
  default was off, to avoid a suspended context.
- The user asked for sound on by default, and the orchestrator explained the
  first-gesture caveat to them.
