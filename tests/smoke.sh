#!/usr/bin/env bash
# The fast headless subset (about 2.5 minutes): the strict test tsc, every suite that runs in under about 10 s on its
# own (tests/smoke-list.txt), and one whole five-ship run end to end (wp11/full-run with RUN_SEEDS=2). The sweeps and
# the many-seed simulations (per-ship, playthrough, rule4-sweep, boss-sim, the 50-seed full-run, ...) stay in the full
# run (npm test). Works with macOS /bin/bash 3.2 (no ** globs: the list is explicit). Prints each suite's wall time.
# Usage: bash tests/smoke.sh   (npm run test:smoke)
cd "$(dirname "$0")/.." || exit 2
list=tests/smoke-list.txt
pass=0; fail=0; failed=()
started=$(date +%s)
run() { # label, then the command
  local label=$1; shift
  local suite_started; suite_started=$(date +%s)
  if out=$("$@" 2>&1); then pass=$((pass+1)); echo "PASS  $(( $(date +%s) - suite_started ))s  $label"
  else fail=$((fail+1)); failed+=("$label"); echo "FAIL  $(( $(date +%s) - suite_started ))s  $label"; echo "$out" | tail -25 | sed 's/^/      /'; fi
}
run tsc-tests npx --no-install tsc -p tests/tsconfig.json
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  run "$file" node_modules/.bin/tsx --tsconfig tsconfig.json "$file"
done < "$list"
run "wp11/full-run (RUN_SEEDS=2)" env RUN_SEEDS=2 node_modules/.bin/tsx --tsconfig tsconfig.json tests/wp11/full-run.test.ts
echo "---- $pass passed, $fail failed in $(( $(date +%s) - started )) s"
[[ $fail -eq 0 ]]
