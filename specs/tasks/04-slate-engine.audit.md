# Audit sheet - 04 slate engine

## Must not have changed

Everything the scaffold tasks (1-3) shipped: `src/App.tsx`, `src/main.tsx`, `src/styles/global.css`,
`src/smoke.test.ts`, `tools/adw/gate.sh`, `package.json`, `pnpm-lock.yaml`, configs.
`git diff <base> --stat` must list only `src/model/{types,derive,derive.test}.ts` and
`src/sim/{mock,mock.test}.ts`.

## Failure modes this change invites

- **Tests rewritten to match wrong output.** The brief's numbers came from running the
  design's own functions. If a test expectation differs from the brief (e.g. 134 events,
  a different total), the port is wrong - fail it even if tests are green. Grep the test
  files for each brief value.
- **RNG order drift.** Most likely cause of mismatched totals: computing `pts` inside
  generation with the chosen mode instead of `'Half PPR'`, drawing times before picks, or
  applying the injury cut after sorting. The snapshot numbers at `t=0.3/0.5` catch this;
  confirm they are asserted, not just the final totals.
- **Model leaking the mock.** `types.ts` must not reference `WINDOWS`, `TEAMS.w`, seed or
  scoring mode; a live source has to be able to satisfy `Slate` without them. `Player.window`
  is the only slate-time coupling and is intended.
- **`sgn` using ASCII `-`** instead of U+2212 `−` (the design's glyph).
- **`out` keyed differently** from `` `${side}${lane}` `` - the page task will rely on it.
- **Mutation of shared constants**: the design mutates `EVENTS[].pts` in place on scoring
  change; the port must build fresh events per `mockSlate` call (call it twice with
  different modes and check the first result is unchanged).
- React/DOM imports in `src/model` or `src/sim`.

## Real pass vs fake pass

Real: the tests import `mockSlate` and `snapshotAt` and assert the literal numbers from the
brief; the gate's `test` step runs them (not skipped). Fake: expectations computed by
calling the code under test, snapshot files, or `toBeCloseTo` with a loose tolerance on
the 1-dp strings.

## Prior art

- Baseline numbers: produced by extracting lines 229-345 of `reference/footrace.dc.html`
  into node and evaluating; the auditor can repeat that to settle any disagreement.
- `reference/espn-api.md` is context for the later ESPN source (fantasy `appliedTotal`
  deltas become `PlayEvent.pts`; `proTeamId` maps to team abbrev) - the model should not
  preclude it, but nothing here implements it.
