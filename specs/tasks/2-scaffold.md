# 2 - fix task 1: let pnpm 11 build esbuild so the gate's install step passes

## Deliverable

Task 1 (`specs/tasks/00-scaffold.md`) is complete on this branch except for one thing:
the gate is red. pnpm 11 refuses to run esbuild's build script until it is explicitly
allowed, and on install it drops a placeholder `pnpm-workspace.yaml` at the repo root
containing `esbuild: set this to true or false`. With that placeholder, `vite build`
cannot run and `sh tools/adw/gate.sh --full` ends `ADW_RESULT: fail`.

Write `pnpm-workspace.yaml` at the repo root with exactly:

```yaml
allowBuilds:
  esbuild: true
```

This form was verified by the orchestrator: with it, `pnpm install --frozen-lockfile`
against this branch's `package.json` and `pnpm-lock.yaml` succeeds on pnpm 11.25.0.

Your Edit tool is not allowed to write `pnpm-workspace.yaml`. Instead, change it with the
shell. If the placeholder file is missing, `pnpm install` creates it. Then run:

    sed -i '' 's/esbuild: set this to true or false/esbuild: true/' pnpm-workspace.yaml

Targets:

- `pnpm-workspace.yaml`

## Interface Contract

- `allowBuilds:` in `pnpm-workspace.yaml`: the one top-level key, mapping `esbuild: true`.

## Behavior

- Every other file task 1 wrote stays as it is. Do not change `package.json`,
  `pnpm-lock.yaml`, `tools/adw/gate.sh` or any `src/` file unless the gate proves one is
  wrong, and then say which and why in your report.
- If `pnpm install` rewrites `pnpm-lock.yaml`, that is a sign the lockfile was out of
  sync: keep the rewritten lockfile and say so.

## Constraints

- No new dependencies. No `packages:` key (this is not a monorepo).
- Do not commit; the auditor commits.

## Out of Scope

- Anything from brief 00 that the audit already found correct (package.json deps,
  tsconfig, vite config, index.html fonts, global.css, App, main, smoke test, gate logic).

## Acceptance Check

Baseline on `adw/1-scaffold` (commit f693f6b): `git show adw/1-scaffold:pnpm-workspace.yaml`
fails with "does not exist"; the gate ends `ADW_RESULT: fail`.

After the change, from the repo root:

1. `cat pnpm-workspace.yaml` prints exactly the two lines above.
2. `sh tools/adw/gate.sh --full` prints `install: ok`, `typecheck: ok`, `test: ok`,
   `build: ok` and ends `ADW_RESULT: pass`.
3. `ls dist/index.html` succeeds.
4. `git diff adw/1-scaffold --stat` lists only `pnpm-workspace.yaml` (plus
   `pnpm-lock.yaml` only if install rewrote it).
