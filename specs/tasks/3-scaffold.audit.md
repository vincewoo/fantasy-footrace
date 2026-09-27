# Audit sheet - 3 (autofix of 2, last attempt of root 1): Node types for typecheck

This is the final autofix attempt for root task 1. If it passes, it becomes the first
green scaffold branch, so run the root sheet (`specs/tasks/00-scaffold.audit.md`) in full
on this branch, not only the delta below.

## Must not have changed

- `src/**`, `tools/adw/gate.sh`, `vite.config.ts`, `index.html`, `pnpm-workspace.yaml`:
  identical to `adw/2-scaffold`.
- `package.json`: the only difference is the added `@types/node` devDependency line.
- `tsconfig.json`: the only difference is the `types` array.

## Failure modes this change invites

- **Silencing the error instead of fixing it.** Watch for `src/smoke.test.ts` excluded
  from `include`, `// @ts-nocheck` or `@ts-ignore` added to the test, `skipLibCheck`
  turned into a broader escape, or the typecheck script changed to skip test files. Any
  of these makes the gate pass while defeating the check.
- **A mismatched Node types major version.** A `^22` range is expected, and the local
  Node is v26. Anything that forces a lockfile-wide upgrade of other packages is out of
  scope, so diff the lockfile for version changes to packages other than
  `@types/node` and its `undici-types` dependency.
- **The gate modified.** Its install line must still be `pnpm install --frozen-lockfile`.

## Real pass vs fake pass

A real pass comes from the unchanged gate, printing four `ok` lines and
`ADW_RESULT: pass`. Add a scratch type error to `src/App.tsx` and confirm `typecheck`
flips to FAIL, then revert it. The smoke test must still read `global.css` from disk and
count 35 keyframes.

## Prior art

- The task-2 verdict found this defect. Task 1 had failed earlier, at install, which
  hid it.
- The orchestrator ran the exact fix on a `git archive` copy of `adw/2-scaffold`, and
  the gate passed. The orchestrator also compared all 35 keyframe bodies in
  `src/styles/global.css` against the design with whitespace stripped, and they are
  identical. Re-check this yourself rather than trusting it.
