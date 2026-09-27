#!/bin/sh

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT" || exit 1

no_tests=0
for arg in "$@"; do
  case "$arg" in
    --no-tests) no_tests=1 ;;
  esac
done

failed=0

step() {
  name=$1
  shift
  output=$("$@" 2>&1)
  status=$?
  if [ "$status" -eq 0 ]; then
    printf '%s: ok\n' "$name"
  else
    printf '%s: FAIL\n' "$name"
    printf '%s\n' "$output" | tail -n 40 | sed 's/^/FAIL /'
    failed=1
  fi
}

step install pnpm install --frozen-lockfile
step typecheck pnpm run typecheck
if [ "$no_tests" -eq 1 ]; then
  printf 'test: skipped (--no-tests)\n'
else
  step test pnpm run test
fi
step build pnpm run build

if [ "$failed" -eq 0 ]; then
  printf 'ADW_RESULT: pass\n'
  exit 0
fi

printf 'ADW_RESULT: fail\n'
exit 1
