# 3 - fix task 2: give the typecheck Node types so the smoke test compiles

## Deliverable

Branch `adw/2-scaffold` is complete except for the typecheck. `src/smoke.test.ts`
imports `node:fs`, `node:path` and `node:url`, but `@types/node` is not installed and
`tsconfig.json` restricts `compilerOptions.types` to `["vite/client"]`. As a result
`tsc --noEmit` fails and the gate ends `ADW_RESULT: fail`.

Make two changes:

1. Run `pnpm add -D @types/node@^22`. This adds the devDependency to `package.json` and
   updates `pnpm-lock.yaml`.
2. In `tsconfig.json`, change `compilerOptions.types` from `["vite/client"]` to
   `["vite/client", "node"]`.

The orchestrator applied exactly these two changes to a copy of `adw/2-scaffold` and ran
`sh tools/adw/gate.sh --full`. Every step printed `ok`, and the run ended
`ADW_RESULT: pass`.

Targets:

- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`

## Interface Contract

- `"types": ["vite/client", "node"]` in `tsconfig.json` under `compilerOptions`.
- `"@types/node"` in `package.json` `devDependencies`, with a `^22` range.

## Behavior

- Every other key in `tsconfig.json` and `package.json` stays exactly as it is.
- Do not touch `src/smoke.test.ts`. Its Node imports are correct, and it is the types
  that are missing.

## Constraints

- No other dependency is added, removed or upgraded.
- Do not touch `pnpm-workspace.yaml`, `tools/adw/gate.sh`, `vite.config.ts`,
  `index.html` or any file under `src/`.
- Do not commit. The auditor commits.

## Out of Scope

- Everything the audits of tasks 1 and 2 already found correct.

## Acceptance Check

Baseline on `adw/2-scaffold`: `git show adw/2-scaffold:tsconfig.json | grep '"types"'`
prints `"types": ["vite/client"]`. `git show adw/2-scaffold:package.json | grep -c
'@types/node'` prints `0`. The gate ends `ADW_RESULT: fail` on `typecheck: FAIL`.

After the change, from the repo root:

1. `sh tools/adw/gate.sh --full` prints `install: ok`, `typecheck: ok`, `test: ok`,
   `build: ok` and ends `ADW_RESULT: pass`.
2. `grep -c '@types/node' package.json` prints `1`.
3. `git diff adw/2-scaffold --stat` lists only `package.json`, `pnpm-lock.yaml` and
   `tsconfig.json`.
