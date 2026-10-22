#!/usr/bin/env bash
# Runs every headless test entry (tests/**/*.test.ts) with tsx and reports a summary. Each test file exits non-zero on
# failure. Usage: bash tests/run.sh [filter-substring]   (npm test)
#
# • tsx strips types without checking them, so a strict tsc over every test entry and the harnesses they import
#   (tests/tsconfig.json) runs first and counts as one suite ("tsc-tests"); it runs with or without a filter.
# • The `**` glob needs bash 4+ (globstar). macOS /bin/bash is 3.2: there `**` acts like `*` and most suites would be
#   skipped without a word, so fail loudly instead, and refuse a suspiciously small unfiltered set too.
cd "$(dirname "$0")/.." || exit 2
if ! shopt -s nullglob globstar 2>/dev/null; then
  echo "tests/run.sh needs bash 4+ for its ** glob (this is bash ${BASH_VERSION}); install a newer bash (brew install bash) and run it with that" >&2
  exit 2
fi
# The suites that existed when the guard was written: an unfiltered run that finds fewer has lost its glob.
MIN_SUITES=120
filter="${1:-}"
pass=0; fail=0; failed=()
started=$(date +%s)

if out=$(npx --no-install tsc -p tests/tsconfig.json 2>&1); then
  pass=$((pass+1)); echo "PASS  tsc-tests (strict tsc over every test entry, tests/tsconfig.json)"
else
  fail=$((fail+1)); failed+=("tsc-tests"); echo "FAIL  tsc-tests (strict tsc over every test entry, tests/tsconfig.json)"; echo "$out" | tail -25 | sed 's/^/      /'
fi

files=(tests/**/*.test.ts)
if [[ -z "$filter" && ${#files[@]} -lt $MIN_SUITES ]]; then
  echo "tests/run.sh found only ${#files[@]} test files (expected at least $MIN_SUITES): is the glob broken?" >&2
  exit 2
fi
for file in "${files[@]}"; do
  [[ "$file" == tests/.out/* ]] && continue
  [[ -n "$filter" && "$file" != *"$filter"* ]] && continue
  suite_started=$(date +%s)
  if out=$(node_modules/.bin/tsx --tsconfig tsconfig.json "$file" 2>&1); then
    pass=$((pass+1)); echo "PASS  $(( $(date +%s) - suite_started ))s  $file"
  else
    fail=$((fail+1)); failed+=("$file"); echo "FAIL  $(( $(date +%s) - suite_started ))s  $file"; echo "$out" | tail -25 | sed 's/^/      /'
  fi
done
echo "---- $pass passed, $fail failed in $(( $(date +%s) - started )) s"
[[ $fail -eq 0 ]]
