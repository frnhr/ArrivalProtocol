#!/usr/bin/env bash
# Scripted browser checks against a running dev server (npm run dev in another terminal). Each check drives Chromium
# through Playwright, prints PASS/FAIL lines and exits non-zero on a failure; screenshots go to tests/.out/shots/.
# Usage: bash tests/browser.sh   (npm run test:browser; TEST_BASE_URL overrides http://localhost:5173/)
cd "$(dirname "$0")/.." || exit 2
base="${TEST_BASE_URL:-http://localhost:5173/}"
if ! curl -sf -o /dev/null "$base"; then
  echo "No dev server at $base: start one with npm run dev (or set TEST_BASE_URL)" >&2
  exit 2
fi
mkdir -p tests/.out/shots
pass=0; fail=0
for check in tests/browser/desk.mjs tests/browser/label-hops.mjs tests/browser/beam-blue.mjs tests/browser/phone.mjs tests/browser/run-flow.mjs; do
  if node "$check" > "tests/.out/$(basename "$check" .mjs).log" 2>&1; then
    pass=$((pass+1)); echo "PASS  $check"
  else
    fail=$((fail+1)); echo "FAIL  $check (log: tests/.out/$(basename "$check" .mjs).log)"; tail -15 "tests/.out/$(basename "$check" .mjs).log" | sed 's/^/      /'
  fi
done
echo "---- $pass passed, $fail failed"
[[ $fail -eq 0 ]]
