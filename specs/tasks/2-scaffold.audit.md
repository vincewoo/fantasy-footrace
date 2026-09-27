# Audit sheet - 2 (autofix of 1): pnpm 11 allowBuilds

## Must not have changed

Everything the task-1 audit found correct: `package.json`, `tsconfig.json`,
`vite.config.ts`, `index.html`, `src/**`, `tools/adw/gate.sh`. `git diff adw/1-scaffold
--stat` should list only `pnpm-workspace.yaml`, and possibly `pnpm-lock.yaml`. If the
lockfile changed, confirm that `package.json` did not, so the churn comes from pnpm alone.

## Failure modes this change invites

- **Placeholder left in place:** the file still reads `set this to true or false`, or
  says `false`. With either, the build step fails or is skipped.
- **The wrong fix:** `ignore-scripts`, `--ignore-scripts` added to the gate, or
  `onlyBuiltDependencies` in `package.json` instead of the workspace file. Any of these
  can hide the problem locally while esbuild is still not built. The gate's install line
  must still be `pnpm install --frozen-lockfile`.
- **The gate loosened to pass:** `--frozen-lockfile` dropped, or the build step
  removed. Diff `tools/adw/gate.sh` against `adw/1-scaffold`; it must be identical.
- **The file never committed:** task 1's commit held only the targets, and this file
  was untracked on the tree before this task. Make sure the commit includes
  `pnpm-workspace.yaml`.

## Real pass vs fake pass

A real pass shows four `ok` lines and `ADW_RESULT: pass` from the unchanged gate, with
`dist/index.html` present afterwards. Re-run the task-1 sheet's full checks as well,
including keyframe bodies and a scratch type error flipping the gate to FAIL, since this
branch is the first one expected to pass as a whole.

## Prior art

- The task-1 verdict (`.adw/audits/1.json`) found the root cause.
- The orchestrator verified `allowBuilds: { esbuild: true }` with a frozen install of this
  branch's lockfile on pnpm 11.25.0 in a scratch directory.
- The worker's Edit allowlist does not cover `pnpm-workspace.yaml`, so the brief tells
  it to fix the pnpm-generated placeholder with `sed`, which the allowlist permits. The
  file must still be committed, even though no Edit call wrote it.
