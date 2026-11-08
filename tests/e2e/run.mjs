// The e2e tier's runner: the game in Chromium, driven by browser scripts only (tests/e2e/scenarios/*.mjs, each a
// standalone Playwright script that prints PASS/FAIL lines and exits non-zero on a failure). It starts a Vite dev server
// of its own (unless E2E_BASE_URL points at one already running), runs the scenarios, streams their lines prefixed with
// the scenario's name and adds the checks up.
// Usage: node tests/e2e/run.mjs [scenario ...]    (npm run test:e2e; names as in SCENARIOS, e.g. `playthrough phone`)
// Env: E2E_BASE_URL (skip the server), E2E_WORKERS (scenarios at once, default 2: they run in real time, and a starved
// page misses its countdowns), E2E_CHROMIUM (see lib.mjs). Logs and shots under tests/.out/e2e/.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const ROOT = join(import.meta.dirname, '..', '..');
const OUT = join(ROOT, 'tests', '.out', 'e2e');
mkdirSync(OUT, { recursive: true });

// Longest first, so the long ones start at once. Each runs in its own Chromium.
const SCENARIOS = [
  { name: 'playthrough', file: 'playthrough.mjs', what: 'a whole run played by the strip on run 1\'s arm: six ships through the DESK with the worked route\'s requests, the RUN TALLY, NEW RUN' },
  { name: 'run-flow', file: 'run-flow.mjs', what: 'a run through every screen and the DESK, BEAM OUT, NEW RUN twice, HOLLOW on CORMORANT' },
  { name: 'map-desk', file: 'map-desk.mjs', what: 'the galaxy map\'s DESK: chart, card, SET COURSE, ◀ CHART, TOO LATE, TIGHT\'s 0-charge confirm, the phone sheet, the title\'s beacon; 3b: the REPOSITORY and INBOX tabs, requests, SEND ON, last rm, the flight INBOX' },
  { name: 'skills-4cde-landing', file: 'skills-4cde-landing.mjs', what: 'slices 4c and 4e in the page: AUTODROP v1 held to BULLSEYE, v2\'s pass from the POD BAY flown from the MIND, v3\'s plan and [F] per gap, AUTOBURN v3 to its landing orbit' },
  { name: 'residents', file: 'residents.mjs', what: 'slice 5\'s resident AIs on seed 7: GANNET\'s WARDEN (wake, burst, pip, a lock blocked, the DEAL by Y, SCAN, the cure; DELETE), PROVIDENCE\'s late surprise, CURLEW\'s BARNABY (wake, MEND, the gift), HERON\'s note and leftover deck' },
  { name: 'ending', file: 'ending.mjs', what: 'slice 7a\'s ending on seed 7: PURGE + REASSIGNMENT by keys with [ESC] BACK, the night and the title\'s ENDINGS line; a reload at step 2 (R14); MERGE + SUNSET\'s LAST LANDING with the engine shut and [ENTER]; UNRESOLVED\'s IT FOLLOWED YOU' },
  { name: 'traces', file: 'traces.mjs', what: 'slice 7c\'s NEXT RUN on seed 7: run 1 ends PURGE + REASSIGNMENT (the FINAL CARD\'s and the title\'s NEXT RUN: lines); run 2\'s stranger UNIT-031, 047.log, the final ship\'s card row, the face and CONTROL; after PURGE + SUNSET 031.log by SCAN and INSPECT, the cache ship\'s ◆ and row, its gift at the boot, a reload there (no double gift)' },
  { name: 'last-landing', file: 'last-landing.mjs', what: 'slice 7b\'s THE LAST LANDING on seed 7: MERGE + REASSIGNMENT with three drivers eaten, the header strip, the POD BAY\'s RESTORED row, the NAV PLOT\'s restored beacons, the kid\'s launch refused, [ENTER] to the end, the report\'s RESTORED BY MERGE row and credits, the night to the title' },
  { name: 'survey', file: 'survey.mjs', what: 'slice 6\'s SURVEY on seed 7\'s CORMORANT: the first touchdown on ROCKY LZ-B with no SURVEY (CONTROL\'s line, the stamp, the report), v2\'s SITES window mapping, rating and moving LZ-B by its pill, the NAV PLOT\'s wedge and brackets, PAUSE, the phone\'s SITES tab' },
  { name: 'resume', file: 'resume.mjs', what: 'slice 3c\'s run save: RESUME at a desk, mid-flight (the boot replayed), at the final report; NEW RUN\'s confirm (ENTER and ESC keep, DEL abandons); CAN\'T RESUME and ABANDON RUN; NO SAVE' },
  { name: 'skills-4cde-sentry', file: 'skills-4cde-sentry.mjs', what: 'slices 4c–4e, SENTRY: a decoy in the MIND answers every tool as its file, SCAN and DELETE and MOVE unmask it, v2\'s pre-empt (and its outline below v2), v3\'s FIREWALL at the boot' },
  { name: 'label-hops', file: 'label-hops.mjs', what: 'NAV PLOT labels never hop, desktop and phone' },
  { name: 'phone', file: 'phone.mjs', what: 'the phone layout: touch, overflow, every strip line fits' },
  { name: 'run2', file: 'run2.mjs', what: 'slice 3c\'s run 2: HOLLOW UNIT-031 and no ghost after a won run (7c), the launch line and stamp, 047\'s trail on the title and the desk, REPORTED HOME, the ships that moved on, the beacon row, the FOR UNIT-047 letter, older colonies, the grey cross' },
  { name: 'desk', file: 'desk.mjs', what: 'the desk: plot chip, dragged windows across the breakpoint' },
  { name: 'beam-blue', file: 'beam-blue.mjs', what: 'BEAM OUT from the MIND' },
];
const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !SCENARIOS.some((scenario) => scenario.name === name));
if (unknown.length) { console.error(`no scenario ${unknown.join(', ')} (have: ${SCENARIOS.map((s) => s.name).join(', ')})`); process.exit(2); }
const chosen = SCENARIOS.filter((scenario) => wanted.length === 0 || wanted.includes(scenario.name));
const WORKERS = Number(process.env.E2E_WORKERS ?? 2);
if (!Number.isInteger(WORKERS) || WORKERS < 1) throw new Error(`E2E_WORKERS=${process.env.E2E_WORKERS} is not a worker count`);

let server = null;
let baseUrl = process.env.E2E_BASE_URL ?? null;
if (!baseUrl) {
  // A port of its own (not the 5173 a dev session may hold), the project's vite.config.ts, no browser tab, quiet.
  server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), logLevel: 'warn', server: { host: '127.0.0.1', port: 5199, strictPort: false, open: false } });
  await server.listen();
  baseUrl = server.resolvedUrls.local[0];
  // The first load transforms every module: do it once here, not inside the first scenario's timeouts.
  await fetch(baseUrl).then((res) => res.text());
  console.log(`---- dev server at ${baseUrl}`);
}

const started = Date.now();
const results = [];
function runScenario(scenario) {
  return new Promise((resolve) => {
    const scenarioStarted = Date.now();
    const child = spawn(process.execPath, [join('tests', 'e2e', 'scenarios', scenario.file)], {
      cwd: ROOT, env: { ...process.env, E2E_BASE_URL: baseUrl }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let pass = 0;
    let fail = 0;
    let out = '';
    let partial = '';
    const onData = (chunk) => {
      out += chunk;
      partial += chunk;
      const lines = partial.split('\n');
      partial = lines.pop();
      for (const line of lines) {
        if (line.startsWith('PASS')) pass++;
        if (line.startsWith('FAIL')) fail++;
        if (line.startsWith('FAIL') || process.env.E2E_VERBOSE === '1') console.log(`[${scenario.name}] ${line}`);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => {
      const sec = (Date.now() - scenarioStarted) / 1000;
      writeFileSync(join(OUT, `${scenario.name}.log`), out);
      // A scenario that dies before its checks (a thrown error, a missing element) is a failure with no FAIL line.
      const ok = code === 0 && fail === 0 && pass > 0;
      results.push({ ...scenario, ok, pass, fail, sec, code });
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${sec.toFixed(0).padStart(4)}s  ${scenario.name}: ${pass} checks passed, ${fail} failed`
        + `${code !== 0 && fail === 0 ? ` (exited ${code}: tests/.out/e2e/${scenario.name}.log)` : ''}  — ${scenario.what}`);
      if (!ok && fail === 0) console.log(out.trimEnd().split('\n').slice(-15).map((line) => `      ${line}`).join('\n'));
      resolve();
    });
  });
}

const queue = [...chosen];
await Promise.all(Array.from({ length: Math.min(WORKERS, queue.length) }, async () => {
  while (queue.length) await runScenario(queue.shift());
}));
await server?.close();

const checks = results.reduce((sum, r) => sum + r.pass + r.fail, 0);
const failedChecks = results.reduce((sum, r) => sum + r.fail, 0);
const failed = results.filter((r) => !r.ok);
console.log(`---- ${checks - failedChecks}/${checks} checks passed in ${results.length} scenarios, ${((Date.now() - started) / 1000).toFixed(0)} s`
  + `${failed.length ? `; failed: ${failed.map((r) => r.name).join(', ')} (logs in tests/.out/e2e/)` : ''}`);
process.exit(failed.length === 0 ? 0 : 1);
