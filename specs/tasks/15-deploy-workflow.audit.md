# Audit sheet - 15 deploy workflow

## Must not have changed

Everything except `.github/workflows/deploy.yml`. In particular `package.json`, the
lockfile, `tools/adw/gate.sh` and `src/worker/wrangler.jsonc`.

## Failure modes this change invites

- **Secrets in logs.**
  - Watch for `echo ${{ secrets.* }}`, or `set -x` in a step that has the token in its
    env.
  - Watch for the token passed on a command line rather than through the action's
    `apiToken` input.
  - The config-check step must test with `[ -z "$VAR" ]`, and never print the value.
- **Secrets that do not belong in CI.** `ESPN_S2`, `SWID` or `PASSPHRASE` appearing as
  GitHub secrets, or a `wrangler secret put` inside the workflow. The user's design keeps
  them only in Cloudflare.
- **Deploying on a red gate.** `deploy` must `needs: gate`. A build-only job that skips
  the tests is not a gate.
- **Preview deploys.** `pages deploy` without `--branch=main` publishes a hash URL that
  the Worker's `ALLOWED_ORIGIN` will reject. That exact confusion already happened by
  hand.
- **Trigger too broad.** Deploying on `pull_request` would run with secrets on forked
  PRs. Only `push` to `main` and `workflow_dispatch` are allowed.
- **`permissions` missing or broad.** It should be `contents: read`.
- **Version drift.**
  - pnpm must be 11. The lockfile and the `pnpm-workspace.yaml` `allowBuilds` key are
    pnpm 11 features, and pnpm 9 or 10 would fail `--frozen-lockfile` or ignore the
    esbuild build approval.
  - Node 22 matches `@types/node` ^22.
- **Wrong wrangler `-c` path.** `wrangler.jsonc`'s `main: "index.ts"` is resolved
  relative to the config file, so `-c src/worker/wrangler.jsonc` is correct. Any other
  path is a fail.

## Real pass vs fake pass

- YAML validity alone is weak. Read the whole file against the Interface Contract.
- If the `gh` CLI is logged in, you may run `gh workflow view` only after the user
  pushes. Do not push.
- Optionally, if `actionlint` can run through `pnpm dlx` or is otherwise available,
  run it. If it is not available, say so.

## Prior art

- The manual deploy commands and the origin mismatch the user hit are recorded in the
  orchestrator's session: the Worker returned `FOOTRACE_ORIGIN` for the page's origin.
- `src/worker/wrangler.jsonc` comes from task 12. It declares the `TALK` Durable Object
  and the `TalkRoom` migration.
- The remote is `git@github.com:vincewoo/fantasy-footrace.git`.
