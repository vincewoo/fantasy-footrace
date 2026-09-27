# 15 - GitHub Actions: gate, then deploy the Worker and the Pages site on every push to main

## Deliverable

The app is deployed by hand today. The user runs
`pnpm dlx wrangler deploy -c src/worker/wrangler.jsonc` for the Worker (tasks 10 and 12),
then `VITE_ESPN_BASE=<worker url> pnpm build` and `wrangler pages deploy dist` for the
site. The repo lives at `github.com/vincewoo/fantasy-footrace`.

Add one workflow that runs the project gate on every push to `main` and, if it passes,
deploys both. The workflow never handles the ESPN cookies or the passphrase. Those stay
as Worker secrets in Cloudflare, set once by the user, and `wrangler deploy` does not
touch existing secrets.

Deploying Pages with `--branch=main` publishes to the project's **production** URL
(`https://<project>.pages.dev`). That stable URL is the value the Worker's
`ALLOWED_ORIGIN` must hold. Per-deploy preview URLs will not work with the Worker, and
that should be said in the header comment.

Targets:

- `.github/workflows/deploy.yml`

## Interface Contract

- `name: Deploy`
- `on:` has `push: branches: [main]` and `workflow_dispatch:`.
- `concurrency: { group: deploy, cancel-in-progress: false }`
- `permissions: { contents: read }`
- `jobs: gate:`
  - `runs-on: ubuntu-latest`
  - steps:
    1. `actions/checkout@v4`
    2. `pnpm/action-setup@v4` with `version: 11`
    3. `actions/setup-node@v4` with `node-version: 22` and `cache: pnpm`
    4. `run: sh tools/adw/gate.sh --full`
- `jobs: deploy:`
  - `needs: gate`
  - `runs-on: ubuntu-latest`
  - `environment: production`
  - steps:
    1. checkout, pnpm and node, the same three steps as `gate`.
    2. A config check that fails the job with a clear `::error::` line when any of
       `vars.VITE_ESPN_BASE`, `vars.PAGES_PROJECT`, `secrets.CLOUDFLARE_API_TOKEN` or
       `vars.CLOUDFLARE_ACCOUNT_ID` is empty. Pass them in as `env:` and test them in
       shell. Never `echo` the token.
    3. `run: pnpm install --frozen-lockfile`
    4. `run: pnpm run build` with `env: VITE_ESPN_BASE: ${{ vars.VITE_ESPN_BASE }}`
    5. `uses: cloudflare/wrangler-action@v3` with `apiToken:
       ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}`
       and `command: deploy -c src/worker/wrangler.jsonc`
    6. `uses: cloudflare/wrangler-action@v3` with the same token and account and
       `command: pages deploy dist --project-name=${{ vars.PAGES_PROJECT }} --branch=main`

## Behavior

A header comment block at the top of the file, of about 15 lines or fewer, tells the user
the one-time setup in plain steps:

- **GitHub repo settings.** Under Settings, Secrets and variables, Actions, create:
  - the secret `CLOUDFLARE_API_TOKEN`, a Cloudflare API token with the Workers Scripts
    Edit and Cloudflare Pages Edit permissions
  - the variables `CLOUDFLARE_ACCOUNT_ID`, `VITE_ESPN_BASE` (the Worker URL) and
    `PAGES_PROJECT`
- **Environment.** Create an environment named `production`.
- **Worker secrets.** `ESPN_S2`, `SWID`, `PASSPHRASE` and `ALLOWED_ORIGIN` are set once
  with `pnpm dlx wrangler secret put <NAME> --name footrace-espn`. They are never stored
  in GitHub.
- **Origin.** `ALLOWED_ORIGIN` must equal `https://<PAGES_PROJECT>.pages.dev` exactly:
  no trailing slash, and not a preview URL.

## Constraints

- One file only. Do not touch `package.json` or add a `packageManager` field, scripts or
  dependencies.
- Do not reference `ESPN_S2`, `SWID` or `PASSPHRASE` anywhere except the header comment.
- Pin actions by major version as listed. No third-party actions beyond the four named.

## Out of Scope

- Preview deployments for PRs, badge links and Slack notifications.

## Acceptance Check

Baseline on the base branch: `.github/` does not exist (`git ls-tree -r --name-only
<base> | grep -c '^.github/'` prints `0`).

After the change:

1. `pnpm dlx yaml@2 valid < .github/workflows/deploy.yml` exits 0. The orchestrator
   verified that this command exits 1 on malformed YAML and 0 on valid YAML.
2. `grep -c 'uses: cloudflare/wrangler-action@v3' .github/workflows/deploy.yml` prints
   `2`.
3. `grep -n 'deploy -c src/worker/wrangler.jsonc' .github/workflows/deploy.yml` finds
   one line, and so does `grep -n -- '--branch=main'`.
4. `grep -n 'needs: gate' .github/workflows/deploy.yml` finds one line.
5. `grep -n 'sh tools/adw/gate.sh --full' .github/workflows/deploy.yml` finds one line.
6. `grep -En 'ESPN_S2|SWID|PASSPHRASE' .github/workflows/deploy.yml` matches only lines
   starting with `#`.
7. `sh tools/adw/gate.sh --full` still ends `ADW_RESULT: pass`, and `git diff <base>
   --stat` lists only `.github/workflows/deploy.yml`.
