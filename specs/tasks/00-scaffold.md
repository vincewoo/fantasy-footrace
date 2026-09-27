# 00 - scaffold a Vite + React + TypeScript app with the design's fonts and keyframes, and a project gate

## Deliverable

The repo has no application code yet. Create a front-end-only single-page app that later
tasks will fill in: Vite, React 18, TypeScript (strict) and Vitest, managed with pnpm.
The visual design to be built lives in `reference/footrace.dc.html` (read it; it is a
design-tool prototype, not code to copy wholesale). This task ports only its global CSS
(fonts, base rules, the 35 `@keyframes`) and renders a placeholder page. It also adds the
project gate the ADW auditor runs.

Targets:

- `package.json`
- `pnpm-lock.yaml`
- `index.html`
- `vite.config.ts`
- `tsconfig.json`
- `src/main.tsx`
- `src/App.tsx`
- `src/styles/global.css`
- `src/smoke.test.ts`
- `tools/adw/gate.sh`

## Interface Contract

- `export default function App()` in `src/App.tsx`: renders the placeholder page.
- `function step()` in `tools/adw/gate.sh` - written as the POSIX shell function
  `step() {`: runs one named check and records failure.
- `@keyframes leg` ... `@keyframes blink` in `src/styles/global.css`: all 35 keyframes of
  `reference/footrace.dc.html`, same names, same bodies.
- `package.json` scripts: `"dev": "vite"`, `"build": "vite build"`,
  `"typecheck": "tsc --noEmit"`, `"test": "vitest run"`.

## Behavior

- `package.json`: `"private": true`, `"type": "module"`. Dependencies `react`, `react-dom`
  (18.x); devDependencies `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`,
  `@types/react`, `@types/react-dom`. Nothing else. Generate `pnpm-lock.yaml` with
  `pnpm install`.
- `tsconfig.json`: `strict: true`, `jsx: "react-jsx"`, `module: "ESNext"`,
  `moduleResolution: "bundler"`, `target: "ES2022"`, `noEmit: true`, `include: ["src",
  "vite.config.ts"]`, `types: ["vite/client"]`.
- `vite.config.ts`: `defineConfig({ plugins: [react()] })` plus
  `test: { environment: 'node' }` (use the `/// <reference types="vitest" />` directive
  or `vitest/config`'s `defineConfig`, whichever typechecks).
- `index.html`: `<!doctype html>`, `lang="en"`, charset, viewport
  `width=device-width, initial-scale=1`, `<title>Fantasy Footrace</title>`, the Google
  Fonts preconnect and stylesheet link **exactly as in the design's `<helmet>`**
  (Lilita One; Nunito 600/800/900; Silkscreen 400/700; `display=swap`), `<div id="root">`,
  and `<script type="module" src="/src/main.tsx">`.
- `src/styles/global.css`: the design's base rules verbatim
  (`html,body{margin:0;background:#efe8d6;}`, `*{box-sizing:border-box}`, the `a` and
  `a:hover` colors, `button{font:inherit}`), then the 35 `@keyframes` blocks copied
  byte-for-byte from the design's `<style>` in the same order.
- `src/main.tsx`: imports `./styles/global.css`, mounts `<App />` in `React.StrictMode`
  on `#root`.
- `src/App.tsx`: a full-height div, background `#efe8d6`, color `#1c1a22`, font
  `'Nunito', sans-serif`, padding `16px 14px 120px`, containing the title
  `Fantasy Footrace` in `'Lilita One'` at 26px. Nothing more.
- `src/smoke.test.ts`: one Vitest test that reads `src/styles/global.css` with
  `node:fs` and asserts it contains exactly 35 matches of `/@keyframes /g`.
- `tools/adw/gate.sh` (POSIX `sh`, executable): resolves `ROOT` as the repo root from its
  own path, `cd`s there, then runs these steps in order, each through `step`:
  `install` = `pnpm install --frozen-lockfile`, `typecheck` = `pnpm run typecheck`,
  `test` = `pnpm run test` (skipped with the line `test: skipped (--no-tests)` when
  `--no-tests` is passed), `build` = `pnpm run build`. `step` prints `<name>: ok` or
  `<name>: FAIL` followed by the last 40 lines of that step's output, each prefixed
  `FAIL `. Accepts and ignores `--files <paths...>` and `--full`. Ends by printing
  `ADW_RESULT: pass` and exiting 0 when every step passed, else `ADW_RESULT: fail` and
  exit 1.

## Constraints

- pnpm only (no npm/yarn lockfiles). No CSS framework, no router, no state library, no
  ESLint/Prettier config.
- Do not edit `reference/`, `specs/`, `.gitignore`, `.claude/`, `.commandcode/` or
  `.agents/`.
- Do not commit; the auditor commits.

## Out of Scope

- The logo, scoreboard, lanes, avatars, ticker, controls: later tasks.
- Any ESPN or data code.

## Acceptance Check

Baseline at `main`: none of the target files exist (`git show main:package.json` and
`git show main:tools/adw/gate.sh` both fail with "does not exist");
`grep -c '^@keyframes' reference/footrace.dc.html` prints `35`.

After the change, from the repo root:

1. `sh tools/adw/gate.sh --full` prints `install: ok`, `typecheck: ok`, `test: ok`,
   `build: ok` and ends `ADW_RESULT: pass`.
2. `grep -c '^@keyframes' src/styles/global.css` prints `35`.
3. `diff <(grep -o '^@keyframes [a-z-]*' reference/footrace.dc.html) <(grep -o '^@keyframes [a-z-]*' src/styles/global.css)` prints nothing.
4. `ls dist/index.html` succeeds after step 1.
5. `git status --porcelain` lists no `node_modules/` or `dist/` paths.
