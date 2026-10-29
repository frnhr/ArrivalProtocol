// The landing suites' check/finish, without wp1/harness's imports: the pure suites (solve, rules) must load nothing but
// the modules they test, so they stay fast and run even while the game's mounts are mid-change. Same output and exit
// rules as wp1/harness: a suite that ran no check fails.
interface Result {
  name: string;
  ok: boolean;
}

const results: Result[] = [];

export function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

export function finish(): void {
  const failed = results.filter((result) => !result.ok);
  console.log(`---- ${results.length - failed.length}/${results.length} checks passed`);
  if (results.length === 0) {
    console.log('FAIL  the suite ran no checks');
    process.exit(1);
  }
  if (failed.length > 0) process.exit(1);
}
