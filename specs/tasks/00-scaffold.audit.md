# Audit sheet - 00 scaffold

## Must not have changed

- `reference/footrace.dc.html`, `.gitignore`, `.commandcode/settings.json`, `.claude/`,
  `.agents/`, `specs/` (other than nothing): `git diff main --stat -- reference .gitignore
  .commandcode .claude .agents specs` must be empty.
- No `package-lock.json` or `yarn.lock` anywhere.

## Failure modes this change invites

- **Keyframes paraphrased instead of copied.** A worker retyping 35 blocks drifts
  percentages or steps. Compare bodies, not just names: for each keyframe name, the block
  text in `src/styles/global.css` must equal the block in the design's `<style>`
  (whitespace-normalized). The name-diff in the brief only proves names.
- **Gate that cannot fail.** Check `tools/adw/gate.sh` really propagates failure: e.g.
  `step` whose status is lost in a pipe (`cmd | tail` without capturing `$?`), or a final
  `exit 0` regardless. Prove it by reasoning over the script or by temporarily breaking a
  type in a scratch copy - never leave the tree modified.
- **`--no-tests` ignored or `--files` rejected.** The hub calls
  `gate.sh --files <targets> --full`; unknown flags must not abort the script.
- **Smoke test that asserts nothing real** (e.g. counts `@keyframes` in a string literal,
  or `expect(true)`). It must read the CSS file from disk.
- **Extra dependencies** beyond the brief's list (router, tailwind, eslint, testing-library,
  jsdom). `package.json` dependency keys are the check.
- **React 19 instead of 18**, or `jsx: "react"` requiring `import React` everywhere.
- **Fonts link altered** (weights dropped, a different family, missing `display=swap`).
- **Lockfile out of sync**: `--frozen-lockfile` in the gate catches it; make sure the gate
  run actually executed that step rather than a plain `pnpm install`.

## Real pass vs fake pass

A real pass: the gate output shows four `ok` lines from real commands, `dist/index.html`
exists, and a deliberately introduced type error (in a scratch check you revert) turns
`typecheck` to FAIL and the final line to `ADW_RESULT: fail`.

## Prior art

- The gate shape mirrors `/Users/vince/workspace/travel-brain-mcp/tools/adw/gate.sh`
  (step function, `ADW_RESULT` last line). The hub's audit runner looks for
  `tools/adw/gate.sh` in the project root and prefers it over the bundled gate, whose
  root resolves to the engine repo and would gate the wrong project.
- `.gitignore` on `main` (after the user's setup commit) ignores `node_modules/` and
  `dist/`; if it does not, report it rather than committing `node_modules`.
