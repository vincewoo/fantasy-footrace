# 19 - sound on by default, remembered per viewer, with audio unlocked on the first interaction

## Deliverable

The user wants sound on by default. Today `MatchupPage` starts with `sound: false`
(`src/ui/MatchupPage.tsx` around line 107), and it only creates the `AudioContext`
inside `toggleSound` (around lines 155-167).

Browsers block audio until the page has had a user gesture, so an `AudioContext` created
at load stays suspended. The change:

1. **Default on.** The initial `sound` comes from a saved preference, defaulting to
   `true`.
2. **Remember the choice.** Toggling saves the new value, so a viewer who turns sound
   off keeps it off on their next visit.
3. **Unlock on first interaction.** A one-time document listener for `pointerdown` and
   `keydown`, registered with `{capture: true}`, creates the `AudioContext` if needed and
   resumes it. After it runs once, both listeners are removed. Plays that fire before
   the first interaction are silent. That is expected browser behavior, not a bug.

Targets:

- `src/ui/MatchupPage.tsx`
- `src/ui/MatchupPage.test.tsx`

## Interface Contract

- `export const SOUND_KEY = 'ff_sound'`
- `export function readSoundPref(): boolean` - returns `false` only when
  `localStorage[SOUND_KEY] === 'off'`. It returns `true` otherwise, including when
  nothing is saved or localStorage throws. The read is wrapped in try/catch.
- `export function saveSoundPref(on: boolean): void` - writes `'on'` or `'off'`, in
  try/catch.
- `export function MatchupPage(props: MatchupPageProps): JSX.Element` - the signature is
  unchanged.

## Behavior

- **Initial state.** The page state's initial `sound` is `readSoundPref()`.
- **One shared helper.** Extract the existing create-or-resume code from `toggleSound`
  into one `ensureAudio()` helper. Both `toggleSound` and the first-interaction listener
  call it. It must stay a no-op when WebAudio is unavailable.
- **Toggling.** `toggleSound` flips `sound`, calls `saveSoundPref(next)`, and plays
  `pos` exactly as today.
- **Listener lifecycle.** The listener is added in an effect on mount and removed on
  unmount or after its first run, whichever comes first.
- **Demo too.** This applies in Demo and Live alike. Nothing else changes.

## Constraints

- Tests are append-only, with one allowed edit. In the existing first-frame test block,
  the single line `expect(m).toContain('SOUND: OFF');` becomes
  `expect(m).toContain('SOUND: ON');`, because the default changed. No other existing
  line changes. `MatchupPage.test.tsx` has 15 blocks on `main`.
- Do not edit any other file. No new dependencies.

## Out of Scope

- A volume control, and per-sound toggles.

## Acceptance Check

Baseline on `main` (09c6c15):
- `grep -n "sound: false" src/ui/MatchupPage.tsx` finds the initial-state line.
- `grep -c "SOUND: OFF" src/ui/MatchupPage.test.tsx` prints `1`.
- The test file has 15 blocks.

After the change:

1. `renderToStaticMarkup(<MatchupPage slate={mockSlate('Half PPR')} />)` contains
   `SOUND: ON`. In node, localStorage is unavailable, so the default applies.
2. New tests, with a stubbed `globalThis.localStorage`:
   - `readSoundPref()` is `true` for an empty store.
   - After `saveSoundPref(false)`, the stored value is `'off'` and `readSoundPref()` is
     `false`.
   - After `saveSoundPref(true)`, the stored value is `'on'` and `readSoundPref()` is
     `true`.
   - With a `localStorage` whose `getItem` throws, it is `true`.
3. `grep -c "SOUND: OFF" src/ui/MatchupPage.test.tsx` prints `0`, and
   `grep -c "SOUND: ON" src/ui/MatchupPage.test.tsx` prints at least `1`.
4. `sh tools/adw/gate.sh --full` ends `ADW_RESULT: pass`, and `git diff main --stat`
   lists only the two targets.
